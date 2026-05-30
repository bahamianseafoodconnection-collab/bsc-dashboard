// app/api/staff/admin/route.ts

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOUNDER_IDS = new Set(['7b62672c-9259-4c1b-98d4-3b78369a52ab']);
const ALLOWED_ADMIN_ROLES = new Set(['founder', 'co_founder', 'control_admin']);
const FOUNDER_ROLES = new Set(['founder', 'co_founder']);
const ALLOWED_ROLES = [
  'founder', 'co_founder', 'control_admin', 'manager', 'supervisor',
  'cashier', 'right_hand', 'processor', 'driver', 'strategist',
  'supplier', 'partner_us',
];

type Body = {
  action?: string;
  id?: string;
  email?: string;
  full_name?: string | null;
  role?: string;
  primary_location?: string | null;
  is_active?: boolean;
  hourly_rate?: number | null;
  hours_per_week?: number | null;
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

interface CallerInfo {
  isAdmin:    boolean;
  isFounder:  boolean; // founder or co_founder
  userId:     string | null;
}

async function resolveCaller(req: Request, admin: SupabaseClient, body: Body): Promise<CallerInfo> {
  if (body._secret && body._secret === process.env.ADMIN_SECRET) {
    return { isAdmin: true, isFounder: true, userId: null };
  }

  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return { isAdmin: false, isFounder: false, userId: null };

  const userId = extractUserIdFromJWT(token);
  if (!userId) return { isAdmin: false, isFounder: false, userId: null };

  if (FOUNDER_IDS.has(userId)) return { isAdmin: true, isFounder: true, userId };

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  let role = profile?.role as string | undefined;
  if (!role) {
    const { data: userRow } = await admin
      .from('users')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    role = userRow?.role as string | undefined;
  }

  if (!role) return { isAdmin: false, isFounder: false, userId };
  return {
    isAdmin:   ALLOWED_ADMIN_ROLES.has(role),
    isFounder: FOUNDER_ROLES.has(role),
    userId,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeMonthly(hourlyRate: number | null | undefined, hoursPerWeek: number | null | undefined): number | null {
  const hr = Number(hourlyRate);
  const hpw = Number(hoursPerWeek);
  if (!hr || !hpw || hr <= 0 || hpw <= 0) return null;
  return round2(hr * hpw * 52 / 12);
}

function expenseDescription(fullName: string | null | undefined, hourlyRate: number, hoursPerWeek: number, location: string | null | undefined): string {
  const name = (fullName || '').trim() || 'Unnamed staff';
  const loc  = (location || '').trim();
  const locTag = loc ? ` (${loc})` : '';
  return `${name} — $${hourlyRate}/hr x ${hoursPerWeek}hr/wk${locTag}`;
}

async function logChange(admin: SupabaseClient, userId: string | null, action: string, changedBy: string | null, details: Record<string, unknown>) {
  await admin.from('staff_changes').insert({
    user_id: userId,
    action,
    changed_by: changedBy,
    details,
  }).then(() => undefined, () => undefined); // fail-soft; never block the caller
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

  const caller = await resolveCaller(req, admin, body);
  if (!caller.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Founder access only' }, { status: 403 });
  }

  const action = (body.action || '').trim();

  switch (action) {
    case 'list': {
      const { data, error } = await admin
        .from('users')
        .select('id, email, role, full_name, primary_location, is_active, activation_token, created_at, last_login_at, hourly_rate, hours_per_week, monthly_salary, expense_id')
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

      const hourly = body.hourly_rate != null ? Number(body.hourly_rate) : null;
      const hpw    = body.hours_per_week != null ? Number(body.hours_per_week) : null;
      const monthly = computeMonthly(hourly, hpw);

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

      // Create the salaries-category expense row first so the staff row
      // can hold its expense_id.
      let expenseId: string | null = null;
      if (monthly !== null && hourly !== null && hpw !== null) {
        const desc = expenseDescription(body.full_name, hourly, hpw, body.primary_location);
        const { data: exp, error: expErr } = await admin
          .from('expenses')
          .insert({ amount: monthly, category: 'salaries', description: desc })
          .select('id')
          .single();
        if (!expErr && exp) expenseId = exp.id as string;
      }

      const insertVariants: Record<string, unknown>[] = [
        {
          id: userId, email, role,
          full_name:        body.full_name || null,
          primary_location: body.primary_location || null,
          is_active:        false,
          activation_token: token,
          hourly_rate:      hourly,
          hours_per_week:   hpw,
          monthly_salary:   monthly,
          expense_id:       expenseId,
        },
        {
          id: userId, email, role,
          name:             body.full_name || null,
          primary_location: body.primary_location || null,
          is_active:        false,
          activation_token: token,
          hourly_rate:      hourly,
          hours_per_week:   hpw,
          monthly_salary:   monthly,
          expense_id:       expenseId,
        },
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
        if (expenseId) await admin.from('expenses').delete().eq('id', expenseId).then(() => undefined, () => undefined);
        return NextResponse.json({ ok: false, error: insErr }, { status: 500 });
      }

      await logChange(admin, userId, 'create', caller.userId, {
        email, role, full_name: body.full_name, primary_location: body.primary_location,
        hourly_rate: hourly, hours_per_week: hpw, monthly_salary: monthly, expense_id: expenseId,
      });

      return NextResponse.json({ ok: true, id: userId, activation_token: token, monthly_salary: monthly, expense_id: expenseId });
    }

    case 'update': {
      if (!body.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
      if (body.role && !ALLOWED_ROLES.includes(body.role))
        return NextResponse.json({ ok: false, error: `Unknown role: ${body.role}` }, { status: 400 });

      // Reactivation (going inactive → active) is founder/co_founder ONLY.
      if (body.is_active === true && !caller.isFounder) {
        const { data: existing } = await admin
          .from('users').select('is_active').eq('id', body.id).maybeSingle();
        if (existing && existing.is_active === false) {
          return NextResponse.json({ ok: false, error: 'Reactivation requires founder approval' }, { status: 403 });
        }
      }

      const patch: Record<string, unknown> = {};
      if (body.full_name        !== undefined) patch.full_name        = body.full_name;
      if (body.role             !== undefined) patch.role             = body.role;
      if (body.primary_location !== undefined) patch.primary_location = body.primary_location;
      if (body.is_active        !== undefined) patch.is_active        = body.is_active;

      // Recompute monthly_salary if hourly or hours/wk changed.
      let hourly: number | null | undefined = body.hourly_rate;
      let hpw:    number | null | undefined = body.hours_per_week;
      if (hourly !== undefined || hpw !== undefined) {
        const { data: existing } = await admin
          .from('users')
          .select('hourly_rate, hours_per_week, expense_id, full_name, primary_location')
          .eq('id', body.id)
          .maybeSingle();
        if (hourly === undefined) hourly = existing?.hourly_rate as number | null;
        if (hpw    === undefined) hpw    = existing?.hours_per_week as number | null;
        const monthly = computeMonthly(hourly, hpw);
        patch.hourly_rate    = hourly;
        patch.hours_per_week = hpw;
        patch.monthly_salary = monthly;

        // Update or create the linked expense row.
        const fullName = (body.full_name ?? existing?.full_name) as string | null;
        const location = (body.primary_location ?? existing?.primary_location) as string | null;
        if (monthly !== null && hourly !== null && hpw !== null) {
          const desc = expenseDescription(fullName, hourly, hpw, location);
          if (existing?.expense_id) {
            await admin.from('expenses').update({ amount: monthly, description: desc }).eq('id', existing.expense_id);
          } else {
            const { data: exp } = await admin
              .from('expenses')
              .insert({ amount: monthly, category: 'salaries', description: desc })
              .select('id')
              .single();
            if (exp) patch.expense_id = exp.id as string;
          }
        } else if (existing?.expense_id) {
          // Hourly/hours cleared → zero out the linked expense rather than orphan it.
          await admin.from('expenses').update({ amount: 0 }).eq('id', existing.expense_id);
        }
      }

      if (Object.keys(patch).length === 0)
        return NextResponse.json({ ok: false, error: 'Nothing to update' }, { status: 400 });

      const err = await patchUser(admin, body.id, patch);
      if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 });

      const action = body.is_active === false ? 'deactivate'
                   : body.is_active === true  ? 'reactivate'
                   : 'update';
      await logChange(admin, body.id, action, caller.userId, patch);

      return NextResponse.json({ ok: true });
    }

    case 'regenerate_token': {
      if (!body.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
      const token = genToken();
      const err = await patchUser(admin, body.id, { activation_token: token, is_active: false });
      if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 });
      await logChange(admin, body.id, 'regenerate_token', caller.userId, {});
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
      await logChange(admin, body.id, 'reset_password', caller.userId, {});
      return NextResponse.json({ ok: true });
    }

    case 'set_password': {
      // Direct-set the staff member's password via the admin API (no email
      // round-trip). Founder/co_founder only — direct password changes are
      // sensitive. Caller still hands over the new password securely (not
      // through this UI's logs).
      if (!caller.isFounder) {
        return NextResponse.json({ ok: false, error: 'Only the founder can set a password directly' }, { status: 403 });
      }
      if (!body.id)       return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
      const newPassword = typeof body.new_password === 'string' ? body.new_password : '';
      if (newPassword.length < 6) {
        return NextResponse.json({ ok: false, error: 'Password must be at least 6 characters' }, { status: 400 });
      }
      const { error: pErr } = await admin.auth.admin.updateUserById(String(body.id), { password: newPassword });
      if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
      // Audit: WHAT changed, never the value.
      await logChange(admin, body.id, 'set_password', caller.userId, { method: 'admin_direct_set' });
      return NextResponse.json({ ok: true });
    }

    case 'delete': {
      if (!body.id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
      // Spec: deactivate without deleting records. Hard-delete is founder-only.
      if (!caller.isFounder) {
        return NextResponse.json({ ok: false, error: 'Hard delete requires founder' }, { status: 403 });
      }
      const { error: aErr } = await admin.auth.admin.deleteUser(body.id);
      if (aErr) return NextResponse.json({ ok: false, error: aErr.message }, { status: 500 });
      await admin.from('users').delete().eq('id', body.id);
      await admin.from('staff_roster').delete().eq('id', body.id);
      await logChange(admin, body.id, 'delete', caller.userId, {});
      return NextResponse.json({ ok: true });
    }

    case 'audit': {
      // Recent staff_changes — useful for the founder approval review screen.
      const { data, error } = await admin
        .from('staff_changes')
        .select('id, user_id, action, changed_by, changed_at, details')
        .order('changed_at', { ascending: false })
        .limit(100);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, changes: data || [] });
    }

    default:
      return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  }
}
