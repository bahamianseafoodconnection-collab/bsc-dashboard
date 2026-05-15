// app/api/customers/upsert/route.ts
//
// Find-or-create a customer record + bump their tracking stats. Used by:
//   - POS Nassau / Andros: BEFORE order insert, get customer_id
//   - Checkout: same pattern
//   - /login signup: fire-and-forget after profile upsert
//
// Dedup priority:
//   1. By phone (unique when set)
//   2. By auth_user_id (when provided)
//   3. New row
//
// On match: bump last_seen_at, optionally increment total_orders +
// total_spent_bsd, fill in name/email if previously blank.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  name?: string;
  phone?: string | null;
  email?: string | null;
  source?: 'pos_nassau' | 'pos_andros' | 'online' | 'manual';
  auth_user_id?: string | null;
  // If this upsert was triggered by a sale, pass the sale total so we can
  // bump total_orders + total_spent_bsd in one round-trip.
  order_total_bsd?: number | null;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim() || null;
  const email = (body.email || '').trim() || null;
  const source = body.source || 'manual';
  const authUserId = body.auth_user_id || null;
  const orderTotal = body.order_total_bsd != null ? Number(body.order_total_bsd) : null;

  if (!name && !phone && !authUserId) {
    return NextResponse.json(
      { error: 'Need at least one of: name, phone, auth_user_id' },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ─── Find existing ─────────────────────────────────────────────────
  let existingId: string | null = null;
  let existing: Record<string, unknown> | null = null;

  if (phone) {
    const { data } = await admin
      .from('customers')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();
    if (data) {
      existing = data as Record<string, unknown>;
      existingId = data.id as string;
    }
  }
  if (!existingId && authUserId) {
    const { data } = await admin
      .from('customers')
      .select('*')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (data) {
      existing = data as Record<string, unknown>;
      existingId = data.id as string;
    }
  }

  const nowIso = new Date().toISOString();

  // ─── Insert path ───────────────────────────────────────────────────
  if (!existingId) {
    if (!name) {
      // No name and no existing record — refuse rather than insert "Walk-in"
      // soup that pollutes the customer list with anonymous rows.
      return NextResponse.json(
        { ok: false, reason: 'anonymous_walk_in' },
        { status: 200 }
      );
    }
    const insertPayload: Record<string, unknown> = {
      full_name: name,
      phone,
      email,
      source,
      auth_user_id: authUserId,
      first_seen_at: nowIso,
      last_seen_at: nowIso,
      total_orders: orderTotal != null ? 1 : 0,
      total_spent_bsd: orderTotal != null ? round2(orderTotal) : 0,
    };
    const { data: inserted, error: insErr } = await admin
      .from('customers')
      .insert(insertPayload)
      .select('id')
      .single();
    if (insErr) {
      return NextResponse.json(
        { error: `Insert failed: ${insErr.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({
      ok: true,
      created: true,
      customer_id: inserted.id as string,
    });
  }

  // ─── Update path ───────────────────────────────────────────────────
  const update: Record<string, unknown> = {
    last_seen_at: nowIso,
    updated_at: nowIso,
  };
  // Backfill missing fields without overwriting existing ones.
  if (name && !existing?.full_name) update.full_name = name;
  if (phone && !existing?.phone) update.phone = phone;
  if (email && !existing?.email) update.email = email;
  if (authUserId && !existing?.auth_user_id) update.auth_user_id = authUserId;

  if (orderTotal != null) {
    const prevOrders = Number((existing?.total_orders as number) ?? 0);
    const prevSpent = Number((existing?.total_spent_bsd as number) ?? 0);
    update.total_orders = prevOrders + 1;
    update.total_spent_bsd = round2(prevSpent + orderTotal);
  }

  const { error: updErr } = await admin
    .from('customers')
    .update(update)
    .eq('id', existingId);
  if (updErr) {
    return NextResponse.json(
      { error: `Update failed: ${updErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    created: false,
    customer_id: existingId,
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
