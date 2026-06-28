// /api/webhooks/rbc-terminal
//
// RBC card-terminal payment webhook — STUBBED (signature validation BLOCKED on
// Julian: need RBC's algorithm + shared secret + sandbox). Until then this
// endpoint ONLY logs the raw payload to payment_webhooks and HOLDS — it takes
// NO action on any order. Nothing auto-confirms off an unvalidated webhook.
//
// When the docs land: validate the signature FIRST, then on 'approved' set the
// matched order's payment_approval_status='approved' + fire fulfillment.
//
// Returns 200 on a successful LOG. Returns 5xx if logging fails, so RBC retries
// (standard webhook behavior — no record is ever lost).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  let payload: unknown = null;
  try { payload = await req.json(); } catch { try { payload = await req.text(); } catch { payload = null; } }

  if (!url || !key) {
    // Can't persist → tell them to retry (5xx) rather than silently drop.
    return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 });
  }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const p = (payload && typeof payload === 'object') ? payload as Record<string, unknown> : {};
  const { error } = await admin.from('payment_webhooks').insert({
    source: 'rbc_terminal',
    webhook_id: typeof p.transaction_id === 'string' ? p.transaction_id : (typeof p.id === 'string' ? p.id : null),
    order_id: null,                         // matching happens after signature validation lands
    raw_payload: payload as object,
    status: 'received_unvalidated',         // NOT acted on — held until validation is wired
    signature_valid: null,
  });
  // Retry on persistence failure so no payment record is lost.
  if (error) return NextResponse.json({ ok: false, error: 'log failed' }, { status: 500 });
  return NextResponse.json({ ok: true, held: true, note: 'logged; awaiting signature validation' });
}
