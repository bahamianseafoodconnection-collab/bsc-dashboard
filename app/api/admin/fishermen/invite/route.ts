// POST /api/admin/fishermen/invite
//
// One-click fisherman onboarding for BSC staff. Performs the three
// linked actions that previously had to be done manually in Supabase:
//   1) Create auth user with temp password (admin API)
//   2) Upsert public.profiles with role='fisherman' + must_change_password
//   3) Link to a supplier record (existing or freshly created)
//
// Returns the temp credentials so the operator can hand them to the
// fisherman (paper, SMS, whatever). Caller must be staff — verified
// against profiles.role on the server side.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager']);

interface InviteBody {
  full_name:                    string;
  email:                        string;
  phone?:                       string;
  temp_password?:               string;
  // EITHER link to existing supplier OR create new
  supplier_id?:                 string | null;
  new_supplier?: {
    name:                       string;     // display name (usually = full_name)
    vessel_name?:               string;
    vessel_registration_number?: string;
    vessel_owner_name?:         string;
    vessel_captain_name?:       string;
    island_source?:             string;
  } | null;
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaKey) return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 500 });
  const admin = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // ── Caller auth → must be staff ──
  const tokenHeader = req.headers.get('authorization') || '';
  const token       = tokenHeader.startsWith('Bearer ') ? tokenHeader.slice(7) : null;
  if (!token) return NextResponse.json({ ok: false, error: 'missing bearer token' }, { status: 401 });
  const { data: { user }, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'invalid token' }, { status: 401 });
  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!callerProfile || !STAFF_ROLES.has(callerProfile.role as string)) {
    return NextResponse.json({ ok: false, error: 'staff role required' }, { status: 403 });
  }

  // ── Body ──
  let body: InviteBody;
  try { body = (await req.json()) as InviteBody; }
  catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  const fullName = body.full_name?.trim();
  const email    = body.email?.trim().toLowerCase();
  const phone    = body.phone?.trim() || null;
  const tempPw   = body.temp_password?.trim() || 'BSC2024!';
  if (!fullName || !email) {
    return NextResponse.json({ ok: false, error: 'full_name + email required' }, { status: 400 });
  }
  if (!body.supplier_id && !body.new_supplier) {
    return NextResponse.json({ ok: false, error: 'supplier_id OR new_supplier required' }, { status: 400 });
  }

  // ── 1) Create the auth user (or recover existing one) ──
  let authUserId: string;
  let isNewAuthUser = true;
  const created = await admin.auth.admin.createUser({
    email,
    password:      tempPw,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone, must_change_password: true },
  });
  if (created.error) {
    // If user already exists, find and reuse — but DO NOT overwrite their password
    // unless caller explicitly asks (future flag). For now, just link.
    if (created.error.message?.toLowerCase().includes('already')) {
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list.users.find((u) => (u.email ?? '').toLowerCase() === email);
      if (!existing) return NextResponse.json({ ok: false, error: `auth create failed: ${created.error.message}` }, { status: 500 });
      authUserId    = existing.id;
      isNewAuthUser = false;
    } else {
      return NextResponse.json({ ok: false, error: `auth create failed: ${created.error.message}` }, { status: 500 });
    }
  } else {
    authUserId = created.data.user.id;
  }

  // ── 2) Upsert profile with role='fisherman' ──
  // Read first so we don't accidentally demote an existing staff user.
  const { data: existingProf } = await admin.from('profiles').select('role').eq('id', authUserId).maybeSingle();
  if (existingProf?.role && STAFF_ROLES.has(existingProf.role as string)) {
    return NextResponse.json({ ok: false, error: `${email} is already a staff user (${existingProf.role}). Refusing to demote.` }, { status: 409 });
  }
  const { error: profErr } = await admin.from('profiles').upsert({
    id:                    authUserId,
    role:                  'fisherman',
    full_name:             fullName,
    phone,
    must_change_password:  isNewAuthUser,
  });
  if (profErr) return NextResponse.json({ ok: false, error: `profile upsert failed: ${profErr.message}` }, { status: 500 });

  // ── 3) Link or create supplier ──
  let supplierId: string | null = body.supplier_id ?? null;
  if (supplierId) {
    // Verify nobody else owns this supplier
    const { data: sup } = await admin.from('suppliers').select('id, auth_user_id, name').eq('id', supplierId).maybeSingle();
    if (!sup) return NextResponse.json({ ok: false, error: 'supplier not found' }, { status: 404 });
    if (sup.auth_user_id && sup.auth_user_id !== authUserId) {
      return NextResponse.json({ ok: false, error: `supplier already linked to a different fisherman` }, { status: 409 });
    }
    const { error: linkErr } = await admin.from('suppliers').update({ auth_user_id: authUserId }).eq('id', supplierId);
    if (linkErr) return NextResponse.json({ ok: false, error: `supplier link failed: ${linkErr.message}` }, { status: 500 });
  } else if (body.new_supplier) {
    const ns = body.new_supplier;
    const { data: insSup, error: insErr } = await admin.from('suppliers').insert({
      name:                       ns.name?.trim() || fullName,
      is_active:                  true,
      contact_email:              email,
      contact_phone:              phone,
      auth_user_id:               authUserId,
      vessel_name:                ns.vessel_name?.trim()                 || null,
      vessel_registration_number: ns.vessel_registration_number?.trim()  || null,
      vessel_owner_name:          ns.vessel_owner_name?.trim()           || null,
      vessel_captain_name:        ns.vessel_captain_name?.trim()         || fullName,
    }).select('id').single();
    if (insErr) return NextResponse.json({ ok: false, error: `supplier create failed: ${insErr.message}` }, { status: 500 });
    supplierId = insSup.id;
  }

  return NextResponse.json({
    ok:            true,
    user_id:       authUserId,
    email,
    temp_password: isNewAuthUser ? tempPw : null,
    is_new_auth_user: isNewAuthUser,
    supplier_id:   supplierId,
  });
}

// POST /api/admin/fishermen/invite with action=reset_password body
// — simpler alternate path: reset an existing fisherman's password.
