// lib/rbc/process.ts
//
// Shared RBC report engine: parse a Merchant POS Transaction Report (.docx),
// store the original, and reconcile each card line.
//
// This RBC report is the IN-STORE POS TERMINAL settlement. So the primary match
// is to a POS register card sale by AMOUNT + DATE (reconcile-only — those orders
// are already paid at the register; we never change their status). An online
// auth-code path is kept as a fallback for any future online (Plug'n'Pay) volume
// that does carry an authorization code → recover pending → paid.
//
// Confirms/reconciles payment only — never touches tax/sales math.

import type { SupabaseClient } from '@supabase/supabase-js';
import mammoth from 'mammoth';

const PENDING = ['payment_pending', 'pending', 'unpaid'];
const POS_CHANNELS = ['nassau_pos', 'andros_pos'];
const CARD_METHODS = ['card', 'split'];

export type RbcTxn = {
  terminal_id: string | null; card_last4: string | null; card_type: string | null; batch_number: string | null;
  trace_number: string | null; auth_code: string | null; txn_date: string | null; txn_time: string | null;
  txn_type: string | null; amount: number | null; fee: number | null;
};

export function parseRbcTable(html: string): { txns: RbcTxn[]; merchantId: string | null; processingDate: string | null } {
  const flat = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const midM = flat.match(/Merchant ID:?\s*([0-9]{4,})/i);
  const pdM = flat.match(/Processing Date:?\s*([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/i);
  let processingDate: string | null = null;
  if (pdM) { const d = new Date(pdM[1]); if (!isNaN(d.getTime())) processingDate = d.toISOString().slice(0, 10); }

  const txns: RbcTxn[] = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (tr.match(/<td[\s\S]*?<\/td>/gi) ?? []).map(td => td.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim());
    if (cells.length < 10) continue;
    if (!/^\d{6,9}$/.test(cells[0])) continue;
    const dateIdx = cells.findIndex(c => /^\d{4}-\d{2}-\d{2}$/.test(c));
    if (dateIdx < 0) continue;
    const num = (s: string | undefined) => { if (!s) return null; const n = Number(s.replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; };
    txns.push({
      terminal_id: cells[0] ?? null,
      card_last4: (cells[1]?.match(/(\d{4})\s*$/)?.[1]) ?? null,
      card_type: cells[2] ?? null,
      batch_number: cells[3] ?? null,
      trace_number: cells[4] ?? null,
      auth_code: cells[5] ?? null,
      txn_date: cells[dateIdx] ?? null,
      txn_time: cells.find(c => /^\d{2}:\d{2}:\d{2}$/.test(c)) ?? null,
      txn_type: cells.find(c => /purchase|refund|void/i.test(c)) ?? null,
      amount: num(cells[dateIdx + 3]) ?? num(cells[9]),
      fee: cells[cells.length - 1] ? num(cells[cells.length - 1]) : null,
    });
  }
  return { txns, merchantId: midM ? midM[1] : null, processingDate };
}

export type RbcMatch = { order_id: string; method: string; recovered: boolean };

// Match one RBC line. `claimed` prevents two lines grabbing the same order.
export async function matchOneRbcTxn(
  admin: SupabaseClient,
  t: { auth_code: string | null; amount: number | null; txn_date: string | null; trace_number: string | null },
  claimed: Set<string>,
): Promise<RbcMatch | null> {
  // 1) Online auth-code path (recover pending → paid). Hits only if online
  //    Plug'n'Pay payments with auth codes exist.
  if (t.auth_code) {
    const { data: pt } = await admin.from('payment_transactions')
      .select('order_id').eq('pt_authorization_code', t.auth_code)
      .order('finalized_at', { ascending: false }).limit(1).maybeSingle<{ order_id: string | null }>();
    if (pt?.order_id && !claimed.has(pt.order_id)) {
      const { data: ord } = await admin.from('orders').select('id, total, payment_status').eq('id', pt.order_id).maybeSingle<{ id: string; total: number | null; payment_status: string | null }>();
      if (ord && Math.abs((Number(ord.total) || 0) - (t.amount ?? 0)) <= 0.01) {
        let recovered = false;
        if (ord.payment_status && PENDING.includes(ord.payment_status)) {
          const { data: flip } = await admin.from('orders').update({ payment_status: 'paid', payment_method: 'card', payment_ref: t.trace_number || undefined }).eq('id', ord.id).in('payment_status', PENDING).select('id');
          recovered = !!(flip && flip.length);
        }
        claimed.add(ord.id);
        return { order_id: ord.id, method: 'auth_code', recovered };
      }
    }
  }

  // 2) POS register card sale by AMOUNT + DATE (reconcile-only; already paid).
  if (t.amount != null && t.txn_date) {
    const from = new Date(`${t.txn_date}T00:00:00Z`); from.setUTCDate(from.getUTCDate() - 1);
    const to = new Date(`${t.txn_date}T23:59:59Z`); to.setUTCDate(to.getUTCDate() + 1);
    const { data: cands } = await admin.from('orders')
      .select('id, total, created_at')
      .in('channel', POS_CHANNELS)
      .in('payment_method', CARD_METHODS)
      .gte('created_at', from.toISOString()).lte('created_at', to.toISOString());
    const matches = (cands ?? [] as Array<{ id: string; total: number | null }>)
      .filter((o: { id: string; total: number | null }) => Math.abs((Number(o.total) || 0) - (t.amount ?? 0)) <= 0.01 && !claimed.has(o.id));
    if (matches.length === 1) { claimed.add(matches[0].id); return { order_id: matches[0].id, method: 'pos_amount_date', recovered: false }; }
  }
  return null;
}

async function loadClaimed(admin: SupabaseClient): Promise<Set<string>> {
  const { data } = await admin.from('rbc_transactions').select('matched_order_id').not('matched_order_id', 'is', null);
  return new Set(((data ?? []) as Array<{ matched_order_id: string }>).map(r => r.matched_order_id));
}

export type RbcResult = { ok: true; report_id: string; parsed: number; matched: number; recovered: number; unmatched: number; skipped: number; processing_date: string | null } | { ok: false; status: number; error: string };

export async function processRbcReport(admin: SupabaseClient, opts: { buffer: Buffer; fileName: string; source: 'upload' | 'email'; uploadedBy: string | null }): Promise<RbcResult> {
  let parsed: { txns: RbcTxn[]; merchantId: string | null; processingDate: string | null };
  try {
    const { value: html } = await mammoth.convertToHtml({ buffer: opts.buffer });
    parsed = parseRbcTable(html);
  } catch (e) {
    return { ok: false, status: 422, error: `Could not read the report: ${e instanceof Error ? e.message : 'parse error'}` };
  }
  if (parsed.txns.length === 0) return { ok: false, status: 422, error: 'No transactions found. Is it the RBC Merchant POS report (.docx)?' };

  let fileUrl = '';
  try {
    const path = `rbc-reports/${Date.now()}-${opts.fileName.replace(/[^A-Za-z0-9._-]/g, '')}`;
    const { error: upErr } = await admin.storage.from('site-images').upload(path, opts.buffer, { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', upsert: true });
    if (!upErr) fileUrl = admin.storage.from('site-images').getPublicUrl(path).data.publicUrl;
  } catch { /* non-fatal */ }

  const { data: report, error: repErr } = await admin.from('rbc_reports').insert({
    file_name: opts.fileName, file_url: fileUrl || null, merchant_id: parsed.merchantId, processing_date: parsed.processingDate,
    source: opts.source, transaction_count: parsed.txns.length, uploaded_by: opts.uploadedBy,
  }).select('id').single();
  if (repErr || !report) return { ok: false, status: 500, error: `Could not save report: ${repErr?.message ?? 'unknown'}` };
  const reportId = (report as { id: string }).id;

  const claimed = await loadClaimed(admin);
  let matched = 0, recovered = 0, unmatched = 0, skipped = 0;
  for (const t of parsed.txns) {
    if (t.amount == null) { skipped++; continue; }
    const m = await matchOneRbcTxn(admin, t, claimed);
    if (m) { matched++; if (m.recovered) recovered++; } else unmatched++;
    const { error: insErr } = await admin.from('rbc_transactions').insert({
      report_id: reportId, terminal_id: t.terminal_id, card_last4: t.card_last4, card_type: t.card_type,
      batch_number: t.batch_number, trace_number: t.trace_number, auth_code: t.auth_code,
      txn_date: t.txn_date, txn_time: t.txn_time, txn_type: t.txn_type, amount: t.amount, fee: t.fee,
      matched: !!m, matched_order_id: m?.order_id ?? null, match_method: m?.method ?? null, confirmed_at: m ? new Date().toISOString() : null,
    });
    if (insErr && ((insErr as { code?: string }).code === '23505' || /duplicate/i.test(insErr.message))) skipped++;
  }

  await admin.from('rbc_reports').update({ matched_count: matched, recovered_count: recovered }).eq('id', reportId);
  return { ok: true, report_id: reportId, parsed: parsed.txns.length, matched, recovered, unmatched, skipped, processing_date: parsed.processingDate };
}

// Re-run matching over already-imported UNMATCHED lines (e.g. after the matcher
// changed). Does not re-import anything.
export async function rematchUnmatched(admin: SupabaseClient): Promise<{ scanned: number; newly_matched: number; recovered: number }> {
  const { data } = await admin.from('rbc_transactions').select('id, auth_code, amount, txn_date, trace_number').eq('matched', false);
  const rows = (data ?? []) as Array<{ id: string; auth_code: string | null; amount: number | null; txn_date: string | null; trace_number: string | null }>;
  const claimed = await loadClaimed(admin);
  let newly = 0, recovered = 0;
  for (const t of rows) {
    const m = await matchOneRbcTxn(admin, t, claimed);
    if (!m) continue;
    await admin.from('rbc_transactions').update({ matched: true, matched_order_id: m.order_id, match_method: m.method, confirmed_at: new Date().toISOString() }).eq('id', t.id);
    newly++; if (m.recovered) recovered++;
  }
  return { scanned: rows.length, newly_matched: newly, recovered };
}
