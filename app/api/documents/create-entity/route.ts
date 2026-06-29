// /api/documents/create-entity
//
// Universal Document Capture — Phase 2 (match → create records).
// Given a captured document's extracted fields + a target entity, MATCHES an
// existing record (by name / phone) or CREATES a new one, then links the
// captured document to it (mirroring: original ↔ system record).
//
// Targets: 'customer', 'supplier', 'fisherman' (a supplier with vessel fields).
// Guardrails: new suppliers default to supplier_type='bsc_direct' (never an
// auto-classification that could mislabel a partner/competitor — flagged in
// notes for founder review). Complex records (products / receiving / PO /
// export) route to their existing validated forms instead of direct insert.
//
// Body: { document_id?, target, fields }
// Resp: { ok, matched, created, record_type, record_id, name }

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Creating master records (suppliers/customers) is an admin action.
const ADMIN = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin', 'manager']);
// Operational capture (a photographed invoice → PO, a receipt → pending
// expense) is part of the cashier/POS receiving lane.
const OPS = new Set([...ADMIN, 'cashier', 'andros_staff']);
const MASTER_TARGETS = ['customer', 'supplier', 'fisherman'];
const OPS_TARGETS = ['purchase', 'expense'];
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function firstOf(f: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) { const v = str(f[k]); if (v) return v; }
  return null;
}

