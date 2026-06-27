// /api/phone-orders/[id]/approve
//
// Founder approval gate for a phone order. On approve it runs the cascade
// (founder's decisions): flip status pending_approval → approved, generate the
// customer invoice (invoices row, linked via orders.payment_ref), raise the
// per-supplier purchase orders (deliver_to spiny_tail), and decrement on-hand
// stock via the proven /api/sales/inventory-write path.
//
// Idempotency: the status flip is an atomic conditional UPDATE
// (... WHERE status='pending_approval'). If 0 rows change, the order was already
// approved (or isn't a pending phone order) and the cascade is SKIPPED — so
// inventory never double-decrements.
//
// Body: { action?: 'approve' | 'cancel' }  (default 'approve')
// Founder / co_founder only.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { raiseResalePurchaseOrdersForOrder } from '@/lib/procurement/raise-resale-purchase-orders';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APPROVERS = new Set(['founder', 'co_founder']);

type Line = { product_id?: string | null; name?: string; sku?: string | null; qty?: number; unit?: string | null; unit_price?: number; line_total?: number };

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: orderId } = await ctx.params;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !APPROVERS.has(role)) return NextResponse.json({ ok: false, error: 'Only the founder or co-founder can approve phone orders.' }, { status: 403 });

  let body: { action?: unknown };
  try { body = await req.json(); } catch { body = {}; }
  const action = body.action === 'cancel' ? 'cancel' : 'approve';

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const approver = (prof as { full_name?: string | null } | null)?.full_name || role;

  // ── CANCEL: discard a pending phone order (no cascade) ──
  if (action === 'cancel') {
    const { data: c } = await admin.from('orders')
      .update({ status: 'cancelled' })
      .eq('id', orderId).eq('order_type', 'phone_order').eq('status', 'pending_approval')
      .select('id').maybeSingle();
    return NextResponse.json({ ok: true, cancelled: !!c });
  }

  // ── APPROVE: atomic pending → approved (guards double-cascade) ──
  const { data: ord, error: updErr } = await admin.from('orders')
    .update({ status: 'approved', payment_approval: 'approved' })
    .eq('id', orderId).eq('order_type', 'phone_order').eq('status', 'pending_approval')
    .select('id, customer_name, customer_phone, wholesale_items, total, admin_notes')
    .maybeSingle();
  if (updErr) return NextResponse.json({ ok: false, error: `Approve failed: ${updErr.message}` }, { status: 500 });
  if (!ord) {
    // Already approved or not a pending phone order — no cascade.
    return NextResponse.json({ ok: true, already: true, note: 'Order was not pending (already approved or not a phone order). No changes.' });
  }

  const lines: Line[] = Array.isArray(ord.wholesale_items) ? (ord.wholesale_items as Line[]) : [];
  const steps: Record<string, string> = {};

  // 1) Customer invoice (invoices row) — linked back via orders.payment_ref.
  let invoiceId: string | null = null;
  try {
    invoiceId = randomUUID();
    const invItems = lines.map((l) => ({ productName: l.name ?? 'Item', qty: Number(l.qty ?? 0), price: Number(l.unit_price ?? 0), total: Number(l.line_total ?? (Number(l.qty ?? 0) * Number(l.unit_price ?? 0))) }));
    const { error: invErr } = await admin.from('invoices').insert({
      id: invoiceId,
      date: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
      customer_name: ord.customer_name ?? '',
      customer_phone: ord.customer_phone ?? '',
      items: JSON.stringify(invItems),
      total: Number(ord.total ?? 0),
    });
    if (invErr) { steps.invoice = `failed: ${invErr.message}`; invoiceId = null; }
    else { steps.invoice = 'created'; await admin.from('orders').update({ payment_ref: invoiceId }).eq('id', orderId); }
  } catch (e) { steps.invoice = `error: ${e instanceof Error ? e.message : 'unknown'}`; invoiceId = null; }

  // 2) Supplier purchase orders (idempotent; deliver to Spiny Tail for assembly).
  try {
    await raiseResalePurchaseOrdersForOrder(admin, orderId, { wholesale_items: ord.wholesale_items }, 'spiny_tail');
    steps.purchase_orders = 'raised';
  } catch (e) { steps.purchase_orders = `error: ${e instanceof Error ? e.message : 'unknown'}`; }

  // 3) On-hand stock decrement — reuse the proven inventory-write path (forward
  //    the caller's bearer). Best-effort: never un-approves the order.
  try {
    const origin = new URL(req.url).origin;
    const r = await fetch(`${origin}/api/sales/inventory-write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader },
      body: JSON.stringify({
        location_code: 'NASSAU',
        order_id: orderId,
        channel: 'phone_order',
        items: lines.filter((l) => l.product_id).map((l) => ({ product_id: l.product_id, sku: l.sku ?? null, qty: Number(l.qty ?? 0), unit: l.unit ?? 'each' })),
      }),
    });
    steps.inventory = r.ok ? 'decremented' : `http ${r.status}`;
  } catch (e) { steps.inventory = `error: ${e instanceof Error ? e.message : 'unknown'}`; }

  try {
    await admin.from('ai_writes').insert({
      tool: 'phone_order_approve', caller_id: user.id,
      input: { order_id: orderId, approver }, result: { status: 'approved', invoice_id: invoiceId, steps }, status: 'success', error: null,
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, order_id: orderId, status: 'approved', invoice_id: invoiceId, steps });
}
