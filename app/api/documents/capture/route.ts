// /api/documents/capture
//
// Universal document capture (Phase 1). Accepts a photo / scan / PDF, runs it
// through Claude vision to IDENTIFY the document type + EXTRACT structured
// fields + any traceability ids, preserves the original in storage, and mirrors
// both into captured_documents (original ↔ digital record, linked permanently).
//
// Generalizes the existing invoice-scan / pricelist-extract pattern to ANY doc:
// landing report, invoice, export certificate, price list, health certificate,
// purchase order, shipping/customs doc, vessel logbook, receipt.
//
// Body: { file_base64, file_name, mime_type }   (image/* or application/pdf)
// Resp: { ok, document_id, doc_type, confidence, summary, fields, traceability, file_url }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STAFF = new Set(['founder','co_founder','control_admin','basic_admin','manager','processor','receiver','qc_staff','cashier','andros_staff','operations']);

const PROMPT = `You are a document-intake assistant for a Bahamian seafood processing + marketplace company (Spiny Tails / Bahamian Seafood Connection). Read this document (it may be a phone photo, scan, printed, or handwritten) and return ONLY valid JSON — no prose, no markdown, no backticks:

{
  "doc_type": one of ["landing_report","purchase_invoice","export_certificate","price_list","health_certificate","purchase_order","shipping_document","customs_document","vessel_logbook","receipt","other"],
  "confidence": 0.0-1.0,
  "summary": "one sentence describing the document",
  "fields": { ...key/value fields appropriate to the type... },
  "traceability": { "batch_number": "", "lot_number": "", "vessel_number": "", "export_number": "" }
}

Field guidance by type:
- landing_report: fisherman_name, company_name, vessel_name, vessel_registration, products (array), weight, date, fishing_area, fishing_method.
- purchase_invoice / receipt: supplier_name, invoice_number, date, line_items (array of {name, sku, quantity, unit_price, line_total}), subtotal, total, payment_terms.
- price_list: supplier_name, currency, products (array of {name, sku, unit_size, price}).
- export_certificate / shipping_document / customs_document: customer, destination_country, export_date, batch_number, lot_number, net_weight, carton_count, coi_number.
- health_certificate: issuer, certificate_number, product, issue_date, expiry_date.
- purchase_order: supplier_name, po_number, line_items, total, date.
- vessel_logbook: vessel_name, vessel_registration, captain, trip_start, trip_end, catch_area, species, weights.
Only include traceability keys you actually find (leave others as ""). Extract every legible value; never invent data.`;

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const aiKey   = process.env.ANTHROPIC_API_KEY;
  if (!supaUrl || !anonKey || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  if (!aiKey) return NextResponse.json({ ok: false, error: 'Document AI not configured (ANTHROPIC_API_KEY missing).' }, { status: 503 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !STAFF.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot capture documents.` }, { status: 403 });

  let b: { file_base64?: unknown; file_name?: unknown; mime_type?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const b64 = typeof b.file_base64 === 'string' ? b.file_base64.replace(/^data:[^,]+,/, '') : '';
  const fileName = typeof b.file_name === 'string' ? b.file_name : 'document';
  const mime = typeof b.mime_type === 'string' ? b.mime_type : 'image/jpeg';
  if (!b64) return NextResponse.json({ ok: false, error: 'file_base64 is required' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1) Preserve the original (legal evidence).
  let fileUrl = '';
  try {
    const ext = (fileName.split('.').pop() || (mime.includes('pdf') ? 'pdf' : 'jpg')).toLowerCase();
    const path = `captured-documents/${Date.now()}-${Math.round(Number(String(user.id).slice(-4)) || 0)}.${ext}`;
    const bytes = Buffer.from(b64, 'base64');
    const { error: upErr } = await admin.storage.from('site-images').upload(path, bytes, { upsert: true, contentType: mime });
    if (!upErr) fileUrl = admin.storage.from('site-images').getPublicUrl(path).data.publicUrl;
  } catch { /* non-fatal — extraction can still proceed */ }

  // 2) Claude vision: classify + extract.
  const isPdf = mime.includes('pdf');
  const contentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: mime.startsWith('image/') ? mime : 'image/jpeg', data: b64 } };

  let parsed: Record<string, unknown> = { doc_type: 'other', confidence: 0, summary: '', fields: {}, traceability: {} };
  let aiErr: string | null = null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': aiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-5', max_tokens: 2048,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: PROMPT }] }],
      }),
    });
    const data = await res.json();
    const text = (data?.content?.[0]?.text ?? '{}').trim().replace(/^```json\s*|\s*```$/g, '');
    try { parsed = JSON.parse(text); } catch { aiErr = 'Could not parse document. Try a clearer photo.'; }
  } catch (e) {
    aiErr = e instanceof Error ? e.message : 'AI extraction failed';
  }

  // 3) Mirror into captured_documents.
  let docId: string | null = null;
  try {
    const { data: row } = await admin.from('captured_documents').insert({
      file_url: fileUrl || 'pending', file_name: fileName, mime_type: mime,
      doc_type: String(parsed.doc_type ?? 'other'),
      summary: typeof parsed.summary === 'string' ? parsed.summary : null,
      extracted: parsed.fields ?? {},
      traceability: parsed.traceability ?? {},
      status: 'pending', uploaded_by: user.id,
    }).select('id').single();
    docId = (row as { id: string } | null)?.id ?? null;
  } catch (e) {
    console.warn('captured_documents insert failed:', e);
  }

  return NextResponse.json({
    ok: true, document_id: docId, file_url: fileUrl,
    doc_type: parsed.doc_type ?? 'other', confidence: parsed.confidence ?? null,
    summary: parsed.summary ?? '', fields: parsed.fields ?? {}, traceability: parsed.traceability ?? {},
    ai_error: aiErr,
  });
}
