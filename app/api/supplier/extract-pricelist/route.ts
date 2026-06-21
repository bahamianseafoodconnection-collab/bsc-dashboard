// app/api/supplier/extract-pricelist/route.ts
//
// Send a supplier's uploaded pricelist PDF to Claude and return a
// structured array of products ready for /supplier admin to review +
// approve before bulk-importing through /api/supplier/bulk-add-products.
//
// Founder / co_founder only — server-authoritative, never lets the
// browser call the Anthropic API directly (keeps ANTHROPIC_API_KEY off
// the client).
//
// CHUNKED EXTRACTION (2026-06-21): a single whole-PDF call capped at
// max_tokens 8192 silently truncated big pricelists (~99 rows of a 1000-item
// sheet). The PDF is now split server-side with pdf-lib into small page-range
// batches.
//
// ONE BATCH PER INVOCATION (2026-06-21, fix): the route processes EXACTLY one
// BATCH_PAGES-page batch per call and returns a `next_start_page` cursor; the
// UI loops (start_page = next_start_page) until null, accumulating + de-duping
// every page client-side. Earlier this loop lived INSIDE the route (many
// batches per call) and blew the 60s function limit → FUNCTION_INVOCATION_
// TIMEOUT on a 33-page sheet. Keeping each invocation to a single Haiku call
// (same workload the old single-call route survived) makes timeouts impossible.
//
// SKU FROM VENDOR ITEM NO (2026-06-21): SKUs used to be `<code>-<slug(name)>`
// truncated to 24 chars, which collided for near-identical names (e.g.
// "FL-LY'S REG 1/1Z" vs "FL-LY'S REG 1/1.5Z") — distinct lines collapsed to one
// SKU and got de-duped / rejected by the unique constraint on import. We now
// ask Claude for the leftmost ITEM NO column and build `<code>-<item_no>`,
// which is unique per line. Falls back to the name slug only when no item
// number is present.
//
// Body: { supplier_id: UUID, start_page?: number }   // start_page 0-based, default 0
// Resp: {
//   ok: true,
//   supplier: { id, code, name },
//   products: Array<{
//     raw_line:          string,
//     name:              string,
//     unit_of_measure:   string,
//     pack_size:         string|null,
//     cost_per_unit:     number|null,
//     suggested_category:string,
//     suggested_sku:     string,
//     notes:             string|null,
//   }>,
//   next_start_page: number|null,   // resume cursor (0-based); null = all pages done
//   total_pages:     number,
//   token_usage: { input, output },
// }
//
// Model: claude-haiku-4-5-20251001 (fast PDF OCR + JSON structuring).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';

export const runtime  = 'nodejs';
export const dynamic  = 'force-dynamic';
export const maxDuration = 60; // single batch runs well under this

const ALLOWED_ROLES = new Set(['founder', 'co_founder']);
const MAX_ROWS = 200;          // per-batch prompt guidance; a few pages never reaches it
const MODEL = 'claude-haiku-4-5-20251001';
const BATCH_PAGES = 3;         // pages per call — one Haiku batch, well inside maxDuration.

// Categories the UI offers — keep in sync with /admin/inventory category
// selector. Used in the prompt so Claude picks from BSC's vocabulary.
const CATEGORIES = [
  'Seafood',
  'Meat',
  'Poultry',
  'Produce',
  'Dry Goods',
  'Frozen',
  'Dairy & Eggs',
  'Beverages',
  'Snacks',
  'Cleaning & Paper',
  'Personal Care',
  'Other',
];

interface ExtractedProduct {
  raw_line:           string;
  name:               string;
  unit_of_measure:    string;
  pack_size:          string | null;
  cost_per_unit:      number | null;
  suggested_category: string;
  suggested_sku:      string;
  notes:              string | null;
}

