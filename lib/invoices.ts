// lib/invoices.ts
//
// Invoice persistence helpers. Backed by the `invoices` table in Supabase.
//
// Earlier versions of this file kept an in-memory `invoicesCache` so the
// invoice detail page could show a result instantly after redirect. The cache
// was module-scope state, which meant:
//   - on the server it was shared across requests and silently drifted
//   - on the client it was empty after every full page load, so the "cache hit"
//     never actually happened in practice
// The DB is fast enough; we just hit it every time now.

import { supabase } from "./supabase";

export type InvoiceItem = {
  productName: string;
  qty: number;
  price: number;
  total: number;
};

export type Invoice = {
  id: string;
  date: string;
  customerName: string;
  customerPhone: string;
  items: InvoiceItem[];
  total: number;
};

export type InvoiceInput = {
  customerName: string;
  customerPhone: string;
  items: {
    productName: string;
    qty: number;
    price: number;
    total?: number;
  }[];
  total: number;
};

function generateId(): string {
  return "INV-" + Date.now();
}

function rowToInvoice(row: Record<string, unknown>): Invoice {
  const rawItems = row.items;
  const items =
    typeof rawItems === "string"
      ? (JSON.parse(rawItems) as InvoiceItem[])
      : ((rawItems ?? []) as InvoiceItem[]);
  return {
    id: String(row.id ?? ""),
    date: String(row.date ?? ""),
    customerName: String(row.customer_name ?? ""),
    customerPhone: String(row.customer_phone ?? ""),
    items,
    total: Number(row.total ?? 0),
  };
}

export async function createInvoice(input: InvoiceInput): Promise<Invoice> {
  const invoice: Invoice = {
    id: generateId(),
    date: new Date().toLocaleString(),
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    items: input.items.map((item) => ({
      productName: item.productName,
      qty: item.qty,
      price: item.price,
      total: item.total ?? item.qty * item.price,
    })),
    total: input.total,
  };

  const { error } = await supabase.from("invoices").insert({
    id: invoice.id,
    date: invoice.date,
    customer_name: invoice.customerName,
    customer_phone: invoice.customerPhone,
    items: JSON.stringify(invoice.items),
    total: invoice.total,
  });
  if (error) throw error;

  return invoice;
}

export async function fetchInvoicesFromDB(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row) => rowToInvoice(row as Record<string, unknown>));
}

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return rowToInvoice(data as Record<string, unknown>);
}
