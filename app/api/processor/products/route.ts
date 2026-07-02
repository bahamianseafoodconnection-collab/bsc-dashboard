// /api/processor/products
//
// Receiving-product catalog = spinytails_species. Each product's `code` is the
// batch-number prefix (spinytails_next_batch_number does p_species_code||'-'||…),
// so a new product (e.g. Grouper → GRO) receives under its own prefix
// immediately. Optional CCP temp limits (fresh/frozen °F) feed Card 1's CCP-1
// check; blank = no temp enforcement (founder can refine later).
//
//   GET   → { ok, products: [{code,name,scientific_name,active,shelf_life_months,ccp_limits}] }
//   POST  { name, code, scientific_name?, shelf_life_months?, fresh_max_f?, frozen_max_f? }
//   PATCH { code, active }
//
// Role-gated, service-role.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver','operations','qc_staff']);

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
  if (!role || !ROLES.has(role)) return { error: `Role "${role ?? 'none'}" cannot manage products.`, status: 403 };
  return { admin: createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } }), userId: user.id };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { data, error } = await g.admin.from('spinytails_species')
    .select('code, name, scientific_name, active, shelf_life_months, ccp_limits').order('name');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, products: data ?? [] });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  let b: Record<string, unknown> = {};
  try { b = (await req.json()) as Record<string, unknown>; } catch { /* ignore */ }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

  const name = str(b.name);
  // code = batch prefix: letters/digits only, 2-4 chars, uppercased.
  const code = (str(b.code) ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
  if (!name) return NextResponse.json({ ok: false, error: 'Product name is required.' }, { status: 400 });
  if (code.length < 2) return NextResponse.json({ ok: false, error: 'Batch prefix must be 2–4 letters (e.g. GRO).' }, { status: 400 });

  const ccp: Record<string, number> = {};
  const fresh = num(b.fresh_max_f); if (fresh != null) ccp.fresh_max_f = fresh;
  const frozen = num(b.frozen_max_f); if (frozen != null) ccp.frozen_max_f = frozen;
  const shelf = num(b.shelf_life_months);

  const row: Record<string, unknown> = { code, name, scientific_name: str(b.scientific_name), ccp_limits: ccp, active: true };
  if (shelf != null && shelf > 0) row.shelf_life_months = Math.round(shelf);

  const { error } = await g.admin.from('spinytails_species').insert(row);
  if (error) {
    if (error.code === '23505') return NextResponse.json({ ok: false, error: `Batch prefix "${code}" already exists — pick another.` }, { status: 409 });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, code, name });
}

export async function PATCH(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  let b: { code?: unknown; active?: unknown } = {};
  try { b = (await req.json()) as typeof b; } catch { /* ignore */ }
  const code = typeof b.code === 'string' ? b.code : '';
  if (!code) return NextResponse.json({ ok: false, error: 'code required' }, { status: 400 });
  const { error } = await g.admin.from('spinytails_species').update({ active: b.active === true }).eq('code', code);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
