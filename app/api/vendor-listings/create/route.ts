// POST /api/vendor-listings/create
//
// Vendor creates a new listing. Status is forced to 'pending_approval'.
// Server-side checks the caller actually owns the vendor record (so
// vendor A can't post against vendor B). Fires multi-channel admin
// notification on success.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyMultiChannel, vendorAdminRecipients } from '@/lib/notifications/multi-channel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  vendor_id:           string;
  title:               string;
  description?:        string;
  product_type?:       string;
  quantity_available:  number;
  unit?:               string;
  price_per_unit:      number;
  harvest_status?:     'ready_to_harvest' | 'harvested' | 'landing_soon';
  harvest_or_catch_time?: string;
  available_until?:    string;
  photos?:             string[];
  videos?:             string[];
  dropoff_expected_at?: string;
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaKey) return NextResponse.json({ ok: false, error: 'server not configured' }, { status: 500 });
  const admin = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const tokenHeader = req.headers.get('authorization') || '';
  const token = tokenHeader.startsWith('Bearer ') ? tokenHeader.slice(7) : null;
  if (!token) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  if (!body.vendor_id || !body.title?.trim() || !body.quantity_available || !body.price_per_unit) {
    return NextResponse.json({ ok: false, error: 'vendor_id, title, quantity_available, price_per_unit required' }, { status: 400 });
  }

  // Confirm ownership: this user owns the vendor record. (Admins
  // bypass via service-role insert path; not exposed here.)
  const { data: v } = await admin.from('vendors').select('id, user_id, business_name, approval_status').eq('id', body.vendor_id).maybeSingle();
  if (!v)                                       return NextResponse.json({ ok: false, error: 'vendor not found' }, { status: 404 });
  if (v.user_id !== user.id)                    return NextResponse.json({ ok: false, error: 'not your vendor record' }, { status: 403 });
  if (v.approval_status !== 'approved')         return NextResponse.json({ ok: false, error: 'vendor not yet approved' }, { status: 403 });

  const { data: listing, error: lErr } = await admin.from('vendor_listings').insert({
    vendor_id:             body.vendor_id,
    title:                 body.title.trim(),
    description:           body.description?.trim() || null,
    product_type:          body.product_type?.trim() || null,
    quantity_available:    Number(body.quantity_available),
    unit:                  body.unit?.trim() || 'lb',
    price_per_unit:        Number(body.price_per_unit),
    status:                'pending_approval',
    harvest_status:        body.harvest_status ?? null,
    harvest_or_catch_time: body.harvest_or_catch_time ?? null,
    available_until:       body.available_until ?? null,
    photos:                Array.isArray(body.photos) ? body.photos : [],
    videos:                Array.isArray(body.videos) ? body.videos : [],
    dropoff_expected_at:   body.dropoff_expected_at ?? null,
  }).select('id').single();
  if (lErr) return NextResponse.json({ ok: false, error: lErr.message }, { status: 500 });

  // Bump vendor.total_listings counter (best-effort, swallow errors).
  try {
    await admin.from('vendors')
      .update({ total_listings: ((v as { total_listings?: number }).total_listings ?? 0) + 1 })
      .eq('id', body.vendor_id);
  } catch { /* best-effort */ }

  // Multi-channel admin notification (fire-and-forget).
  const { emails, phones } = vendorAdminRecipients();
  notifyMultiChannel({
    channels:    ['email','sms','dashboard'],
    emails,
    phones,
    title:       `New listing pending: ${body.title}`,
    body:        `${v.business_name}: ${body.quantity_available} ${body.unit ?? 'lb'} @ BSD $${Number(body.price_per_unit).toFixed(2)}. Approve at bscbahamas.com/dashboard/listings/pending`,
    url:         'https://bscbahamas.com/dashboard/listings/pending',
    urgent:      false,
    relatedId:   listing?.id ?? null,
    relatedType: 'vendor_listing',
  }).catch((err) => console.warn('multi-channel notify failed:', err));

  return NextResponse.json({ ok: true, listing_id: listing?.id ?? null });
}
