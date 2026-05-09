// app/api/staff/admin/route.ts
//
// Admin API for the founder/co-founder to manage the staff roster.
// Gated by checking the bearer token's user.id maps to a role of
// 'founder' or 'co_founder'. All other roles get 403.
//
// Single endpoint, action dispatched by `action` field in the body:
//
//   list                    → returns all users (no body args)
//   create                  → { email, full_name?, role, primary_location? }
//   update                  → { id, full_name?, role?, primary_location?, is_active? }
//   regenerate_token        → { id }            -- returns new activation_token
//   reset_password          → { id }            -- triggers Supabase auth email
//   delete                  → { id }            -- hard-delete (auth + users row)
//
// The users table has a `name` OR `full_name` column depending on the
// version of the schema. We try both, mirroring app/api/staff/activate.

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ADMIN_ROLES = new Set(['founder', 'co_founder']);
const ALLOWED_ROLES = [
  'founder', 'co_founder', 'manager', 'cashier', 'right_hand',
  'supervisor', 'processor', 'driver',
];

type Body = {
  action?: string;
  id?: string;
  email?: string;
  full_name?: string | null;
  role?: string;
  primary_location?: string | null;
  is_active?: boolean;
};

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;
  return createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function callerIsAdmin(req: Request, admin: SupabaseClient): Promise<boolean> {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return false;
  const { data } = await admin.from('users').select('role').eq('id', user.id).maybeSingle();
  if (!data?.role) return false;
  return ALLOWED_ADMIN_ROLES.has(String(data.role));
}

// Best-effort name column reader. Returns the value found regardless of
// which column the schema uses.
async function selectAll(admin: SupabaseClient) {
  const variants = [
    'id, email, role, full_name, primary_location, is_active, activation_token, created_at, last_login_at',
    'id, email, role, name, primary_location, is_active, activation_token, created_at, last_login_at',
    'id, email, role, primary_location, is_active, activation_token, created_at',
  ];
  for (const cols of variants) {
    const { data, error } = await admin.from('users').select(cols).order('role', { ascending: true });
    if (!error) return data || [];
  }
  return [];
}

async function patchUser(admin: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const variantsToTry = [
    patch,                           // as-is
    { ...patch, name: patch.full_name, full_name: undefined }, // swap full_name → name
  ];
  for (const v of variantsToTry) {
    const cleaned = Object.fromEntries(Object.entries(v).filter(([, val]) => val !== undefined));
    const { error } = await admin.from('users').update(cleaned).eq('id', id);
    if (!error) return null;
    if (!error.message.toLowerCase().includes('column')) return error.message;
  }
  return 'Could not update user';
}

function genToken(): string {
  // 32 hex chars — opaque, URL-safe, unguessable.
  const arr = new Uint8Array(16);
  (globalThis.crypto as Crypto).getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(req: Request) {
  const admin = adminClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });
  if (!(await callerIsAdmin(req, admin))) {
    return NextResponse.json({ ok: false, error: 'Founder access only' }, { status: 403 });
  }

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 }); }

  const action = (body.action || '').trim();

  switch (action) {
    case 'list': {
      const users = await selectAll(admin);
      return NextResponse.json({ ok: true, users });
    }

    case 'create': {
      const email = (body.email || '').trim().toLowerCase();
      const role  = (body.role  || 'cashier').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return NextResponse.json({ ok: false, error: 'Valid email required' }, { status: 400 });
      if (!ALLOWED_ROLES.includes(role))
        return NextResponse.json({ ok: false, error: `Unknown role: ${role}` }, { status: 400 });

      // Create the auth user with a throwaway password they'll overwrite.
      const tempPassword = genToken().slice(0, 16) + 'A1!';
      const { data: created, error: authErr } = await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });
      if (authErr || !created.user) {
        return NextResponse.json({ ok: false, error: authErr?.message || 'Auth create failed' }, { status: 500 });
      }
      const userId = created.user.id;
      const token = genToken();

      // Two shapes because the schema may use full_name OR name. Loose
      // typing on the row is intentional — the table's generated types
      // don't admit both column shapes simultaneously.
      const insertVariants: Record<string, unknown>[] = [
        { id: userId, email, role, full_name: body.full_name || null, primary_location: body.primary_location || null, is_active: false, activation_token: token },
        { id: userId, email, role, name:      body.full_name || null, primary_location: body.primary_location || null, is_active: false, activation_token: token },
      ];
      let insErr: string | null = 'unknown';
      for (const row of insertVariants) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await admin.from('users').insert(row as any);
        if (!error) { insErr = null; break; }
        insErr = error.message;
        if (!error.message.toLowerCase().includes('column')) break;
      }
      if (insErr) {
        // Roll back the auth user so we don't leak orphans.
        await admin.auth.admin.deleteUser(userId).catch(() => {});
        return NextResponse.json({ ok: false, error: insErr }, { status: 500 });
      }
      return NextResponse.json({ ok: true, id: userId, activation_token: token });
    }

    case 'update': {
      if (!body.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
      if (body.role && !ALLOWED_ROLES.includes(body.role))
        return NextResponse.json({ ok: false, error: `Unknown role: ${body.role}` }, { status: 400 });
      const patch: Record<string, unknown> = {};
      if (body.full_name !== undefined)        patch.full_name        = body.full_name;
      if (body.role !== undefined)             patch.role             = body.role;
      if (body.primary_location !== undefined) patch.primary_location = body.primary_location;
      if (body.is_active !== undefined)        patch.is_active        = body.is_active;
      if (Object.keys(patch).length === 0)
        return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 });
      const err = await patchUser(admin, body.id, patch);
      if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case 'regenerate_token': {
      if (!body.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
      const token = genToken();
      const err = await patchUser(admin, body.id, { activation_token: token, is_active: false });
      if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 });
      return NextResponse.json({ ok: true, activation_token: token });
    }

    case 'reset_password': {
      if (!body.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
      const { data: u } = await admin.from('users').select('email').eq('id', body.id).maybeSingle();
      if (!u?.email) return NextResponse.json({ ok: false, error: 'User has no email' }, { status: 400 });
      const { error: rErr } = await admin.auth.resetPasswordForEmail(u.email, {
        redirectTo: `${new URL(req.url).origin}/staff-login`,
      });
      if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case 'delete': {
      if (!body.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
      // Delete the auth user first (cascade to users row depends on FK).
      // If users row doesn't cascade, we delete it explicitly afterward.
      const { error: aErr } = await admin.auth.admin.deleteUser(body.id);
      if (aErr) return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });
      await admin.from('users').delete().eq('id', body.id);
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  }
}
