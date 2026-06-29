// =====================================================================
// /api/founder/customer-approvals  (G7 — customer intake approval)
//
// Founder review of inbound customer signups / WhatsApp intakes
// (early_access_signups). Approve → convert to a real customer (deduped
// by phone E.164 then email) and mark the signup handled; Dismiss → just
// mark handled. early_access_signups has no status — `notified_at` is the
// handled marker.
//
//   GET  → { ok, signups: [...] }   (un-handled, + existing_customer flag)
//   POST { action:'approve'|'dismiss', id, name? }
//
// Founder / co_founder / control_admin / manager. Service-role.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { toE164 } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APPROVERS = new Set(['founder', 'co_founder', 'control_admin', 'manager']);

async function gate(req: NextRequest): Promise<{ admin: SupabaseClient; userId: string } | { error: string; status: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const authHeader = req.headers.get('authorization') ?? '';
  if (!url || !anon || !svc) return { error: 'Server not configured', status: 500 };
  if (!authHeader.startsWith('Bearer ')) return { error: 'Sign in required', status: 401 };
  const uc = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: { user } } = await uc.auth.getUser();
  if (!user) return { error: 'Sign in required', status: 401 };
  const { data: prof } = await uc.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !APPROVERS.has(role)) return { error: 'Founder / manager only', status: 403 };
  return { admin: createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } }), userId: user.id };
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });

  const { data } = await g.admin.from('early_access_signups')
    .select('id, channel, email, phone, intent_meta, created_at')
    .is('notified_at', null).order('created_at', { ascending: false }).limit(100);
  const signups = (data ?? []) as Array<{ id: string; channel: string | null; email: string | null; phone: string | null; intent_meta: Record<string, unknown> | null; created_at: string }>;

  // Flag signups whose email/phone already map to a customer.
  const emails = [...new Set(signups.map((s) => (s.email || '').toLowerCase()).filter(Boolean))];
  const phones = [...new Set(signups.map((s) => toE164(s.phone || '')).filter(Boolean) as string[])];
  const known = new Set<string>();
  if (emails.length) { const { data: ce } = await g.admin.from('customers').select('email').in('email', emails); (ce ?? []).forEach((r) => { const e = (r as { email?: string }).email; if (e) known.add(`e:${e.toLowerCase()}`); }); }
  if (phones.length) { const { data: cp } = await g.admin.from('customers').select('phone_e164').in('phone_e164', phones); (cp ?? []).forEach((r) => { const p = (r as { phone_e164?: string }).phone_e164; if (p) known.add(`p:${p}`); }); }

  const rows = signups.map((s) => ({
    ...s,
    existing_customer: (s.email && known.has(`e:${s.email.toLowerCase()}`)) || (toE164(s.phone || '') && known.has(`p:${toE164(s.phone || '')}`)) || false,
  }));
  return NextResponse.json({ ok: true, signups: rows });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ('error' in g) return NextResponse.json({ ok: false, error: g.error }, { status: g.status });
  const { admin, userId } = g;

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { /* ignore */ }
  const action = String(body.action || '');
  const id = typeof body.id === 'string' ? body.id : null;
  const nameIn = typeof body.name === 'string' ? body.name.trim() : '';
  if (!id || !['approve', 'dismiss'].includes(action)) return NextResponse.json({ ok: false, error: 'id + valid action required' }, { status: 400 });

  const { data: sg } = await admin.from('early_access_signups').select('id, channel, email, phone, intent_meta, notified_at').eq('id', id).maybeSingle();
  if (!sg) return NextResponse.json({ ok: false, error: 'Signup not found' }, { status: 404 });
  const s = sg as { channel: string | null; email: string | null; phone: string | null; intent_meta: Record<string, unknown> | null; notified_at: string | null };
  if (s.notified_at) return NextResponse.json({ ok: true, already: true });

  let customerId: string | null = null;
  let outcome: 'created' | 'matched' | 'dismissed' = 'dismissed';

  if (action === 'approve') {
    const email = (s.email || '').trim().toLowerCase();
    const phoneE164 = toE164(s.phone || '');
    const name = nameIn || (typeof s.intent_meta?.name === 'string' ? s.intent_meta.name as string : '') || null;

    // Dedupe: phone first, then email.
    let existing: { id: string } | null = null;
    if (phoneE164) { const { data } = await admin.from('customers').select('id').eq('phone_e164', phoneE164).maybeSingle(); existing = data as { id: string } | null; }
    if (!existing && email) { const { data } = await admin.from('customers').select('id').eq('email', email).maybeSingle(); existing = data as { id: string } | null; }

    if (existing) { customerId = existing.id; outcome = 'matched'; }
    else {
      const { data: ins, error } = await admin.from('customers').insert({
        full_name: name, email: email || null, phone: s.phone || null, phone_e164: phoneE164 || null,
        origin_channel: s.channel ? `signup_${s.channel}` : 'signup',
        notes: 'Approved from customer intake queue',
      }).select('id').single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      customerId = (ins as { id: string }).id; outcome = 'created';
    }
  }

  await admin.from('early_access_signups').update({ notified_at: new Date().toISOString(), notified_by: userId }).eq('id', id);
  return NextResponse.json({ ok: true, outcome, customer_id: customerId });
}
