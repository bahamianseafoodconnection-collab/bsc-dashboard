// app/api/promos/validate/route.ts
//
// Validate a promo code against the cart subtotal + (optionally) a customer
// identifier (email or phone). Returns the discount amount that would apply
// or a friendly reason why the code is invalid.
//
// This is the source of truth for promo math. The checkout UI calls this on
// blur of the code input AND immediately before the order is created, then
// stores the resulting promo_code + applied_amount on the order itself.
//
// Body:
//   { code: string, subtotal: number, email?: string, phone?: string }
//
// Response (200 always — invalid codes are { valid: false, reason }):
//   { valid: true,  code, discount_amount, discount_type, discount_value }
//   { valid: false, reason }

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  code?: string;
  subtotal?: number;
  email?: string | null;
  phone?: string | null;
};

export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ valid: false, reason: 'Invalid request' }, { status: 400 }); }

  const code = (body.code || '').trim().toUpperCase();
  const subtotal = Number(body.subtotal);
  if (!code) return NextResponse.json({ valid: false, reason: 'Enter a code' });
  if (!Number.isFinite(subtotal) || subtotal <= 0)
    return NextResponse.json({ valid: false, reason: 'Add items to your cart first' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service)
    return NextResponse.json({ valid: false, reason: 'Promo lookup unavailable' }, { status: 500 });

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: promo, error } = await admin
    .from('promo_codes')
    .select('*')
    .ilike('code', code)
    .maybeSingle();

  if (error || !promo) return NextResponse.json({ valid: false, reason: 'Code not found' });
  if (!promo.active)   return NextResponse.json({ valid: false, reason: 'This code is no longer active' });

  const now = new Date();
  if (promo.valid_from && new Date(promo.valid_from) > now)
    return NextResponse.json({ valid: false, reason: 'This code is not yet active' });
  if (promo.valid_until && new Date(promo.valid_until) < now)
    return NextResponse.json({ valid: false, reason: 'This code has expired' });
  if (promo.min_subtotal && subtotal < Number(promo.min_subtotal))
    return NextResponse.json({
      valid: false,
      reason: `Minimum subtotal of BSD $${Number(promo.min_subtotal).toFixed(2)} required`,
    });
  if (promo.max_uses != null && Number(promo.uses_count || 0) >= Number(promo.max_uses))
    return NextResponse.json({ valid: false, reason: 'This code has reached its usage limit' });

  // Single-use-per-customer: best-effort, by email or phone.
  if (promo.single_use_per_customer) {
    const orParts: string[] = [];
    if (body.email) orParts.push(`customer_email.ilike.${body.email}`);
    if (body.phone) orParts.push(`customer_phone.eq.${body.phone}`);
    if (orParts.length > 0) {
      const { data: prior } = await admin
        .from('promo_redemptions')
        .select('id')
        .eq('promo_id', promo.id)
        .or(orParts.join(','))
        .limit(1);
      if (prior && prior.length > 0)
        return NextResponse.json({ valid: false, reason: 'You have already used this code' });
    }
  }

  let discount =
    promo.discount_type === 'percent'
      ? +(subtotal * (Number(promo.discount_value) / 100)).toFixed(2)
      : +Math.min(Number(promo.discount_value), subtotal).toFixed(2);
  if (discount > subtotal) discount = subtotal;
  if (discount < 0) discount = 0;

  return NextResponse.json({
    valid: true,
    code: String(promo.code).toUpperCase(),
    promo_id: promo.id,
    discount_amount: discount,
    discount_type: promo.discount_type,
    discount_value: Number(promo.discount_value),
    description: promo.description || null,
  });
}