function slugifyForSku(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

// Robust JSON extraction from one batch's Claude response. Claude sometimes
// wraps in ```json ... ``` fences regardless of prompt; also survives a
// truncated tail (max_tokens hit mid-row) by walking back to the last
// complete row and rebuilding `]}`. Returns mapped rows + the raw count.
// (Same parse + field-mapping logic the single-call version used.)
function parseBatchRows(rawText: string, sup: { code: string }): { products: ExtractedProduct[]; rawCount: number } {
  let parsed: { products?: unknown } | null = null;
  const fenceStripped = rawText
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();
  const firstBrace = fenceStripped.indexOf('{');
  if (firstBrace !== -1) {
    const body = fenceStripped.slice(firstBrace);
    // Try the easy path first.
    try { parsed = JSON.parse(body); }
    catch {
      // Truncation recovery: find the last complete row inside products[]
      // and rebuild a closing `]}`. Works because every product row ends
      // with `}` and rows are comma-separated.
      const startIdx = body.indexOf('[');
      if (startIdx !== -1) {
        // Walk from the end backwards finding the last `},` and clip there.
        const end = body.lastIndexOf('},');
        if (end > startIdx) {
          const repaired = body.slice(0, end + 1) + ']}';
          try { parsed = JSON.parse(repaired); }
          catch {}
        }
      }
    }
  }
  const rawProducts = parsed && Array.isArray(parsed.products) ? parsed.products : [];
  const products: ExtractedProduct[] = rawProducts.map((p) => {
    const r = (p ?? {}) as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    const unit = typeof r.unit_of_measure === 'string' ? r.unit_of_measure.trim().toLowerCase() : '';
    const pack = typeof r.pack_size === 'string' && r.pack_size.trim() ? r.pack_size.trim() : null;
    const cost = typeof r.cost_per_unit === 'number' && Number.isFinite(r.cost_per_unit) && r.cost_per_unit >= 0
                   ? Number(r.cost_per_unit) : null;
    const cat  = typeof r.suggested_category === 'string' && CATEGORIES.includes(r.suggested_category.trim())
                   ? r.suggested_category.trim() : 'Other';
    const raw  = typeof r.raw_line === 'string' ? r.raw_line : '';
    const note = typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim() : null;

    // SKU from the vendor ITEM NO (unique per line). item_no may arrive as a
    // string ("01990", "MS165I") or, if Claude dropped leading zeros, a number.
    // Sanitize to alphanumerics + uppercase. Fall back to the name slug only
    // when there's no item number to key on.
    const itemNoRaw = typeof r.item_no === 'string' ? r.item_no.trim()
                    : (typeof r.item_no === 'number' && Number.isFinite(r.item_no)) ? String(r.item_no) : '';
    const itemNo = itemNoRaw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const suggestedSku = (itemNo
      ? `${sup.code}-${itemNo}`
      : `${sup.code}-${slugifyForSku(name)}`).slice(0, 64);

    return {
      raw_line:           raw,
      name,
      unit_of_measure:    unit,
      pack_size:          pack,
      cost_per_unit:      cost,
      suggested_category: cat,
      suggested_sku:      suggestedSku,
      notes:              note,
    };
  }).filter(p => p.name); // drop rows without a name
  return { products, rawCount: rawProducts.length };
}

interface ClaudeResp {
  content?: Array<{ type: string; text?: string }>;
  usage?:   { input_tokens?: number; output_tokens?: number };
}

// One Haiku call on a base64 PDF excerpt. Preserves the single-call version's
// exact Anthropic error handling (502 + inner message).
async function callClaude(
  pdfBase64: string, prompt: string, anthKey: string,
): Promise<{ ok: true; rawText: string; usage: { input: number; output: number } }
        | { ok: false; status: number; error: string }> {
  let claudeRes: Response;
  try {
    claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':          anthKey,
        'anthropic-version':  '2023-06-01',
      },
      body: JSON.stringify({
        model:      MODEL,
        // A few pages fit well inside Haiku's 8192 output ceiling.
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    });
  } catch (e) {
    return { ok: false, status: 502, error: `Anthropic call failed: ${e instanceof Error ? e.message : 'network'}` };
  }
  if (!claudeRes.ok) {
    const errText = await claudeRes.text().catch(() => '');
    // Anthropic returns JSON like {"type":"error","error":{"type":"...","message":"..."}}.
    // Surface the inner message if present so the UI shows something actionable.
    let innerMsg = errText.slice(0, 400);
    try {
      const j = JSON.parse(errText) as { error?: { message?: string; type?: string } };
      if (j?.error?.message) innerMsg = `${j.error.type ?? 'error'}: ${j.error.message}`;
    } catch {}
    return { ok: false, status: 502, error: `Anthropic ${claudeRes.status} (${MODEL}) — ${innerMsg}` };
  }
  const data    = (await claudeRes.json()) as ClaudeResp;
  const rawText = data.content?.find(c => c.type === 'text')?.text ?? '';
  return {
    ok: true, rawText,
    usage: { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 },
  };
}

