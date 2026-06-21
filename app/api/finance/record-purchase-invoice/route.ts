// /api/finance/record-purchase-invoice
//
// Server-authoritative persistence for a scanned supplier invoice (Phase 5
// batch 8). Replaces the browser→RLS-direct purchase_invoices.insert() in
// components/InvoiceScanner.tsx.
//
// The AI split (/api/invoice-scan) is unauthenticated and only READS the photo;
// the money record it produces must be written behind an auth + role gate. The
// total and balance are RE-DERIVED here from the line items — the client's
// arithmetic is never trusted for what BSC owes a supplier.
//
// Body: { location, margin, items: [{ price, ... }], summary? }
// Resp: { ok, id, total_amount, balance_owed }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin', 'manager']);

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  }
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot record purchase invoices.` }, { status: 403 });
  }

  let b: { location?: unknown; margin?: unknown; items?: unknown; summary?: unknown };
  try { b = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const location = typeof b.location === 'string' ? b.location : null;
  const margin = typeof b.margin === 'number' && Number.isFinite(b.margin) && b.margin >= 0 && b.margin < 1 ? b.margin : null;
  const items = Array.isArray(b.items) ? b.items as Array<Record<string, unknown>> : [];
  const summary = typeof b.summary === 'string' ? b.summary : '';
  if (margin === null) return NextResponse.json({ ok: false, error: 'margin must be a fraction in [0,1)' }, { status: 400 });
  if (items.length === 0) return NextResponse.json({ ok: false, error: 'No invoice items to record' }, { status: 400 });

  // Re-derive the total server-side from the line items — never trust a client
  // total for what BSC owes a supplier. Prices arrive as strings like "BSD $12.50".
  const total = items.reduce((s, it) => {
    const raw = typeof it.price === 'string' ? it.price : String(it.price ?? '');
    const n = parseFloat(raw.replace(/[^0-9.]/g, '') || '0');
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  const totalRounded = Math.round(total * 100) / 100;
  const balanceOwed = Math.round(total * (1 - margin) * 100) / 100;

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let newId: string | null = null;
  let err: string | null = null;
  try {
    const { data, error } = await admin.from('purchase_invoices').insert({
      invoice_ref:  `BSC-INV-${Date.now()}`,
      location,
      total_amount: totalRounded,
      balance_owed: balanceOwed,
      status:       'unpaid',
      items,
      summary,
    }).select('id').single();
    if (error) err = error.message; else newId = (data as { id: string }).id;
  } catch (e) {
    err = e instanceof Error ? e.message : 'insert failed';
  }

  try {
    await admin.from('ai_writes').insert({
      tool:      'finance_record_purchase_invoice',
      caller_id: user.id,
      input:     { location, margin, item_count: items.length },
      result:    { id: newId, total_amount: totalRounded, balance_owed: balanceOwed, role },
      status:    err ? 'error' : 'success',
      error:     err,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  if (err) return NextResponse.json({ ok: false, error: `Could not record invoice: ${err}` }, { status: 500 });
  return NextResponse.json({ ok: true, id: newId, total_amount: totalRounded, balance_owed: balanceOwed });
}
