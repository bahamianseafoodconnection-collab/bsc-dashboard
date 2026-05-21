// POST /api/admin/suppliers/invite
//
// One-click supplier onboarding. Same shape as /api/admin/fishermen/invite
// but writes role='supplier'. Performs three linked actions:
//   1) Create auth user with the supplied password (admin API)
//   2) Upsert public.profiles with role='supplier' + must_change_password
//   3) Link to a supplier record (existing supplier_id OR create one)
//
// The supplier then logs in at /staff-login with the email + password
// and lands on /supplier where they can manage inventory + view their
// online market sales tracking.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin','manager']);

interface InviteBody {
  full_name:      string;
  email:          string;
  phone?:         string;
  whatsapp?:      string;
  temp_password?: string;
  notes?:         string;
  supplier_id?:   string | null;     // link to existing supplier (e.g. Tropic Seafood)
  new_supplier?: {                    // OR create a fresh supplier
    name:          string;
    code?:         string;
    contact_email?: string;
    contact_phone?: string;
  } | null;
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaKey) return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 500 });
  const admin = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const tokenHeader = req.headers.get('authorization') || '';
  const token       = tokenHeader.startsWith('Bearer ') ? tokenHeader.slice(7) : null;
  if (!token) return NextResponse.json({ ok: false, error: 'missing bearer token' }, { status: 401 });
  const { data: { user }, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'invalid token' }, { status: 401 });
  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!callerProfile || !STAFF_ROLES.has(callerProfile.role as string)) {
    return NextResponse.json({ ok: false, error: 'staff role required' }, { status: 403 });
  }

  let body: InviteBody;
  try { body = (await req.json()) as InviteBody; }
  catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  const fullName  = body.full_name?.trim();
  const email     = body.email?.trim().toLowerCase();
  const phone     = body.phone?.trim()    || null;
  const whatsapp  = body.whatsapp?.trim() || phone;
  const tempPw    = body.temp_password?.trim() || 'BSC2024!';
  const notes     = body.notes?.trim()    || null;

  if (!fullName || !email) {
    return NextResponse.json({ ok: false, error: 'full_name + email required' }, { status: 400 });
  }
  if (!body.supplier_id && !body.new_supplier) {
    return NextResponse.json({ ok: false, error: 'supplier_id OR new_supplier required' }, { status: 400 });
  }

  // 1) Create auth user (or reuse existing).
  let authUserId: string;
  let isNewAuthUser = true;
  const created = await admin.auth.admin.createUser({
    email,
    password:      tempPw,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone, whatsapp, must_change_password: false },
  });
  if (created.error) {
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

  // 2) Upsert profile with role='supplier'. Don't demote staff users.
  const { data: existingProf } = await admin.from('profiles').select('role').eq('id', authUserId).maybeSingle();
  if (existingProf?.role && STAFF_ROLES.has(existingProf.role as string)) {
    return NextResponse.json({ ok: false, error: `${email} is already a staff user (${existingProf.role}). Refusing to demote.` }, { status: 409 });
  }
  const { error: profErr } = await admin.from('profiles').upsert({
    id:        authUserId,
    role:      'supplier',
    full_name: fullName,
    phone,
  });
  if (profErr) return NextResponse.json({ ok: false, error: `profile upsert failed: ${profErr.message}` }, { status: 500 });

  // 3) Link or create supplier record.
  let supplierId: string | null = body.supplier_id ?? null;
  if (supplierId) {
    const { data: sup } = await admin.from('suppliers').select('id, auth_user_id, name').eq('id', supplierId).maybeSingle();
    if (!sup) return NextResponse.json({ ok: false, error: 'supplier not found' }, { status: 404 });
    if (sup.auth_user_id && sup.auth_user_id !== authUserId) {
      return NextResponse.json({ ok: false, error: `supplier "${sup.name}" already linked to a different user.` }, { status: 409 });
    }
    const updateFields: Record<string, unknown> = { auth_user_id: authUserId };
    if (notes) updateFields.notes = notes;
    const { error: linkErr } = await admin.from('suppliers').update(updateFields).eq('id', supplierId);
    if (linkErr) return NextResponse.json({ ok: false, error: `supplier link failed: ${linkErr.message}` }, { status: 500 });
  } else if (body.new_supplier) {
    const ns = body.new_supplier;
    const { data: insSup, error: insErr } = await admin.from('suppliers').insert({
      name:          ns.name?.trim() || fullName,
      code:          ns.code?.trim() || null,
      is_active:     true,
      contact_email: ns.contact_email?.trim() || email,
      contact_phone: ns.contact_phone?.trim() || phone,
      auth_user_id:  authUserId,
      notes,
    }).select('id').single();
    if (insErr) return NextResponse.json({ ok: false, error: `supplier create failed: ${insErr.message}` }, { status: 500 });
    supplierId = insSup.id;
  }

  return NextResponse.json({
    ok:               true,
    user_id:          authUserId,
    email,
    temp_password:    isNewAuthUser ? tempPw : null,
    is_new_auth_user: isNewAuthUser,
    supplier_id:      supplierId,
    login_url:        '/staff-login',
    landing_url:      '/supplier',
  });
}
