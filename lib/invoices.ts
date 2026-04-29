// File: lib/invoices.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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

// In-memory cache so invoice page works immediately after redirect
export let invoicesCache: Invoice[] = [];

function generateId(): string {
  return "INV-" + Date.now();
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

  // Add to memory cache immediately
  invoicesCache.push(invoice);

  // Save to Supabase
  await supabase.from("invoices").insert({
    id: invoice.id,
    date: invoice.date,
    customer_name: invoice.customerName,
    customer_phone: invoice.customerPhone,
    items: JSON.stringify(invoice.items),
    total: invoice.total,
  });

  return invoice;
}

export async function fetchInvoicesFromDB(): Promise<Invoice[]> {
  const { data } = await supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false });

  if (!data) return [];

  const invoices: Invoice[] = data.map((row) => ({
    id: row.id,
    date: row.date,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    items:
      typeof row.items === "string" ? JSON.parse(row.items) : row.items,
    total: row.total,
  }));

  invoicesCache = invoices;
  return invoices;
}
