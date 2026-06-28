// /api/directives/feed
//
// Staff "My Tasks" feed. For the signed-in user: open directives targeting them
// (by user / role / location), rendered in their language (profiles.language:
// en→body, cr→body_cr, es→body_es, with English fallback). Duties materialize
// the CURRENT cycle instance lazily here; opening the feed lazily creates a
// 'seen' receipt.
//   GET  → my open items
//   POST → { instance_id, action:'done'|'undone', done_note? }
//
// Service-role behind a signed-in gate (RLS is the backstop; this is the
// convenience layer that does the targeting + lazy materialization).

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function cycleKey(recurrence: unknown, d = new Date()): string {
  const freq = (recurrence && typeof recurrence === 'object' && 'freq' in recurrence) ? String((recurrence as { freq: unknown }).freq) : 'daily';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  if (freq === 'monthly') return `${y}-${m}`;
  if (freq === 'weekly') {
    const onejan = Date.UTC(y, 0, 1);
    const week = Math.ceil(((d.getTime() - onejan) / 86400000 + new Date(onejan).getUTCDay() + 1) / 7);
    return `${y}-W${String(week).padStart(2, '0')}`;
  }
  return `${y}-${m}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function ctx(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const uc = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return null;
  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: prof } = await admin.from('profiles').select('role, language').eq('id', user.id).maybeSingle();
  let role = (prof as { role?: string | null } | null)?.role ?? null;
  let loc: string | null = null;
  const { data: u } = await admin.from('users').select('role, primary_location').eq('id', user.id).maybeSingle();
  if (u) { role = role ?? (u as { role?: string | null }).role ?? null; loc = (u as { primary_location?: string | null }).primary_location ?? null; }
  const lang = (prof as { language?: string | null } | null)?.language ?? 'en';
  return { admin: admin as SupabaseClient, userId: user.id, role, loc, lang };
}

function pickBody(d: { body: string | null; body_cr: string | null; body_es: string | null }, lang: string): string {
  if (lang === 'cr') return d.body_cr || d.body || '';
  if (lang === 'es') return d.body_es || d.body || '';
  return d.body || '';
}

export async function GET(req: NextRequest) {
  const c = await ctx(req);
  if (!c) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const { admin, userId, role, loc, lang } = c;

  // Directives targeting me (open).
  const ors: string[] = [`and(target_type.eq.user,target_value.eq.${userId})`];
  if (role) ors.push(`and(target_type.eq.role,target_value.eq.${role})`);
  if (loc) ors.push(`and(target_type.eq.location,target_value.eq.${loc})`);
  const { data: tgts } = await admin.from('directive_targets').select('directive_id').or(ors.join(','));
  const dirIds = Array.from(new Set((tgts ?? []).map((t: { directive_id: string }) => t.directive_id)));
  if (dirIds.length === 0) return NextResponse.json({ ok: true, items: [], lang });

  const { data: dirs } = await admin.from('directives').select('id, kind, title, body, body_cr, body_es, priority, due_date, recurrence').in('id', dirIds).eq('status', 'open');
  type D = { id: string; kind: string; title: string; body: string | null; body_cr: string | null; body_es: string | null; priority: string; due_date: string | null; recurrence: unknown };
  const dlist = (dirs ?? []) as D[];

  // Materialize the wanted instance per directive (task='task'; duty=current cycle).
  const wanted = dlist.map((d) => ({ directive_id: d.id, cycle_key: d.kind === 'task' ? 'task' : cycleKey(d.recurrence), due_date: d.due_date, status: 'open' as const }));
  if (wanted.length) await admin.from('directive_instances').upsert(wanted, { onConflict: 'directive_id,cycle_key', ignoreDuplicates: true });

  const { data: insts } = await admin.from('directive_instances').select('id, directive_id, cycle_key, due_date, status').in('directive_id', dirIds).eq('status', 'open');
  const wantKey = new Set(wanted.map((w) => `${w.directive_id}|${w.cycle_key}`));
  const myInsts = (insts ?? []).filter((i: { directive_id: string; cycle_key: string | null }) => wantKey.has(`${i.directive_id}|${i.cycle_key}`)) as { id: string; directive_id: string; cycle_key: string | null; due_date: string | null }[];
  const instIds = myInsts.map((i) => i.id);

  // Lazy 'seen' receipts + read existing done state.
  if (instIds.length) await admin.from('directive_receipts').upsert(instIds.map((id) => ({ instance_id: id, user_id: userId, seen_at: new Date().toISOString() })), { onConflict: 'instance_id,user_id', ignoreDuplicates: true });
  const { data: rcpts } = instIds.length ? await admin.from('directive_receipts').select('instance_id, done_at, done_note').eq('user_id', userId).in('instance_id', instIds) : { data: [] };
  const rcptBy = new Map((rcpts ?? []).map((r: { instance_id: string; done_at: string | null; done_note: string | null }) => [r.instance_id, r]));
  const dirById = new Map(dlist.map((d) => [d.id, d]));

  const items = myInsts.map((i) => {
    const d = dirById.get(i.directive_id)!;
    const r = rcptBy.get(i.id);
    return { instance_id: i.id, directive_id: d.id, kind: d.kind, title: d.title, body: pickBody(d, lang), priority: d.priority, due_date: i.due_date, done: !!r?.done_at, done_note: r?.done_note ?? null };
  }).sort((a, b) => Number(a.done) - Number(b.done));

  return NextResponse.json({ ok: true, items, lang });
}

export async function POST(req: NextRequest) {
  const c = await ctx(req);
  if (!c) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const { admin, userId } = c;
  let b: { instance_id?: unknown; action?: unknown; done_note?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const instanceId = typeof b.instance_id === 'string' ? b.instance_id : '';
  const done = b.action === 'done';
  const undone = b.action === 'undone';
  if (!instanceId || (!done && !undone)) return NextResponse.json({ ok: false, error: "instance_id + action ('done'|'undone') required" }, { status: 400 });

  const { error } = await admin.from('directive_receipts').upsert({
    instance_id: instanceId, user_id: userId,
    seen_at: new Date().toISOString(),
    done_at: done ? new Date().toISOString() : null,
    done_note: done ? (typeof b.done_note === 'string' ? b.done_note.slice(0, 500) : null) : null,
  }, { onConflict: 'instance_id,user_id' });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
