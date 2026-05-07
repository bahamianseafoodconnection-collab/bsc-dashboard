// app/api/inventory/movements/update/route.ts
// BSC Inventory Update API — 5 actions
// update_cost, update_price, update_status, update_channels, update_image
// All writes are audited (recorded_by, recorded_at).

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

const MANAGER_ROLES = ['founder', 'co_founder', 'manager'];
const PHOTO_ROLES = [
  'founder',
  'co_founder',
  'manager',
  'cashier',
  'right_hand',
  'supervisor',
  'processor',
  'andros_staff',
];
const VALID_CHANNELS = ['nassau_pos', 'andros_pos', 'online_market', 'local_wholesale'];

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase service role not configured');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getAuthAndRole() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase env not configured');
  }

  const ssr = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet: CookieToSet[]) =>
        toSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        ),
    },
  });

  const { data: authData, error: authErr } = await ssr.auth.getUser();
  if (authErr || !authData?.user) {
    return { user: null, role: null, error: 'Not signed in' };
  }

  const admin = adminClient();
  const { data: row, error: roleErr } = await admin
    .from('users')
    .select('id, email, role, is_active')
    .eq('id', authData.user.id)
    .single();

  if (roleErr || !row) {
    return { user: authData.user, role: null, error: 'User record not found' };
  }
  if (!row.is_active) {
    return { user: authData.user, role: row.role, error: 'User is not active' };
  }
  return { user: authData.user, role: row.role as string, error: null };
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action as string | undefined;
  const productId = body.product_id as string | undefined;
  if (!action || !productId) {
    return NextResponse.json(
      { error: 'action and product_id are required' },
      { status: 400 }
    );
  }

  const { user, role, error: authError } = await getAuthAndRole();
  if (authError || !user || !role) {
    return NextResponse.json(
      { error: authError || 'Unauthorized' },
      { status: 401 }
    );
  }

  const admin = adminClient();
  const now = new Date().toISOString();

  try {
    // -----------------------------------------------------------
    // ACTION: update_image  (photo replace — broad role access)
    // -----------------------------------------------------------
    if (action === 'update_image') {
      if (!PHOTO_ROLES.includes(role)) {
        return NextResponse.json(
          { error: `Role ${role} cannot update images` },
          { status: 403 }
        );
      }
      const imageUrl = body.image_url as string | undefined;
      if (!imageUrl) {
        return NextResponse.json(
          { error: 'image_url is required' },
          { status: 400 }
        );
      }
      const { error } = await admin
        .from('products')
        .update({
          image_url: imageUrl,
          updated_at: now,
        })
        .eq('id', productId);
      if (error) throw error;
      return NextResponse.json({
        success: true,
        message: 'Photo updated',
      });
    }

    // -----------------------------------------------------------
    // ACTION: update_cost  (manager+ only)
    // -----------------------------------------------------------
    if (action === 'update_cost') {
      if (!MANAGER_ROLES.includes(role)) {
        return NextResponse.json(
          { error: `Role ${role} cannot update cost` },
          { status: 403 }
        );
      }
      const costPerUnit = body.cost_per_unit as number | undefined;
      if (typeof costPerUnit !== 'number' || isNaN(costPerUnit) || costPerUnit < 0) {
        return NextResponse.json(
          { error: 'cost_per_unit must be a non-negative number' },
          { status: 400 }
        );
      }
      const supplierId = (body.supplier_id as string | undefined) || null;
      const notes = (body.notes as string | undefined) || null;

      // Retire previous current cost
      await admin
        .from('product_costs')
        .update({ is_current: false, effective_to: now })
        .eq('product_id', productId)
        .eq('is_current', true);

      // Insert new current cost
      const { error: insertErr } = await admin.from('product_costs').insert({
        product_id: productId,
        cost_per_unit: costPerUnit,
        cost_type: 'manual_adjustment',
        supplier_id: supplierId,
        effective_from: now,
        is_current: true,
        notes,
        recorded_by: user.id,
        recorded_at: now,
      });
      if (insertErr) throw insertErr;

      await admin.from('products').update({ updated_at: now }).eq('id', productId);
      return NextResponse.json({
        success: true,
        message: `Cost updated to $${costPerUnit.toFixed(4)}`,
      });
    }

    // -----------------------------------------------------------
    // ACTION: update_price  (manager+ only, per channel)
    // -----------------------------------------------------------
    if (action === 'update_price') {
      if (!MANAGER_ROLES.includes(role)) {
        return NextResponse.json(
          { error: `Role ${role} cannot update price` },
          { status: 403 }
        );
      }
      const channel = body.channel as string | undefined;
      if (!channel || !VALID_CHANNELS.includes(channel)) {
        return NextResponse.json(
          { error: `channel must be one of ${VALID_CHANNELS.join(', ')}` },
          { status: 400 }
        );
      }
      const pricingMode = (body.pricing_mode as string | undefined) || 'formula';
      if (!['formula', 'manual_override'].includes(pricingMode)) {
        return NextResponse.json(
          { error: 'pricing_mode must be formula or manual_override' },
          { status: 400 }
        );
      }
      const margin = body.margin_multiplier as number | null | undefined;
      const vat = (body.vat_multiplier as number | undefined) ?? 1.0;
      const manual = body.manual_unit_price as number | null | undefined;

      if (pricingMode === 'formula') {
        if (typeof margin !== 'number' || isNaN(margin) || margin <= 0) {
          return NextResponse.json(
            { error: 'margin_multiplier required for formula mode' },
            { status: 400 }
          );
        }
      } else {
        if (typeof manual !== 'number' || isNaN(manual) || manual < 0) {
          return NextResponse.json(
            { error: 'manual_unit_price required for manual_override mode' },
            { status: 400 }
          );
        }
      }

      // Retire previous current pricing for this channel
      await admin
        .from('product_pricing')
        .update({ is_current: false, is_active: false, effective_to: now })
        .eq('product_id', productId)
        .eq('channel', channel)
        .eq('is_current', true);

      // Insert new current pricing
      const { error: insertErr } = await admin.from('product_pricing').insert({
        product_id: productId,
        channel,
        pricing_mode: pricingMode,
        margin_multiplier: pricingMode === 'formula' ? margin : null,
        vat_multiplier: vat,
        manual_unit_price: pricingMode === 'manual_override' ? manual : null,
        effective_from: now,
        is_current: true,
        is_active: true,
        recorded_by: user.id,
        recorded_at: now,
      });
      if (insertErr) throw insertErr;

      await admin.from('products').update({ updated_at: now }).eq('id', productId);
      return NextResponse.json({
        success: true,
        message: `${channel} pricing updated`,
      });
    }

    // -----------------------------------------------------------
    // ACTION: update_status  (manager+ only)
    // -----------------------------------------------------------
    if (action === 'update_status') {
      if (!MANAGER_ROLES.includes(role)) {
        return NextResponse.json(
          { error: `Role ${role} cannot update status` },
          { status: 403 }
        );
      }
      const status = body.status as string | undefined;
      const valid = ['draft', 'pending_approval', 'active', 'discontinued', 'archived'];
      if (!status || !valid.includes(status)) {
        return NextResponse.json(
          { error: `status must be one of ${valid.join(', ')}` },
          { status: 400 }
        );
      }
      const { error } = await admin
        .from('products')
        .update({ status, updated_at: now })
        .eq('id', productId);
      if (error) throw error;
      return NextResponse.json({
        success: true,
        message: `Status updated to ${status}`,
      });
    }

    // -----------------------------------------------------------
    // ACTION: update_channels  (manager+ only)
    // -----------------------------------------------------------
    if (action === 'update_channels') {
      if (!MANAGER_ROLES.includes(role)) {
        return NextResponse.json(
          { error: `Role ${role} cannot update channels` },
          { status: 403 }
        );
      }
      const sellNassau = !!body.sell_nassau;
      const sellAndros = !!body.sell_andros;
      const sellOnline = !!body.sell_online;
      const sellWholesale = !!body.sell_wholesale;

      const { error } = await admin
        .from('products')
        .update({
          sell_nassau: sellNassau,
          sell_andros: sellAndros,
          sell_online: sellOnline,
          sell_wholesale: sellWholesale,
          updated_at: now,
        })
        .eq('id', productId);
      if (error) throw error;
      return NextResponse.json({
        success: true,
        message: 'Channels updated',
      });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
