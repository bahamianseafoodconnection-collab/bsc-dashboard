// app/api/processor/batches/approve/route.ts
//
// Founder/co_founder approves or rejects a draft processing batch.
// Uses the service role to bypass RLS on the update so the server-side
// role check is the single source of truth.

import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APPROVER_ROLES = new Set(['founder', 'co_founder']);

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

type Body = {
  batchId?: string;
  decision?: 'approved' | 'rejected';
  notes?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const batchId = (body.batchId || '').trim();
  const decision = body.decision;
  const noteText = (body.notes || '').trim();

  if (!batchId) {
    return NextResponse.json({ error: 'Missing batchId' }, { status: 400 });
  }
  if (decision !== 'approved' && decision !== 'rejected') {
    return NextResponse.json(
      { error: 'decision must be "approved" or "rejected"' },
      { status: 400 }
    );
  }
  if (decision === 'rejected' && !noteText) {
    return NextResponse.json(
      { error: 'Rejection requires a note explaining why.' },
      { status: 400 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
  }

  // Identify the caller from cookies.
  const cookieStore = await cookies();
  const ssr = createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet: CookieToSet[]) =>
        toSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        ),
    },
  });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Service-role admin client to bypass RLS for the role check + the update.
  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userRow, error: userErr } = await admin
    .from('users')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (userErr || !userRow) {
    return NextResponse.json(
      { error: userErr?.message ?? 'User record not found' },
      { status: 403 }
    );
  }
  if (!userRow.is_active) {
    return NextResponse.json({ error: 'Account inactive' }, { status: 403 });
  }
  if (!APPROVER_ROLES.has(userRow.role as string)) {
    return NextResponse.json(
      { error: `Role ${userRow.role} cannot approve batches` },
      { status: 403 }
    );
  }

  // Look up the batch so we can fold the rejection note into the existing notes
  // field (the schema doesn't have a separate rejection_reason column).
  const { data: batch, error: batchErr } = await admin
    .from('processing_batches')
    .select('id, status, notes')
    .eq('id', batchId)
    .maybeSingle();
  if (batchErr || !batch) {
    return NextResponse.json(
      { error: batchErr?.message ?? 'Batch not found' },
      { status: 404 }
    );
  }
  if (batch.status === 'approved' || batch.status === 'rejected') {
    return NextResponse.json(
      { error: `Batch already ${batch.status}` },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: decision,
    approved_by: user.id,
    approved_at: nowIso,
    updated_at: nowIso,
  };
  if (noteText) {
    const stamp = `[${decision === 'rejected' ? 'REJECTED' : 'APPROVED'} ${nowIso.slice(0, 10)}] ${noteText}`;
    update.notes = batch.notes ? `${batch.notes}\n${stamp}` : stamp;
  }

  const { error: updErr } = await admin
    .from('processing_batches')
    .update(update)
    .eq('id', batchId);

  if (updErr) {
    return NextResponse.json(
      { error: `Update failed: ${updErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, batchId, decision });
}
