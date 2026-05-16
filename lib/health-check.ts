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
  wholesale:       0.12,
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
