// Vercel cron — /api/cron/daily-briefing
//
// Scheduled in vercel.json at "0 1 * * *" UTC (= 9 PM AST during EDT,
// the Bahamian default most of the year).
//
// Real implementation (replaces the prior scaffold): pulls today's
// customer pulse + lot consumption + sales totals, renders a branded
// HTML email, sends to the AR/variance recipient list, logs the run to
// daily_briefings. The bank-data + AI-generated narrative will land in
// a future pass — this version gives the founder the "who came back +
// what shipped from which lot + what we made today" view by email so
// they don't have to open the dashboard.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${expected}`;
}

function adminSupa(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function dollars(n: number): string {
  return n < 0 ? `−$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;
}

function startOfTodayUtc(): string { const d = new Date(); d.setUTCHours(0,0,0,0); return d.toISOString(); }
function endOfTodayUtc(): string   { const d = new Date(); d.setUTCHours(23,59,59,999); return d.toISOString(); }

interface OrderRow {
  id: string; created_at: string; customer_id: string | null;
  customer_name: string | null; total: number | null; net_profit: number | null;
  order_type: string | null; wholesale_items: unknown;
}

async function buildBriefing(admin: SupabaseClient) {
  const fromIso = startOfTodayUtc();
  const toIso   = endOfTodayUtc();

  // Today's orders.
  const { data: ords } = await admin
    .from('orders')
    .select('id, created_at, customer_id, customer_name, total, net_profit, order_type, wholesale_items')
    .gte('created_at', fromIso)
    .lte('created_at', toIso);
  const orders = (ords ?? []) as OrderRow[];

  // Today's lot consumption (via the junction table we just shipped).
  let lotRows: Array<{ lot_code: string; customer_name: string | null; qty_lbs: number | null }> = [];
  if (orders.length > 0) {
    const orderIds = orders.map(o => o.id);
    const { data: olc } = await admin
      .from('order_lot_consumption')
      .select('quantity_lbs, lot:spinytails_lots(lot_code), orders(customer_name)')
      .in('order_id', orderIds);
    lotRows = ((olc ?? []) as unknown as Array<{
      quantity_lbs: number | null;
      lot: { lot_code: string } | { lot_code: string }[] | null;
      orders: { customer_name: string | null } | { customer_name: string | null }[] | null;
    }>).map(r => {
      const lot   = Array.isArray(r.lot)    ? r.lot[0]    : r.lot;
      const order = Array.isArray(r.orders) ? r.orders[0] : r.orders;
      return {
        lot_code:      lot?.lot_code ?? '',
        customer_name: order?.customer_name ?? null,
        qty_lbs:       r.quantity_lbs,
      };
    }).filter(r => !!r.lot_code);
  }

  // Returning vs new customers (using customers.first_seen_at).
  const WALK_IN_ID = '00000000-0000-0000-0000-000000000001';
  const customerIds = Array.from(new Set(
    orders.map(o => o.customer_id).filter((id): id is string => !!id && id !== WALK_IN_ID),
  ));
  const custs: Array<{ id: string; full_name: string | null; first_seen_at: string | null; total_orders: number | null; total_spent: number | null }> = [];
  if (customerIds.length > 0) {
    const { data } = await admin.from('customers')
      .select('id, full_name, first_seen_at, total_orders, total_spent')
      .in('id', customerIds);
    if (data) custs.push(...data);
  }

  const todayStartMs = new Date(fromIso).getTime();
  type CustPerCust = { id: string; name: string; orders: number; revenue: number; profit: number; is_returning: boolean };
  const perCustomer: CustPerCust[] = customerIds.map(cid => {
    const c = custs.find(x => x.id === cid);
    const myOrders = orders.filter(o => o.customer_id === cid);
    const firstSeenMs = c?.first_seen_at ? new Date(c.first_seen_at).getTime() : todayStartMs;
    return {
      id: cid,
      name: c?.full_name ?? myOrders[0]?.customer_name ?? '(unknown)',
      orders: myOrders.length,
      revenue: myOrders.reduce((s, o) => s + Number(o.total ?? 0), 0),
      profit:  myOrders.reduce((s, o) => s + Number(o.net_profit ?? 0), 0),
      is_returning: firstSeenMs < todayStartMs,
    };
  });
  perCustomer.sort((a, b) => b.profit - a.profit);

  const stats = {
    total_orders:    orders.length,
    total_revenue:   orders.reduce((s, o) => s + Number(o.total ?? 0), 0),
    total_profit:    orders.reduce((s, o) => s + Number(o.net_profit ?? 0), 0),
    unique:          perCustomer.length,
    returning:       perCustomer.filter(p => p.is_returning).length,
    new_today:       perCustomer.filter(p => !p.is_returning).length,
    walk_in_orders:  orders.filter(o => o.customer_id === WALK_IN_ID).length,
    lots_consumed:   new Set(lotRows.map(r => r.lot_code)).size,
  };

  return { stats, perCustomer, lotRows };
}

function renderHtml(briefing: Awaited<ReturnType<typeof buildBriefing>>, dateStr: string): string {
  const { stats, perCustomer, lotRows } = briefing;
  const customerRows = perCustomer.slice(0, 25).map(c => `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:8px 10px;font-size:12px;color:#1a2e5a;">
        <strong>${c.name}</strong>
        <span style="font-size:9px;padding:1px 6px;border-radius:8px;margin-left:6px;background:${c.is_returning?'#dcfce7':'#fef3c7'};color:${c.is_returning?'#065f46':'#92400e'};font-weight:800;">${c.is_returning?'RETURN':'NEW'}</span>
      </td>
      <td style="padding:8px 10px;text-align:right;font-size:12px;color:#475569;">${c.orders}</td>
      <td style="padding:8px 10px;text-align:right;font-size:12px;color:#1a2e5a;font-weight:700;">${dollars(c.revenue)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:12px;font-weight:700;color:${c.profit<0?'#9b1c1c':'#065f46'};">${dollars(c.profit)}</td>
    </tr>`).join('');

  const lotMap = new Map<string, Set<string>>();
  for (const r of lotRows) {
    if (!r.customer_name) continue;
    const set = lotMap.get(r.lot_code) ?? new Set<string>();
    set.add(r.customer_name);
    lotMap.set(r.lot_code, set);
  }
  const lotsHtml = lotMap.size === 0
    ? '<p style="font-size:12px;color:#94a3b8;">No verified lot consumption today. (Recorded at packout via /spinytails/lots/&lt;code&gt;.)</p>'
    : '<ul style="font-size:12px;color:#1a2e5a;line-height:1.6;padding-left:18px;margin:0;">'
      + Array.from(lotMap.entries()).map(([lot, set]) => `<li><strong style="font-family:monospace">${lot}</strong> → ${Array.from(set).join(', ')}</li>`).join('')
      + '</ul>';

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#e2e8f0;font-family:'DM Sans',system-ui,sans-serif;color:#1a2e5a;">
  <div style="max-width:780px;margin:24px auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 10px 30px -10px rgba(0,0,0,0.12);border-top:6px solid #f5c518;">
    <div style="text-align:center;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:18px;">
      <img src="https://bscbahamas.com/brand/bsc-marketplace-logo.png" alt="BSC Market Place" style="height:90px;width:auto;display:block;margin:0 auto;" />
      <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;color:#a16207;text-transform:uppercase;margin-top:6px;">Daily briefing — ${dateStr}</div>
    </div>

    <h2 style="margin:6px 0 12px;font-size:22px;color:#1a2e5a;">Today at a glance</h2>
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;margin-bottom:16px;">
      <tr>
        <td style="padding:10px 12px;border-right:1px solid #e2e8f0;">
          <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Orders</div>
          <div style="font-size:20px;font-weight:900;color:#1a2e5a;">${stats.total_orders}</div>
        </td>
        <td style="padding:10px 12px;border-right:1px solid #e2e8f0;">
          <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Revenue</div>
          <div style="font-size:20px;font-weight:900;color:#1a2e5a;">${dollars(stats.total_revenue)}</div>
        </td>
        <td style="padding:10px 12px;border-right:1px solid #e2e8f0;">
          <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Net profit</div>
          <div style="font-size:20px;font-weight:900;color:${stats.total_profit<0?'#9b1c1c':'#065f46'};">${dollars(stats.total_profit)}</div>
        </td>
        <td style="padding:10px 12px;">
          <div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Customers</div>
          <div style="font-size:20px;font-weight:900;color:#1a2e5a;">${stats.unique} <span style="font-size:11px;font-weight:600;color:#475569;">(${stats.returning} return / ${stats.new_today} new)</span></div>
        </td>
      </tr>
    </table>

    <h3 style="margin:18px 0 6px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#475569;">Customer pulse (top 25 by profit)</h3>
    ${perCustomer.length === 0
      ? '<p style="font-size:12px;color:#94a3b8;">No identified customers today (walk-in-only day or zero sales).</p>'
      : `<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
          <thead><tr style="background:#f1f5f9;text-align:left;">
            <th style="padding:8px 10px;font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Customer</th>
            <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;">Orders</th>
            <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;">Revenue</th>
            <th style="padding:8px 10px;font-size:10px;color:#475569;text-align:right;">Profit</th>
          </tr></thead>
          <tbody>${customerRows}</tbody>
        </table>`}

    <h3 style="margin:18px 0 6px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#475569;">Lot consumption today (${lotMap.size})</h3>
    ${lotsHtml}

    <p style="font-size:11px;color:#94a3b8;margin-top:18px;">
      Live view: <a href="https://bscbahamas.com/dashboard/customer-pulse" style="color:#1a2e5a;">/dashboard/customer-pulse</a> · Walk-in anon orders today: ${stats.walk_in_orders}.
    </p>
    <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:18px;">
      BSC daily briefing · ${new Date().toLocaleString()}
    </p>
  </div>
</body></html>`;
}

export async function GET(req: NextRequest) {
  const firedAt = new Date().toISOString();
  console.log('[cron/daily-briefing] triggered at', firedAt);
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const supa = adminSupa();
  if (!supa) return NextResponse.json({ ok: false, error: 'Supabase service key missing' }, { status: 500 });

  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  const briefing = await buildBriefing(supa);
  const html = renderHtml(briefing, dateStr);

  const list = (process.env.CASHIER_VARIANCE_ALERT_EMAILS
              ?? process.env.AR_AGING_ALERT_EMAILS
              ?? '')
    .split(',').map(s => s.trim()).filter(Boolean);

  let sent = 0;
  if (list.length > 0) {
    const subject = `📰 BSC daily briefing · ${dateStr} · ${briefing.stats.total_orders} orders · ${dollars(briefing.stats.total_revenue)}`;
    const results = await Promise.allSettled(list.map(to => sendEmail({ to, subject, html })));
    sent = results.filter(r => r.status === 'fulfilled').length;
  }

  await supa.from('daily_briefings').insert({
    briefing_date:     new Date().toISOString().slice(0, 10),
    raw_data_json:     briefing,
    generated_content: html,
    sent_to:           list,
    status:            list.length === 0 ? 'no_recipients' : 'sent',
  });

  return NextResponse.json({
    ok: true, fired_at: firedAt,
    stats: briefing.stats,
    recipients_attempted: list.length, recipients_sent: sent,
  });
}

export async function POST(req: NextRequest) {
  // Manual founder trigger; same handler.
  return GET(req);
}
