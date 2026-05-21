// /api/admin/whatsapp-test
//
// Founder-only smoke test for the Twilio WhatsApp pipeline. Sends a
// short "test from BSC" message to a phone number the founder supplies
// (defaults to his own from the env DEFAULT_WHATSAPP_TEST_TO if set).
//
// Useful right after env vars are configured in Vercel — confirms the
// account SID + auth token + WHATSAPP_FROM are all wired correctly.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppOrSMS } from '@/lib/twilio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set(['founder','co_founder','control_admin','basic_admin']);

export async function POST(req: NextRequest) {
  const supaUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !anonKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });

  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !STAFF_ROLES.has(role)) return NextResponse.json({ ok: false, error: 'Admin only' }, { status: 403 });

  let body: { to?: unknown; body?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const to   = typeof body.to === 'string' && body.to.trim() ? body.to.trim() : (process.env.DEFAULT_WHATSAPP_TEST_TO ?? '');
  const text = typeof body.body === 'string' && body.body.trim() ? body.body.trim() :
    `🇧🇸 BSC test ping from ${role}. WhatsApp pipeline alive. ${new Date().toLocaleTimeString()}`;

  if (!to) return NextResponse.json({ ok: false, error: 'No "to" provided + DEFAULT_WHATSAPP_TEST_TO env not set' }, { status: 400 });

  const result = await sendWhatsAppOrSMS({ to, body: text });

  // Echo env state for diagnostics (without leaking secrets).
  const env = {
    has_account_sid:    !!process.env.TWILIO_ACCOUNT_SID,
    has_auth_token:     !!process.env.TWILIO_AUTH_TOKEN,
    has_whatsapp_from:  !!process.env.TWILIO_WHATSAPP_FROM,
    has_sms_from:       !!process.env.TWILIO_PHONE_NUMBER,
  };

  return NextResponse.json({ ...result, env }, { status: result.ok ? 200 : 502 });
}
