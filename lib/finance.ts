// File: lib/finance.ts

let revenue = 0;
let profit = 0;
let supplierOwed = 0;
let transactions = 0;

export function recordSaleFinancials(amount: number) {
  revenue += amount;

  const bscShare = amount * 0.07;
  const supplierShare = amount * 0.93;

  profit += bscShare;
  supplierOwed += supplierShare;
  transactions += 1;
}

export function getFinancialSummary() {
  return {
    revenue,
    profit,
    supplierOwed,
    transactions,
  };
}