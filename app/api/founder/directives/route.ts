// /api/founder/directives
//
// Founder→staff assignment board composer. Founder/co_founder only.
//   POST   create a directive (+ targets + first instance) → audit
//   GET    list directives with targets + done/seen counts
//   PATCH  close / reopen a directive → audit
//
// Tasks get exactly 1 instance (cycle_key='task'); duties get their current
// cycle instance now (ongoing cycles are materialized lazily by the staff feed).
// Service-role writes behind a founder role gate; audit → ai_writes.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FOUNDER_ROLES = new Set(['founder', 'co_founder']);

function svc(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function founder(req: NextRequest, admin: SupabaseClient) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { user: null, role: null };
  const uc = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return { user: null, role: null };
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return { user, role: (prof as { role?: string | null } | null)?.role ?? null };
}

// Current cycle key for a duty's recurrence (daily/weekly/monthly).
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
  return `${y}-${m}-${String(d.getUTCDate()).padStart(2, '0')}`; // daily
}

export async function GET(req: NextRequest) {
  const admin = svc();
  if (!admin) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  const { user, role } = await founder(req, admin);
  if (!user || !role || !FOUNDER_ROLES.has(role)) return NextResponse.json({ ok: false, error: 'Founder only' }, { status: 403 });

  const { data: dirs } = await admin.from('directives').select('*').order('created_at', { ascending: false }).limit(200);
  const ids = (dirs ?? []).map((d: { id: string }) => d.id);
  const [{ data: tgts }, { data: insts }] = await Promise.all([
    ids.length ? admin.from('directive_targets').select('directive_id, target_type, target_value').in('directive_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? admin.from('directive_instances').select('id, directive_id').in('directive_id', ids) : Promise.resolve({ data: [] }),
  ]);
  const instIds = (insts ?? []).map((i: { id: string }) => i.id);
  const { data: rcpts } = instIds.length ? await admin.from('directive_receipts').select('instance_id, seen_at, done_at').in('instance_id', instIds) : { data: [] };
  const instToDir = new Map((insts ?? []).map((i: { id: string; directive_id: string }) => [i.id, i.directive_id]));
  const seenBy = new Map<string, number>(), doneBy = new Map<string, number>();
  for (const r of (rcpts ?? []) as { instance_id: string; seen_at: string | null; done_at: string | null }[]) {
    const dir = instToDir.get(r.instance_id); if (!dir) continue;
    if (r.seen_at) seenBy.set(dir, (seenBy.get(dir) ?? 0) + 1);
    if (r.done_at) doneBy.set(dir, (doneBy.get(dir) ?? 0) + 1);
  }
  const tByDir = new Map<string, Array<{ target_type: string; target_value: string }>>();
  for (const t of (tgts ?? []) as { directive_id: string; target_type: string; target_value: string }[]) {
    const a = tByDir.get(t.directive_id) ?? []; a.push({ target_type: t.target_type, target_value: t.target_value }); tByDir.set(t.directive_id, a);
  }
  const out = (dirs ?? []).map((d: { id: string }) => ({ ...d, targets: tByDir.get(d.id) ?? [], seen_count: seenBy.get(d.id) ?? 0, done_count: doneBy.get(d.id) ?? 0 }));

  // Picker data for the composer: active staff (named-user targets), roles, locations.
  const { data: staff } = await admin.from('users').select('id, full_name, email, role').eq('is_active', true).order('full_name');
  const { data: locs }  = await admin.from('inventory_locations').select('code, name').eq('is_active', true).order('name');
  return NextResponse.json({ ok: true, directives: out, staff: staff ?? [], locations: locs ?? [] });
}

export async function POST(req: NextRequest) {
  const admin = svc();
  if (!admin) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  const { user, role } = await founder(req, admin);
  if (!user || !role || !FOUNDER_ROLES.has(role)) return NextResponse.json({ ok: false, error: 'Founder only' }, { status: 403 });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const kind = b.kind === 'duty' ? 'duty' : b.kind === 'task' ? 'task' : '';
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const targets = Array.isArray(b.targets) ? b.targets as Array<{ target_type?: unknown; target_value?: unknown }> : [];
  if (!kind) return NextResponse.json({ ok: false, error: "kind must be 'task' or 'duty'" }, { status: 400 });
  if (!title) return NextResponse.json({ ok: false, error: 'title required' }, { status: 400 });
  const cleanTargets = targets
    .map((t) => ({ target_type: String(t.target_type ?? ''), target_value: String(t.target_value ?? '').trim() }))
    .filter((t) => ['user', 'role', 'location'].includes(t.target_type) && t.target_value);
  if (cleanTargets.length === 0) return NextResponse.json({ ok: false, error: 'At least one target (user/role/location) required' }, { status: 400 });

  const priority = ['low', 'normal', 'high', 'urgent'].includes(String(b.priority)) ? String(b.priority) : 'normal';
  const recurrence = kind === 'duty' ? (b.recurrence && typeof b.recurrence === 'object' ? b.recurrence : { freq: 'daily' }) : null;
  const dueDate = kind === 'task' && typeof b.due_date === 'string' && b.due_date ? b.due_date.slice(0, 10) : null;

  const { data: dir, error: dErr } = await admin.from('directives').insert({
    kind, title,
    body: typeof b.body === 'string' ? b.body : null,
    body_cr: typeof b.body_cr === 'string' ? b.body_cr : null,
    body_es: typeof b.body_es === 'string' ? b.body_es : null,
    priority, due_date: dueDate, recurrence, status: 'open', author_id: user.id,
  }).select('id').single();
  if (dErr || !dir) return NextResponse.json({ ok: false, error: `Create failed: ${dErr?.message ?? 'no id'}` }, { status: 500 });
  const directiveId = (dir as { id: string }).id;

  await admin.from('directive_targets').insert(cleanTargets.map((t) => ({ directive_id: directiveId, ...t })));
  await admin.from('directive_instances').insert({
    directive_id: directiveId,
    cycle_key: kind === 'task' ? 'task' : cycleKey(recurrence),
    due_date: dueDate,
    status: 'open',
  });

  try { await admin.from('ai_writes').insert({ tool: 'directive_create', caller_id: user.id, input: { kind, title, targets: cleanTargets.length }, result: { directive_id: directiveId }, status: 'success', error: null }); } catch { /* non-fatal */ }
  return NextResponse.json({ ok: true, id: directiveId });
}

export async function PATCH(req: NextRequest) {
  const admin = svc();
  if (!admin) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  const { user, role } = await founder(req, admin);
  if (!user || !role || !FOUNDER_ROLES.has(role)) return NextResponse.json({ ok: false, error: 'Founder only' }, { status: 403 });

  let b: { id?: unknown; action?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const id = typeof b.id === 'string' ? b.id : '';
  const status = b.action === 'reopen' ? 'open' : b.action === 'close' ? 'closed' : '';
  if (!id || !status) return NextResponse.json({ ok: false, error: "id + action ('close'|'reopen') required" }, { status: 400 });
  const { error } = await admin.from('directives').update({ status }).eq('id', id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  try { await admin.from('ai_writes').insert({ tool: status === 'closed' ? 'directive_close' : 'directive_reopen', caller_id: user.id, input: { id }, result: { status }, status: 'success', error: null }); } catch { /* non-fatal */ }
  return NextResponse.json({ ok: true, status });
}
