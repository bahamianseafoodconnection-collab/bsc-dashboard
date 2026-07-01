// /api/processor/inventory-in
//
// Card 2: inventory intake of FINISHED product from a supplier (not a boat).
// Thin wrapper over the DB-authoritative record_inventory_in() RPC (SECURITY
// DEFINER) — records an 'in' movement into inventory_movements with supplier +
// cost + invoice. Role-gated; the RPC is called through the caller's session so
// recorded_by = the actual staff member (auth.uid()).
//
// Body: { sku, quantity, to_location_code, supplier_code?, cost_per_unit?,
//         invoice_number?, invoice_photo_url?, notes? }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver','operations','supplier_handler']);

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !anonKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  // Caller-scoped client → the RPC's auth.uid() resolves to this staff member.
  const uc = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: uErr } = await uc.auth.getUser();
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await uc.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ROLES.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot receive inventory.` }, { status: 403 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

  const sku      = str(b.sku);
  const quantity = num(b.quantity);
  const locCode  = str(b.to_location_code);
  if (!sku)      return NextResponse.json({ ok: false, error: 'Select a product.' }, { status: 400 });
  if (!(quantity && quantity > 0)) return NextResponse.json({ ok: false, error: 'Quantity must be > 0.' }, { status: 400 });
  if (!locCode)  return NextResponse.json({ ok: false, error: 'Select an inventory location.' }, { status: 400 });

  const { data, error } = await uc.rpc('record_inventory_in', {
    p_product_sku:       sku,
    p_quantity:          quantity,
    p_to_location_code:  locCode,
    p_supplier_code:     str(b.supplier_code),
    p_invoice_number:    str(b.invoice_number),
    p_invoice_photo_url: str(b.invoice_photo_url),
    p_intake_id:         null,
    p_batch_number:      null,
    p_cost_per_unit:     num(b.cost_per_unit),
    p_notes:             str(b.notes),
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, movement_id: data });
}
