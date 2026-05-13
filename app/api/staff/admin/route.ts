// app/api/staff/admin/route.ts

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOUNDER_IDS = new Set(['7b62672c-9259-4c1b-98d4-3b78369a52ab']);
const ALLOWED_ADMIN_ROLES = new Set(['founder', 'co_founder', 'control_admin']);
const ALLOWED_ROLES = [
  'founder', 'co_founder', 'control_admin', 'manager', 'cashier', 'right_hand',
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
  _secret?: string;
};

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;
  return createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema: 'public' },
  });
}

function extractUserIdFromJWT(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    return decoded.sub || null;
  } catch {
    return null;
  }
}

async function callerIsAdmin(req: Request, admin: SupabaseClient, body: Body): Promise<boolean> {
  if (body._secret && body._secret === process.env.ADMIN_SECRET) return true;

  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return false;

  const userId = extractUserIdFromJWT(token);
  if (!userId) return false;

  if (FOUNDER_IDS.has(userId)) return true;

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.role && ALLOWED_ADMIN_ROLES.has(String(profile.role))) return true;

  const { data: userRow } = await admin
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (!userRow?.role) return false;
  return ALLOWED_ADMIN_ROLES.has(String(userRow.role));
}

async function patchUser(admin: SupabaseClient, id: string, patch: Record<string, unknown>) {
  const tables = ['users', 'staff_roster'];
  for (const table of tables) {
    const variantsToTry = [
      patch,
      { ...patch, name: patch.full_name, full_name: undefined },
    ];
    for (const v of variantsToTry) {
      const cleaned = Object.fromEntries(Object.entries(v).filter(([, val]) => val !== undefined));
      const { error } = await admin.from(table).update(cleaned).eq('id', id);
      if (!error) return null;
      if (!error.message.toLowerCase().includes('column')) return error.message;
    }
  }
  return 'Could not update user';
}

function genToken(): string {
  const arr = new Uint8Array(16);
  (globalThis.crypto as Crypto).getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(req: Request) {
  const admin = adminClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 }); }

  if (!(await callerIsAdmin(req, admin, body))) {
    return NextResponse.json({ ok: false, error: 'Founder access only' }, { status: 403 });
  }

  const action = (body.action || '').trim();

  switch (action) {
    case 'list': {
      const { data, error } = await admin
        .from('users')
        .select('id, email, role, full_name, primary_location, is_active, activation_token, created_at, last_login_at')
        .order('role', { ascending: true });

      if (error) {
        return NextResponse.json({ ok: false, error: error.message, debug: 'users query failed' }, { status: 500 });
      }

      return NextResponse.json({ ok: true, users: data || [], debug_count: data?.length ?? 0 });
    }

    case 'create': {
      const email = (body.email || '').trim().toLowerCase();
      const role  = (body.role  || 'cashier').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return NextResponse.json({ ok: false, error: 'Valid email required' }, { status: 400 });
      if (!ALLOWED_ROLES.includes(role))
        return NextResponse.json({ ok: false, error: `Unknown role: ${role}` }, { status: 400 });

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

      const insertVariants: Record<string, unknown>[] = [
        { id: userId, email, role, full_name: body.full_name || null, primary_location: body.primary_location || null, is_active: false, activation_token: token },
        { id: userId, email, role, name: body.full_name || null, primary_location: body.primary_location || null, is_active: false, activation_token: token },
      ];

      const tables = ['users', 'staff_roster'];
      let insErr: string | null = 'unknown';

      outer:
      for (const table of tables) {
        for (const row of insertVariants) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await admin.from(table).insert(row as any);
          if (!error) { insErr = null; break outer; }
          insErr = error.message;
          if (!error.message.toLowerCase().includes('column')) break;
        }
      }

      if (insErr) {
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
      const email = u?.email || (await admin.from('staff_roster').select('email').eq('id', body.id).maybeSingle()).data?.email;
      if (!email) return NextResponse.json({ ok: false, error: 'User has no email' }, { status: 400 });
      const { error: rErr } = await admin.auth.resetPasswordForEmail(email, {
        redirectTo: `${new URL(req.url).origin}/staff-login`,
      });
      if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case 'delete': {
      if (!body.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
      const { error: aErr } = await admin.auth.admin.deleteUser(body.id);
      if (aErr) return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });
      await admin.from('users').delete().eq('id', body.id);
      await admin.from('staff_roster').delete().eq('id', body.id);
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  }
}
