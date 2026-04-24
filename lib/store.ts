// File: lib/store.ts

// --------------------
// TYPES
// --------------------

export type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  minStock: number;
  supplierName: string; // ✅ FIX ADDED
};

export type Customer = {
  name: string;
  phone: string;
};

export type SaleItem = {
  productId: string;
  productName: string;
  price: number;
  qty: number;
  supplierName: string;
};

export type Sale = {
  customerName: string;
  customerPhone: string;
  items: SaleItem[];
  total: number;
};

// --------------------
// PRODUCTS
// --------------------

export let products: Product[] = [
  {
    id: "salmon-6oz",
    name: "Salmon 6oz",
    price: 10.5,
    stock: 36,
    minStock: 10,
    supplierName: "Father & Sons Distribution",
  },
  {
    id: "grouper",
    name: "Grouper Fillet",
    price: 12,
    stock: 24,
    minStock: 5,
    supplierName: "Father & Sons Distribution",
  },
  {
    id: "snapper-whole",
    name: "Snapper Whole",
    price: 9.32,
    stock: 149,
    minStock: 20,
    supplierName: "Local Fishermen",
  },
  {
    id: "snapper-case",
    name: "Snapper Fillet Case 10lb",
    price: 139.5,
    stock: 8,
    minStock: 2,
    supplierName: "Tropic Seafood",
  },
];

// --------------------
// CUSTOMER STORAGE
// --------------------

let customers: Customer[] = [];

export function getCustomerByName(name: string): Customer | undefined {
  return customers.find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );
}

export function saveCustomer(customer: Customer) {
  const existing = getCustomerByName(customer.name);

  if (!existing) {
    customers.push(customer);
  } else {
    existing.phone = customer.phone;
  }
}

// --------------------
// SALES ENGINE
// --------------------

export function completeSale(sale: Sale): { success: boolean; message: string } {
  for (const item of sale.items) {
    const product = products.find((p) => p.id === item.productId);

    if (!product) {
      return {
        success: false,
        message: `Product not found: ${item.productName}`,
      };
    }

    const newStock = product.stock - item.qty;

    if (newStock < product.minStock) {
      return {
        success: false,
        message: `Cannot sell ${item.productName}. Must keep at least ${product.minStock} in stock.`,
      };
    }
  }

  // Deduct stock AFTER validation
  for (const item of sale.items) {
    const product = products.find((p) => p.id === item.productId)!;
    product.stock -= item.qty;
  }

  return {
    success: true,
    message: "Sale completed",
  };
}