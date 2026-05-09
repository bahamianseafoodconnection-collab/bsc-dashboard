// Unit tests for lib/finance.ts — the SACRED PRICING RULES.
// If any of these break, profit numbers across BSC are wrong.

import { describe, expect, it } from 'vitest';
import {
  CHANNEL_MARGIN,
  VAT_RATE,
  sellPriceFromCost,
  splitSale,
  type PricingChannel,
} from '@/lib/finance';

const STANDARD_GOODS_CHANNELS: PricingChannel[] = [
  'nassau_pos',
  'andros_pos',
  'online_market',
  'local_wholesale',
  'us_resale',
];

const ALL_CHANNELS: PricingChannel[] = [
  ...STANDARD_GOODS_CHANNELS,
  'bill_payments',
  'bill_casale',
];

// Floating-point compare with explicit tolerance.
function near(a: number, b: number, eps = 1e-9): void {
  expect(Math.abs(a - b)).toBeLessThan(eps);
}

describe('CHANNEL_MARGIN — sacred values', () => {
  it('matches the published sacred margins exactly', () => {
    expect(CHANNEL_MARGIN.nassau_pos).toBe(0.38);
    expect(CHANNEL_MARGIN.andros_pos).toBe(0.43);
    expect(CHANNEL_MARGIN.online_market).toBe(0.25);
    expect(CHANNEL_MARGIN.local_wholesale).toBe(0.12);
    expect(CHANNEL_MARGIN.us_resale).toBe(0.12);
    expect(CHANNEL_MARGIN.bill_payments).toBe(0.045);
    expect(CHANNEL_MARGIN.bill_casale).toBe(0.05);
  });

  it('VAT_RATE is 10%', () => {
    expect(VAT_RATE).toBe(0.1);
  });

  it('Bill Casale margin is exactly 5% — sacred, never lower', () => {
    // Specifically asserted because Dedrick's commitment to Bill is locked at
    // 5%. If a future refactor accidentally moves it, this test catches it.
    expect(CHANNEL_MARGIN.bill_casale).toBe(0.05);
    expect(CHANNEL_MARGIN.bill_casale).toBeGreaterThanOrEqual(0.05);
  });
});

describe('sellPriceFromCost — standard goods (margin × VAT)', () => {
  it.each(STANDARD_GOODS_CHANNELS)(
    '%s: sell = cost × (1 + margin) × (1 + VAT)',
    (channel) => {
      const cost = 100;
      const expected = cost * (1 + CHANNEL_MARGIN[channel]) * (1 + VAT_RATE);
      near(sellPriceFromCost(cost, channel), expected);
    }
  );

  it('Nassau POS: $100 cost → $151.80 sell', () => {
    near(sellPriceFromCost(100, 'nassau_pos'), 151.8);
  });

  it('Andros POS: $100 cost → $157.30 sell', () => {
    near(sellPriceFromCost(100, 'andros_pos'), 157.3);
  });

  it('Online Market: $100 cost → $137.50 sell', () => {
    near(sellPriceFromCost(100, 'online_market'), 137.5);
  });

  it('Wholesale: $100 cost → $123.20 sell', () => {
    near(sellPriceFromCost(100, 'local_wholesale'), 123.2);
  });

  it('zero cost yields zero sell price (any standard channel)', () => {
    for (const ch of STANDARD_GOODS_CHANNELS) {
      expect(sellPriceFromCost(0, ch)).toBe(0);
    }
  });
});

describe('sellPriceFromCost — special channels', () => {
  it('Bill Casale: 5% gross profit, no VAT', () => {
    near(sellPriceFromCost(100, 'bill_casale'), 105);
    near(sellPriceFromCost(20, 'bill_casale'), 21);
    near(sellPriceFromCost(0, 'bill_casale'), 0);
  });

  it('Bill Payments: cost × 1.045 + $6 service fee, no VAT', () => {
    near(sellPriceFromCost(100, 'bill_payments'), 100 * 1.045 + 6); // 110.50
    near(sellPriceFromCost(50, 'bill_payments'), 50 * 1.045 + 6); // 58.25
  });

  it('Bill Payments service fee applies even at zero cost', () => {
    // Customer always pays the $6 even on a $0 base — service fee is the floor.
    expect(sellPriceFromCost(0, 'bill_payments')).toBe(6);
  });
});

