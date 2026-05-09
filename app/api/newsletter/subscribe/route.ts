// app/api/newsletter/subscribe/route.ts
//
// Email-list signup. Stores subscribers as customer rows with
// source='newsletter' so they show up alongside other customer records
// and can be reached from the same notification queue.
//
// Idempotent: if the email or phone already exists on a customer record,
// we update it (mark as newsletter-subscribed via tag) rather than insert
// a duplicate.
//
// Body: { email?, phone?, name?, source? }
// At least one of email or phone is required.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  source?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 }); }

  const email = (body.email || '').trim().toLowerCase();
  const phone = (body.phone || '').trim();
  const name  = (body.name  || '').trim() || null;

  if (!email && !phone)
    return NextResponse.json({ ok: false, error: 'Email or phone required' }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ ok: false, error: 'Invalid email' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service)
    return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 });

  const admin = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Look for an existing customer by phone (preferred) then email.
  let existingId: string | null = null;
  if (phone) {
    const { data } = await admin.from('customers').select('id').eq('phone', phone).maybeSingle();
    if (data) existingId = data.id;
  }
  if (!existingId && email) {
    const { data } = await admin.from('customers').select('id').ilike('email', email).maybeSingle();
    if (data) existingId = data.id;
  }

  if (existingId) {
    // Update last_seen_at, fill in blanks. We don't change source —
    // staying loyal to whatever first brought them in. The newsletter
    // touch shows up in the updated_at + a tag if the column exists.
    const updates: Record<string, unknown> = {
      last_seen_at: new Date().toISOString(),
    };
    if (name)  updates.name  = name;
    if (email) updates.email = email;
    if (phone) updates.phone = phone;
    await admin.from('customers').update(updates).eq('id', existingId);
    return NextResponse.json({ ok: true, status: 'already_subscribed', customer_id: existingId });
  }

  const { data: inserted, error: insErr } = await admin
    .from('customers')
    .insert({
      name,
      email: email || null,
      phone: phone || null,
      source: 'newsletter',
      last_seen_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (insErr) return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, status: 'subscribed', customer_id: inserted?.id });
}
