// File: lib/finance.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
"https://auqjjrisivhfmpleusyt.supabase.co",
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg"
);

let revenue = 0;
let profit = 0;
let supplierOwed = 0;
let transactions = 0;

export async function recordSaleFinancials(amount: number): Promise<void> {
const bscShare = amount * 0.07;
const supplierShare = amount * 0.93;

revenue += amount;
profit += bscShare;
supplierOwed += supplierShare;
transactions += 1;

await supabase.from("financials").insert({
revenue: amount,
profit: bscShare,
supplier_owed: supplierShare,
transactions: 1,
});
}

export function getFinancialSummary() {
return {
revenue,
profit,
supplierOwed,
transactions,
};
}

export async function fetchFinancialsFromDB() {
const { data, error } = await supabase
.from("financials")
.select("*");

if (error || !data) return;

revenue = data.reduce((sum, row) => sum + Number(row.revenue), 0);
profit = data.reduce((sum, row) => sum + Number(row.profit), 0);
supplierOwed = data.reduce((sum, row) => sum + Number(row.supplier_owed), 0);
transactions = data.reduce((sum, row) => sum + Number(row.transactions), 0);
}