describe('splitSale — invariants for VAT channels', () => {
  it.each(STANDARD_GOODS_CHANNELS)(
    '%s: revenue = cost_basis + bsc_profit + vat_collected (within rounding)',
    (channel) => {
      const sale = 1000;
      const cost = 700;
      const split = splitSale(sale, cost, channel);
      near(split.cost_basis + split.bsc_profit + split.vat_collected, sale, 1e-9);
      expect(split.revenue).toBe(sale);
      expect(split.cost_basis).toBe(cost);
      expect(split.channel).toBe(channel);
    }
  );

  it('vat_collected = saleAmount × (VAT / (1 + VAT))', () => {
    const sale = 110;
    const split = splitSale(sale, 80, 'nassau_pos');
    // 110 * 0.10 / 1.10 = 10
    near(split.vat_collected, 10);
  });

  it('Nassau POS round-trip: cost → sell → split recovers cost & yields exact margin profit', () => {
    const cost = 250;
    const sell = sellPriceFromCost(cost, 'nassau_pos');
    const split = splitSale(sell, cost, 'nassau_pos');
    near(split.cost_basis, cost);
    // BSC profit on a properly-priced item = cost × margin (excl VAT)
    near(split.bsc_profit, cost * CHANNEL_MARGIN.nassau_pos);
  });

  it('Andros POS round-trip: $100 cost → $157.30 sell → split recovers $43 profit', () => {
    const sell = sellPriceFromCost(100, 'andros_pos');
    const split = splitSale(sell, 100, 'andros_pos');
    near(split.bsc_profit, 43);
    near(split.vat_collected, 14.3);
    near(split.cost_basis + split.bsc_profit + split.vat_collected, sell);
  });
});

describe('splitSale — special channels', () => {
  it('Bill Casale: vat_collected is 0', () => {
    const split = splitSale(105, 100, 'bill_casale');
    expect(split.vat_collected).toBe(0);
    near(split.bsc_profit, 5);
    expect(split.revenue).toBe(105);
    expect(split.cost_basis).toBe(100);
  });

  it('Bill Payments: vat_collected is 0', () => {
    const split = splitSale(110.5, 100, 'bill_payments');
    expect(split.vat_collected).toBe(0);
    near(split.bsc_profit, 10.5);
  });

  it('Bill Casale round-trip yields exactly 5% on cost', () => {
    const cost = 1000;
    const sell = sellPriceFromCost(cost, 'bill_casale');
    const split = splitSale(sell, cost, 'bill_casale');
    near(split.bsc_profit, cost * 0.05);
    near(split.bsc_profit, 50);
  });
});

describe('splitSale — historical bug regression', () => {
  it('Andros: subtotal × 0.43 (the OLD wrong formula) overstates profit by ~43%', () => {
    // The previous code did `bscProfit = subtotal * 0.43` which applied the
    // margin rate to the SELL price instead of the cost basis. This test
    // documents the bug so future refactors can't reintroduce it.
    const sale = 1573; // $1000 cost @ 43% margin + 10% VAT = $1573
    const oldWrongProfit = sale * 0.43;
    const correctProfit = splitSale(sale, sale / 1.573, 'andros_pos').bsc_profit;

    expect(oldWrongProfit).toBeCloseTo(676.39, 2);
    expect(correctProfit).toBeCloseTo(430.0, 1);
    // The old formula overstated profit by ~57% on Andros sales.
    expect(oldWrongProfit / correctProfit).toBeGreaterThan(1.5);
  });

  it('Nassau: subtotal − costTotal (the OLD wrong formula) overstates profit by the 10% VAT', () => {
    const cost = 100;
    const sale = sellPriceFromCost(cost, 'nassau_pos'); // 151.80
    const oldWrongProfit = sale - cost; // 51.80 — counts VAT as profit
    const correctProfit = splitSale(sale, cost, 'nassau_pos').bsc_profit;

    near(oldWrongProfit, 51.8);
    near(correctProfit, 38);
    // VAT inflates the old number by ~36% relative to actual BSC profit.
    expect(oldWrongProfit - correctProfit).toBeCloseTo(13.8, 2);
  });
});

describe('splitSale — edge cases', () => {
  it('zero sale yields zero everything', () => {
    for (const ch of ALL_CHANNELS) {
      const split = splitSale(0, 0, ch);
      expect(split.revenue).toBe(0);
      expect(split.cost_basis).toBe(0);
      expect(split.bsc_profit).toBe(0);
      expect(split.vat_collected).toBe(0);
    }
  });

  it('underpriced sale (cost > revenue) returns negative bsc_profit so callers can warn', () => {
    // recordSaleFinancials clamps profit at 0 before insert (DB constraint),
    // but splitSale itself returns the raw negative so the caller can detect
    // and surface the issue.
    const split = splitSale(100, 110, 'nassau_pos');
    expect(split.bsc_profit).toBeLessThan(0);
  });

  it('channel field on returned split matches input', () => {
    for (const ch of ALL_CHANNELS) {
      expect(splitSale(100, 50, ch).channel).toBe(ch);
    }
  });
});
