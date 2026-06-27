// /api/international/whoami
//
// Tells the storefront whether the signed-in user is an INTERNATIONAL export
// buyer, so /market can show export-only products to them. International status
// = an active business_accounts row (buyer_type='international') linked to the
// user. IP country is returned as a hint only (Vercel header), never the gate.
//
// Defensive: if business_accounts doesn't exist yet (RUN 2 unrun) the read
// errors and we return is_international=false — so the storefront behaves
// exactly as today until the schema + accounts are in place.
//
// Resp: { ok, is_international, is_staff, ip_country, account }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin', 'manager']);

export async function GET(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const ipCountry = req.headers.get('x-vercel-ip-country') || null;

  // No auth → anonymous visitor: not international (sees the normal catalog).
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ') || !supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: true, is_international: false, is_staff: false, ip_country: ipCountry, account: null });
  }

  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ ok: true, is_international: false, is_staff: false, ip_country: ipCountry, account: null });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let isStaff = false;
  try {
    const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
    const role = (prof as { role?: string | null } | null)?.role ?? null;
    isStaff = !!role && STAFF_ROLES.has(role);
  } catch { /* ignore */ }

  // business_accounts may not exist yet (RUN 2). Treat any failure as not-international.
  let account: Record<string, unknown> | null = null;
  try {
    const { data } = await admin
      .from('business_accounts')
      .select('id, username, buyer_type, company_name, status')
      .eq('auth_user_id', user.id)
      .eq('buyer_type', 'international')
      .eq('status', 'active')
      .maybeSingle();
    if (data) account = data as Record<string, unknown>;
  } catch { /* table absent / not international */ }

  return NextResponse.json({
    ok: true,
    is_international: !!account,
    is_staff: isStaff,
    ip_country: ipCountry,
    account,
  });
}
