// One-click unsubscribe endpoint linked from the footer of every blast.
// Validates the HMAC token, flips customers.email_marketing_consent=FALSE,
// records the timestamp + source, then renders a tiny confirmation page.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyUnsubscribeToken } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HTML_DONE = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f2ee;font-family:Georgia,serif;color:#0F1111">
<div style="max-width:480px;margin:80px auto;padding:32px;background:#fff;border:1px solid #e7e7e7;border-radius:12px;text-align:center">
  <h2 style="margin:0 0 12px 0;color:#0F1111">You're unsubscribed.</h2>
  <p style="color:#565959;line-height:1.6">You'll no longer receive marketing emails from Bahamian Seafood Connection. We're sorry to see you go.</p>
  <p style="color:#888;font-size:12px;margin-top:24px">Changed your mind? Visit <a href="https://bscbahamas.com" style="color:#060d1f">bscbahamas.com</a> any time.</p>
</div></body></html>`;

const HTML_INVALID = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f2ee;font-family:Georgia,serif;color:#0F1111">
<div style="max-width:480px;margin:80px auto;padding:32px;background:#fff;border:1px solid #e7e7e7;border-radius:12px;text-align:center">
  <h2 style="margin:0 0 12px 0;color:#c0392b">Invalid unsubscribe link.</h2>
  <p style="color:#565959">If you keep seeing this, email <a href="mailto:hello@bscbahamas.com">hello@bscbahamas.com</a> and we'll remove you manually.</p>
</div></body></html>`;

export async function GET(req: NextRequest) {
  const url   = new URL(req.url);
  const cid   = url.searchParams.get('c');
  const token = url.searchParams.get('t');

  if (!cid || !token || !verifyUnsubscribeToken(cid, token)) {
    return new NextResponse(HTML_INVALID, { status: 400, headers: { 'Content-Type': 'text/html' } });
  }

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !supaKey) {
    return new NextResponse('Server not configured.', { status: 500 });
  }
  const admin = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { error } = await admin.from('customers').update({
    email_marketing_consent: false,
    email_consent_source:    'unsubscribed',
  }).eq('id', cid);

  if (error) {
    return new NextResponse(`Unsubscribe failed: ${error.message}`, { status: 500 });
  }
  return new NextResponse(HTML_DONE, { headers: { 'Content-Type': 'text/html' } });
}
