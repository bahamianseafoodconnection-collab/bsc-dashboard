// /api/supplier/extract-pricelist
//
// Send a supplier's uploaded pricelist PDF to Claude and return a
// structured array of products ready for /supplier admin to review +
// approve before bulk-importing through /api/supplier/bulk-add-products.
//
// Founder / co_founder only — server-authoritative, never lets the
// browser call the Anthropic API directly (keeps ANTHROPIC_API_KEY off
// the client).
//
// Body: { supplier_id: UUID }
// Resp: {
//   ok: true,
//   supplier: { id, code, name },
//   products: Array<{
//     raw_line:          string,   // original text from the pricelist
//     name:              string,   // normalized Title Case product name
//     unit_of_measure:   string,   // lb | case | each | kg | gallon | bottle | bag
//     pack_size:         string|null,  // "24x4oz" / "50lb bag" / null
//     cost_per_unit:     number|null, // BSD cost per unit (what BSC pays)
//     suggested_category:string,   // one of CATEGORIES list
//     suggested_sku:     string,   // auto-built supplier_code + slug
//     notes:             string|null,
//   }>,
//   token_usage: { input, output },
// }
//
// Notes:
//   • Uses Claude's native PDF input — no pre-conversion needed.
//   • Model: claude-opus-4-5 (matches /api/invoice-scan; opus picks up
//     odd table layouts better than sonnet).
//   • Hard cap at 200 extracted rows per call so a 50-page distributor
//     pricelist doesn't blow the response payload. Cashier can re-run
//     against page ranges if a supplier has more.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime  = 'nodejs';
export const dynamic  = 'force-dynamic';
export const maxDuration = 60; // PDF extraction can run up to a minute

const ALLOWED_ROLES = new Set(['founder', 'co_founder']);
const MAX_ROWS = 200;

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

  let body: { supplier_id?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const supplierId = typeof body.supplier_id === 'string' ? body.supplier_id : '';
  if (!supplierId) {
    return NextResponse.json({ ok: false, error: 'supplier_id is required' }, { status: 400 });
  }

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

  // ── download PDF and base64 it ──
  let arrayBuf: ArrayBuffer;
  let pdfBase64: string;
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
  try {
    pdfBase64 = Buffer.from(arrayBuf).toString('base64');
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Step=base64-encode — ${e instanceof Error ? `${e.name}: ${e.message}` : 'unknown'} · bytes=${arrayBuf.byteLength}` },
      { status: 500 },
    );
  }

  // ── call Claude ──
  const prompt = `You are extracting BSC's wholesale cost per product from a supplier pricelist PDF.

Supplier: ${sup.name} (BSC code: ${sup.code})

BSC categories (pick the closest one for each product):
${CATEGORIES.map(c => `  - ${c}`).join('\n')}

Return ONLY valid JSON. No markdown, no backticks. Format:
{
  "products": [
    {
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
- Extract every distinct sellable product line. Skip section headers, totals, blank lines.
- cost_per_unit is the BSD price BSC pays per unit_of_measure. If the pricelist shows "case $40 / 12 units", set unit_of_measure="case" and cost_per_unit=40.00.
- Title Case names. Strip vendor codes and pack quantities out of the name and into pack_size.
- If a line has unclear pricing, set cost_per_unit=null and explain in notes.
- Cap at ${MAX_ROWS} products total. If the PDF has more, take the first ${MAX_ROWS} and add a note on the last row.`;

  // Haiku 4.5 — fast PDF OCR + JSON structuring. Sonnet was timing out
  // the Vercel function (FUNCTION_INVOCATION_TIMEOUT, ~10s cap on
  // Hobby plan) on a 3-page JBI pricelist. Haiku finishes the same
  // workload in 3-5s and is much cheaper.
  const MODEL = 'claude-haiku-4-5-20251001';
  let claudeData: unknown;
  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':          anthKey,
        'anthropic-version':  '2023-06-01',
      },
      body: JSON.stringify({
        model:      MODEL,
        // 8192 is Haiku's standard output ceiling. JBI's 3-page pricelist
        // hit 4096 mid-row — bumping to give Claude room to finish the
        // whole list. Haiku is still fast enough to fit Vercel's cap.
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
    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => '');
      // Anthropic returns JSON like {"type":"error","error":{"type":"...","message":"..."}}.
      // Surface the inner message if present so the UI shows something actionable.
      let innerMsg = errText.slice(0, 400);
      try {
        const j = JSON.parse(errText) as { error?: { message?: string; type?: string } };
        if (j?.error?.message) innerMsg = `${j.error.type ?? 'error'}: ${j.error.message}`;
      } catch {}
      return NextResponse.json(
        { ok: false, error: `Anthropic ${claudeRes.status} (${MODEL}) — ${innerMsg}` },
        { status: 502 },
      );
    }
    claudeData = await claudeRes.json();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Anthropic call failed: ${e instanceof Error ? e.message : 'network'}` },
      { status: 502 },
    );
  }

  interface ClaudeResp {
    content?: Array<{ type: string; text?: string }>;
    usage?:   { input_tokens?: number; output_tokens?: number };
  }
  const data    = claudeData as ClaudeResp;
  const rawText = data.content?.find(c => c.type === 'text')?.text ?? '';

  // Robust JSON extraction. Claude sometimes wraps in ```json ... ```
  // fences regardless of prompt; also need to survive a truncated tail
  // (max_tokens hit mid-row). Strategy:
  //   1. Strip leading/trailing whitespace + any code fences anywhere.
  //   2. Find the first '{' and parse forward. If parse fails, walk
  //      backward from the end stripping incomplete tail rows until
  //      we find a balanced JSON close. That recovers as many complete
  //      products as Claude managed to emit before truncation.
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
        let end = body.lastIndexOf('},');
        if (end > startIdx) {
          const repaired = body.slice(0, end + 1) + ']}';
          try { parsed = JSON.parse(repaired); }
          catch {}
        }
      }
    }
  }
  if (!parsed) {
    return NextResponse.json({
      ok: false,
      error: `Claude returned unparseable JSON (likely truncated). First 400 chars: ${rawText.slice(0, 400)}`,
    }, { status: 502 });
  }

  const rawProducts = Array.isArray(parsed.products) ? parsed.products : [];
  const products: ExtractedProduct[] = rawProducts.slice(0, MAX_ROWS).map((p) => {
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
    return {
      raw_line:           raw,
      name,
      unit_of_measure:    unit,
      pack_size:          pack,
      cost_per_unit:      cost,
      suggested_category: cat,
      suggested_sku:      `${sup.code}-${slugifyForSku(name)}`.slice(0, 64),
      notes:              note,
    };
  }).filter(p => p.name); // drop rows without a name

  return NextResponse.json({
    ok:       true,
    supplier: { id: sup.id, code: sup.code, name: sup.name },
    products,
    // Diagnostic snapshot so the UI can show WHY products is empty when
    // it is — image-only PDF (low input_tokens), Claude refused to JSON
    // (claude_preview shows prose), valid JSON but empty array, etc.
    diagnostic: products.length === 0 ? {
      raw_products_count: rawProducts.length,
      claude_preview:     rawText.slice(0, 800),
      pdf_bytes:          arrayBuf.byteLength,
    } : null,
    token_usage: {
      input:  data.usage?.input_tokens  ?? 0,
      output: data.usage?.output_tokens ?? 0,
    },
  });
}
