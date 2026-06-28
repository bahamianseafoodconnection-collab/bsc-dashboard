// /api/webhooks/plug-n-pay
//
// Plug'n Pay online payment webhook — STUBBED. Logs the raw payload to
// payment_webhooks and HOLDS; takes NO order action until signature validation
// is wired (need to confirm PnP webhook support + secret; else fall back to
// 5-min polling). Returns 200 on log, 5xx on log failure (so PnP retries).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  let payload: unknown = null;
  try { payload = await req.json(); } catch { try { payload = await req.text(); } catch { payload = null; } }

  if (!url || !key) return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 });
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const p = (payload && typeof payload === 'object') ? payload as Record<string, unknown> : {};
  const { error } = await admin.from('payment_webhooks').insert({
    source: 'plug_n_pay',
    webhook_id: typeof p.orderID === 'string' ? p.orderID : (typeof p.transaction_id === 'string' ? p.transaction_id : null),
    order_id: null,
    raw_payload: payload as object,
    status: 'received_unvalidated',
    signature_valid: null,
  });
  if (error) return NextResponse.json({ ok: false, error: 'log failed' }, { status: 500 });
  return NextResponse.json({ ok: true, held: true, note: 'logged; awaiting signature validation' });
}