async function uniqueSupplierCode(admin: SupabaseClient, name: string): Promise<string> {
  const base = (name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'SUP');
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base.slice(0, 6)}${i}`;
    const { data } = await admin.from('suppliers').select('id').eq('code', candidate).limit(1);
    if (!data || data.length === 0) return candidate;
  }
  return `${base.slice(0, 5)}${Date.now().toString().slice(-3)}`;
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  const userClient = createClient(supaUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;

  let b: { document_id?: unknown; target?: unknown; fields?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }
  const docId = str(b.document_id);
  const target = ([...MASTER_TARGETS, ...OPS_TARGETS].includes(b.target as string)) ? b.target as string : '';
  const f = (b.fields && typeof b.fields === 'object') ? b.fields as Record<string, unknown> : {};
  if (!target) return NextResponse.json({ ok: false, error: 'target must be customer, supplier, fisherman, purchase, or expense' }, { status: 400 });
  // Master records (customer/supplier/fisherman) = admin only. Operational
  // capture (purchase invoice, expense) = ops staff incl cashiers.
  const allowed = MASTER_TARGETS.includes(target) ? ADMIN : OPS;
  if (!role || !allowed.has(role)) return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot create a ${target} from documents.` }, { status: 403 });
  const money = (v: unknown) => { const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : 0; };

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let recordType = '', recordId: string | null = null, name = '', matched = false, created = false;

  try {
    if (target === 'customer') {
      recordType = 'customer';
      name = firstOf(f, ['customer', 'customer_name', 'full_name', 'name']) ?? '';
      const phone = firstOf(f, ['customer_phone', 'phone']);
      if (!name && !phone) return NextResponse.json({ ok: false, error: 'No customer name/phone in the document' }, { status: 422 });
      // Match by phone first, then name.
      let q = admin.from('customers').select('id, full_name').limit(1);
      q = phone ? q.eq('phone', phone) : q.ilike('full_name', name);
      const { data: existing } = await q;
      if (existing && existing.length > 0) { recordId = (existing[0] as { id: string }).id; matched = true; name = (existing[0] as { full_name: string }).full_name ?? name; }
      else {
        const { data: ins, error } = await admin.from('customers').insert({ full_name: name || null, phone, origin_channel: 'document', created_by: user.id, notes: 'Auto-created from captured document' }).select('id').single();
        if (error) throw new Error(error.message);
        recordId = (ins as { id: string }).id; created = true;
      }
    } else if (target === 'supplier' || target === 'fisherman') {
      // supplier / fisherman → suppliers table
      recordType = 'supplier';
      const isFisherman = target === 'fisherman';
      name = firstOf(f, isFisherman ? ['fisherman_name', 'vessel_owner_name', 'company_name', 'supplier_name'] : ['supplier_name', 'company_name', 'name']) ?? '';
      if (!name) return NextResponse.json({ ok: false, error: 'No supplier/fisherman name in the document' }, { status: 422 });
      const { data: existing } = await admin.from('suppliers').select('id, name').ilike('name', name).limit(1);
      if (existing && existing.length > 0) { recordId = (existing[0] as { id: string }).id; matched = true; name = (existing[0] as { name: string }).name ?? name; }
      else {
        const code = await uniqueSupplierCode(admin, name);
        const row: Record<string, unknown> = {
          code, name, supplier_type: 'bsc_direct', country: 'The Bahamas', default_currency: 'BSD',
          contact_phone: firstOf(f, ['phone', 'supplier_phone', 'fisherman_phone', 'contact_phone']),
          contact_name: firstOf(f, ['contact_name', 'fisherman_name']),
          notes: 'Auto-created from captured document — review classification.',
          created_by: user.id,
        };
        if (isFisherman) {
          row.vessel_name = firstOf(f, ['vessel_name']);
          row.vessel_registration_number = firstOf(f, ['vessel_registration', 'vessel_number', 'vessel_registration_number']);
          row.vessel_captain_name = firstOf(f, ['captain', 'fisherman_name']);
        }
        const { data: ins, error } = await admin.from('suppliers').insert(row).select('id').single();
        if (error) throw new Error(error.message);
        recordId = (ins as { id: string }).id; created = true;
      }
    }

    if (target === 'purchase') {
      // Invoice / PO → a purchase_invoices record (what BSC owes). Supplier is
      // captured separately via the "+ Supplier" action; named here in summary.
      recordType = 'purchase_invoice';
      const supplierName = firstOf(f, ['supplier_name', 'company_name']) ?? 'Unknown supplier';
      const invoiceRef = firstOf(f, ['invoice_number', 'po_number']) ?? `CAP-${Date.now().toString(36).toUpperCase()}`;
      const total = money(f.total ?? f.subtotal);
      const items = Array.isArray(f.line_items) ? f.line_items : [];
      const { data: ins, error } = await admin.from('purchase_invoices').insert({
        invoice_ref: invoiceRef, total_amount: total, balance_owed: total, status: 'unpaid',
        items, summary: `Invoice from ${supplierName} (auto-captured from document)`,
      }).select('id').single();
      if (error) throw new Error(error.message);
      recordId = (ins as { id: string }).id; created = true; name = `${invoiceRef} · ${supplierName} · $${total.toFixed(2)}`;
    }

    if (target === 'expense') {
      // Receipt photo → a PENDING expense for founder approval. The captured
      // document's file_url is attached as the receipt image.
      recordType = 'expense';
      const vendor = firstOf(f, ['vendor', 'merchant', 'supplier_name', 'company_name', 'payee', 'store']) ?? 'Unknown vendor';
      const amount = money(f.total ?? f.amount ?? f.grand_total ?? f.amount_paid ?? f.subtotal);
      const category = firstOf(f, ['category', 'expense_category', 'type']) ?? 'general';
      const desc = firstOf(f, ['description', 'summary', 'memo']) ?? `${vendor} receipt`;
      let imageUrl: string | null = null;
      if (docId) {
        const { data: doc } = await admin.from('captured_documents').select('file_url').eq('id', docId).maybeSingle();
        imageUrl = (doc as { file_url?: string } | null)?.file_url ?? null;
      }
      const { data: ins, error } = await admin.from('expenses').insert({
        vendor, amount, amount_bsd: amount, category, description: desc,
        image_url: imageUrl, status: 'pending_approval', created_by: user.id,
        notes: 'Captured from receipt photo — pending founder approval',
      }).select('id').single();
      if (error) throw new Error(error.message);
      recordId = (ins as { id: string }).id; created = true; name = `${vendor} · $${amount.toFixed(2)}`;
    }

    // Link the captured document to the record (mirroring).
    if (docId && recordId) {
      await admin.from('captured_documents').update({ status: 'linked', linked_record_type: recordType, linked_record_id: recordId }).eq('id', docId);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'create failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  try {
    await admin.from('ai_writes').insert({ tool: 'documents_create_entity', caller_id: user.id, input: { target, document_id: docId }, result: { record_type: recordType, record_id: recordId, matched, created, role }, status: 'success', error: null });
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, matched, created, record_type: recordType, record_id: recordId, name });
}
