// =====================================================================
// /api/cloudprnt — Star CloudPRNT server endpoint
//
// The Star mC-Print3 (MCP31L) polls THIS public HTTPS URL outbound from
// the LAN. No iPad driver, no Mac .pkg. Protocol (Star CloudPRNT, HTTP):
//
//   1. POST  (poll)    printer → { printerMAC, status, printingInProgress, ... }
//                      server → { jobReady: bool, mediaTypes:[...], jobToken }
//   2. GET   (fetch)   printer → ?mac=&token=&type=
//                      server → Star Document Markup body (text/vnd.star.markup)
//   3. DELETE(confirm) printer → ?mac=&token=&code=
//                      server → { } 200; job marked printed (or failed)
//
// The printer is identified by MAC against the printers registry. Jobs
// are read/written with the SERVICE ROLE (bypasses RLS) so the poll path
// needs no user token. Optional shared secret: if CLOUDPRNT_TOKEN is set,
// the printer must present it (?t=… or HTTP Basic password) or it is
// served nothing — see the CloudPRNT settings note in the build report.
//
// This file exports ONLY HTTP handlers + route config (Next.js rule).
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { renderJobMarkup, type PrintJobType, type PrintableOrder } from '@/lib/star-markup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAR_MEDIA = 'text/vnd.star.markup';
// A claimed job with no DELETE within this window is re-served on the
// next poll (covers a printer that lost power / dropped the ACK). Worst
// case is a duplicate slip, never a lost receipt.
const RECLAIM_MS = 90_000;

const ORDER_COLS =
  'id, created_at, customer_name, customer_phone, payment_method, payment_status, status, payment_ref, card_ref, terminal_type, total, vat_amount, wholesale_items';

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// MAC comparison is separator/case-insensitive (00:11:62… vs 001162…).
function normMac(m: string | null | undefined): string {
  return String(m ?? '').toLowerCase().replace(/[^0-9a-f]/g, '');
}

// Optional shared-secret gate. Open when CLOUDPRNT_TOKEN is unset.
function authorized(req: NextRequest): boolean {
  const want = process.env.CLOUDPRNT_TOKEN;
  if (!want) return true;
  const t = req.nextUrl.searchParams.get('t');
  if (t && t === want) return true;
  const basic = req.headers.get('authorization') || '';
  if (basic.toLowerCase().startsWith('basic ')) {
    try {
      const [, pass] = Buffer.from(basic.slice(6), 'base64').toString('utf8').split(':');
      if (pass && pass === want) return true;
    } catch { /* ignore */ }
  }
  return false;
}

async function printerByMac(db: SupabaseClient, mac: string) {
  const target = normMac(mac);
  if (!target) return null;
  const { data } = await db.from('printers').select('id, mac_address, is_active').eq('is_active', true);
  for (const p of (data ?? []) as { id: string; mac_address: string; is_active: boolean }[]) {
    if (normMac(p.mac_address) === target) return p;
  }
  return null;
}

// ── POST: poll — "anything to print for me?" ─────────────────────────
export async function POST(req: NextRequest) {
  const none = NextResponse.json({ jobReady: false, mediaTypes: [STAR_MEDIA] });
  if (!authorized(req)) return none;
  const db = admin();
  if (!db) return none;

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* empty/keepalive */ }
  const mac = (body.printerMAC as string) || req.nextUrl.searchParams.get('mac');

  const printer = await printerByMac(db, mac || '');
  if (!printer) return none;

  // Next job: pending, or a stale claim to re-serve.
  const staleBefore = new Date(Date.now() - RECLAIM_MS).toISOString();
  const { data: jobs } = await db
    .from('print_jobs')
    .select('id, status, claimed_at')
    .eq('printer_id', printer.id)
    .or(`status.eq.pending,and(status.eq.claimed,claimed_at.lt.${staleBefore})`)
    .order('created_at', { ascending: true })
    .limit(1);

  const job = (jobs ?? [])[0] as { id: string } | undefined;
  if (!job) return NextResponse.json({ jobReady: false, mediaTypes: [STAR_MEDIA] });

  await db.from('print_jobs').update({ status: 'claimed', claimed_at: new Date().toISOString() }).eq('id', job.id);
  return NextResponse.json({ jobReady: true, mediaTypes: [STAR_MEDIA], jobToken: job.id });
}

// ── GET: fetch — return the print payload for the claimed job ────────
export async function GET(req: NextRequest) {
  if (!authorized(req)) return new NextResponse('', { status: 200 });
  const db = admin();
  if (!db) return new NextResponse('', { status: 200 });

  const token = req.nextUrl.searchParams.get('token');
  if (!token) return new NextResponse('', { status: 200 }); // bare probe

  const { data: job } = await db
    .from('print_jobs')
    .select('id, job_type, order_id, payload')
    .eq('id', token)
    .maybeSingle();
  if (!job) return new NextResponse('', { status: 200 });

  const j = job as { id: string; job_type: string; order_id: string | null; payload: string | null };

  // Pre-rendered payload prints verbatim; otherwise render fresh from the order.
  let markup = j.payload ?? '';
  if (!markup && j.order_id) {
    const { data: order } = await db.from('orders').select(ORDER_COLS).eq('id', j.order_id).maybeSingle();
    if (order) markup = renderJobMarkup(order as unknown as PrintableOrder, j.job_type as PrintJobType);
  }
  if (!markup) markup = '[align: center]\n(No content)\n[feed: 2]\n[cut: partial]\n';

  return new NextResponse(markup, {
    status: 200,
    headers: { 'Content-Type': STAR_MEDIA, 'Cache-Control': 'no-store' },
  });
}

// ── DELETE: confirm — printer finished; mark printed (or failed) ─────
export async function DELETE(req: NextRequest) {
  const db = admin();
  if (!db) return NextResponse.json({ ok: true });
  const token = req.nextUrl.searchParams.get('token');
  const code = (req.nextUrl.searchParams.get('code') || '').toLowerCase();
  if (!token) return NextResponse.json({ ok: true });

  // Treat anything not clearly an error as success — the printer only
  // DELETEs after handling the job. A "2xx"/"ok"/empty/"0" code is good.
  const ok = !code || code === '0' || code === 'ok' || code.startsWith('2');
  await db
    .from('print_jobs')
    .update(ok
      ? { status: 'printed', printed_at: new Date().toISOString() }
      : { status: 'failed', error: code })
    .eq('id', token);

  return NextResponse.json({ ok: true });
}
