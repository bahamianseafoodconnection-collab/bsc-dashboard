// /api/pricing/update-rule
//
// Server-authoritative writes for the pricing source-of-truth (Phase 5 sweep).
// Replaces the two browser→RLS-direct writes on /dashboard/pricing-rules:
//   • RuleModal   → pricing_rules.update(markup_pct, vat_pct, description)  by channel
//   • ConfigModal → pricing_config.update(value)                            by key
//
// These were already RLS-gated (is_bsc_admin write) + audited by the
// pricing_rules_audit trigger; this moves the write itself behind a
// role-gated service-role API per the D2 standard, with an ai_writes row.
//
// Body: { kind: 'rule', channel, markup_pct, vat_pct, description }
//   or:  { kind: 'config', key, value }
// Resp: { ok, kind, affected }

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Mirrors the page gate (ADMIN_ROLES incl. manager). Write is also RLS-gated.
const ALLOWED_ROLES = new Set(['founder', 'co_founder', 'control_admin', 'basic_admin', 'manager']);

export async function POST(req: NextRequest) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svcKey  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supaUrl || !anonKey || !svcKey) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ ok: false, error: 'Sign in required' }, { status: 401 });
  }
  const userClient = createClient(supaUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth:   { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return NextResponse.json({ ok: false, error: 'Invalid session' }, { status: 401 });
  const { data: prof } = await userClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (prof as { role?: string | null } | null)?.role ?? null;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ ok: false, error: `Role "${role ?? 'none'}" cannot edit pricing rules.` }, { status: 403 });
  }

  let body: {
    kind?: unknown; channel?: unknown; markup_pct?: unknown; vat_pct?: unknown;
    description?: unknown; key?: unknown; value?: unknown;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  const kind = body.kind === 'rule' || body.kind === 'config' ? body.kind : '';
  if (!kind) return NextResponse.json({ ok: false, error: "kind must be 'rule' or 'config'" }, { status: 400 });

  const admin = createClient(supaUrl, svcKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const nowIso = new Date().toISOString();

  let affected = 0;
  let err: string | null = null;
  const auditInput: Record<string, unknown> = { kind };

  try {
    if (kind === 'rule') {
      const channel = typeof body.channel === 'string' ? body.channel : '';
      const m = typeof body.markup_pct === 'number' ? body.markup_pct : NaN;
      const v = typeof body.vat_pct === 'number' ? body.vat_pct : NaN;
      const description = typeof body.description === 'string' ? body.description.trim() : '';
      if (!channel) return NextResponse.json({ ok: false, error: 'channel is required' }, { status: 400 });
      if (!Number.isFinite(m) || m < 0 || m > 1000) return NextResponse.json({ ok: false, error: 'markup_pct must be 0-1000' }, { status: 400 });
      if (!Number.isFinite(v) || v < 0 || v > 100)  return NextResponse.json({ ok: false, error: 'vat_pct must be 0-100' }, { status: 400 });
      Object.assign(auditInput, { channel, markup_pct: m, vat_pct: v });

      const update: Record<string, unknown> = {
        markup_pct: m, vat_pct: v, updated_at: nowIso, updated_by: user.id,
      };
      if (description) update.description = description;
      const { data, error } = await admin
        .from('pricing_rules')
        .update(update)
        .eq('channel', channel)
        .select('channel');
      if (error) err = error.message; else affected = (data ?? []).length;

    } else { // config
      const key   = typeof body.key === 'string' ? body.key : '';
      const value = typeof body.value === 'string' ? body.value.trim() : '';
      if (!key)   return NextResponse.json({ ok: false, error: 'key is required' }, { status: 400 });
      if (!value) return NextResponse.json({ ok: false, error: 'value is required' }, { status: 400 });
      Object.assign(auditInput, { key, value });

      const { data, error } = await admin
        .from('pricing_config')
        .update({ value })
        .eq('key', key)
        .select('key');
      if (error) err = error.message; else affected = (data ?? []).length;
    }
  } catch (e) {
    err = e instanceof Error ? e.message : 'update failed';
  }

  // Audit (non-fatal; pricing_rules_audit trigger also records rule changes).
  try {
    await admin.from('ai_writes').insert({
      tool:      'pricing_update_rule',
      caller_id: user.id,
      input:     auditInput,
      result:    { affected, role },
      status:    err ? 'error' : 'success',
      error:     err,
    });
  } catch (auditErr) {
    console.warn('ai_writes audit insert failed (non-fatal):', auditErr);
  }

  if (err) return NextResponse.json({ ok: false, error: `Pricing update failed: ${err}` }, { status: 500 });
  return NextResponse.json({ ok: true, kind, affected });
}
