// =====================================================================
// /api/webhooks/whatsapp-inbound  (G8 — inbound WhatsApp via Twilio)
//
// Twilio POSTs inbound WhatsApp messages here (form-encoded). We validate
// the X-Twilio-Signature (when TWILIO_AUTH_TOKEN is set), store the message
// for the cashier WhatsApp monitor, and reply with empty TwiML.
//
// Setup (founder/Twilio): in the Twilio console, set the WhatsApp number's
// "A message comes in" webhook to POST https://www.bscbahamas.com/api/webhooks/whatsapp-inbound
//
// Public route (Twilio can't send a JWT). Signature is the auth.
// =====================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const xml = (body: string, status = 200) => new NextResponse(body, { status, headers: { 'Content-Type': 'text/xml' } });

function publicUrl(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
  return `${proto}://${host}${req.nextUrl.pathname}`;
}

// Twilio request validation: base64(HMAC-SHA1(authToken, url + sortedKV)).
function validTwilio(authToken: string, signature: string, url: string, params: Record<string, string>): boolean {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  try { return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature)); } catch { return false; }
}

export async function POST(req: NextRequest) {
  let params: Record<string, string> = {};
  try {
    const form = await req.formData();
    for (const [k, v] of form.entries()) params[k] = typeof v === 'string' ? v : '';
  } catch { return xml(EMPTY_TWIML); }

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers.get('x-twilio-signature') || '';
  let verified = false;
  if (authToken && signature) {
    verified = validTwilio(authToken, signature, publicUrl(req), params);
    if (!verified) return xml(EMPTY_TWIML, 403); // signed but invalid → reject
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !svc) return xml(EMPTY_TWIML); // ack so Twilio doesn't retry-storm

  const admin = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });
  const fromNumber = (params.From || '').replace(/^whatsapp:/i, '');
  const numMedia = parseInt(params.NumMedia || '0', 10) || 0;
  const mediaUrls = Array.from({ length: numMedia }, (_, i) => params[`MediaUrl${i}`]).filter(Boolean);

  await admin.from('whatsapp_messages').upsert({
    twilio_sid:   params.MessageSid || params.SmsMessageSid || null,
    from_number:  fromNumber || null,
    from_name:    params.ProfileName || null,
    body:         params.Body || null,
    num_media:    numMedia,
    media_urls:   mediaUrls,
    verified,
    received_at:  new Date().toISOString(),
  }, { onConflict: 'twilio_sid' }).then(() => undefined, () => undefined);

  return xml(EMPTY_TWIML);
}
