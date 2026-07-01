// /api/spinytails/inventory
//
// Barcode inventory for finished Spiny Tails cases. Cases are created 'in_holding'
// by the grading (lobster) / pack_conch (conch) actions, each with an inventory
// 'in' movement. This route handles the OUT side:
//   • scan_out — scan a case barcode → mark the case 'shipped', log an inventory
//     'out' movement with a destination. Idempotent (a second scan is a no-op).
//
// Server-authoritative, staff-gated. The on-hand view is read directly from
// spinytails_cases by the dashboard (RLS-scoped), so no GET here.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLES = new Set(['founder','co_founder','control_admin','manager','processor','receiver','qc_staff','operations']);

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ROLES.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot move inventory.` }, { status: 403 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const action = String(b.action ?? 'scan_out');
  if (action !== 'scan_out') return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });

  const code = str(b.case_code) ?? str(b.scanned_barcode);
  const destination = str(b.destination) ?? 'shipped';
  if (!code) return NextResponse.json({ ok: false, error: 'Scan or enter a case barcode.' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: c } = await admin.from('spinytails_cases')
    .select('id, lot_id, case_code, product_type, grade, conch_clean_pct, net_weight_lbs, status')
    .eq('case_code', code).maybeSingle<{ id: string; lot_id: string; case_code: string; product_type: string; grade: string | null; conch_clean_pct: number | null; net_weight_lbs: number; status: string }>();
  if (!c) return NextResponse.json({ ok: false, error: `Case "${code}" not found.` }, { status: 404 });
  if (c.status === 'shipped') {
    return NextResponse.json({ ok: true, already_out: true, case: c, message: 'Already scanned out.' });
  }
  if (c.status === 'recalled') {
    return NextResponse.json({ ok: false, error: `Case "${code}" is RECALLED — cannot ship.` }, { status: 409 });
  }

  const { error: upErr } = await admin.from('spinytails_cases')
    .update({ status: 'shipped', shipment_id: str(b.shipment_id) })
    .eq('id', c.id);
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  const { error: mvErr } = await admin.from('spinytails_inventory').insert({
    case_id: c.id, lot_id: c.lot_id, direction: 'out', freezer: 'holding',
    destination, product_type: c.product_type, grade: c.grade, qty_cases: 1,
    scanned_barcode: c.case_code, employee_id: user.id,
  });
  if (mvErr) console.warn('inventory out movement insert failed (non-fatal):', mvErr.message);

  return NextResponse.json({
    ok: true,
    case: { case_code: c.case_code, product_type: c.product_type, grade: c.grade, conch_clean_pct: c.conch_clean_pct, net_weight_lbs: c.net_weight_lbs },
    destination, status: 'shipped',
  });
}
