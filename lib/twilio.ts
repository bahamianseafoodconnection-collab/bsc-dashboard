// lib/twilio.ts
//
// Twilio WhatsApp + SMS send helper. Server-side only — uses TWILIO_AUTH_TOKEN
// which must never leak to the client. Phase 1: transactional sends only
// (order receipts, status updates). STOP/START handling + marketing
// consent gate live in /api/twilio/webhook (separate file, not built yet).
//
// Required env:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_WHATSAPP_FROM     — e.g. 'whatsapp:+14155238886' (sandbox) or your verified WABA number
//   TWILIO_PHONE_NUMBER      — e.g. '+1242…' for SMS fallback
//
// All sends are best-effort. If env is unset or Twilio rejects, return
// { ok: false, error } — caller decides whether to surface or swallow.

import { toE164 } from './phone';

const TWILIO_BASE = 'https://api.twilio.com/2010-04-01';

export interface TwilioSendResult {
  ok:        boolean;
  sid?:      string;
  error?:    string;
  channel?:  'whatsapp' | 'sms';
  to?:       string;
}

export interface SendOpts {
  to:        string;      // any phone format; normalized to E.164 here
  body:      string;
  /** 'whatsapp' (default) tries WhatsApp first, falls back to SMS on error. 'sms' = SMS only. */
  channel?:  'whatsapp' | 'sms' | 'whatsapp_then_sms';
}

async function postTwilio(form: Record<string, string>): Promise<{ sid: string } | { error: string; status: number }> {
  const sid    = process.env.TWILIO_ACCOUNT_SID;
  const token  = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return { error: 'TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN not configured', status: 500 };

  const url  = `${TWILIO_BASE}/Accounts/${sid}/Messages.json`;
  const body = new URLSearchParams(form).toString();
  const auth = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');

  const res = await fetch(url, {
    method:  'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: (json as { message?: string }).message ?? `Twilio ${res.status}`, status: res.status };
  }
  return { sid: (json as { sid: string }).sid };
}

export async function sendWhatsApp(opts: { to: string; body: string }): Promise<TwilioSendResult> {
  const e164 = toE164(opts.to);
  if (!e164) return { ok: false, error: 'Invalid recipient phone' };
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) return { ok: false, error: 'TWILIO_WHATSAPP_FROM not configured' };

  const res = await postTwilio({
    To:   `whatsapp:${e164}`,
    From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
    Body: opts.body,
  });
  if ('error' in res) return { ok: false, error: res.error, channel: 'whatsapp', to: e164 };
  return { ok: true, sid: res.sid, channel: 'whatsapp', to: e164 };
}

export async function sendSMS(opts: { to: string; body: string }): Promise<TwilioSendResult> {
  const e164 = toE164(opts.to);
  if (!e164) return { ok: false, error: 'Invalid recipient phone' };
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) return { ok: false, error: 'TWILIO_PHONE_NUMBER not configured' };

  const res = await postTwilio({ To: e164, From: from, Body: opts.body });
  if ('error' in res) return { ok: false, error: res.error, channel: 'sms', to: e164 };
  return { ok: true, sid: res.sid, channel: 'sms', to: e164 };
}

/** Try WhatsApp first, fall back to SMS if WhatsApp fails. */
export async function sendWhatsAppOrSMS(opts: { to: string; body: string }): Promise<TwilioSendResult> {
  const wa = await sendWhatsApp(opts);
  if (wa.ok) return wa;
  const sms = await sendSMS(opts);
  if (sms.ok) return sms;
  return { ok: false, error: `WhatsApp: ${wa.error}; SMS: ${sms.error}` };
}
