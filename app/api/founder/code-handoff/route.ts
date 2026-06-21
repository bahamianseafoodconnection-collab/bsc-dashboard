// /api/founder/code-handoff
//
// Founder AI → Claude Code handoff (Batch 9). A launch HANDOFF, not a live
// socket: the founder clicks "Connect to Claude Code" in the dashboard, this
// route stores the prepared task server-side and returns a ONE-TOUCH terminal
// command. The founder pastes that into their own terminal; it pulls the repo
// and launches Claude Code with the task.
//
// SECURITY: the command carries NO secrets. Claude Code authenticates with the
// founder's OWN local Claude login. The only token in the command is a
// short-lived (15-min) SINGLE-USE handoff token — it unlocks nothing but the
// task text, and is consumed on first read.
//
//   POST  { task }            (founder/co_founder, Bearer) → { ok, token, command, expires_at }
//   GET   ?token=…&format=text                              → the task text (claims it, marks used)
//
// The GET is token-authenticated (the token IS the proof) so the founder's
// terminal can fetch the task with a plain curl, no login.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOUNDER_ROLES = new Set(['founder', 'co_founder']);
const TTL_MS = 15 * 60 * 1000;
const REPO_PATH = '~/Documents/GitHub/bsc-dashboard';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function svc() {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
  return createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ── POST: create a handoff (founder only) ──────────────────────────────────
export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  }
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !FOUNDER_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot open a Claude Code handoff.` }, { status: 403 });
  }

  let b: { task?: unknown };
  try { b = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const task = typeof b.task === 'string' ? b.task.trim() : '';
  if (!task) return NextResponse.json({ ok: false, error: 'task is required' }, { status: 400 });
  if (task.length > 8000) return NextResponse.json({ ok: false, error: 'task too long (8000 char max)' }, { status: 400 });

  // High-entropy single-use token. Stored only as a hash.
  const token = `bsc_${randomBytes(24).toString('base64url')}`;
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  const admin = svc();
  const { error: insErr } = await admin.from('founder_code_handoffs').insert({
    token_hash: sha256(token),
    task,
    created_by: user.id,
    status:     'pending',
    expires_at: expiresAt,
  });
  if (insErr) {
    return NextResponse.json({ ok: false, error: `Could not create handoff: ${insErr.message}` }, { status: 500 });
  }

  const origin = req.headers.get('origin') ?? req.nextUrl.origin ?? 'https://bscbahamas.com';
  // One-touch launch: pull latest, then start Claude Code with the task fetched
  // via the single-use token. No secrets — Claude Code uses the local login.
  const command =
    `cd ${REPO_PATH} && git pull --ff-only && ` +
    `claude "$(curl -s '${origin}/api/founder/code-handoff?token=${token}&format=text')"`;

  return NextResponse.json({ ok: true, token, command, expires_at: expiresAt });
}

// ── GET: claim the task with the token (single-use) ────────────────────────
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const asText = req.nextUrl.searchParams.get('format') === 'text';
  const fail = (msg: string, status: number) =>
    asText ? new NextResponse(msg, { status, headers: { 'Content-Type': 'text/plain' } })
           : NextResponse.json({ ok: false, error: msg }, { status });

  if (!token) return fail('token required', 400);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_KEY) {
    return fail('Supabase not configured', 500);
  }

  const admin = svc();
  const { data: row } = await admin
    .from('founder_code_handoffs')
    .select('id, task, status, expires_at')
    .eq('token_hash', sha256(token))
    .maybeSingle<{ id: string; task: string; status: string; expires_at: string }>();

  if (!row) return fail('Handoff not found.', 404);
  if (row.status !== 'pending') return fail('This handoff was already used.', 410);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await admin.from('founder_code_handoffs').update({ status: 'expired' }).eq('id', row.id);
    return fail('This handoff link has expired (15-min limit). Generate a new one.', 410);
  }

  // Single-use: mark claimed BEFORE returning so a replay can't re-read it.
  await admin.from('founder_code_handoffs')
    .update({ status: 'claimed', claimed_at: new Date().toISOString() })
    .eq('id', row.id);

  if (asText) {
    return new NextResponse(row.task, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  return NextResponse.json({ ok: true, task: row.task });
}
