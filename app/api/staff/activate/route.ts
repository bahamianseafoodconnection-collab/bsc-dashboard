// app/api/staff/activate/route.ts
// Staff account activation.
//
// Flow:
//   GET  ?token=...      -> { email, role, name } for a valid token, else 404
//   POST { token, pwd }  -> sets the auth password, marks user active, clears the token
//
// Tokens are one-shot — they're cleared on successful activation.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StaffRow = {
  id: string;
  email: string | null;
  role: string | null;
  full_name?: string | null;
  name?: string | null;
};

function adminOrError() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return null;
  return createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Try with full_name first; fall back to name; fall back to no name column.
// This keeps the route working across small schema variants.
async function lookupByToken(
  // The admin client's full generic type leaks through; `any` keeps the helper
  // shape-agnostic without losing type safety at the call site.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  token: string
): Promise<StaffRow | null> {
  const variants = [
    'id, email, role, full_name',
    'id, email, role, name',
    'id, email, role',
  ];
  for (const cols of variants) {
    const { data, error } = await admin
      .from('users')
      .select(cols)
      .eq('activation_token', token)
      .maybeSingle();
    if (!error) return (data as StaffRow | null) ?? null;
  }
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = (url.searchParams.get('token') || '').trim();
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const admin = adminOrError();
  if (!admin) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const row = await lookupByToken(admin, token);
  if (!row) {
    return NextResponse.json(
      { error: 'This activation link is invalid or has already been used.' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    email: row.email,
    role: row.role,
    name: row.full_name ?? row.name ?? null,
  });
}

export async function POST(req: Request) {
  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const token = (body.token || '').trim();
  const password = body.password || '';

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: 'Password must be at least 8 characters.' },
      { status: 400 }
    );
  }

  const admin = adminOrError();
  if (!admin) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  const row = await lookupByToken(admin, token);
  if (!row || !row.id || !row.email) {
    return NextResponse.json(
      { error: 'This activation link is invalid or has already been used.' },
      { status: 404 }
    );
  }

  // Set the password on the auth user.
  const { error: pwErr } = await admin.auth.admin.updateUserById(row.id, {
    password,
  });
  if (pwErr) {
    return NextResponse.json(
      { error: `Could not set password: ${pwErr.message}` },
      { status: 500 }
    );
  }

  // Mark user active and burn the token. must_change_password is best-effort —
  // if the column doesn't exist we still want activation to succeed.
  const baseUpdate = {
    is_active: true,
    activation_token: null as string | null,
  };
  const { error: u1 } = await admin
    .from('users')
    .update({ ...baseUpdate, must_change_password: false })
    .eq('id', row.id);
  if (u1) {
    const { error: u2 } = await admin
      .from('users')
      .update(baseUpdate)
      .eq('id', row.id);
    if (u2) {
      return NextResponse.json(
        { error: `Password set, but user record update failed: ${u2.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    success: true,
    email: row.email,
    role: row.role,
  });
}
