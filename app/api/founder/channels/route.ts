// /api/founder/channels
//
// Channel Margins panel data. The six-channel matrix (Nassau/Andros/Online ×
// Retail/Wholesale), each with its own markup from supplier cost. Margins live
// in channel_markups (the DB source that drives per-product channel pricing).
//
//   GET  → the 6 channels with their current margin %.
//   POST { channel, margin_pct, apply_to_all? } → upsert the channel margin
//         (and, if apply_to_all, re-price every product on that channel from
//         its current cost via bsc_set_channel_price). Founder-only, service-role.
//
// Does not change tax math. apply_to_all is an explicit, confirmed action.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FOUNDER_ROLES = new Set(['founder', 'co_founder', 'control_admin']);

// channel → display + the sell_* flag that gates which products it applies to.
const CHANNELS: { channel: string; location: string; tier: string; sell_flag: string; default_pct: number }[] = [
  { channel: 'nassau_pos',       location: 'Nassau POS', tier: 'Retail',    sell_flag: 'sell_nassau',    default_pct: 40 },
  { channel: 'nassau_wholesale', location: 'Nassau POS', tier: 'Wholesale', sell_flag: 'sell_nassau',    default_pct: 22 },
  { channel: 'andros_pos',       location: 'Andros POS', tier: 'Retail',    sell_flag: 'sell_andros',    default_pct: 40 },
  { channel: 'andros_wholesale', location: 'Andros POS', tier: 'Wholesale', sell_flag: 'sell_andros',    default_pct: 22 },
  { channel: 'online_market',    location: 'Online',     tier: 'Retail',    sell_flag: 'sell_online',    default_pct: 35 },
  { channel: 'local_wholesale',  location: 'Online',     tier: 'Wholesale', sell_flag: 'sell_wholesale', default_pct: 19 },
];

async function gate(req: NextRequest): Promise<{ ok: true; admin: SupabaseClient; userId: string } | { ok: false; status: number; error: string }> {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return { ok: false, status: 500, error: 'Supabase not configured' };
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Sign in required' };
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { ok: false, status: 401, error: 'Invalid session' };
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !FOUNDER_ROLES.has(role)) return { ok: false, status: 403, error: 'Founder only.' };
  return { ok: true, admin: createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } }), userId: user.id };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { data } = await g.admin.from('channel_markups').select('channel, margin_pct');
  const map: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ channel: string; margin_pct: number | null }>) if (r.margin_pct != null) map[r.channel] = Number(r.margin_pct);
  const channels = CHANNELS.map(c => ({
    ...c,
    margin_pct: map[c.channel] != null ? Math.round(map[c.channel] * 1000) / 10 : c.default_pct, // 0.40 → 40
    configured: map[c.channel] != null,
  }));
  return NextResponse.json({ ok: true, channels });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (!g.ok) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { admin, userId } = g;
  let b: { channel?: unknown; margin_pct?: unknown; apply_to_all?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const cfg = CHANNELS.find(c => c.channel === b.channel);
  if (!cfg) return NextResponse.json({ ok: false, error: 'Unknown channel' }, { status: 400 });
  const pct = Number(b.margin_pct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 1000) return NextResponse.json({ ok: false, error: 'margin_pct must be 0–1000' }, { status: 400 });
  const marginFraction = Math.round((pct / 100) * 10000) / 10000; // 40 → 0.40

  const { error: upErr } = await admin.from('channel_markups')
    .upsert({ channel: cfg.channel, margin_pct: marginFraction, notes: `${cfg.location} ${cfg.tier}`, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'channel' });
  if (upErr) return NextResponse.json({ ok: false, error: `Save failed: ${upErr.message}` }, { status: 500 });

  let repriced = 0;
  if (b.apply_to_all === true) {
    // Re-price every product on this channel from its current cost.
    const { data: prods } = await admin.from('products').select('id').eq('status', 'active').eq(cfg.sell_flag, true);
    const ids = ((prods ?? []) as Array<{ id: string }>).map(p => p.id);
    for (const id of ids) {
      const { error } = await admin.rpc('bsc_set_channel_price', { p_product_id: id, p_channel: cfg.channel, p_margin: marginFraction, p_user: userId });
      if (!error) repriced++;
    }
  }
  try { await admin.from('ai_writes').insert({ tool: 'channel_margin_set', caller_id: userId, input: { channel: cfg.channel, margin_pct: pct, apply_to_all: b.apply_to_all === true }, result: { repriced }, status: 'success', error: null }); } catch { /* non-fatal */ }
  return NextResponse.json({ ok: true, channel: cfg.channel, margin_pct: pct, repriced });
}
