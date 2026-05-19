'use client';

// =====================================================================
// components/CustomerPhoneLookup.tsx
// Phone-first customer lookup for Nassau POS, Andros POS, Online.
// Brand: Playfair Display + DM Sans, gold #f5c518, dark navy #060d1f.
//
// Uses the project's shared @/lib/supabase client (anon key) so callers
// don't have to plumb env vars through every page.
// =====================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type OriginChannel = 'nassau_pos' | 'andros_pos' | 'online' | 'qr_scan' | 'wholesale';

export interface CustomerLookupResult {
  id:         string;
  full_name:  string;
  email:      string | null;
  phone_e164: string;
  is_active:  boolean;
}

export interface SelectedCustomer {
  id:                   string;
  full_name:            string;
  email:                string | null;
  phone_e164:           string | null;
  is_walk_in_anonymous: boolean;
}

export interface CustomerPhoneLookupProps {
  origin:              OriginChannel;
  qrSource?:           string | null;
  onCustomerSelected:  (customer: SelectedCustomer) => void;
  autoFocus?:          boolean;
}

const WALK_IN_ANONYMOUS_ID = '00000000-0000-0000-0000-000000000001';

function normalizePhone(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  let cleaned = raw.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  cleaned = cleaned.replace(/\+/g, '');
  if (cleaned.length === 7)                                   return `+1242${cleaned}`;
  if (cleaned.length === 10)                                  return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith('1'))       return `+${cleaned}`;
  if (cleaned.length === 0)                                   return null;
  return `+${cleaned}`;
}

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function CustomerPhoneLookup({
  origin,
  qrSource           = null,
  onCustomerSelected,
  autoFocus          = true,
}: CustomerPhoneLookupProps) {
  const [rawPhone,   setRawPhone]   = useState('');
  const [normalized, setNormalized] = useState<string | null>(null);
  const [fullName,   setFullName]   = useState('');
  const [email,      setEmail]      = useState('');

  const [matched,    setMatched]    = useState<CustomerLookupResult | null>(null);
  const [isLooking,  setIsLooking]  = useState(false);
  const [lookupError,setLookupError]= useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError,setSubmitError]= useState<string | null>(null);

  const debounceRef    = useRef<number | null>(null);
  const phoneInputRef  = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (autoFocus && phoneInputRef.current) phoneInputRef.current.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    const n = normalizePhone(rawPhone);
    setNormalized(n);

    if (!n || n.length < 9) {
      setMatched(null);
      setLookupError(null);
      return;
    }

    debounceRef.current = window.setTimeout(async () => {
      setIsLooking(true);
      setLookupError(null);

      const { data, error } = await supabase.rpc('bsc_lookup_customer_by_phone', { p_raw_phone: rawPhone });

      setIsLooking(false);

      if (error) {
        setLookupError(error.message);
        setMatched(null);
        return;
      }

      const row = Array.isArray(data) && data.length > 0 ? (data[0] as CustomerLookupResult) : null;
      if (row) {
        setMatched(row);
        setFullName(row.full_name ?? '');
        setEmail(row.email ?? '');
      } else {
        setMatched(null);
      }
    }, 350);

    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [rawPhone]);

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);

    if (matched) {
      onCustomerSelected({
        id:                   matched.id,
        full_name:            matched.full_name,
        email:                matched.email,
        phone_e164:           matched.phone_e164,
        is_walk_in_anonymous: false,
      });
      return;
    }

    if (!normalized)                                      { setSubmitError('Enter a valid phone number.'); return; }
    if (!fullName.trim())                                 { setSubmitError('Full name is required.');     return; }
    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) { setSubmitError('Enter a valid email address.'); return; }

    setSubmitting(true);
    const { data, error } = await supabase.rpc('bsc_upsert_customer', {
      p_raw_phone:  rawPhone,
      p_full_name:  fullName.trim(),
      p_email:      email.trim(),
      p_origin:     origin,
      p_qr_source:  qrSource,
    });
    setSubmitting(false);

    if (error) { setSubmitError(error.message); return; }

    const newId = typeof data === 'string' ? data : (data as { id?: string })?.id;
    if (!newId) { setSubmitError('Customer was not created. Try again.'); return; }

    onCustomerSelected({
      id:                   newId,
      full_name:            fullName.trim(),
      email:                email.trim(),
      phone_e164:           normalized,
      is_walk_in_anonymous: false,
    });
  }, [matched, normalized, fullName, email, rawPhone, origin, qrSource, onCustomerSelected]);

  const handleWalkInAnonymous = useCallback(() => {
    onCustomerSelected({
      id:                   WALK_IN_ANONYMOUS_ID,
      full_name:            'Walk-In Anonymous',
      email:                null,
      phone_e164:           null,
      is_walk_in_anonymous: true,
    });
  }, [onCustomerSelected]);

  const showNewCustomerFields = normalized && !matched && !isLooking;

  return (
    <div className="bsc-customer-lookup">
      <style jsx>{`
        .bsc-customer-lookup {
          font-family: 'DM Sans', system-ui, sans-serif;
          color: #060d1f;
          background: #ffffff;
          border: 1px solid rgba(6, 13, 31, 0.08);
          border-radius: 14px;
          padding: 24px;
          max-width: 520px;
          box-shadow: 0 1px 0 rgba(6, 13, 31, 0.02), 0 10px 30px -10px rgba(6, 13, 31, 0.12);
        }
        .header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 18px; }
        .header h2 { font-family: 'Playfair Display', serif; font-weight: 600; font-size: 22px; margin: 0; letter-spacing: -0.01em; }
        .header .channel { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(6, 13, 31, 0.55); }
        label { display: block; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(6, 13, 31, 0.62); margin-bottom: 6px; }
        .field { margin-bottom: 14px; }
        input[type="tel"], input[type="text"], input[type="email"] {
          width: 100%; font-family: inherit; font-size: 16px;
          padding: 12px 14px; border: 1px solid rgba(6, 13, 31, 0.14); border-radius: 10px;
          background: #fafafa; color: #060d1f; transition: border-color 120ms ease, background 120ms ease;
          box-sizing: border-box;
        }
        input:focus { outline: none; border-color: #f5c518; background: #ffffff; box-shadow: 0 0 0 3px rgba(245, 197, 24, 0.18); }
        input[readonly] { background: #f3f4f6; color: rgba(6, 13, 31, 0.75); }
        .phone-row { position: relative; }
        .phone-status { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 12px; letter-spacing: 0.04em; }
        .status-found   { color: #0f7a3f; }
        .status-new     { color: #f5c518; }
        .status-looking { color: rgba(6, 13, 31, 0.5); }
        .e164-hint { margin-top: 6px; font-size: 12px; color: rgba(6, 13, 31, 0.5); font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
        .match-banner { background: rgba(15, 122, 63, 0.08); border-left: 3px solid #0f7a3f; padding: 10px 12px; border-radius: 6px; font-size: 14px; margin-bottom: 14px; color: #0c5a2e; }
        .new-banner   { background: rgba(245, 197, 24, 0.12); border-left: 3px solid #f5c518; padding: 10px 12px; border-radius: 6px; font-size: 14px; margin-bottom: 14px; color: #7a5e00; }
        .error { color: #b00020; font-size: 13px; margin-top: 6px; }
        .actions { display: flex; gap: 10px; margin-top: 18px; }
        button { font-family: inherit; cursor: pointer; border: none; padding: 12px 18px; border-radius: 10px; font-size: 14px; font-weight: 600; letter-spacing: 0.02em; transition: transform 80ms ease, box-shadow 120ms ease, background 120ms ease; }
        button:disabled { cursor: not-allowed; opacity: 0.55; }
        .btn-primary { background: #060d1f; color: #f5c518; flex: 1; }
        .btn-primary:hover:not(:disabled) { background: #0d1834; transform: translateY(-1px); box-shadow: 0 8px 20px -8px rgba(6, 13, 31, 0.4); }
        .btn-ghost { background: transparent; color: rgba(6, 13, 31, 0.7); border: 1px solid rgba(6, 13, 31, 0.14); }
        .btn-ghost:hover:not(:disabled) { border-color: rgba(6, 13, 31, 0.3); color: #060d1f; }
      `}</style>

      <div className="header">
        <h2>Customer</h2>
        <span className="channel">{origin.replace('_', ' ')}</span>
      </div>

      <div className="field">
        <label htmlFor="bsc-phone">Phone number</label>
        <div className="phone-row">
          <input
            id="bsc-phone"
            ref={phoneInputRef}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="e.g. 242-357-0000 or +1 305 555 0123"
            value={rawPhone}
            onChange={(e) => setRawPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          />
          {isLooking && (<span className="phone-status status-looking">searching…</span>)}
          {!isLooking && matched && (<span className="phone-status status-found">✓ existing</span>)}
          {!isLooking && normalized && !matched && normalized.length >= 9 && (
            <span className="phone-status status-new">new customer</span>
          )}
        </div>
        {normalized && (<div className="e164-hint">stored as {normalized}</div>)}
        {lookupError && <div className="error">{lookupError}</div>}
      </div>

      {matched && (
        <div className="match-banner">
          Found <strong>{matched.full_name}</strong>. Name &amp; email loaded.
        </div>
      )}

      {showNewCustomerFields && (
        <div className="new-banner">
          New phone — capture name and email to create the customer.
        </div>
      )}

      <div className="field">
        <label htmlFor="bsc-name">Full name</label>
        <input
          id="bsc-name"
          type="text"
          autoComplete="name"
          placeholder="First and last name"
          value={fullName}
          readOnly={!!matched}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="bsc-email">Email</label>
        <input
          id="bsc-email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          value={email}
          readOnly={!!matched}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      {submitError && <div className="error">{submitError}</div>}

      <div className="actions">
        <button className="btn-primary" onClick={handleSubmit} disabled={submitting || !normalized}>
          {submitting ? 'Saving…' : matched ? 'Use this customer' : 'Create & continue'}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={handleWalkInAnonymous}
          disabled={submitting}
          title="Use the shared Walk-In Anonymous record"
        >
          Walk-In
        </button>
      </div>
    </div>
  );
}