export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (e) {
    // Anything we forgot to wrap below ends up here so the modal never
    // shows an opaque framework error like "The string did not match
    // the expected pattern".
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error('[extract-pricelist] uncaught:', msg);
    return NextResponse.json(
      { ok: false, error: `Server crash in extract-pricelist: ${msg}` },
      { status: 500 },
    );
  }
}

async function handle(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const anthKey = process.env.ANTHROPIC_API_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase env vars missing on server' }, { status: 500 });
  }
  if (!anthKey) {
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY missing on Vercel' }, { status: 500 });
  }

  // ── auth: founder / co_founder only ──
  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  }
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  }
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot extract pricelists.` }, { status: 403 });
  }

  let body: { supplier_id?: unknown; start_page?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const supplierId = typeof body.supplier_id === 'string' ? body.supplier_id : '';
  if (!supplierId) {
    return NextResponse.json({ ok: false, error: 'supplier_id is required' }, { status: 400 });
  }
  // 0-based resume cursor; default first page. Clamp to >= 0.
  const startPage = typeof body.start_page === 'number' && Number.isFinite(body.start_page) && body.start_page >= 0
    ? Math.floor(body.start_page) : 0;

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // ── load supplier + pricelist URL ──
  const { data: supplier, error: supErr } = await admin
    .from('suppliers')
    .select('id, code, name, pricelist_url, pricelist_filename')
    .eq('id', supplierId)
    .maybeSingle();
  if (supErr || !supplier) {
    return NextResponse.json({ ok: false, error: `Supplier ${supplierId.slice(0, 8)} not found` }, { status: 404 });
  }
  const sup = supplier as {
    id: string; code: string; name: string;
    pricelist_url: string | null; pricelist_filename: string | null;
  };
  if (!sup.pricelist_url) {
    return NextResponse.json({ ok: false, error: `${sup.name} has no pricelist uploaded yet.` }, { status: 400 });
  }

  // ── download PDF ──
  let arrayBuf: ArrayBuffer;
  try {
    const pdfRes = await fetch(sup.pricelist_url, { cache: 'no-store' });
    if (!pdfRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Step=fetch-pdf — pricelist URL returned ${pdfRes.status}: ${sup.pricelist_url.slice(0, 120)}` },
        { status: 502 },
      );
    }
    arrayBuf = await pdfRes.arrayBuffer();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Step=fetch-pdf — ${e instanceof Error ? `${e.name}: ${e.message}` : 'network'} · url=${sup.pricelist_url.slice(0, 120)}` },
      { status: 502 },
    );
  }

  // ── load with pdf-lib for server-side page splitting ──
  let src: PDFDocument;
  let totalPages: number;
  try {
    src = await PDFDocument.load(arrayBuf, { ignoreEncryption: true });
    totalPages = src.getPageCount();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Step=pdf-load — ${e instanceof Error ? `${e.name}: ${e.message}` : 'unknown'} · bytes=${arrayBuf.byteLength}` },
      { status: 400 },
    );
  }
  if (totalPages === 0) {
    return NextResponse.json({ ok: false, error: 'PDF has no pages.' }, { status: 400 });
  }
  if (startPage >= totalPages) {
    return NextResponse.json({ ok: false, error: `start_page ${startPage} is past the last page (total ${totalPages}).` }, { status: 400 });
  }

  // ── prompt ──
  const prompt = `You are extracting BSC's wholesale cost per product from a supplier pricelist PDF.

Supplier: ${sup.name} (BSC code: ${sup.code})

BSC categories (pick the closest one for each product):
${CATEGORIES.map(c => `  - ${c}`).join('\n')}

Return ONLY valid JSON. No markdown, no backticks. Format:
{
  "products": [
    {
      "item_no": "the exact ITEM NO column value as a STRING (preserve leading zeros and letters, e.g. \\"01990\\" or \\"MS165I\\"); null if the pricelist has no item-number column",
      "raw_line": "the exact text line as it appears in the PDF",
      "name": "normalized Title Case product name with no quantity suffix",
      "unit_of_measure": "one of: lb, case, each, kg, gallon, bottle, bag, box, dozen",
      "pack_size": "e.g. 24x4oz or 50lb bag or null if not stated",
      "cost_per_unit": 12.50,
      "suggested_category": "one of the categories listed above",
      "notes": "optional caveat or null"
    }
  ]
}

Rules:
- item_no is the supplier's own product/item number, usually the leftmost ITEM NO column. Copy it EXACTLY as a string, preserving leading zeros and letters. If there is no such column, use null.
- Extract every distinct sellable product line. Skip section headers, totals, blank lines.
- cost_per_unit is the BSD price BSC pays per unit_of_measure. If the pricelist shows "case $40 / 12 units", set unit_of_measure="case" and cost_per_unit=40.00.
- Title Case names. Strip vendor codes and pack quantities out of the name and into pack_size.
- If a line has unclear pricing, set cost_per_unit=null and explain in notes.
- Cap at ${MAX_ROWS} products total. If the PDF has more, take the first ${MAX_ROWS} and add a note on the last row.`;

  // ── ONE batch per invocation: pages [startPage, endExcl) ──
  // Copy this page range into a fresh PDF, run a single Haiku call, parse,
  // and return a cursor. The UI re-calls with start_page = next_start_page
  // until next_start_page is null. One Haiku call per invocation keeps each
  // function well under maxDuration (no FUNCTION_INVOCATION_TIMEOUT).
  const endExcl = Math.min(startPage + BATCH_PAGES, totalPages);

  let batchBase64: string;
  try {
    const sub = await PDFDocument.create();
    const idxs = Array.from({ length: endExcl - startPage }, (_, k) => startPage + k);
    const copied = await sub.copyPages(src, idxs);
    copied.forEach((pg) => sub.addPage(pg));
    const bytes = await sub.save();
    batchBase64 = Buffer.from(bytes).toString('base64');
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Step=pdf-split (pages ${startPage}-${endExcl - 1}) — ${e instanceof Error ? `${e.name}: ${e.message}` : 'unknown'}` },
      { status: 500 },
    );
  }

  const batch = await callClaude(batchBase64, prompt, anthKey);
  if (!batch.ok) {
    return NextResponse.json({ ok: false, error: batch.error }, { status: batch.status });
  }

  // Parse + de-dupe within this batch by suggested_sku (fallback raw_line).
  // The UI also de-dupes across batches against page-boundary overlap.
  const { products: parsed, rawCount } = parseBatchRows(batch.rawText, sup);
  const seen = new Set<string>();
  const products: ExtractedProduct[] = [];
  for (const p of parsed) {
    const key = (p.suggested_sku || p.raw_line).toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    products.push(p);
  }

  const nextStartPage = endExcl >= totalPages ? null : endExcl;

  return NextResponse.json({
    ok:       true,
    supplier: { id: sup.id, code: sup.code, name: sup.name },
    products,
    next_start_page: nextStartPage,
    total_pages:     totalPages,
    // Diagnostic snapshot so the UI can show WHY products is empty when
    // it is — image-only PDF (low input_tokens), Claude refused to JSON
    // (claude_preview shows prose), valid JSON but empty array, etc.
    diagnostic: products.length === 0 ? {
      raw_products_count: rawCount,
      claude_preview:     batch.rawText.slice(0, 800),
      pdf_bytes:          arrayBuf.byteLength,
    } : null,
    token_usage: {
      input:  batch.usage.input,
      output: batch.usage.output,
    },
  });
}
