// Vercel cron — /api/cron/daily-briefing
//
// Scheduled in vercel.json at "0 1 * * *" UTC (= 9 PM AST during EDT,
// which Bahamas observes most of the year). Tweak to "0 2 * * *"
// for EST months if the timing drifts.
//
// SCAFFOLD ONLY: this run logs that it fired and writes a placeholder
// row to daily_briefings so we can see the cron actually hit Vercel.
// The real data aggregator (bank_transactions + orders + fees +
// customers + inventory) lands in a follow-up session, and at that
// point we replace the placeholder block with a call to
// sendDailyBriefing(...).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthorized(req: NextRequest): boolean {
  // Vercel cron supplies an Authorization: Bearer <CRON_SECRET> header
  // when CRON_SECRET is set in env. If the secret isn't set, allow the
  // call (so the scaffold is testable on day one).
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  const header = req.headers.get('authorization') ?? '';
  return header === `Bearer ${expected}`;
}

function adminSupa() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(req: NextRequest) {
  const firedAt = new Date().toISOString();
  console.log('[cron/daily-briefing] triggered at', firedAt);

  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const supa = adminSupa();
  if (!supa) {
    return NextResponse.json({ ok: false, error: 'Supabase service key missing' }, { status: 500 });
  }

  const briefingDateIso = new Date().toISOString().slice(0, 10);

  const { data, error } = await supa
    .from('daily_briefings')
    .insert({
      briefing_date:     briefingDateIso,
      raw_data_json:     null,
      generated_content: '⏳ scaffold placeholder — bank-data aggregator not yet wired',
      sent_to:           [],
      status:            'placeholder',
    })
    .select('id')
    .single();

  if (error) {
    console.error('[cron/daily-briefing] insert failed:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok:           true,
    fired_at:     firedAt,
    briefing_id:  data?.id ?? null,
    note:         'placeholder row written; bank-data aggregator + real send come in follow-up session',
  });
}
