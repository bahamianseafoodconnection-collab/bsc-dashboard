// /api/cron/vendor-weekly-statements
//
// Monday 8am AST (12 UTC). For each vendor with orders in the previous
// Mon–Sun window, send a per-vendor email statement with: every order in
// the window, total revenue, total commission, net payout owed. Founder
// is CC'd via the cascading recipient list. Vendor address comes from
// vendors.contact_email.
//
// Does NOT auto-create vendor_payouts rows (avoids duplicates on re-runs);
// founder marks them paid manually in a future admin view. The email
// is the official artifact this week.

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

function previousWeekRange(): { fromIso: string; toIso: string; fromLabel: string; toLabel: string } {
  const now = new Date();
  const day = now.getUTCDay();
  const daysBackToSun = day === 0 ? 7 : day;
  const sun = new Date(now); sun.setUTCDate(now.getUTCDate() - daysBackToSun);
  const mon = new Date(sun); mon.setUTCDate(sun.getUTCDate() - 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    fromIso:   `${fmt(mon)}T00:00:00.000Z`,
    toIso:     `${fmt(sun)}T23:59:59.999Z`,
    fromLabel: fmt(mon),
    toLabel:   fmt(sun),
  };
}

interface VendorOrderRow {
  id: string;
  vendor_id: string;
  listing_id: string;
  quantity: number;
  total_price: number;
  commission_amount: number;
  vendor_payout: number;
  status: string;
  created_at: string;
}
interface VendorRow {
  id: string;
  display_name: string | null;
  business_name: string | null;
  contact_email: string | null;
}

