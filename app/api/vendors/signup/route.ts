// POST /api/vendors/signup
//
// Public vendor signup endpoint. Anyone (authenticated or not) can apply.
// Writes vendors row with approval_status='pending', then fans out a
// multi-channel notification to BSC admins.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyMultiChannel, vendorAdminRecipients } from '@/lib/notifications/multi-channel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  business_name:        string;
  vendor_type:          'fisherman' | 'farmer' | 'other';
  contact_name?:        string;
  phone?:               string;
  email?:               string;
  government_id_number?: string;
  license_number?:      string;
  location?:            string;
  bank_account_name?:   string;
  bank_account_number?: string;
  routing_info?:        string;
  documents?:           Array<{ document_type: 'photo' | 'video' | 'id' | 'license'; file_url: string; description?: string }>;
  user_id?:             string | null;
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaKey) return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 500 });
  const admin = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } });

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  if (!body.business_name?.trim() || !body.vendor_type) {
    return NextResponse.json({ ok: false, error: 'business_name + vendor_type required' }, { status: 400 });
  }

  // Pull signed-in user id (if any) so we link the vendor to their auth account.
  let userId: string | null = body.user_id ?? null;
  const tokenHeader = req.headers.get('authorization') || '';
  const token = tokenHeader.startsWith('Bearer ') ? tokenHeader.slice(7) : null;
  if (token && !userId) {
    try {
      const { data: { user } } = await admin.auth.getUser(token);
      userId = user?.id ?? null;
    } catch { /* anonymous signup is fine */ }
  }

  const { data: vendor, error: vErr } = await admin.from('vendors').insert({
    user_id:              userId,
    business_name:        body.business_name.trim(),
    vendor_type:          body.vendor_type,
    contact_name:         body.contact_name?.trim() || null,
    phone:                body.phone?.trim() || null,
    email:                body.email?.trim().toLowerCase() || null,
    government_id_number: body.government_id_number?.trim() || null,
    license_number:       body.license_number?.trim() || null,
    location:             body.location?.trim() || null,
    bank_account_name:    body.bank_account_name?.trim() || null,
    bank_account_number:  body.bank_account_number?.trim() || null,
    routing_info:         body.routing_info?.trim() || null,
    approval_status:      'pending',
  }).select('id').single();
  if (vErr) return NextResponse.json({ ok: false, error: vErr.message }, { status: 500 });

  // Insert any documents that were uploaded client-side.
  if (Array.isArray(body.documents) && body.documents.length > 0 && vendor) {
    const rows = body.documents
      .filter((d) => d.file_url && d.document_type)
      .map((d) => ({
        vendor_id:     vendor.id,
        document_type: d.document_type,
        file_url:      d.file_url,
        description:   d.description ?? null,
      }));
    if (rows.length > 0) {
      const { error: dErr } = await admin.from('vendor_documents').insert(rows);
      if (dErr) console.error('vendor_documents insert failed:', dErr.message);
    }
  }

  // Multi-channel admin notification (fire-and-forget).
  const { emails, phones } = vendorAdminRecipients();
  notifyMultiChannel({
    channels:    ['email','sms','dashboard'],
    emails,
    phones,
    title:       'New vendor signup: ' + body.business_name,
    body:        `${body.vendor_type === 'fisherman' ? '🎣' : body.vendor_type === 'farmer' ? '🌱' : '📦'} ${body.contact_name ?? ''} (${body.phone ?? '—'}) wants to join BSC. Review at bscbahamas.com/dashboard/vendors/pending`,
    url:         'https://bscbahamas.com/dashboard/vendors/pending',
    urgent:      false,
    relatedId:   vendor?.id ?? null,
    relatedType: 'vendor_signup',
  }).catch((err) => console.warn('multi-channel notify failed:', err));

  return NextResponse.json({ ok: true, vendor_id: vendor?.id ?? null });
}
