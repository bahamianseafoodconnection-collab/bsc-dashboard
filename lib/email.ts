// Resend wrapper + email composition helpers.
//
// Required env:
//   RESEND_API_KEY          — from resend.com → API Keys
//   RESEND_FROM_ADDRESS     — e.g. 'BSC Marketplace <hello@bscbahamas.com>'
//                             (the bscbahamas.com domain must be verified
//                             in Resend before sends will succeed)
//   UNSUBSCRIBE_SECRET      — any random string used to sign one-click
//                             unsubscribe URLs (HMAC-SHA256 truncated)
//   NEXT_PUBLIC_SITE_URL    — e.g. 'https://bscbahamas.com'
//                             (only used to build absolute unsubscribe URLs)

import { createHmac } from 'crypto';

const RESEND_EMAILS = 'https://api.resend.com/emails';
const RESEND_BATCH  = 'https://api.resend.com/emails/batch';

function defaultFrom(): string {
  return process.env.RESEND_FROM_ADDRESS || 'BSC Marketplace <hello@bscbahamas.com>';
}

export function unsubscribeUrl(customer_id: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET || 'change-me-in-env';
  const token  = createHmac('sha256', secret).update(customer_id).digest('hex').slice(0, 32);
  const base   = process.env.NEXT_PUBLIC_SITE_URL || 'https://bscbahamas.com';
  return `${base}/api/unsubscribe?c=${encodeURIComponent(customer_id)}&t=${token}`;
}

export function verifyUnsubscribeToken(customer_id: string, token: string): boolean {
  const secret = process.env.UNSUBSCRIBE_SECRET || 'change-me-in-env';
  const expected = createHmac('sha256', secret).update(customer_id).digest('hex').slice(0, 32);
  // Constant-time comparison
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/**
 * Wrap a body of HTML in the standard BSC blast layout:
 * navy header, white card, footer with physical address + unsubscribe link.
 * Required for CAN-SPAM compliance.
 */
export function buildBlastHtml(opts: { headline: string; body_html: string; customer_id?: string }): string {
  const unsub = opts.customer_id ? unsubscribeUrl(opts.customer_id) : '#';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f2ee;font-family:Georgia,serif;color:#0F1111;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td>
    <table width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="background:#fff;margin:24px auto;border-radius:12px;overflow:hidden;border:1px solid #e7e7e7">
      <tr><td style="background:#060d1f;color:#f5c518;padding:18px 24px;font-weight:bold;font-size:13px;letter-spacing:3px;text-transform:uppercase">
        Bahamian Seafood Connection
      </td></tr>
      <tr><td style="padding:28px 24px 8px;">
        <h1 style="margin:0 0 18px 0;font-size:24px;color:#0F1111;font-weight:600;">${escapeHtml(opts.headline)}</h1>
        <div style="font-size:15px;line-height:1.7;color:#1c1c1c">${opts.body_html}</div>
      </td></tr>
      <tr><td style="padding:20px 24px 28px;">
        <a href="https://bscbahamas.com" style="display:inline-block;background:#f5c518;color:#060d1f;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px">Shop the Marketplace</a>
      </td></tr>
      <tr><td style="background:#f7f8f8;padding:16px 24px;font-size:11px;color:#565959;text-align:center;line-height:1.7">
        Bahamian Seafood Connection · Nassau, Bahamas<br>
        bscbahamas.com · You're receiving this because you opted in at our marketplace or POS.<br>
        ${opts.customer_id ? `<a href="${unsub}" style="color:#565959;text-decoration:underline">Unsubscribe</a>` : ''}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendEmail(p: SendEmailParams): Promise<{ id?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { error: 'RESEND_API_KEY missing in environment' };

  const res = await fetch(RESEND_EMAILS, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    p.from || defaultFrom(),
      to:      [p.to],
      subject: p.subject,
      html:    p.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { error: `Resend ${res.status}: ${body}` };
  }
  const data = await res.json();
  return { id: data?.id };
}

export interface BatchEmail {
  to:      string;
  subject: string;
  html:    string;
  from?:   string;
}

/**
 * Send up to 100 emails in a single Resend batch call. Returns the array of
 * IDs (success) or an error string. Caller is responsible for chunking
 * larger lists into ≤100-recipient slices.
 */
export async function sendBatch(emails: BatchEmail[]): Promise<{ ids?: string[]; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { error: 'RESEND_API_KEY missing in environment' };
  if (emails.length === 0) return { ids: [] };
  if (emails.length > 100) return { error: 'Resend batch limit is 100 emails per call' };

  const res = await fetch(RESEND_BATCH, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(
      emails.map(e => ({
        from:    e.from || defaultFrom(),
        to:      [e.to],
        subject: e.subject,
        html:    e.html,
      })),
    ),
  });
  if (!res.ok) {
    const body = await res.text();
    return { error: `Resend batch ${res.status}: ${body}` };
  }
  const data = await res.json();
  const ids: string[] = Array.isArray(data?.data) ? data.data.map((r: { id: string }) => r.id) : [];
  return { ids };
}
