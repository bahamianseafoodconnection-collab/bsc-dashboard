// File: lib/finance.ts

type Financials = {
  revenue: number;
  cogs: number;
  profit: number;
  bscShare: number;
  supplierShare: number;
};

let financials: Financials = {
  revenue: 0,
  cogs: 0,
  profit: 0,
  bscShare: 0,
  supplierShare: 0,
};

export function recordSaleFinancials(total: number) {
  const cogs = total * 0.93;
  const bsc = total * 0.07;

  financials.revenue += total;
  financials.cogs += cogs;
  financials.profit += total - cogs;
  financials.bscShare += bsc;
  financials.supplierShare += cogs;
}

export function getFinancials() {
  return financials;
}