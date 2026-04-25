// File: lib/store.ts

export type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  minStock: number;
  category: string;
  supplierName: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  lastVisit: string;
  totalSpent: number;
  visitCount: number;
};

export type SaleItem = {
  productId: string;
  productName: string;
  price: number;
  qty: number;
  supplierName?: string;
};

export type Sale = {
  customerName: string;
  customerPhone: string;
  items: SaleItem[];
  total: number;
};

// ── PRODUCTS ──
export const products: Product[] = [
  { id: 'p1', name: 'Bahamian Conch', price: 12.99, stock: 100, minStock: 10, category: 'seafood', supplierName: 'Spiny Tails Processing' },
  { id: 'p2', name: 'Nassau Grouper', price: 18.99, stock: 20, minStock: 5, category: 'seafood', supplierName: 'Spiny Tails Processing' },
  { id: 'p3', name: 'Lane Snapper', price: 14.99, stock: 40, minStock: 5, category: 'seafood', supplierName: 'Spiny Tails Processing' },
  { id: 'p4', name: 'Salmon 4oz', price: 8.99, stock: 50, minStock: 8, category: 'seafood', supplierName: 'Spiny Tails Processing' },
  { id: 'p5', name: 'Salmon 6oz', price: 11.99, stock: 60, minStock: 8, category: 'seafood', supplierName: 'Spiny Tails Processing' },
  { id: 'p6', name: 'Salmon 8oz', price: 14.99, stock: 30, minStock: 5, category: 'seafood', supplierName: 'Spiny Tails Processing' },
  { id: 'p7', name: 'Yellowfin Tuna', price: 19.99, stock: 25, minStock: 5, category: 'seafood', supplierName: 'Spiny Tails Processing' },
  { id: 'p8', name: 'Snow Crab Pack (4x1.5lb)', price: 24.99, stock: 20, minStock: 3, category: 'seafood', supplierName: 'Spiny Tails Processing' },
  { id: 'p9', name: 'Grouper Fillet 6/8oz', price: 16.99, stock: 18, minStock: 4, category: 'seafood', supplierName: 'Spiny Tails Processing' },
  { id: 'p10', name: 'Snapper Fillet 6/8oz', price: 15.99, stock: 15, minStock: 4, category: 'seafood', supplierName: 'Spiny Tails Processing' },
  { id: 'p11', name: 'Snapper Fingers (2lb bag)', price: 9.99, stock: 30, minStock: 5, category: 'seafood', supplierName: 'Spiny Tails Processing' },
  { id: 'p12', name: 'Black Mussel (10lb case)', price: 22.99, stock: 7, minStock: 2, category: 'seafood', supplierName: 'Spiny Tails Processing' },
  { id: 'p13', name: 'Swai Fillet (10lb case)', price: 18.99, stock: 6, minStock: 2, category: 'seafood', supplierName: 'Spiny Tails Processing' },
  { id: 'p14', name: 'Chicken Leg Quarters', price: 6.99, stock: 80, minStock: 10, category: 'poultry', supplierName: 'Spiny Tails Processing' },
  { id: 'p15', name: 'Chicken Wings', price: 8.99, stock: 70, minStock: 10, category: 'poultry', supplierName: 'Spiny Tails Processing' },
  { id: 'p16', name: 'Whole Chicken Griller', price: 12.99, stock: 40, minStock: 5, category: 'poultry', supplierName: 'Spiny Tails Processing' },
  { id: 'p17', name: 'Pork Spareribs', price: 14.99, stock: 35, minStock: 5, category: 'meat', supplierName: 'Spiny Tails Processing' },
  { id: 'p18', name: 'Ribeye Steak', price: 29.99, stock: 8, minStock: 2, category: 'meat', supplierName: 'Spiny Tails Processing' },
  { id: 'p19', name: 'Breaded Crab Claws', price: 16.99, stock: 25, minStock: 4, category: 'seafood', supplierName: 'Spiny Tails Processing' },
];

// ── CUSTOMER STORAGE (localStorage) ──
const CUSTOMERS_KEY = 'bsc_customers';

function loadCustomers(): Customer[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOMERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomers(customers: Customer[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
  } catch {}
}

// Save or update a customer
export function saveCustomer(data: { name: string; phone: string; amountSpent?: number }) {
  const customers = loadCustomers();
  const normalizedPhone = data.phone.replace(/\D/g, '');
  const normalizedName = data.name.trim().toLowerCase();

  const existingIdx = customers.findIndex(c =>
    c.phone.replace(/\D/g, '') === normalizedPhone ||
    c.name.trim().toLowerCase() === normalizedName
  );

  const now = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });

  if (existingIdx >= 0) {
    // Update existing
    customers[existingIdx] = {
      ...customers[existingIdx],
      name: data.name, // update name in case corrected
      phone: data.phone, // update phone in case corrected
      lastVisit: now,
      totalSpent: (customers[existingIdx].totalSpent || 0) + (data.amountSpent || 0),
      visitCount: (customers[existingIdx].visitCount || 0) + 1,
    };
  } else {
    // New customer
    customers.push({
      id: 'c_' + Date.now(),
      name: data.name,
      phone: data.phone,
      lastVisit: now,
      totalSpent: data.amountSpent || 0,
      visitCount: 1,
    });
  }

  saveCustomers(customers);
}

// Search customers by name OR phone
export function searchCustomers(query: string): Customer[] {
  if (!query || query.length < 2) return [];
  const customers = loadCustomers();
  const q = query.trim().toLowerCase();
  const qDigits = query.replace(/\D/g, '');

  return customers.filter(c => {
    const nameMatch = c.name.toLowerCase().includes(q);
    const phoneMatch = qDigits.length >= 3 &&
      c.phone.replace(/\D/g, '').includes(qDigits);
    return nameMatch || phoneMatch;
  }).slice(0, 5); // max 5 suggestions
}

// Get customer by exact name (legacy)
export function getCustomerByName(name: string): Customer | null {
  const customers = loadCustomers();
  const q = name.trim().toLowerCase();
  return customers.find(c => c.name.trim().toLowerCase() === q) || null;
}

// Get customer by phone
export function getCustomerByPhone(phone: string): Customer | null {
  const customers = loadCustomers();
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return customers.find(c => c.phone.replace(/\D/g, '').includes(digits)) || null;
}

// Get all customers
export function getAllCustomers(): Customer[] {
  return loadCustomers().sort((a, b) =>
    (b.visitCount || 0) - (a.visitCount || 0)
  );
}

// ── SALE ENGINE ──
export function completeSale(sale: Sale): { success: boolean; error?: string } {
  // Verify stock
  for (const item of sale.items) {
    const product = products.find(p => p.id === item.productId);
    if (!product) return { success: false, error: `Product not found: ${item.productName}` };
    if (product.stock - product.minStock < item.qty) {
      return { success: false, error: `Insufficient stock for ${item.productName}` };
    }
  }
  // Deduct stock
  for (const item of sale.items) {
    const product = products.find(p => p.id === item.productId);
    if (product) product.stock -= item.qty;
  }
  return { success: true };
}
