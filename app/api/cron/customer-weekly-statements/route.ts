// =====================================================================
// /api/cron/customer-weekly-statements
//
// Per-customer cadence (read from credit_terms):
//   • weekly (NET_≤7)  → every Monday  08:00 AST  (cron 0 12 * * 1)
//   • monthly          → month-end     09:00 AST  (cron 0 13 28-31 * *)
//   • EVENT OVERRIDE   → credit-limit breach generates immediately
//
// Both schedules hit this one route; the per-customer logic in
// runStatementGeneration() decides who is actually due today, so extra
// fires are safe (idempotent on customer_id + period_end).
//
// GENERATES + SAVES AS 'pending' ONLY. It never sends — the founder
// approves + sends from /founder/statements.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runStatementGeneration } from '@/lib/statements/generate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true; // open in envs without a secret configured
  return (req.headers.get('authorization') ?? '') === `Bearer ${expected}`;
}

function adminSupa(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const admin = adminSupa();
  if (!admin) return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });

  const { asOf, results } = await runStatementGeneration(admin);
  const created = results.filter((r) => r.outcome === 'created');
  const errors = results.filter((r) => r.outcome === 'error');

  return NextResponse.json({
    ok: true,
    asOf,
    created: created.length,
    skipped: results.filter((r) => r.outcome === 'skipped').length,
    errors: errors.length,
    detail: results,
  });
}
