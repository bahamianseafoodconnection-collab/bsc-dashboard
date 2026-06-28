// /api/supplier/invoice-auto-add
//
// From a recorded supplier invoice, find line-item products NOT already in the
// catalog and create them under the chosen supplier — landing in the REVIEW
// queue (status='pending_approval' + needs_review=true), priced from the invoice
// cost. Reuses /api/supplier/bulk-add-products for creation (no duplicate logic,
// no auto-publish).
//
// Supplier is EXPLICIT (the invoice pipeline doesn't capture it). Matching is by
// normalized name (invoice lines rarely carry a SKU) + SKU when present, against
// ALL active products (avoids cross-supplier duplicates).
//
// Body: { invoice_id, supplier_id, dry_run? }
//   dry_run=true → returns { matched, unmatched } and writes nothing.
//   else        → creates the unmatched via bulk-add, returns { added, ... }.
// Auth: founder/co_founder/control_admin/basic_admin/manager.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_ROLES = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin', 'manager']);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function parseCost(price: unknown): number {
  const n = parseFloat(String(price ?? '').replace(/[^0-9.]/g, '') || '0');
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function parseUnit(qty: unknown): string {
  const s = String(qty ?? '').toLowerCase();
  if (/\blbs?\b|pound/.test(s)) return 'lb';
  if (/\boz\b|ounce/.test(s)) return 'oz';
  if (/\bkg\b|kilo/.test(s)) return 'kg';
  if (/\bcase\b/.test(s)) return 'case';
  if (/\bbag\b/.test(s)) return 'bag';
  return 'each';
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ADMIN_ROLES.has(role)) return NextResponse.json({ ok: false, error: 'Admin role required.' }, { status: 403 });

  let b: { invoice_id?: unknown; supplier_id?: unknown; dry_run?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const invoiceId = typeof b.invoice_id === 'string' ? b.invoice_id : '';
  const supplierId = typeof b.supplier_id === 'string' ? b.supplier_id : '';
  const dryRun = b.dry_run === true;
  if (!invoiceId || !supplierId) return NextResponse.json({ ok: false, error: 'invoice_id + supplier_id required' }, { status: 400 });

  const admin: SupabaseClient = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: inv } = await admin.from('purchase_invoices').select('id, items').eq('id', invoiceId).maybeSingle();
  if (!inv) return NextResponse.json({ ok: false, error: 'Invoice not found' }, { status: 404 });
  const { data: sup } = await admin.from('suppliers').select('id, name').eq('id', supplierId).maybeSingle();
  if (!sup) return NextResponse.json({ ok: false, error: 'Supplier not found' }, { status: 404 });

  const items = Array.isArray((inv as { items?: unknown }).items) ? ((inv as { items: Record<string, unknown>[] }).items) : [];

  // Existing catalog: normalized names + skus (active products).
  const { data: prods } = await admin.from('products').select('name, sku').eq('status', 'active');
  const existNames = new Set<string>();
  const existSkus = new Set<string>();
  for (const p of (prods ?? []) as { name: string | null; sku: string | null }[]) {
    if (p.name) existNames.add(norm(p.name));
    if (p.sku) existSkus.add(p.sku.toLowerCase());
  }

  const matched: string[] = [];
  const unmatched: Array<{ name: string; cost_per_unit: number; unit_of_measure: string; sku: string }> = [];
  const seen = new Set<string>();
  for (const it of items) {
    const name = String(it.item ?? it.name ?? '').trim();
    if (!name) continue;
    const key = norm(name);
    if (seen.has(key)) continue;             // de-dupe within the invoice
    seen.add(key);
    const sku = String(it.sku ?? '').trim();
    if (existNames.has(key) || (sku && existSkus.has(sku.toLowerCase()))) { matched.push(name); continue; }
    unmatched.push({
      name,
      cost_per_unit: parseCost(it.price),
      unit_of_measure: parseUnit(it.qty),
      sku: sku || `INV-${key.replace(/\s+/g, '-')}`.slice(0, 40).toUpperCase(),
    });
  }

  if (dryRun) {
    return NextResponse.json({ ok: true, dry_run: true, supplier: sup.name, total_items: items.length, matched_count: matched.length, matched, unmatched });
  }
  if (unmatched.length === 0) {
    return NextResponse.json({ ok: true, added: 0, matched_count: matched.length, note: 'Every invoice line already exists in the catalog.' });
  }

  // Create via the proven bulk-add path → pending_approval + needs_review.
  const rows = unmatched.map((u) => ({
    sku: u.sku, name: u.name, category: 'other',
    unit_of_measure: u.unit_of_measure,
    cost_per_unit: u.cost_per_unit,
    channels: { nassau: true, andros: false, online: true, wholesale: false },
  }));
  const origin = new URL(req.url).origin;
  const r = await fetch(`${origin}/api/supplier/bulk-add-products`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify({ supplier_id: supplierId, rows }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) return NextResponse.json({ ok: false, error: `Catalog add failed: ${j.error ?? `HTTP ${r.status}`}` }, { status: 500 });

  try {
    await admin.from('ai_writes').insert({ tool: 'invoice_auto_add', caller_id: user.id, input: { invoice_id: invoiceId, supplier_id: supplierId, unmatched: unmatched.length }, result: { inserted: j.inserted ?? null }, status: 'success', error: null });
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, added: j.inserted ?? unmatched.length, matched_count: matched.length, supplier: sup.name, bulk_result: { inserted: j.inserted, failed: j.failed } });
}
