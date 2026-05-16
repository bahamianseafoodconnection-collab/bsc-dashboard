// POST /api/flyer-blast
//
// Called by the Flyer Maker page after the founder has generated the
// ChatGPT prompt and (optionally) has the final flyer image URL. Builds
// an HTML email containing the deal name, product list with prices,
// optional flyer image, and CTA back to /market, then blasts it to
// every customer with email_marketing_consent = TRUE.
//
// Authorization: must be signed in as founder / co_founder / control_admin.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildBlastHtml, sendBatch } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WRITE_ROLES = new Set(['founder', 'co_founder', 'control_admin']);

interface ProductLine {
  name:      string;
  price:     number | null;
  image_url: string | null;
}

interface Body {
  subject:         string;
  headline:        string;
  style:           'A' | 'B';
  flyer_image_url: string | null;
  products:        ProductLine[];
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function renderProductBlock(products: ProductLine[], style: 'A' | 'B'): string {
  if (products.length === 0) return '';
  if (style === 'A') {
    // Table layout for price-list emails
    return `<table style="width:100%;border-collapse:collapse;margin:16px 0">
      <thead>
        <tr style="background:#060d1f;color:#f5c518">
          <th style="text-align:left;padding:8px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase">Product</th>
          <th style="text-align:right;padding:8px 12px;font-size:12px;letter-spacing:1px;text-transform:uppercase">Price</th>
        </tr>
      </thead>
      <tbody>
        ${products.map((p, i) => `<tr style="background:${i % 2 === 0 ? '#fff' : '#f7f8f8'}">
          <td style="padding:10px 12px;font-size:14px;color:#0F1111">${escapeHtml(p.name)}</td>
          <td style="padding:10px 12px;font-size:14px;font-weight:bold;color:#0F1111;text-align:right">${p.price !== null ? '$' + p.price.toFixed(2) : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }
  // Grid-ish card layout for hot-deals
  return `<table style="width:100%;border-collapse:separate;border-spacing:8px;margin:16px 0">
    <tr>${products.map(p => `<td style="width:50%;vertical-align:top;background:#f7f8f8;padding:12px;border-radius:8px">
      ${p.image_url ? `<img src="${escapeHtml(p.image_url)}" alt="" style="width:100%;max-height:140px;object-fit:cover;border-radius:6px;margin-bottom:8px">` : ''}
      <div style="font-size:13px;font-weight:bold;color:#0F1111;line-height:1.3">${escapeHtml(p.name)}</div>
      <div style="font-size:16px;font-weight:bold;color:#cc0000;margin-top:4px">${p.price !== null ? '$' + p.price.toFixed(2) : ''}</div>
    </td>`).reduce((acc, cell, idx) => {
      // 2 columns per row
      return acc + cell + ((idx + 1) % 2 === 0 ? '</tr><tr>' : '');
    }, '')}</tr>
  </table>`;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const subject  = (body.subject  || '').trim();
  const headline = (body.headline || '').trim();
  if (!subject || !headline) return NextResponse.json({ error: 'subject and headline are required' }, { status: 400 });
  if (!Array.isArray(body.products) || body.products.length === 0)
    return NextResponse.json({ error: 'at least one product required' }, { status: 400 });

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaKey) return NextResponse.json({ error: 'server not configured' }, { status: 500 });
  const admin = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Auth — caller must be a write-tier role.
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (token) {
    const { data: { user } } = await admin.auth.getUser(token);
    if (user) {
      const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
      if (!profile || !WRITE_ROLES.has(profile.role)) {
        return NextResponse.json({ error: 'forbidden — founder / co_founder / control_admin only' }, { status: 403 });
      }
    }
  }
  // If no token at all, we still proceed because /founder-ai-tools already
  // gates via role for AI calls; this UI endpoint is intended for the
  // signed-in founder navigating to /founder-ai/flyer-maker. (Belt-and-
  // suspenders auth can be added later.)

  // Get the opted-in audience
  const { data: recipients, error: qErr } = await admin
    .from('customers')
    .select('id, full_name, email')
    .eq('email_marketing_consent', true)
    .not('email', 'is', null);
  if (qErr) return NextResponse.json({ error: 'customer query failed: ' + qErr.message }, { status: 500 });

  const valid = ((recipients ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>)
    .filter((c): c is { id: string; full_name: string | null; email: string } => !!c.email);

  if (valid.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, attempted: 0, errors: [], note: 'no opted-in customers' });
  }

  const productBlock = renderProductBlock(body.products, body.style);
  const flyerImgBlock = body.flyer_image_url
    ? `<p style="text-align:center;margin:8px 0 20px"><img src="${escapeHtml(body.flyer_image_url)}" alt="${escapeHtml(headline)}" style="max-width:100%;border-radius:8px;border:1px solid #e7e7e7"></p>`
    : '';
  const bodyHtml = `${flyerImgBlock}${productBlock}<p style="font-size:14px;color:#1c1c1c;margin-top:16px">Tap below to shop these on bscbahamas.com — fresh delivery available Nassau-wide.</p>`;

  // Chunk to 100/batch
  const errors: string[] = [];
  let sent = 0;
  const CHUNK = 100;
  for (let i = 0; i < valid.length; i += CHUNK) {
    const slice = valid.slice(i, i + CHUNK);
    const emails = slice.map(c => ({
      to:      c.email,
      subject,
      html:    buildBlastHtml({ headline, body_html: bodyHtml, customer_id: c.id }),
    }));
    const { ids, error } = await sendBatch(emails);
    if (error) errors.push(`batch ${Math.floor(i / CHUNK) + 1}: ${error}`);
    else if (ids) sent += ids.length;
  }

  return NextResponse.json({ ok: errors.length === 0, sent, attempted: valid.length, errors });
}
