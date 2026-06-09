// /api/admin/channel-margins
//
// Backs the "Margins" panel in /admin/inventory (founder direction
// 2026-05-28: "allow margin change to all products across all channels").
//
//   GET  → list every channel's current margin_pct + when/who last set it
//   POST → { channel, margin_pct } : persist the margin AND immediately
//          reprice every active product on that channel from its current
//          cost × (1 + margin). Calls bsc_apply_channel_margin() (RPC,
//          SECURITY DEFINER). Returns { repriced } count.
//
// Global pricing is high-impact, so this is tighter than the per-product
// editor: founder / co_founder / control_admin only.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['founder', 'co_founder', 'control_admin']);

const VALID_CHANNELS = new Set([
  'nassau_pos', 'andros_pos', 'online_market', 'local_wholesale', 'us_resale',
]);

// Resolve env + auth + role in one place. Returns either an error tuple
// or the admin (service-role) client plus the verified user.
async function authContext(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return { error: 'Supabase not configured', status: 500 as const };

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { error: 'Sign in required', status: 401 as const };

  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return { error: 'Invalid session', status: 401 as const };

  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return { error: `Role "${role ?? 'none'}" cannot change margins.`, status: 403 as const };
  }

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return { admin, user };
}

export async function GET(req: NextRequest) {
  const ctx = await authContext(req);
  if ('error' in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

  const { data, error } = await ctx.admin
    .from('channel_markups')
    .select('channel, margin_pct, notes, updated_at, updated_by')
    .order('channel');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, margins: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await authContext(req);
  if ('error' in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });

  let body: { channel?: unknown; margin_pct?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const channel = typeof body.channel === 'string' ? body.channel : '';
  const margin  = Number(body.margin_pct);
  if (!VALID_CHANNELS.has(channel)) {
    return NextResponse.json({ ok: false, error: `Unknown channel "${channel}"` }, { status: 400 });
  }
  if (!Number.isFinite(margin) || margin < 0 || margin > 5) {
    return NextResponse.json({ ok: false, error: 'margin_pct must be a number between 0 and 5 (e.g. 0.35 = 35%)' }, { status: 400 });
  }

  const { data, error } = await ctx.admin.rpc('bsc_apply_channel_margin', {
    p_channel: channel,
    p_margin:  margin,
    p_user:    ctx.user.id,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, channel, margin_pct: margin, repriced: Number(data ?? 0) });
}
