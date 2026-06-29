// =====================================================================
// /api/founder/receiving  (G4 — receiving → inventory → sellable)
//
// Closes the incoming-goods loop. A photographed supplier invoice is
// captured (/documents/capture → purchase_invoices with the photo). Here
// the founder VERIFIES it, matches each line to a product SKU, RECEIVES it
// into stock (record_inventory_in → inventory_movements + current_stock,
// with the invoice number + photo attached), and marks the bill
// paid/outstanding.
//
//   GET  → { invoices:[pending], locations:[{code,name}], products:[{sku,name}] }
//   POST { invoice_id, location_code, lines:[{sku,quantity,cost_per_unit}], mark }
//        → record each line into stock + mark invoice received + paid/outstanding
//
// Founder / co_founder / control_admin / manager. Service-role.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RECEIVERS = new Set(['founder', 'co_founder', 'control_admin', 'manager']);

async function gate(req: NextRequest): Promise<{ admin: SupabaseClient; userId: string } | { error: string; status: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const authHeader = req.headers.get('authorization') ?? '';
  if (!url || !anon || !svc) return { error: 'Server not configured', status: 500 };
  if (!authHeader.startsWith('Bearer ')) return { error: 'Sign in required', status: 401 };
  const uc = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return { error: 'Sign in required', status: 401 };
  const { data: prof } = await uc.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !RECEIVERS.has(role)) return { error: 'Founder / manager only', status: 403 };
  return { admin: createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } }), userId: user.id };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });

  const [{ data: invoices }, { data: locations }, { data: products }] = await Promise.all([
    g.admin.from('purchase_invoices')
      .select('id, created_at, supplier_name, invoice_ref, total_amount, balance_owed, status, items, image_urls, summary')
      .is('received_at', null).order('created_at', { ascending: false }).limit(100),
    g.admin.from('inventory_locations').select('code, name').eq('is_active', true).order('name'),
    g.admin.from('products').select('sku, name').not('sku', 'is', null).order('name').limit(2000),
  ]);

  return NextResponse.json({
    ok: true,
    invoices: invoices ?? [],
    locations: locations ?? [],
    products: products ?? [],
  });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { admin, userId } = g;

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* ignore */ }
  const invoiceId = typeof body.invoice_id === 'string' ? body.invoice_id : null;
  const locationCode = (typeof body.location_code === 'string' ? body.location_code : '').trim().toUpperCase();
  const mark = body.mark === 'paid' ? 'paid' : 'outstanding';
  const lines = Array.isArray(body.lines) ? body.lines as Array<Record<string, unknown>> : [];
  if (!invoiceId) return NextResponse.json({ ok: false, error: 'invoice_id required' }, { status: 400 });
  if (!locationCode) return NextResponse.json({ ok: false, error: 'location_code required' }, { status: 400 });

  const { data: inv } = await admin.from('purchase_invoices')
    .select('id, invoice_ref, image_urls, total_amount, received_at').eq('id', invoiceId).maybeSingle();
  if (!inv) return NextResponse.json({ ok: false, error: 'Invoice not found' }, { status: 404 });
  const invoice = inv as { invoice_ref: string | null; image_urls: string[] | null; total_amount: number | null; received_at: string | null };
  if (invoice.received_at) return NextResponse.json({ ok: false, error: 'Already received' }, { status: 409 });
  const photo = Array.isArray(invoice.image_urls) && invoice.image_urls.length ? invoice.image_urls[0] : null;

  let received = 0;
  const errors: string[] = [];
  for (const ln of lines) {
    const sku = typeof ln.sku === 'string' ? ln.sku.trim() : '';
    const qty = Number(ln.quantity);
    if (!sku || !(qty > 0)) continue;
    const cost = Number(ln.cost_per_unit);
    const { error } = await admin.rpc('record_inventory_in', {
      p_product_sku: sku,
      p_quantity: qty,
      p_to_location_code: locationCode,
      p_supplier_code: null,
      p_invoice_number: invoice.invoice_ref,
      p_invoice_photo_url: photo,
      p_intake_id: null,
      p_batch_number: null,
      p_cost_per_unit: Number.isFinite(cost) ? cost : null,
      p_notes: 'Received from supplier invoice (founder receiving)',
    });
    if (error) errors.push(`${sku}: ${error.message}`);
    else received += 1;
  }

  // Only mark the invoice received if at least one line went in (else let the
  // founder fix the SKUs and retry).
  if (received > 0) {
    await admin.from('purchase_invoices').update({
      received_at: new Date().toISOString(),
      received_by: userId,
      status: mark === 'paid' ? 'paid' : 'unpaid',
      balance_owed: mark === 'paid' ? 0 : (invoice.total_amount ?? 0),
    }).eq('id', invoiceId);
  }

  return NextResponse.json({ ok: received > 0, received, errors, marked: received > 0 ? mark : null });
}
