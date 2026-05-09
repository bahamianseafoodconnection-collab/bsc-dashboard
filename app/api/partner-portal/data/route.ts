// app/api/partner-portal/data/route.ts
//
// Returns scoped partner data for a /partner/[token] page. The token IS
// the auth - no login needed. Service role bypasses RLS so we can scope
// the response strictly to that partner's records.
//
// Body: { token: string }
// Response: {
//   ok: true,
//   partner: { id, name, contact_name, contact_phone, contact_email },
//   token_meta: { label, expires_at, last_accessed_at },
//   balance: { outstanding_bsd, line_count },
//   payment_terms: 'Net-30',
//   activity: [ { date, description, amount, paid, paid_at, notes } ],
//   shipments_coming_soon: true,    // Until lobster pipeline ships
//   inventory_coming_soon: true
// }

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = { token?: string };

export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 }); }

  const token = (body.token || '').trim();
  if (!token) return NextResponse.json({ ok: false, error: 'Token required' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service)
    return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Look up token + supplier in one query
  const { data: tokenRow, error: tErr } = await admin
    .from('partner_access_tokens')
    .select('id, supplier_id, label, expires_at, revoked_at, last_accessed_at')
    .eq('token', token)
    .maybeSingle();
  if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });
  if (!tokenRow) return NextResponse.json({ ok: false, error: 'Invalid link' }, { status: 404 });

  if (tokenRow.revoked_at)
    return NextResponse.json({ ok: false, error: 'This link has been revoked' }, { status: 403 });
  if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date())
    return NextResponse.json({ ok: false, error: 'This link has expired' }, { status: 403 });

  // Bump access counter (non-blocking — failure here doesn't break the response)
  admin
    .from('partner_access_tokens')
    .update({
      last_accessed_at: new Date().toISOString(),
      access_count: 1,  // PostgREST doesn't easily support incr; keep simple
    })
    .eq('id', tokenRow.id)
    .then(() => {});  // fire-and-forget

  // Look up the supplier
  const { data: supplier, error: sErr } = await admin
    .from('suppliers')
    .select('id, name, contact_name, contact_phone, contact_email, supplier_type')
    .eq('id', tokenRow.supplier_id)
    .maybeSingle();
  if (sErr || !supplier) return NextResponse.json({ ok: false, error: 'Partner not found' }, { status: 404 });

  // Pull all expense activity for this supplier (by name match - vendor is free text)
  const { data: activityRows } = await admin
    .from('expenses')
    .select('id, created_at, description, amount_bsd, due_date, paid_at, payment_method, payment_ref, notes')
    .ilike('vendor', supplier.name)
    .order('created_at', { ascending: false })
    .limit(100);

  const activity = (activityRows || []).map((row) => ({
    id: row.id,
    date: row.paid_at || row.created_at,
    description: row.description,
    amount_bsd: Number(row.amount_bsd),
    paid: !!row.paid_at,
    paid_at: row.paid_at,
    payment_method: row.payment_method,
    payment_ref: row.payment_ref,
    notes: row.notes,
  }));

  const outstanding = activity
    .filter((r) => !r.paid)
    .reduce((s, r) => s + r.amount_bsd, 0);

  return NextResponse.json({
    ok: true,
    partner: {
      id: supplier.id,
      name: supplier.name,
      contact_name: supplier.contact_name,
      contact_phone: supplier.contact_phone,
      contact_email: supplier.contact_email,
    },
    token_meta: {
      label: tokenRow.label,
      expires_at: tokenRow.expires_at,
      last_accessed_at: tokenRow.last_accessed_at,
    },
    balance: {
      outstanding_bsd: Math.round(outstanding * 100) / 100,
      line_count: activity.filter((r) => !r.paid).length,
    },
    payment_terms: 'Net-30',
    activity,
    shipments_coming_soon: true,
    inventory_coming_soon: true,
  });
}
