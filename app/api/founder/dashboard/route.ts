// /api/founder/dashboard
//
// Headline "today at a glance" numbers for the Founder dashboard (the oversight
// home). Founder-only. Server-authoritative: Bearer → profiles.role → service-
// role (bypasses RLS for a true company-wide read). The full narrative briefing
// lives at /founder-ai (BriefPanel); this is the fast top-line.
//
// Every block is defensive — orders.status/payment_status/channel are drifted
// free-text, so a bad value returns nulls, never a 500.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOUNDER_ROLES = new Set(['founder', 'co_founder', 'control_admin']);

function nassauMidnightISO(daysAgo = 0): string {
  const now = new Date();
  const nassauNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Nassau' }));
  const offsetMs = now.getTime() - nassauNow.getTime();
  const midnight = new Date(nassauNow);
  midnight.setHours(0, 0, 0, 0);
  midnight.setDate(midnight.getDate() - daysAgo);
  return new Date(midnight.getTime() + offsetMs).toISOString();
}

async function safeCount(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try { const { count, error } = await q; return error ? null : (count ?? 0); } catch { return null; }
}

const isPaid = (s: string | null) => s === 'paid' || s === 'paid_in_full';

export async function GET(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role, full_name').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  const fullName = (prof as { full_name?: string | null } | null)?.full_name ?? null;
  if (!role || !FOUNDER_ROLES.has(role)) return NextResponse.json({ ok: false, error: 'Founder only.' }, { status: 403 });

  const admin: SupabaseClient = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const startToday = nassauMidnightISO(0);
  const startYesterday = nassauMidnightISO(1);

  // ── Sales: pull the last 2 days of orders once, aggregate in JS ──
  let today = { orders: 0, revenue: 0, net_profit: 0 };
  let yesterday = { orders: 0, revenue: 0 };
  const channels: Record<string, { orders: number; revenue: number }> = {};
  let codOutstanding = 0, codCollectedToday = 0, deliveriesActive = 0;
  let salesOk = true;
  try {
    const { data, error } = await admin
      .from('orders')
      .select('created_at, total, net_profit, channel, payment_status, payment_method, payment_received_at, fulfillment_status')
      .gte('created_at', startYesterday);
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      created_at: string; total: number | null; net_profit: number | null; channel: string | null;
      payment_status: string | null; payment_method: string | null; payment_received_at: string | null; fulfillment_status: string | null;
    }>;
    for (const o of rows) {
      const total = Number(o.total) || 0;
      const isToday = o.created_at >= startToday;
      if (isToday) {
        today.orders += 1; today.revenue += total; today.net_profit += Number(o.net_profit) || 0;
        const ch = o.channel || 'other';
        const e = (channels[ch] ??= { orders: 0, revenue: 0 });
        e.orders += 1; e.revenue += total;
      } else {
        yesterday.orders += 1; yesterday.revenue += total;
      }
      // COD: money owed on delivery (any active order, not just today)
      if (!o.payment_received_at && !isPaid(o.payment_status)) codOutstanding += 1;
      if (o.payment_received_at && o.payment_received_at >= startToday) codCollectedToday += 1;
      if (o.fulfillment_status && ['collected', 'in_transit', 'out_for_delivery'].includes(o.fulfillment_status)) deliveriesActive += 1;
    }
    today = { orders: today.orders, revenue: Math.round(today.revenue * 100) / 100, net_profit: Math.round(today.net_profit * 100) / 100 };
    yesterday = { orders: yesterday.orders, revenue: Math.round(yesterday.revenue * 100) / 100 };
  } catch { salesOk = false; }

  // ── Operational + HACCP counts (independent + defensive) ──
  const [
    newPosToday, creditDue, activeLots, pendingQc, tempExcursionsToday, openCapas,
  ] = await Promise.all([
    safeCount(admin.from('purchase_orders').select('id', { count: 'exact', head: true }).gte('created_at', startToday)),
    safeCount(admin.from('orders').select('id', { count: 'exact', head: true }).eq('payment_status', 'account')),
    safeCount(admin.from('spinytails_lots').select('id', { count: 'exact', head: true }).not('status', 'in', '(shipped,rejected,recalled)')),
    safeCount(admin.from('spinytails_quality_inspections').select('id', { count: 'exact', head: true }).eq('result', 'pending')),
    safeCount(admin.from('spinytails_temperature_logs').select('id', { count: 'exact', head: true }).eq('within_limit', false).gte('logged_at', startToday)),
    safeCount(admin.from('spinytails_corrective_actions').select('id', { count: 'exact', head: true }).is('closed_at', null)),
  ]);

  const channelList = Object.entries(channels)
    .map(([channel, v]) => ({ channel, orders: v.orders, revenue: Math.round(v.revenue * 100) / 100 }))
    .sort((a, b) => b.revenue - a.revenue);

  return NextResponse.json({
    ok: true,
    founder: { name: fullName, role },
    sales: salesOk ? { today, yesterday, channels: channelList } : null,
    fulfillment: { cod_outstanding: salesOk ? codOutstanding : null, cod_collected_today: salesOk ? codCollectedToday : null, deliveries_active: salesOk ? deliveriesActive : null },
    operations: { new_pos_today: newPosToday, credit_due: creditDue, low_stock: null },
    haccp: { active_lots: activeLots, pending_qc: pendingQc, temp_excursions_today: tempExcursionsToday, open_capas: openCapas },
  });
}
