// /api/supplier/save-extract-draft
//
// Server-authoritative durable save of a supplier's REVIEWED pricelist-extract
// set (D2 / Phase 5). The extract review grid used to live only in browser
// state and was lost the moment the modal closed — this persists it to the
// supplier_extract_drafts staging table so edits survive close/reopen and crash.
//
// This is the canonical Save pattern: Bearer-token auth + role gate (the
// authoritative mirror of the client canLock()), service-role client for the
// write, and an ai_writes audit row. Front-end is a thin view; this is the lock.
//
// POST { supplier_id: UUID, rows: any[], lock?: boolean }
//   → upsert the reviewed rows; when lock=true also stamp locked/locked_by.
//   → { ok, saved_count, locked }
// GET  ?supplier_id=UUID
//   → load the saved draft: { ok, rows, locked, updated_at }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['founder', 'co_founder']);
const MAX_DRAFT_ROWS = 5000;

function clients() {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return null;
  return { supaUrl, anonKey, svcKey };
}

// Shared auth: validate Bearer token + role gate. Returns the user id + role
// (the authoritative server-side mirror of the client canLock() check).
async function authFounder(req: NextRequest, supaUrl: string, anonKey: string) {
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { error: 'Sign in required', status: 401 as const };
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return { error: 'Invalid session', status: 401 as const };
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED_ROLES.has(role)) return { error: `Role "${role ?? 'none'}" cannot save drafts.`, status: 403 as const };
  return { userId: user.id, role };
}

export async function POST(req: NextRequest) {
  const c = clients();
  if (!c) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const auth = await authFounder(req, c.supaUrl, c.anonKey);
  if ('error' in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body: { supplier_id?: unknown; rows?: unknown; lock?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const supplierId = typeof body.supplier_id === 'string' ? body.supplier_id : '';
  const rows       = Array.isArray(body.rows) ? body.rows : null;
  const lock       = body.lock === true;
  if (!supplierId) return NextResponse.json({ ok: false, error: 'supplier_id is required' }, { status: 400 });
  if (!rows)       return NextResponse.json({ ok: false, error: 'rows array is required' }, { status: 400 });
  if (rows.length > MAX_DRAFT_ROWS) {
    return NextResponse.json({ ok: false, error: `Too many rows (${rows.length} > ${MAX_DRAFT_ROWS})` }, { status: 400 });
  }

  const admin = createClient(c.supaUrl, c.svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const nowIso = new Date().toISOString();

  const record: Record<string, unknown> = {
    supplier_id: supplierId,
    rows,
    updated_at:  nowIso,
    updated_by:  auth.userId,
  };
  if (lock) { record.locked = true; record.locked_at = nowIso; record.locked_by = auth.userId; }

  const { error } = await admin
    .from('supplier_extract_drafts')
    .upsert(record, { onConflict: 'supplier_id' });
  if (error) {
    return NextResponse.json({ ok: false, error: `Draft save failed: ${error.message}` }, { status: 500 });
  }

  // Audit (non-fatal).
  try {
    await admin.from('ai_writes').insert({
      tool:      'supplier_save_extract_draft',
      caller_id: auth.userId,
      input:     { supplier_id: supplierId, row_count: rows.length, lock },
      result:    { saved_count: rows.length, locked: lock, role: auth.role },
      status:    'success',
      error:     null,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  return NextResponse.json({ ok: true, saved_count: rows.length, locked: lock });
}

export async function GET(req: NextRequest) {
  const c = clients();
  if (!c) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const auth = await authFounder(req, c.supaUrl, c.anonKey);
  if ('error' in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const supplierId = new URL(req.url).searchParams.get('supplier_id') ?? '';
  if (!supplierId) return NextResponse.json({ ok: false, error: 'supplier_id required' }, { status: 400 });

  const admin = createClient(c.supaUrl, c.svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await admin
    .from('supplier_extract_drafts')
    .select('rows, locked, updated_at')
    .eq('supplier_id', supplierId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const draft = (data ?? null) as { rows?: unknown; locked?: boolean; updated_at?: string } | null;
  return NextResponse.json({
    ok:         true,
    rows:       Array.isArray(draft?.rows) ? draft!.rows : [],
    locked:     draft?.locked === true,
    updated_at: draft?.updated_at ?? null,
  });
}
