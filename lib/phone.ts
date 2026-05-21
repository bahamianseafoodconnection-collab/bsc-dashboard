// lib/phone.ts
//
// Bahamas-aware phone normalization to E.164. Used by every channel that
// touches a customer phone — Twilio WhatsApp/SMS, CustomerPhoneLookup,
// receipts, AR statements.
//
// Rules:
//   • 7-digit input (242-area is implicit)         → +1242xxxxxxx
//   • 10-digit input starting with 242             → +1242xxxxxxx
//   • 10-digit input NOT starting with 242         → +1xxxxxxxxxx (US)
//   • 11-digit input starting with 1               → +1xxxxxxxxxx
//   • Already in +E.164 form                       → returned as-is
//   • Empty / invalid                              → null

export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Strip all non-digits except leading +.
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  if (digits.length === 0) return null;

  // Already +-prefixed and at least 10 digits? Trust it.
  if (hasPlus && digits.length >= 10) return `+${digits}`;

  // 11 digits starting with 1 (US/Canada/Bahamas).
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

  // 10 digits — could be Bahamas (242-xxx-xxxx) or US (xxx-xxx-xxxx).
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // 7 digits — assume Bahamas local (242 area code implicit).
  if (digits.length === 7) {
    return `+1242${digits}`;
  }

  // Anything else: too short or too long, can't reliably normalize.
  return null;
}

/**
 * Format an E.164 number for display. Bahamas-aware:
 *   +12423613474 → +1 (242) 361-3474
 *   +14155551234 → +1 (415) 555-1234
 */
export function formatE164ForDisplay(e164: string | null | undefined): string {
  if (!e164) return '';
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (m) return `+1 (${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}
