// app/api/inventory/onboard/route.ts
// BSC Inventory Onboard API
// Creates a new product + cost row + per-channel pricing rows.
// Manager+ -> status='active' (live immediately)
// Other staff roles -> status='pending_approval' (Dedrick reviews)
// Honors sell_nassau / sell_andros / sell_online / sell_wholesale toggles from the form.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

const ROLES_GO_LIVE = ['founder', 'co_founder', 'manager'];
const ROLES_PENDING = [
  'cashier',
  'right_hand',
  'supervisor',
  'processor',
  'andros_staff',
  'supplier',
];

const VALID_CHANNELS = ['nassau_pos', 'andros_pos', 'online_market', 'local_wholesale'];

type PricingInput = {
  channel: string;
  pricing_mode?: string;
  margin_multiplier?: number | null;
  vat_multiplier?: number | null;
  manual_unit_price?: number | null;
};

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anon || !service) {
      return NextResponse.json({ error: 'Server not configured.' }, { status: 500 });
    }

    const ssr = createServerClient(url, anon, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: CookieToSet[]) =>
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    });

    const {
      data: { user },
    } = await ssr.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userRow } = await admin
      .from('users')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    if (!userRow || !userRow.is_active) {
      return NextResponse.json({ error: 'Account inactive' }, { status: 403 });
    }

    const goLive = ROLES_GO_LIVE.includes(userRow.role);
    const isPending = ROLES_PENDING.includes(userRow.role);
    if (!goLive && !isPending) {
      return NextResponse.json(
        { error: `Your role (${userRow.role}) cannot onboard products` },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      barcode,
      sku,
      name,
      category,
      unit_of_measure,
      pack_size,
      description,
      image_url,
      cost_per_unit,
      pricing,
      supplier_id,
      is_bsc_processed,
      sell_nassau,
      sell_andros,
      sell_online,
      sell_wholesale,
    } = body;

    if (!name || !category || !unit_of_measure) {
      return NextResponse.json(
        { error: 'name, category, and unit_of_measure are required' },
        { status: 400 }
      );
    }

    // Resolve supplier id (suppliers can only onboard against their own record)
    let resolvedSupplierId = supplier_id || null;
    if (userRow.role === 'supplier') {
      const { data: supRow } = await admin
        .from('suppliers')
        .select('id')
        .eq('portal_user_id', user.id)
        .single();
      if (!supRow) {
        return NextResponse.json(
          { error: 'Supplier record not found' },
          { status: 403 }
        );
      }
      resolvedSupplierId = supRow.id;
    }

    const targetStatus = goLive ? 'active' : 'pending_approval';
    const finalSku = (sku || `BSC-${Date.now().toString().slice(-8)}`).trim();

    // Honor channel toggles from form (managers).
    // Pending products default all channels off until Dedrick reviews.
    const channelFlags = goLive
      ? {
          sell_nassau: !!sell_nassau,
          sell_andros: !!sell_andros,
          sell_online: !!sell_online,
          sell_wholesale: !!sell_wholesale,
        }
      : {
          sell_nassau: false,
          sell_andros: false,
          sell_online: false,
          sell_wholesale: false,
        };

    // Reject duplicate barcodes early so we surface a clear error.
    if (barcode) {
      const { data: existing } = await admin
        .from('products')
        .select('id, sku')
        .eq('barcode', barcode)
        .limit(1);
      if (existing && existing.length > 0) {
        return NextResponse.json(
          {
            error: `Barcode ${barcode} already exists for product ${existing[0].sku}`,
          },
          { status: 409 }
        );
      }
    }

    // 1. Insert product
    const { data: created, error: prodErr } = await admin
      .from('products')
      .insert({
        sku: finalSku,
        barcode: barcode || null,
        name,
        description: description || null,
        category,
        unit_of_measure,
        pack_size: pack_size || null,
        image_url: image_url || null,
        is_bsc_processed: !!is_bsc_processed,
        primary_supplier_id: resolvedSupplierId,
        status: targetStatus,
        ...channelFlags,
        created_by: user.id,
      })
      .select()
      .single();

    if (prodErr || !created) {
      return NextResponse.json(
        { error: `Product creation failed: ${prodErr?.message || 'unknown'}` },
        { status: 500 }
      );
    }

    // 2. Cost row (if provided)
    let costInserted = false;
    if (cost_per_unit != null && Number(cost_per_unit) > 0) {
      const { error: costErr } = await admin.from('product_costs').insert({
        product_id: created.id,
        supplier_id: resolvedSupplierId,
        cost_type: 'standard',
        cost_per_unit: Number(cost_per_unit),
        unit_of_measure,
        shipping_per_lb: 0,
        customs_duty_pct: 0,
        vat_levy_pct: 0,
        processing_fee: 0,
        effective_from: new Date().toISOString(),
        is_current: true,
        recorded_by: user.id,
      });
      if (costErr) {
        return NextResponse.json({
          success: true,
          partial: true,
          product: created,
          warning: `Product created but cost insert failed: ${costErr.message}`,
        });
      }
      costInserted = true;
    }

    // 3. Pricing rows (managers only). Iterate all rows the form sends.
    let pricingInserted = 0;
    if (Array.isArray(pricing) && pricing.length > 0 && goLive) {
      for (const p of pricing as PricingInput[]) {
        if (!p.channel || !VALID_CHANNELS.includes(p.channel)) continue;
        const mode = p.pricing_mode || 'formula';
        if (mode === 'formula') {
          const m = p.margin_multiplier ?? null;
          if (typeof m !== 'number' || isNaN(m) || m <= 0) continue;
        } else if (mode === 'manual_override') {
          const mp = p.manual_unit_price ?? null;
          if (typeof mp !== 'number' || isNaN(mp) || mp < 0) continue;
        } else {
          continue;
        }

        const { error: priceErr } = await admin.from('product_pricing').insert({
          product_id: created.id,
          channel: p.channel,
          pricing_mode: mode,
          margin_multiplier: mode === 'formula' ? p.margin_multiplier : 1.0,
          vat_multiplier: p.vat_multiplier ?? 1.0,
          manual_unit_price:
            mode === 'manual_override' ? p.manual_unit_price ?? null : null,
          shipping_per_lb: 0,
          customs_duty_pct: 0,
          vat_levy_pct: 0,
          per_transaction_fee: 0,
          service_fee_pct: 0,
          effective_from: new Date().toISOString(),
          is_current: true,
          is_active: true,
          recorded_by: user.id,
        });
        if (!priceErr) pricingInserted++;
      }
    }

    // 4. Build the response message
    let message: string;
    if (goLive) {
      const parts: string[] = [`Live: ${finalSku}`];
      if (costInserted) parts.push('cost set');
      if (pricingInserted > 0) {
        parts.push(`${pricingInserted} channel${pricingInserted === 1 ? '' : 's'} priced`);
      }
      message = parts.join(' - ');
    } else {
      message = `Submitted ${finalSku} for approval. Dedrick will review.`;
    }

    return NextResponse.json({
      success: true,
      product: created,
      status: targetStatus,
      sku: finalSku,
      pricing_count: pricingInserted,
      cost_set: costInserted,
      message,
    });
  } catch (e) {
    console.error('Onboard error:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
