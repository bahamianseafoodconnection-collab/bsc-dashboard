// Optional sanity-check. Run with: node scripts/pricing-sanity-check.js
// Validates the five-channel pricing math against real BSC scenarios.

const RULES = {
  wholesale_in_store: { markup: 22, vat: 10 },
  wholesale_online:   { markup: 19, vat: 10 },
  online_retail:      { markup: 35, vat: 10 },
  nassau_pos:         { markup: 40, vat: 10 },
  andros_pos:         { markup: 40, vat: 10 },
};
const WHOLESALE_MIN_LBS = 10;

function qualifies(qty, unit) {
  if (unit === 'case') return true;
  if (unit === 'lb' && qty >= WHOLESALE_MIN_LBS) return true;
  return false;
}
function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

function route(ch) {
  if (ch === 'nassau_pos' || ch === 'andros_pos') return 'wholesale_in_store';
  if (ch === 'online_retail')                     return 'wholesale_online';
  return ch;
}

function price(cost, channel, qty, unit) {
  let eff = channel, upgraded = false;
  if (qualifies(qty, unit) && channel !== 'wholesale_in_store' && channel !== 'wholesale_online') {
    eff      = route(channel);
    upgraded = eff !== channel;
  }
  const rule     = RULES[eff];
  const subtotal = r2(cost * (1 + rule.markup / 100));
  const vat      = r2(subtotal * (rule.vat / 100));
  const final    = r2(subtotal + vat);
  const margin   = r2(subtotal - cost);
  const marginPct = subtotal > 0 ? r2((subtotal - cost) / subtotal * 100) : 0;
  return { eff, upgraded, subtotal, vat, final, margin, marginPct, unitPrice: r2(final / qty) };
}

console.log('BSC NEW PRICING — sanity check\n' + '='.repeat(70));

const tests = [
  [ 6.38, 'nassau_pos',    2,  'lb',      'Conch 2 lbs @ Nassau POS (retail)'],
  [ 6.38, 'nassau_pos',    12, 'lb',      'Conch 12 lbs @ Nassau POS → in-store wholesale'],
  [ 6.38, 'andros_pos',    15, 'lb',      'Conch 15 lbs @ Andros POS → in-store wholesale'],
  [ 6.38, 'online_retail', 12, 'lb',      'Conch 12 lbs online → online wholesale'],
  [ 9.00, 'online_retail', 1,  'portion', 'Salmon 6oz portion online retail'],
  [ 9.00, 'online_retail', 5,  'lb',      'Salmon 5 lbs online (under threshold)'],
  [ 9.00, 'online_retail', 10, 'lb',      'Salmon 10 lbs online → online wholesale'],
  [22.00, 'nassau_pos',    1,  'each',    'Ribeye each @ Nassau POS'],
  [ 3.50, 'nassau_pos',    1,  'case',    '1 case @ Nassau POS → in-store wholesale'],
];

for (const [cost, ch, qty, unit, label] of tests) {
  const p    = price(cost, ch, qty, unit);
  const flag = p.upgraded ? ` ⟹ ${p.eff.toUpperCase()}` : '';
  console.log(`\n${label}`);
  console.log(`  cost=$${cost.toFixed(2)}/${unit}  qty=${qty}  requested=${ch}${flag}`);
  console.log(`  effective=${p.eff}  subtotal=$${p.subtotal}  VAT=$${p.vat}  FINAL=$${p.final}`);
  console.log(`  unit price=$${p.unitPrice}/${unit}  margin=$${p.margin} (${p.marginPct}% of revenue)`);
  console.log(`  Bill 5% payout on this line: $${r2(p.margin * 0.05)}`);
}
