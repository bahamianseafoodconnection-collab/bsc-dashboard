// app/api/landed-cost/calculate/route.ts
//
// Server-side landed-cost calculator. Pulls the current duty rate for a
// category from public.customs_duty_rates, then computes the full Bahamas
// import cost stack: FOB + freight + insurance + duty + stamp tax +
// environmental levy. Optionally returns sacred-rule retail prices per
// channel so the supplier portal can show "if you supply at $X FOB,
// here's what BSC sells it at and what BSC's margin is."
//
// POST body:
//   {
//     duty_category_code?: string,    // matches customs_duty_rates.category_code
//     duty_pct_override?:  number,    // optional manual override (0-100)
//     fob_cost:            number,    // BSD per same unit as freight
//     freight:             number,    // BSD per same unit
//     insurance:           number,    // BSD; default 0
//     unit_weight_lbs?:    number,    // optional, for per-lb pricing
//     case_units?:         number     // optional, for per-unit pricing
//   }
//
// Returns the full cost breakdown + sacred-rule pricing per channel.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sellPriceFromCost, type PricingChannel } from '@/lib/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  duty_category_code?: string;
  duty_pct_override?: number;
  fob_cost?: number;
  freight?: number;
  insurance?: number;
  unit_weight_lbs?: number;
  case_units?: number;
};

const PRICING_CHANNELS: PricingChannel[] = [
  'nassau_pos', 'andros_pos', 'online_market', 'local_wholesale', 'us_resale',
];

export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 }); }

  const fob = Number(body.fob_cost);
  const freight = Number(body.freight ?? 0);
  const insurance = Number(body.insurance ?? 0);
  if (!Number.isFinite(fob) || fob <= 0)
    return NextResponse.json({ ok: false, error: 'fob_cost is required and must be > 0' }, { status: 400 });
  if (!Number.isFinite(freight) || freight < 0)
    return NextResponse.json({ ok: false, error: 'freight must be >= 0' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey)
    return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });

  // Anon client is fine — duty rates are public read.
  const supa = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Look up duty rate. Override wins if provided; otherwise look up by code.
  let duty_pct = 0;
  let stamp_tax_pct = 1.0;
  let environmental_levy_pct = 0;
  let category: { code: string; label: string; confirmed: boolean } | null = null;

  if (typeof body.duty_pct_override === 'number') {
    duty_pct = body.duty_pct_override;
    category = { code: 'manual_override', label: `Manual override (${duty_pct}%)`, confirmed: false };
  } else if (body.duty_category_code) {
    const { data, error } = await supa
      .from('customs_duty_rates')
      .select('category_code, category_label, duty_pct, stamp_tax_pct, environmental_levy_pct, confirmed_by_user, applies_stamp_tax, applies_environmental_levy')
      .eq('category_code', body.duty_category_code)
      .eq('active', true)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: false, error: `Category not found: ${body.duty_category_code}. Run sql/2026-05-09-customs-duty.sql.` }, { status: 404 });
    duty_pct = Number(data.duty_pct);
    stamp_tax_pct = data.applies_stamp_tax ? Number(data.stamp_tax_pct) : 0;
    environmental_levy_pct = data.applies_environmental_levy ? Number(data.environmental_levy_pct) : 0;
    category = { code: data.category_code, label: data.category_label, confirmed: !!data.confirmed_by_user };
  } else {
    return NextResponse.json({ ok: false, error: 'Provide either duty_category_code or duty_pct_override' }, { status: 400 });
  }

  // Bahamas customs is duty on CIF (cost + insurance + freight).
  const cif = fob + freight + insurance;
  const duty = cif * (duty_pct / 100);
  const stamp_tax = cif * (stamp_tax_pct / 100);
  const environmental_levy = cif * (environmental_levy_pct / 100);
  const landed = cif + duty + stamp_tax + environmental_levy;

  const round = (n: number) => Math.round(n * 100) / 100;

  // Sacred-rule pricing per channel
  const pricing: Record<string, number> = {};
  for (const ch of PRICING_CHANNELS) {
    pricing[ch] = round(sellPriceFromCost(landed, ch));
  }

  // Per-lb / per-unit derivatives
  const per_lb = body.unit_weight_lbs && body.unit_weight_lbs > 0
    ? {
        unit_weight_lbs: body.unit_weight_lbs,
        landed_per_lb: round(landed / body.unit_weight_lbs),
        pricing_per_lb: Object.fromEntries(
          PRICING_CHANNELS.map((ch) => [ch, round(pricing[ch] / body.unit_weight_lbs!)]),
        ),
      }
    : null;

  const per_unit = body.case_units && body.case_units > 0
    ? {
        case_units: body.case_units,
        landed_per_unit: round(landed / body.case_units),
        pricing_per_unit: Object.fromEntries(
          PRICING_CHANNELS.map((ch) => [ch, round(pricing[ch] / body.case_units!)]),
        ),
      }
    : null;

  return NextResponse.json({
    ok: true,
    category,
    inputs: {
      fob: round(fob),
      freight: round(freight),
      insurance: round(insurance),
      duty_pct,
      stamp_tax_pct,
      environmental_levy_pct,
    },
    cost_breakdown: {
      fob: round(fob),
      freight: round(freight),
      insurance: round(insurance),
      cif: round(cif),
      duty: round(duty),
      stamp_tax: round(stamp_tax),
      environmental_levy: round(environmental_levy),
      landed: round(landed),
    },
    pricing,
    per_lb,
    per_unit,
  });
}
