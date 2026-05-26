// /api/payment/health
//
// Founder-facing diagnostic for the Plug'n Pay (RBC) integration.
// Reports whether the PNP_* env vars are present in this deployment +
// (optionally, when ?ping=1) actually exercises the gateway with a
// known-invalid order ID to confirm credentials authenticate.
//
// Authentication: founder/co_founder only. We DO NOT want random users
// or competitors probing this and learning whether we have a gateway
// integration ready to test.
//
// NEVER echo the env values back. Only their presence.
//
// Usage:
//   GET /api/payment/health
//       → { ok: true,  configured: true,  ready: true }
//       → { ok: false, configured: false, missing: ['PNP_PUBLISHER_PASSWORD'] }
//
//   GET /api/payment/health?ping=1
//       → Same as above PLUS a live Query Transaction call with a
//         deliberately-bogus orderID. Three possible outcomes:
//           gateway_reachable + creds_valid (good)
//           gateway_reachable + creds_invalid (env var is wrong)
//           gateway_unreachable (network / DNS / firewall problem)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isPnpConfigured, queryTransaction } from '@/lib/plugnpay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['founder', 'co_founder']);

function whichMissing(): string[] {
  const missing: string[] = [];
  if (!process.env.PNP_GATEWAY_ACCOUNT)         missing.push('PNP_GATEWAY_ACCOUNT');
  if (!process.env.PNP_PUBLISHER_PASSWORD)      missing.push('PNP_PUBLISHER_PASSWORD');
  if (!process.env.PNP_VERIFICATION_HASH_SECRET) missing.push('PNP_VERIFICATION_HASH_SECRET');
  return missing;
}

async function authorize(req: NextRequest): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !anonKey) return { ok: false, status: 500, error: 'Supabase not configured' };

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return { ok: false, status: 401, error: 'Sign in required' };

  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { ok: false, status: 401, error: 'Invalid session' };

  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED_ROLES.has(role)) return { ok: false, status: 403, error: 'Founder / co-founder only' };

  return { ok: true };
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const missing    = whichMissing();
  const configured = missing.length === 0;
  const ready      = configured && isPnpConfigured();

  const wantPing = req.nextUrl.searchParams.get('ping') === '1';
  if (!wantPing) {
    return NextResponse.json({
      ok:         configured,
      configured,
      ready,
      missing:    missing.length > 0 ? missing : undefined,
      api_base:   process.env.PNP_API_BASE_URL ?? 'https://pay1.plugnpay.com (default)',
      currency:   process.env.PNP_CURRENCY ?? 'BSD (default)',
      hint:       configured
                    ? 'Env vars present. Add ?ping=1 to test live credentials against the gateway.'
                    : 'Add the missing variables in Vercel → Settings → Environment Variables, then redeploy.',
    }, { status: configured ? 200 : 503 });
  }

  // Live ping — exercise the gateway with a known-bogus orderID. Three
  // possible outcomes told apart by the error message:
  //   - "Authentication Failed" → reachable, creds WRONG
  //   - "Order not found" / similar → reachable, creds CORRECT (this is
  //     the success case for a health probe — the gateway authed us
  //     fine and just couldn't find our fake order)
  //   - fetch threw / timeout → unreachable (network / firewall)
  if (!configured) {
    return NextResponse.json({
      ok:        false,
      configured: false,
      missing,
      hint:      'Cannot ping — env vars not set.',
    }, { status: 503 });
  }

  const t0 = Date.now();
  try {
    const probeOrderId = `BSC-HEALTH-${Date.now()}`;
    const response = await queryTransaction(probeOrderId);
    const tookMs = Date.now() - t0;

    // PnP signals auth failure with FinalStatus=problem + a message
    // containing "Authentication Failed" or similar. We sniff for that.
    const status   = (response.FinalStatus ?? '').toLowerCase();
    const msg      = (response.MErrMsg ?? response['auth-msg'] ?? '').toString();
    const authFail = /auth(?:entication)?\s*fail|password\s*(?:is\s+)?required|invalid\s+credentials/i.test(msg);

    if (authFail) {
      return NextResponse.json({
        ok:                false,
        configured:        true,
        gateway_reachable: true,
        creds_valid:       false,
        took_ms:           tookMs,
        gateway_message:   msg,
        hint:              'Gateway responded but rejected our credentials. The most likely cause is the wrong value in PNP_GATEWAY_ACCOUNT or PNP_PUBLISHER_PASSWORD. Re-verify both against Settings → Account Settings + Settings → Security Administration in the PnP admin panel.',
      }, { status: 502 });
    }

    // Any other response = gateway reachable + credentials accepted.
    // We expect status=problem because the orderID is fake; what
    // matters is the gateway processed the auth before returning.
    return NextResponse.json({
      ok:                true,
      configured:        true,
      gateway_reachable: true,
      creds_valid:       true,
      took_ms:           tookMs,
      gateway_status:    status,
      gateway_message:   msg || '(no message, credentials accepted)',
      hint:              'Gateway authenticated successfully. PNP env vars are correct and the integration is ready for a test transaction once Testing Mode is enabled in the PnP admin panel.',
    });
  } catch (err) {
    const tookMs = Date.now() - t0;
    return NextResponse.json({
      ok:                false,
      configured:        true,
      gateway_reachable: false,
      took_ms:           tookMs,
      error:             err instanceof Error ? err.message : String(err),
      hint:              'Could not reach pay1.plugnpay.com. Check Vercel function networking / outbound firewall.',
    }, { status: 502 });
  }
}
