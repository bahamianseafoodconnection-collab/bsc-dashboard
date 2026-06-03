// POST /api/customers/admin
//
// Action-based staff admin for the customers table. Mirrors /api/staff/admin.
// Three actions:
//   - 'list'           : page of customers (with credit + points fields)
//   - 'update_credit'  : edit is_credit_customer / credit_terms / credit_limit
//                       (stamps credit_approved_by/at on enable)
//   - 'adjust_points'  : founder-only manual award/deduct with audit
//
// Service-role on the writes (customers / customer_points_log RLS would block
// the client). Reads use the user's bearer to authenticate role.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_ROLES   = new Set(['founder', 'co_founder', 'manager', 'control_admin', 'basic_admin']);
const FOUNDER_ROLES = new Set(['founder', 'co_founder']);

type Body = {
  action?: string;
  // list
  search?: string;
  limit?: number;
  // update_credit
  id?: string;
  is_credit_customer?: boolean;
  credit_terms?: string;
  credit_limit?: number;
  // adjust_points
  delta?: number;
  reason?: string;
  note?: string;
  // create
  full_name?: string;
  phone?: string;
  email?: string;
  address?: string;
};

// Phone normalization → E.164 with Bahamas default. Keeps customer lookup
// consistent with the phone-E.164 unification rule (see CustomerPhoneLookup).
function normalizePhone(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (raw.trim().startsWith('+')) return '+' + digits;
  if (digits.length === 10) return '+1' + digits;          // US/Bahamas 10-digit
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  return '+' + digits;
}

function adminClient(): SupabaseClient | null {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !svcKey) return null;
  return createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function resolveCaller(req: NextRequest): Promise<{ userId: string | null; role: string | null; isAdmin: boolean; isFounder: boolean }> {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authHeader = req.headers.get('authorization') ?? '';
  if (!supaUrl || !anonKey || !authHeader.startsWith('Bearer ')) {
    return { userId: null, role: null, isAdmin: false, isFounder: false };
  }
  const client = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { userId: null, role: null, isAdmin: false, isFounder: false };
  const { data: prof } = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  return { userId: user.id, role, isAdmin: !!role && ADMIN_ROLES.has(role), isFounder: !!role && FOUNDER_ROLES.has(role) };
}

