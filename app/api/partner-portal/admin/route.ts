// app/api/partner-portal/admin/route.ts
//
// Admin API for managing partner access tokens. Founder/co_founder
// gated. Actions: list / create / revoke / delete.

import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ADMIN_ROLES = new Set(['founder', 'co_founder']);

type Body = {
  action?: string;
  supplier_id?: string;
  label?: string;
  expires_in_days?: number | null;
  token_id?: string;
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
  return ALLOWED_ADMIN_ROLES.has(String(data?.role || ''));
}

function genToken(): string {
  const arr = new Uint8Array(16);
  (globalThis.crypto as Crypto).getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(req: Request) {
  const admin = adminClient();
  if (!admin) return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });
  if (!(await callerIsAdmin(req, admin)))
    return NextResponse.json({ ok: false, error: 'Founder access only' }, { status: 403 });

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 }); }

  const action = (body.action || '').trim();

  switch (action) {
    case 'list': {
      const { data, error } = await admin
        .from('partner_access_tokens')
        .select(`
          id, token, supplier_id, label, created_at, expires_at,
          revoked_at, last_accessed_at, access_count,
          supplier:suppliers ( id, name, contact_name, contact_phone )
        `)
        .order('created_at', { ascending: false });
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, tokens: data || [] });
    }

    case 'create': {
      if (!body.supplier_id)
        return NextResponse.json({ ok: false, error: 'supplier_id required' }, { status: 400 });
      const expires_at = body.expires_in_days
        ? new Date(Date.now() + body.expires_in_days * 24 * 3600 * 1000).toISOString()
        : null;
      const token = genToken();
      const { data, error } = await admin
        .from('partner_access_tokens')
        .insert({
          token,
          supplier_id: body.supplier_id,
          label: body.label || null,
          expires_at,
        })
        .select('id, token, expires_at')
        .single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, token: data.token, id: data.id, expires_at: data.expires_at });
    }

    case 'revoke': {
      if (!body.token_id)
        return NextResponse.json({ ok: false, error: 'token_id required' }, { status: 400 });
      const { error } = await admin
        .from('partner_access_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', body.token_id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case 'delete': {
      if (!body.token_id)
        return NextResponse.json({ ok: false, error: 'token_id required' }, { status: 400 });
      const { error } = await admin
        .from('partner_access_tokens')
        .delete()
        .eq('id', body.token_id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
  }
}
