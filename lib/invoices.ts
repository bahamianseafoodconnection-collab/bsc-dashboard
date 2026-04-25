// File: lib/invoices.ts
import { supabase } from "./supabase";
import { Sale } from "./store";

export type Invoice = {
  id: string;
  date: string;
  customerName: string;
  customerPhone: string;
  items: {
    productName: string;
    qty: number;
    price: number;
    total: number;
  }[];
  total: number;
};

// In-memory cache so invoice page works immediately after redirect
let invoicesCache: Invoice[] = [];

function generateInvoiceId() {
  return "INV-" + Date.now();
}

export async function createInvoice(sale: Sale): Promise<Invoice> {
  const invoice: Invoice = {
    id: generateInvoiceId(),
    date: new Date().toLocaleString(),
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    items: sale.items.map((item) => ({
      productName: item.productName,
      qty: item.qty,
      price: item.price,
      total: item.qty * item.price,
    })),
    total: sale.total,
  };

  // Save to memory cache immediately
  invoicesCache.push(invoice);

  // Save to Supabase in background
  await supabase.from("invoices").insert({
    id: invoice.id,
    date: invoice.date,
    customer_name: invoice.customerName,
    customer_phone: invoice.customerPhone,
    items: invoice.items,
    total: invoice.total,
  });

  return invoice;
}

export function getInvoices(): Invoice[] {
  return invoicesCache;
}

export async function fetchInvoicesFromDB(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  const invoices: Invoice[] = data.map((row) => ({
    id: row.id,
    date: row.date,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    items: row.items,
    total: row.total,
  }));

  invoicesCache = invoices;
  return invoices;
}
