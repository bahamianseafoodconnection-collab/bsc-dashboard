// POST /api/notifications/multi-channel
//
// Auth-gated wrapper around lib/notifications/multi-channel.ts so we
// can fire admin-only fan-outs from the client when needed. Most of
// our server code calls notifyMultiChannel() directly — this endpoint
// is for cases where a client-side action needs to trigger a fan-out
// without exposing API keys.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyMultiChannel, type Channel } from '@/lib/notifications/multi-channel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['founder','co_founder','control_admin','manager','basic_admin']);

interface Body {
  channels:    Channel[];
  emails?:     string[];
  phones?:     string[];
  title:       string;
  body:        string;
  url?:        string;
  urgent?:     boolean;
  relatedId?:  string | null;
  relatedType?: string | null;
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaKey) return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 500 });
  const admin = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const tokenHeader = req.headers.get('authorization') || '';
  const token = tokenHeader.startsWith('Bearer ') ? tokenHeader.slice(7) : null;
  if (!token) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!prof || !ALLOWED_ROLES.has(prof.role)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  if (!body.title || !body.body || !Array.isArray(body.channels) || body.channels.length === 0) {
    return NextResponse.json({ ok: false, error: 'title, body, channels[] required' }, { status: 400 });
  }

  const result = await notifyMultiChannel(body);
  return NextResponse.json({ ok: result.errors.length === 0, ...result });
}
