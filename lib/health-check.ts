// Anomaly scanner invoked by Founder AI's health_check tool.
//
// Three categories of findings:
//   schema       — data shape that drifted from what the app expects
//   margin       — sales that violated a sacred pricing rule
//   operational  — work-in-flight items not flowing correctly
//
// Each finding has a severity:
//   info     — informational; founder may want to know
//   warning  — action probably needed soon
//   critical — money / data integrity issue, needs attention now

import type { SupabaseClient } from '@supabase/supabase-js';

export type Severity = 'info' | 'warning' | 'critical';
export type Category = 'schema' | 'margin' | 'operational';

export interface HealthFinding {
  category:    Category;
  severity:    Severity;
  message:     string;
  count?:      number;
  sample_ids?: string[];
}

export interface HealthReport {
  generated_at: string;
  total:        number;
  by_severity:  { critical: number; warning: number; info: number };
  findings:     HealthFinding[];
  summary:      string;
}

const OVERHEAD_CATEGORIES = ['salaries', 'utilities', 'rent', 'operations', 'maintenance', 'accounts_payable'];

const CHANNEL_MARGIN: Record<string, number> = {
  pos_sale_nassau: 0.38,
  pos_sale_andros: 0.43,
  online_market:   0.25,
  wholesale:       0.15,
};

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

