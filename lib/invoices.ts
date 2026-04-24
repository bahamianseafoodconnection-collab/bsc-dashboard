// File: lib/invoices.ts

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

let invoices: Invoice[] = [];

function generateInvoiceId() {
  return "INV-" + Date.now();
}

export function createInvoice(sale: Sale): Invoice {
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

  invoices.push(invoice);

  return invoice;
}

export function getInvoices() {
  return invoices;
}