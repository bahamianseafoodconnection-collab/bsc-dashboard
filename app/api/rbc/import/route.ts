// /api/rbc/import
//
// Manual re-upload fallback for the RBC portal (e.g. re-process a missed report).
// The PRIMARY ingestion is automatic — see /api/rbc/inbound. Same shared engine.
// Founder/admin/manager. Service-role.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processRbcReport } from '@/lib/rbc/process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin', 'manager']);

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED.has(role)) return NextResponse.json({ ok: false, error: 'Founder / admin only.' }, { status: 403 });

  let b: { file_base64?: unknown; file_name?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const b64 = typeof b.file_base64 === 'string' ? b.file_base64.replace(/^data:[^,]+,/, '') : '';
  const fileName = typeof b.file_name === 'string' ? b.file_name : 'rbc-report.docx';
  if (!b64) return NextResponse.json({ ok: false, error: 'file_base64 required' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const r = await processRbcReport(admin, { buffer: Buffer.from(b64, 'base64'), fileName, source: 'upload', uploadedBy: user.id });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  try { await admin.from('ai_writes').insert({ tool: 'rbc_import', caller_id: user.id, input: { file_name: fileName }, result: { ...r }, status: 'success', error: null }); } catch { /* non-fatal */ }
  return NextResponse.json(r);
}