export async function POST(req: NextRequest) {
  const admin = adminClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const caller = await resolveCaller(req);
  if (!caller.isAdmin) return NextResponse.json({ ok: false, error: 'Admin role required' }, { status: 403 });

  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const action = (body.action || '').trim();

  switch (action) {
    case 'list': {
      const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);
      const search = typeof body.search === 'string' ? body.search.trim().replace(/[,()*]/g, '').slice(0, 80) : '';
      let q = admin
        .from('customers')
        .select('id, full_name, phone, email, is_credit_customer, credit_terms, credit_limit, current_balance, points_balance, points_lifetime, points_redeemed, total_orders, total_spent, is_active, created_at')
        .eq('is_walk_in_anonymous', false)
        .order('total_spent', { ascending: false })
        .limit(limit);
      if (search) q = q.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, customers: data ?? [] });
    }

    case 'update_credit': {
      if (!body.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.is_credit_customer === 'boolean') {
        update.is_credit_customer = body.is_credit_customer;
        if (body.is_credit_customer) {
          update.credit_approved_by = caller.userId;
          update.credit_approved_at = new Date().toISOString();
        }
      }
      if (typeof body.credit_terms === 'string' && body.credit_terms.trim()) {
        update.credit_terms = body.credit_terms.trim();
      }
      if (typeof body.credit_limit === 'number' && Number.isFinite(body.credit_limit) && body.credit_limit >= 0) {
        update.credit_limit = body.credit_limit;
      }
      const { data, error } = await admin.from('customers').update(update).eq('id', body.id).select('id, is_credit_customer, credit_terms, credit_limit, credit_approved_by, credit_approved_at').single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, customer: data });
    }

    case 'adjust_points': {
      if (!caller.isFounder) return NextResponse.json({ ok: false, error: 'Founder/co-founder only' }, { status: 403 });
      if (!body.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
      const delta = Number(body.delta);
      if (!Number.isInteger(delta) || delta === 0) {
        return NextResponse.json({ ok: false, error: 'delta must be a non-zero integer' }, { status: 400 });
      }
      const reason = (typeof body.reason === 'string' && body.reason.trim()) ? body.reason.trim() : 'adjusted';
      const note   = (typeof body.note   === 'string' && body.note.trim())   ? body.note.trim()   : null;

      // Audit the change first, then bump the balance. (Both rows live or
      // neither — wrap so a failure doesn't leave the balance out of sync.)
      const { data: cur, error: rErr } = await admin.from('customers').select('points_balance, points_lifetime, points_redeemed').eq('id', body.id).maybeSingle();
      if (rErr || !cur) return NextResponse.json({ ok: false, error: rErr?.message || 'Customer not found' }, { status: 404 });

      const { error: logErr } = await admin.from('customer_points_log').insert({
        customer_id: body.id,
        delta,
        reason,
        note,
        created_by: caller.userId,
      });
      if (logErr) return NextResponse.json({ ok: false, error: `Log insert failed: ${logErr.message}` }, { status: 500 });

      const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
      next.points_balance = (cur.points_balance ?? 0) + delta;
      if (delta > 0) next.points_lifetime = (cur.points_lifetime ?? 0) + delta;
      if (delta < 0) next.points_redeemed = (cur.points_redeemed ?? 0) + Math.abs(delta);
      const { error: uErr } = await admin.from('customers').update(next).eq('id', body.id);
      if (uErr) return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });

      return NextResponse.json({ ok: true, points_balance: next.points_balance });
    }

    case 'create': {
      const fullName = (body.full_name || '').trim();
      if (!fullName) return NextResponse.json({ ok: false, error: 'full_name required' }, { status: 400 });

      const phoneRaw = (body.phone || '').trim();
      const emailRaw = (body.email || '').trim().toLowerCase();
      if (!phoneRaw && !emailRaw) {
        return NextResponse.json({ ok: false, error: 'Phone OR email required' }, { status: 400 });
      }
      const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
      const email = emailRaw || null;

      // Duplicate check — phone-E.164 is the canonical unification key.
      if (phone) {
        const { data: existing } = await admin.from('customers').select('id, full_name').eq('phone', phone).maybeSingle();
        if (existing) {
          return NextResponse.json(
            { ok: false, error: `Phone already on file as "${(existing as { full_name: string | null }).full_name ?? 'customer ' + (existing as { id: string }).id.slice(0,8)}"` },
            { status: 409 },
          );
        }
      }
      if (email) {
        const { data: existing } = await admin.from('customers').select('id, full_name').eq('email', email).maybeSingle();
        if (existing) {
          return NextResponse.json(
            { ok: false, error: `Email already on file as "${(existing as { full_name: string | null }).full_name ?? 'customer ' + (existing as { id: string }).id.slice(0,8)}"` },
            { status: 409 },
          );
        }
      }

      const isCredit = body.is_credit_customer === true;
      const insert: Record<string, unknown> = {
        full_name:           fullName,
        phone,
        email,
        address:             typeof body.address === 'string' && body.address.trim() ? body.address.trim() : null,
        is_walk_in_anonymous: false,
        is_active:           true,
        is_credit_customer:  isCredit,
        created_by:          caller.userId,
      };
      if (isCredit) {
        if (typeof body.credit_terms === 'string' && body.credit_terms.trim()) insert.credit_terms = body.credit_terms.trim();
        if (typeof body.credit_limit === 'number' && Number.isFinite(body.credit_limit) && body.credit_limit >= 0) insert.credit_limit = body.credit_limit;
        insert.credit_approved_by = caller.userId;
        insert.credit_approved_at = new Date().toISOString();
      }

      const { data, error } = await admin.from('customers').insert(insert)
        .select('id, full_name, phone, email, is_credit_customer, credit_terms, credit_limit, current_balance, points_balance, points_lifetime, points_redeemed, total_orders, total_spent, is_active, created_at')
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, customer: data });
    }

    case 'points_history': {
      if (!body.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
      const { data, error } = await admin
        .from('customer_points_log')
        .select('id, delta, reason, profit_basis, note, order_id, created_at, created_by')
        .eq('customer_id', body.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, log: data ?? [] });
    }
  }

  return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
}