function renderHtml(vendorName: string, orders: VendorOrderRow[], totals: { sales: number; commission: number; payout: number }, range: { fromLabel: string; toLabel: string }): string {
  const rows = orders.map(o => `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:8px 10px;font-size:11px;color:#475569;font-family:monospace;">${o.id.slice(0, 8)}</td>
      <td style="padding:8px 10px;font-size:11px;color:#475569;">${new Date(o.created_at).toLocaleDateString()}</td>
      <td style="padding:8px 10px;font-size:11px;color:#1a2e5a;">${o.status}</td>
      <td style="padding:8px 10px;text-align:right;font-size:11px;color:#475569;">${Number(o.quantity).toFixed(3)}</td>
      <td style="padding:8px 10px;text-align:right;font-size:11px;color:#1a2e5a;font-weight:700;">${dollars(Number(o.total_price))}</td>
      <td style="padding:8px 10px;text-align:right;font-size:11px;color:#475569;">${dollars(Number(o.commission_amount))}</td>
      <td style="padding:8px 10px;text-align:right;font-size:11px;color:#065f46;font-weight:700;">${dollars(Number(o.vendor_payout))}</td>
    </tr>`).join('');
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#e2e8f0;font-family:'DM Sans',system-ui,sans-serif;color:#1a2e5a;">
  <div style="max-width:780px;margin:24px auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 10px 30px -10px rgba(0,0,0,0.12);border-top:6px solid #f5c518;">
    <div style="text-align:center;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:18px;">
      <img src="https://bscbahamas.com/brand/bsc-marketplace-logo.png" alt="BSC" style="height:80px;width:auto;display:block;margin:0 auto;" />
      <div style="font-size:11px;font-weight:800;letter-spacing:1.5px;color:#a16207;text-transform:uppercase;margin-top:6px;">Vendor weekly statement</div>
    </div>
    <h2 style="margin:6px 0 4px;font-size:20px;color:#1a2e5a;">${vendorName}</h2>
    <p style="font-size:13px;color:#475569;margin:0 0 14px;">${range.fromLabel} → ${range.toLabel}</p>
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;margin-bottom:16px;">
      <tr>
        <td style="padding:10px 12px;border-right:1px solid #e2e8f0;"><div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Orders</div><div style="font-size:20px;font-weight:900;color:#1a2e5a;">${orders.length}</div></td>
        <td style="padding:10px 12px;border-right:1px solid #e2e8f0;"><div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Gross sales</div><div style="font-size:20px;font-weight:900;color:#1a2e5a;">${dollars(totals.sales)}</div></td>
        <td style="padding:10px 12px;border-right:1px solid #e2e8f0;"><div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Commission</div><div style="font-size:20px;font-weight:900;color:#b45309;">${dollars(totals.commission)}</div></td>
        <td style="padding:10px 12px;"><div style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;">Net payout</div><div style="font-size:22px;font-weight:900;color:#065f46;">${dollars(totals.payout)}</div></td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
      <thead><tr style="background:#f1f5f9;text-align:left;">
        <th style="padding:8px 10px;font-size:10px;color:#475569;text-transform:uppercase;">Order</th>
        <th style="padding:8px 10px;font-size:10px;color:#475569;text-transform:uppercase;">Date</th>
        <th style="padding:8px 10px;font-size:10px;color:#475569;text-transform:uppercase;">Status</th>
        <th style="padding:8px 10px;font-size:10px;color:#475569;text-transform:uppercase;text-align:right;">Qty</th>
        <th style="padding:8px 10px;font-size:10px;color:#475569;text-transform:uppercase;text-align:right;">Price</th>
        <th style="padding:8px 10px;font-size:10px;color:#475569;text-transform:uppercase;text-align:right;">Commission</th>
        <th style="padding:8px 10px;font-size:10px;color:#475569;text-transform:uppercase;text-align:right;">Payout</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:11px;color:#94a3b8;margin-top:18px;">
      BSC pays out via wire / cash by Friday of the following week. Reach the founder at +1 242 361-3474 or hello@bscbahamas.com with any disputes.
    </p>
  </div>
</body></html>`;
}

export async function GET(req: NextRequest) {
  const firedAt = new Date().toISOString();
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const supa = adminSupa();
  if (!supa) return NextResponse.json({ ok: false, error: 'Supabase service key missing' }, { status: 500 });

  const range = previousWeekRange();
  const { data: ords } = await supa
    .from('vendor_orders')
    .select('id, vendor_id, listing_id, quantity, total_price, commission_amount, vendor_payout, status, created_at')
    .gte('created_at', range.fromIso)
    .lte('created_at', range.toIso)
    .order('created_at', { ascending: true });
  const orders = (ords ?? []) as VendorOrderRow[];

  const vendorIds = Array.from(new Set(orders.map(o => o.vendor_id)));
  if (vendorIds.length === 0) {
    return NextResponse.json({ ok: true, fired_at: firedAt, week: range, vendors: 0, sent: 0, note: 'No vendor orders in window' });
  }

  const { data: vens } = await supa
    .from('vendors')
    .select('id, display_name, business_name, contact_email')
    .in('id', vendorIds);
  const vendorMap = new Map<string, VendorRow>();
  for (const v of (vens ?? []) as VendorRow[]) vendorMap.set(v.id, v);

  const cc = (process.env.CASHIER_VARIANCE_ALERT_EMAILS ?? process.env.AR_AGING_ALERT_EMAILS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean);

  let sent = 0; let skipped = 0;
  for (const vid of vendorIds) {
    const v = vendorMap.get(vid);
    if (!v) { skipped++; continue; }
    const myOrders = orders.filter(o => o.vendor_id === vid);
    const totals = myOrders.reduce(
      (acc, o) => ({
        sales:      acc.sales      + Number(o.total_price),
        commission: acc.commission + Number(o.commission_amount),
        payout:     acc.payout     + Number(o.vendor_payout),
      }),
      { sales: 0, commission: 0, payout: 0 },
    );
    const vendorName = v.business_name ?? v.display_name ?? '(unnamed vendor)';
    const html = renderHtml(vendorName, myOrders, totals, range);
    const subject = `Vendor weekly statement · ${vendorName} · ${range.fromLabel} → ${range.toLabel} · ${dollars(totals.payout)} owed`;
    const targets = [v.contact_email, ...cc].filter((x): x is string => !!x && /@/.test(x));
    if (targets.length === 0) { skipped++; continue; }
    const results = await Promise.allSettled(targets.map(to => sendEmail({ to, subject, html })));
    sent += results.filter(r => r.status === 'fulfilled').length;
  }

  return NextResponse.json({ ok: true, fired_at: firedAt, week: range, vendors: vendorIds.length, sent, skipped });
}