export async function healthCheck(admin: SupabaseClient): Promise<HealthReport> {
  const findings: HealthFinding[] = [];

  const now      = new Date();
  const dayAgo   = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString();
  const twoWkAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // ── Schema / data drift ─────────────────────────────────────────────

  // 1. Recent orders (last 24h) with NULL net_profit — per-transaction
  //    allocation didn't fire on these.
  await safe(async () => {
    const { data } = await admin
      .from('orders')
      .select('id')
      .gte('created_at', dayAgo)
      .is('net_profit', null)
      .limit(20);
    if (data && data.length > 0) {
      findings.push({
        category:    'schema',
        severity:    'warning',
        message:     `${data.length} order(s) in the last 24h saved without net_profit. The per-transaction allocation hook may have skipped them (overhead fetch failed or order_type unsupported).`,
        count:       data.length,
        sample_ids:  data.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // 2. Expenses in unexpected categories.
  await safe(async () => {
    const { data } = await admin
      .from('expenses')
      .select('id, category')
      .not('category', 'in', `(${OVERHEAD_CATEGORIES.map((c) => `"${c}"`).join(',')})`)
      .limit(50);
    if (data && data.length > 0) {
      const cats = Array.from(new Set(data.map((r: { category: string }) => r.category)));
      findings.push({
        category:    'schema',
        severity:    'info',
        message:     `${data.length} expense row(s) sit in unrecognized categories (${cats.join(', ')}). These won't roll into the monthly fixed overhead total.`,
        count:       data.length,
        sample_ids:  data.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // 3. Active staff with no monthly_salary set.
  await safe(async () => {
    const { data } = await admin
      .from('users')
      .select('id, full_name, email, is_active, monthly_salary')
      .eq('is_active', true)
      .is('monthly_salary', null)
      .limit(50);
    if (data && data.length > 0) {
      findings.push({
        category:    'schema',
        severity:    'warning',
        message:     `${data.length} active staff member(s) have no monthly_salary. Their pay isn't included in monthly fixed overhead.`,
        count:       data.length,
        sample_ids:  data.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // 4. Products with negative stock.
  await safe(async () => {
    const { data } = await admin
      .from('products')
      .select('id, sku, name, stock_lbs')
      .lt('stock_lbs', 0)
      .limit(50);
    if (data && data.length > 0) {
      findings.push({
        category:    'schema',
        severity:    'critical',
        message:     `${data.length} product(s) have negative stock_lbs — sales recorded faster than stock was updated. SKUs: ${data.slice(0, 3).map((r: { sku: string }) => r.sku).join(', ')}`,
        count:       data.length,
        sample_ids:  data.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // 5. Credit customers over their credit_limit.
  await safe(async () => {
    const { data } = await admin
      .from('customers')
      .select('id, full_name, current_balance, credit_limit')
      .eq('is_credit_customer', true)
      .not('credit_limit', 'is', null)
      .limit(200);
    const over = (data ?? []).filter(
      (r: { current_balance: number | null; credit_limit: number | null }) =>
        r.current_balance !== null && r.credit_limit !== null && Number(r.current_balance) > Number(r.credit_limit),
    );
    if (over.length > 0) {
      findings.push({
        category:    'schema',
        severity:    'critical',
        message:     `${over.length} credit customer(s) are over their credit_limit. Total over-extension: $${over.reduce((s: number, r: { current_balance: number | null; credit_limit: number | null }) => s + (Number(r.current_balance) - Number(r.credit_limit)), 0).toFixed(2)}.`,
        count:       over.length,
        sample_ids:  over.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // 6. Locked records still locked after 7+ days.
  for (const table of ['orders', 'catch_logs', 'processing_logs']) {
    await safe(async () => {
      const { data } = await admin
        .from(table)
        .select('id, locked_at')
        .not('locked_by', 'is', null)
        .lt('locked_at', weekAgo)
        .limit(20);
      if (data && data.length > 0) {
        findings.push({
          category:    'schema',
          severity:    'info',
          message:     `${data.length} ${table} row(s) have been locked for over 7 days. Confirm they should stay locked or unlock to allow edits.`,
          count:       data.length,
          sample_ids:  data.slice(0, 5).map((r: { id: string }) => r.id),
        });
      }
    }, undefined);
  }

  // ── Margin / pricing alerts ─────────────────────────────────────────

  // 7. Recent sales with negative net_profit (loss).
  await safe(async () => {
    const { data } = await admin
      .from('orders')
      .select('id, order_type, total, net_profit')
      .gte('created_at', weekAgo)
      .lt('net_profit', 0)
      .limit(20);
    if (data && data.length > 0) {
      findings.push({
        category:    'margin',
        severity:    'critical',
        message:     `${data.length} sale(s) in the last 7 days closed at a net loss after expenses + Bill 5%. Total loss: $${data.reduce((s: number, r: { net_profit: number | null }) => s + Number(r.net_profit ?? 0), 0).toFixed(2)}.`,
        count:       data.length,
        sample_ids:  data.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // 8. Recent sales (last 24h) with total > 0 but bill_casale_share = 0.
  await safe(async () => {
    const { data } = await admin
      .from('orders')
      .select('id, total, bill_casale_share')
      .gte('created_at', dayAgo)
      .gt('total', 0)
      .eq('bill_casale_share', 0)
      .limit(20);
    if (data && data.length > 0) {
      findings.push({
        category:    'margin',
        severity:    'warning',
        message:     `${data.length} sale(s) in the last 24h have $0 bill_casale_share despite non-zero total. The sacred 5% is missing.`,
        count:       data.length,
        sample_ids:  data.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // 9. Recent sales whose effective margin (net_profit / total) is below
  //    the sacred floor for their channel. Light heuristic; ignores items
  //    that intentionally undercut the market.
  await safe(async () => {
    const { data } = await admin
      .from('orders')
      .select('id, order_type, total, net_profit, expense_allocation, bill_casale_share')
      .gte('created_at', weekAgo)
      .not('net_profit', 'is', null)
      .gt('total', 0)
      .limit(500);
    const offenders = (data ?? []).filter((r: {
      order_type: string | null;
      total: number;
      net_profit: number | null;
      expense_allocation: number | null;
      bill_casale_share: number | null;
    }) => {
      const floor = CHANNEL_MARGIN[r.order_type ?? ''];
      if (!floor) return false;
      // gross_profit ≈ net + expense + bill
      const gross = Number(r.net_profit ?? 0) + Number(r.expense_allocation ?? 0) + Number(r.bill_casale_share ?? 0);
      const effective = gross / Number(r.total);
      return effective < floor - 0.02; // 2% tolerance for rounding
    });
    if (offenders.length > 0) {
      findings.push({
        category:    'margin',
        severity:    'warning',
        message:     `${offenders.length} sale(s) in the last 7 days closed below the channel's sacred margin floor. Manual price overrides probably bypassed the rule.`,
        count:       offenders.length,
        sample_ids:  offenders.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // ── Operational alerts ──────────────────────────────────────────────

  // 10. Catch logs from last 14 days with no corresponding processing.
  await safe(async () => {
    const { data: catches } = await admin
      .from('catch_logs')
      .select('id, species, raw_weight_lb, created_at')
      .gte('created_at', twoWkAgo)
      .limit(200);
    if (!catches || catches.length === 0) return;

    const { data: processed } = await admin
      .from('processing_logs')
      .select('catch_log_id');
    const processedIds = new Set((processed ?? []).map((r: { catch_log_id: string | null }) => r.catch_log_id));

    const orphans = catches.filter((c: { id: string }) => !processedIds.has(c.id));
    if (orphans.length > 0) {
      findings.push({
        category:    'operational',
        severity:    'warning',
        message:     `${orphans.length} catch(es) from the last 14 days have not been processed yet. Total raw weight: ${orphans.reduce((s: number, r: { raw_weight_lb: number | null }) => s + Number(r.raw_weight_lb ?? 0), 0).toFixed(2)} lb.`,
        count:       orphans.length,
        sample_ids:  orphans.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // 11. Processing batches with yield < 60%.
  await safe(async () => {
    const { data } = await admin
      .from('processing_logs')
      .select('id, species, yield_pct, created_at')
      .gte('created_at', twoWkAgo)
      .lt('yield_pct', 60)
      .limit(20);
    if (data && data.length > 0) {
      findings.push({
        category:    'operational',
        severity:    'warning',
        message:     `${data.length} processing batch(es) in the last 14 days came in with yield below 60%. Quality or process issue.`,
        count:       data.length,
        sample_ids:  data.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // 12. Wholesale orders unpurchased > 24h.
  await safe(async () => {
    const { data } = await admin
      .from('orders')
      .select('id, customer_name, total, created_at')
      .eq('order_type', 'wholesale')
      .eq('admin_purchased', false)
      .lt('created_at', dayAgo)
      .limit(20);
    if (data && data.length > 0) {
      findings.push({
        category:    'operational',
        severity:    'critical',
        message:     `${data.length} wholesale order(s) older than 24h still flagged not-purchased. Suppliers expect us to act on these same-day.`,
        count:       data.length,
        sample_ids:  data.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // 13. Suspended staff still appearing in recent activity.
  await safe(async () => {
    const { data: suspended } = await admin
      .from('users')
      .select('id, full_name')
      .eq('is_active', false)
      .not('full_name', 'is', null)
      .limit(20);
    if (!suspended || suspended.length === 0) return;
    const names = suspended.map((r: { full_name: string | null }) => (r.full_name || '').toLowerCase()).filter(Boolean);
    if (names.length === 0) return;

    const { data: recentOrders } = await admin
      .from('orders')
      .select('id, customer_name, admin_notes')
      .gte('created_at', weekAgo)
      .limit(500);
    const hits = (recentOrders ?? []).filter((o: { customer_name: string | null; admin_notes: string | null }) => {
      const blob = `${o.customer_name ?? ''} ${o.admin_notes ?? ''}`.toLowerCase();
      return names.some((n) => blob.includes(n));
    });
    if (hits.length > 0) {
      findings.push({
        category:    'operational',
        severity:    'info',
        message:     `Suspended staff name(s) appear in ${hits.length} order(s) from the last 7 days (customer_name or admin_notes). Probably benign but worth a glance.`,
        count:       hits.length,
        sample_ids:  hits.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // 14. Cashier drawer left open more than 24 hours.
  await safe(async () => {
    const { data } = await admin
      .from('cash_drawer_sessions')
      .select('id, cashier_user_id, location, opened_at')
      .eq('status', 'open')
      .lt('opened_at', dayAgo)
      .limit(20);
    if (data && data.length > 0) {
      findings.push({
        category:    'operational',
        severity:    'critical',
        message:     `${data.length} cashier drawer session(s) have been open more than 24 hours. Someone forgot to close out. Locations: ${Array.from(new Set(data.map((r: { location: string }) => r.location))).join(', ')}.`,
        count:       data.length,
        sample_ids:  data.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // 15. Chronic cashier shorter — ≥3 short shifts (variance < −$5) in last 30d.
  await safe(async () => {
    const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await admin
      .from('cash_drawer_session_totals')
      .select('cashier_user_id, variance_cents')
      .eq('status', 'closed')
      .gte('closed_at', thirtyAgo)
      .lt('variance_cents', -500);
    if (!data || data.length === 0) return;
    const counts = new Map<string, number>();
    for (const r of data as Array<{ cashier_user_id: string }>) {
      counts.set(r.cashier_user_id, (counts.get(r.cashier_user_id) ?? 0) + 1);
    }
    const chronic = Array.from(counts.entries()).filter(([, c]) => c >= 3);
    if (chronic.length > 0) {
      const sample = chronic.slice(0, 5).map(([id, c]) => `${id.slice(0, 8)} (${c}×)`).join(', ');
      findings.push({
        category:    'operational',
        severity:    'warning',
        message:     `${chronic.length} cashier(s) had 3+ short shifts (variance < −$5) in the last 30 days. Sample: ${sample}.`,
        count:       chronic.length,
        sample_ids:  chronic.slice(0, 5).map(([id]) => id),
      });
    }
  }, undefined);

  // 16. AR over 60 days outstanding — unpaid wholesale/credit orders aging out.
  await safe(async () => {
    const sixtyAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await admin
      .from('orders')
      .select('id, total, customer_name, customer_id, created_at')
      .eq('payment_status', 'unpaid')
      .lt('created_at', sixtyAgo)
      .limit(100);
    if (data && data.length > 0) {
      const sum = data.reduce((s: number, r: { total: number | null }) => s + Number(r.total ?? 0), 0);
      findings.push({
        category:    'schema',
        severity:    'critical',
        message:     `${data.length} unpaid invoice(s) are more than 60 days old. Outstanding: $${sum.toFixed(2)}. Send statements / escalate or write off.`,
        count:       data.length,
        sample_ids:  data.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // 17. Spinytails: no pre-op SSOP recorded today (skip Sundays — plant closed).
  await safe(async () => {
    if (now.getUTCDay() === 0) return;
    const today = now.toISOString().slice(0, 10);
    const { count } = await admin
      .from('spinytails_sanitation_checks')
      .select('*', { count: 'exact', head: true })
      .eq('check_phase', 'pre_op')
      .eq('check_date', today);
    if ((count ?? 0) === 0) {
      findings.push({
        category:    'operational',
        severity:    'warning',
        message:     `No pre-op SSOP checks recorded for today (${today}). HACCP plan requires daily pre-op verification before production starts.`,
        count:       0,
      });
    }
  }, undefined);

  // 18. Spinytails: corrective actions open more than 7 days.
  await safe(async () => {
    const { data } = await admin
      .from('spinytails_corrective_actions')
      .select('id, ca_number, what_failed, opened_at')
      .is('closed_at', null)
      .lt('opened_at', weekAgo)
      .limit(20);
    if (data && data.length > 0) {
      findings.push({
        category:    'operational',
        severity:    'warning',
        message:     `${data.length} HACCP corrective action(s) have been open more than 7 days without closure. CA #s: ${data.slice(0, 5).map((r: { ca_number: number }) => r.ca_number).join(', ')}.`,
        count:       data.length,
        sample_ids:  data.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // 19. Spinytails: calibration overdue — next_due in the past with no newer log.
  await safe(async () => {
    const today = now.toISOString().slice(0, 10);
    const { data } = await admin
      .from('spinytails_calibration_logs')
      .select('id, equipment_id, equipment_type, next_due, performed_at')
      .not('next_due', 'is', null)
      .lt('next_due', today)
      .order('performed_at', { ascending: false })
      .limit(200);
    if (!data || data.length === 0) return;
    // Keep only the most recent log per equipment_id; flag those still overdue.
    const seen = new Set<string>();
    const overdue: Array<{ id: string; equipment_id: string; equipment_type: string }> = [];
    for (const r of data as Array<{ id: string; equipment_id: string; equipment_type: string; next_due: string }>) {
      if (seen.has(r.equipment_id)) continue;
      seen.add(r.equipment_id);
      if (r.next_due < today) overdue.push(r);
    }
    if (overdue.length > 0) {
      findings.push({
        category:    'operational',
        severity:    'warning',
        message:     `${overdue.length} piece(s) of equipment are past their calibration due date. Equipment: ${overdue.slice(0, 4).map(r => `${r.equipment_id} (${r.equipment_type})`).join(', ')}.`,
        count:       overdue.length,
        sample_ids:  overdue.slice(0, 5).map(r => r.id),
      });
    }
  }, undefined);

  // 20. Spinytails: staff with most-recent training over 365 days old.
  await safe(async () => {
    const { data } = await admin
      .from('spinytails_training_records')
      .select('staff_id, trained_at')
      .not('staff_id', 'is', null)
      .order('trained_at', { ascending: false })
      .limit(500);
    if (!data || data.length === 0) return;
    const latest = new Map<string, string>();
    for (const r of data as Array<{ staff_id: string; trained_at: string }>) {
      if (!latest.has(r.staff_id)) latest.set(r.staff_id, r.trained_at);
    }
    const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const stale = Array.from(latest.entries()).filter(([, t]) => t < yearAgo);
    if (stale.length > 0) {
      findings.push({
        category:    'operational',
        severity:    'info',
        message:     `${stale.length} HACCP staff member(s) have not had a training entry in over 365 days. Annual refresher recommended.`,
        count:       stale.length,
        sample_ids:  stale.slice(0, 5).map(([id]) => id),
      });
    }
  }, undefined);

  // 21. Spinytails: audit sessions past expiry that were never revoked.
  await safe(async () => {
    const nowIso = now.toISOString();
    const { data } = await admin
      .from('spinytails_audit_sessions')
      .select('id, inspector_name, inspector_agency, expires_at')
      .is('revoked_at', null)
      .lt('expires_at', nowIso)
      .limit(20);
    if (data && data.length > 0) {
      findings.push({
        category:    'schema',
        severity:    'info',
        message:     `${data.length} inspector audit session(s) are past expiry but never revoked. The tokens are technically dead but the records still show as "active". Mark as revoked for clean audit trail.`,
        count:       data.length,
        sample_ids:  data.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // 22. Products with no current product_costs row — pricing math runs on $0 cost.
  await safe(async () => {
    const { data: prods } = await admin
      .from('products')
      .select('id, sku, name');
    const { data: costs } = await admin
      .from('product_costs')
      .select('product_id')
      .eq('is_current', true);
    if (!prods || !costs) return;
    const costed = new Set((costs as Array<{ product_id: string }>).map(c => c.product_id));
    const missing = (prods as Array<{ id: string; sku: string; name: string }>).filter(p => !costed.has(p.id));
    if (missing.length > 0) {
      findings.push({
        category:    'margin',
        severity:    'warning',
        message:     `${missing.length} product(s) have no current product_costs row. Channel pricing falls back to $0 cost, so margin math is wrong. SKUs: ${missing.slice(0, 4).map(p => p.sku).join(', ')}${missing.length > 4 ? ', …' : ''}.`,
        count:       missing.length,
        sample_ids:  missing.slice(0, 5).map(p => p.id),
      });
    }
  }, undefined);

  // 23. Vendor listings live but priced at $0.
  await safe(async () => {
    const { data } = await admin
      .from('vendor_listings')
      .select('id, title, vendor_id, price_per_unit')
      .eq('status', 'live')
      .eq('price_per_unit', 0)
      .limit(50);
    if (data && data.length > 0) {
      findings.push({
        category:    'schema',
        severity:    'warning',
        message:     `${data.length} live vendor listing(s) have a $0 price. Titles: ${data.slice(0, 3).map((r: { title: string }) => r.title).join(', ')}. Buyers can add these to cart for free.`,
        count:       data.length,
        sample_ids:  data.slice(0, 5).map((r: { id: string }) => r.id),
      });
    }
  }, undefined);

  // ── Summary ─────────────────────────────────────────────────────────
  const by_severity = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    warning:  findings.filter((f) => f.severity === 'warning').length,
    info:     findings.filter((f) => f.severity === 'info').length,
  };
  const summary = findings.length === 0
    ? 'All checks passed. No anomalies detected.'
    : `${by_severity.critical} critical, ${by_severity.warning} warning, ${by_severity.info} info.`;

  return {
    generated_at: now.toISOString(),
    total:        findings.length,
    by_severity,
    findings,
    summary,
  };
}
