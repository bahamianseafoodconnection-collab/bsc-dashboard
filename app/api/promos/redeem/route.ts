// app/api/promos/redeem/route.ts
//
// Record that a promo was applied to an order. Increments uses_count and
// inserts a promo_redemptions row. Called server-side from checkout right
// after the order insert succeeds.
//
// Body:
//   { promo_id, promo_code, order_id, customer_id?, customer_email?,
//     customer_phone?, applied_amount }

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  promo_id?: string;
  promo_code?: string;
  order_id?: string | null;
  customer_id?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  applied_amount?: number;
};

export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 }); }

  if (!body.promo_id || !body.promo_code || !Number.isFinite(body.applied_amount))
    return NextResponse.json({ ok: false, error: 'Missing required fields' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service)
    return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error: insErr } = await admin.from('promo_redemptions').insert({
    promo_id: body.promo_id,
    promo_code: String(body.promo_code).toUpperCase(),
    order_id: body.order_id ?? null,
    customer_id: body.customer_id ?? null,
    customer_email: body.customer_email ?? null,
    customer_phone: body.customer_phone ?? null,
    applied_amount: Number(body.applied_amount),
  });

  // Increment uses_count via fetch + update (race acceptable for our scale).
  const { data: cur } = await admin
    .from('promo_codes')
    .select('uses_count')
    .eq('id', body.promo_id)
    .maybeSingle();
  if (cur) {
    await admin
      .from('promo_codes')
      .update({ uses_count: Number(cur.uses_count || 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', body.promo_id);
  }

  if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
