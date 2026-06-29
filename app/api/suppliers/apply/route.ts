// POST /api/suppliers/apply
//
// Public fisherman / farmer signup. Creates a PENDING suppliers row
// (supplier_type='bsc_direct', is_active=false) and emails the founder the
// full application via Resend so they can follow up + onboard. Once approved
// in admin, the supplier's products can be priced in the bulk_deals channel.
//
// Anonymous-friendly: no auth required (it's a public recruitment funnel),
// service-role for the insert (suppliers is admin-only via RLS).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ApplyBody {
  type?:           unknown;  // 'fisherman' | 'farmer'
  name?:           unknown;
  phone?:          unknown;
  email?:          unknown;
  island?:         unknown;
  business_name?:  unknown;  // vessel name OR farm name
  offering?:       unknown;  // what they catch / grow
  volume?:         unknown;  // typical weekly volume
  notes?:          unknown;
  vessel_registration_number?: unknown;  // boat registration number (G13)
  cert_url?:       unknown;               // uploaded boat registration cert photo URL (G13)
}

const NOTIFY_TO = process.env.SUPPLIER_APPLICATION_INBOX || 'admin@bscbahamas.com';

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  let body: ApplyBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const type = body.type === 'farmer' ? 'farmer' : body.type === 'fisherman' ? 'fisherman' : '';
  const name  = typeof body.name  === 'string' ? body.name.trim()  : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const island        = typeof body.island        === 'string' ? body.island.trim()        : '';
  const businessName  = typeof body.business_name === 'string' ? body.business_name.trim() : '';
  const offering      = typeof body.offering      === 'string' ? body.offering.trim()      : '';
  const volume        = typeof body.volume        === 'string' ? body.volume.trim()        : '';
  const notes         = typeof body.notes         === 'string' ? body.notes.trim()         : '';

  if (!type)  return NextResponse.json({ ok: false, error: 'Choose fisherman or farmer.' }, { status: 400 });
  if (!name)  return NextResponse.json({ ok: false, error: 'Name is required.' },           { status: 400 });
  if (!phone) return NextResponse.json({ ok: false, error: 'WhatsApp phone is required.' }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Generate a unique code so two applicants with the same name don't collide.
  const code = `${type.toUpperCase().slice(0,4)}_${slug(name) || 'applicant'}_${Date.now().toString(36).slice(-5)}`.toUpperCase();
  // Store the application details on the row so the founder approval queue
  // (G13) can show + onboard it — not just the founder's email.
  const certUrl = typeof body.cert_url === 'string' ? body.cert_url.trim() : '';
  const vesselReg = typeof body.vessel_registration_number === 'string' ? body.vessel_registration_number.trim() : '';
  const supplierRow: Record<string, unknown> = {
    code,
    name,
    supplier_type: 'bsc_direct',
    is_active:     false,           // pending review
    country:       'Bahamas',
    currency:      'BSD',
    emoji:         type === 'fisherman' ? '🎣' : '🌱',
    contact_phone: phone || null,
    contact_email: email || null,
    vessel_name:   type === 'fisherman' && businessName ? businessName : null,
    vessel_registration_number:  vesselReg || null,
    vessel_registration_doc_url: certUrl || null,
    notes:         [island && `Island: ${island}`, offering && `Sells: ${offering}`, volume && `Volume: ${volume}`, notes].filter(Boolean).join(' · ') || null,
  };

  let supplierId: string | null = null;
  const { data: inserted, error: insErr } = await admin
    .from('suppliers')
    .insert(supplierRow)
    .select('id')
    .maybeSingle();
  if (insErr) {
    // Don't fail the whole submission if the insert hits a column the schema
    // lacks — the founder still gets the email + can onboard manually.
    console.warn('[suppliers/apply] insert failed:', insErr.message);
  } else {
    supplierId = (inserted as { id: string } | null)?.id ?? null;
  }

  // Email the founder the full application so follow-up is one click away.
  const subject = `New ${type} signup — ${name}${island ? ` (${island})` : ''}`;
  const html = `
    <h2 style="margin:0 0 16px;font-family:system-ui">New ${type} supplier signup</h2>
    <table style="font-family:system-ui;font-size:14px;border-collapse:collapse">
      <tr><td style="padding:4px 12px 4px 0;color:#666">Name</td><td><strong>${escapeHtml(name)}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#666">WhatsApp</td><td><a href="https://wa.me/${encodeURIComponent(phone.replace(/[^+0-9]/g, ''))}">${escapeHtml(phone)}</a></td></tr>
      ${email   ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Email</td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>` : ''}
      ${island  ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Island</td><td>${escapeHtml(island)}</td></tr>` : ''}
      ${businessName ? `<tr><td style="padding:4px 12px 4px 0;color:#666">${type === 'fisherman' ? 'Vessel' : 'Farm'}</td><td>${escapeHtml(businessName)}</td></tr>` : ''}
      ${offering ? `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">What they sell</td><td>${escapeHtml(offering)}</td></tr>` : ''}
      ${volume   ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Typical volume</td><td>${escapeHtml(volume)}</td></tr>` : ''}
      ${notes    ? `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">Notes</td><td>${escapeHtml(notes)}</td></tr>` : ''}
      ${supplierId ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Supplier id</td><td style="font-family:monospace">${supplierId}</td></tr>` : ''}
    </table>
    <p style="margin-top:16px;font-family:system-ui;color:#444">
      Status: <strong>PENDING REVIEW</strong>. Approve in admin → suppliers, then list their products in the bulk_deals channel.
    </p>
  `;
  const emailRes = await sendEmail({ to: NOTIFY_TO, subject, html });
  if (emailRes.error) console.warn('[suppliers/apply] email failed:', emailRes.error);

  return NextResponse.json({ ok: true, supplier_id: supplierId });
}
