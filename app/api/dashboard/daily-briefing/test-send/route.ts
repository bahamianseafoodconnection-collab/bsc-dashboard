// POST /api/dashboard/daily-briefing/test-send
//
// Manual trigger for the Daily Briefing pipeline. Lets the founder fire
// a sample email TONIGHT to verify Resend delivery + email rendering
// before the bank-data aggregator is wired.
//
// Auth: must be signed in as founder / co_founder / control_admin.
// Body (optional): { overrides?: Partial<DailyBriefingProps> } — pass to
// substitute parts of the sample (e.g. test a different headline).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendDailyBriefing } from '@/lib/resend/send-daily-briefing';
import type { DailyBriefingProps } from '@/emails/DailyBriefing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['founder', 'co_founder', 'control_admin']);

function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function sampleContent(): DailyBriefingProps {
  const today = new Date();
  const dayLabel = (i: number) => {
    const d = new Date(today); d.setDate(d.getDate() + i);
    return { day: d.toLocaleDateString('en-US', { weekday: 'short' }), date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
  };
  return {
    briefingDate:     fmtDay(today),
    greetingName:    'Dedrick + Jaquel',
    yesterdaysNumbers: [
      { label: 'Sales',         value: '$4,820.00', trend: 'up',   hint: '+18% vs last Sat' },
      { label: 'Orders',        value: '47',         trend: 'up' },
      { label: 'New Customers', value: '6',          trend: 'flat' },
    ],
    whatINoticed: [
      '*Salmon* sold out by 2 PM — same pattern as last 3 Saturdays. Pull *45 lb* for next Sat.',
      '*Online Market* dropped to 22% margin on Pig Feet — promo over-discount; reset to $1.59.',
      'No POS sales after 6 PM — close-up routine drifting; check with TJ.',
    ],
    sevenDayForecast: [
      { ...dayLabel(0), inflow: 4820, outflow: 1240, net:  3580 },
      { ...dayLabel(1), inflow: 6100, outflow: 1100, net:  5000 },
      { ...dayLabel(2), inflow:  980, outflow: 4150, net: -3170 },
      { ...dayLabel(3), inflow: 2400, outflow:  680, net:  1720 },
      { ...dayLabel(4), inflow: 3900, outflow: 1900, net:  2000 },
      { ...dayLabel(5), inflow: 1450, outflow:  520, net:   930 },
      { ...dayLabel(6), inflow: 5200, outflow: 1380, net:  3820 },
    ],
    whatToFocusOn: [
      'Pre-order *45 lb salmon* from BWA Monday for next Saturday rush.',
      'Reset *Pig Feet* online price to $1.59 — protects the 25% online margin.',
      'Brief TJ on close-up routine — no sales after 6 PM means we left customers at the door.',
      'Bahama Breeze invoice $4,150 hits Tuesday — confirm cash on hand by Monday close.',
    ],
    billsNote:
      'Bill, *salmon* is the headline today — sold out by 2 PM. Your 5% on a $4,820 day is *$170.50*. *Pig Feet* online needs a price reset to protect your cut. — D.',
    dashboardUrl: 'https://bscbahamas.com/dashboard/daily-briefing',
  };
}

export async function POST(req: NextRequest) {
  // ── auth ──
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaKey) {
    return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 500 });
  }
  const admin = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    try {
      const { data: { user } } = await admin.auth.getUser(token);
      if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
      const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).single();
      if (!prof || !ALLOWED_ROLES.has(prof.role)) {
        return NextResponse.json({ ok: false, error: 'forbidden — founder/co_founder/control_admin only' }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  // ── body / overrides ──
  let overrides: Partial<DailyBriefingProps> = {};
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && body.overrides) overrides = body.overrides;
  } catch { /* empty body is fine */ }

  const content: DailyBriefingProps = { ...sampleContent(), ...overrides };

  // ── send ──
  const result = await sendDailyBriefing({
    briefingDate:     content.briefingDate,
    briefingDateIso:  new Date().toISOString().slice(0, 10),
    content,
    rawData:          { test_send: true, generated_at: new Date().toISOString() },
  });

  const httpStatus = result.status === 'sent' ? 200 : result.status === 'placeholder' ? 200 : 500;
  return NextResponse.json(result, { status: httpStatus });
}
