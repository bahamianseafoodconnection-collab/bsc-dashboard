// File: lib/store.ts

export type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  minStock: number;
  category: string;
  supplierName: string;
  image: string;
  description: string;
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

export type SaleResult = {
  success: boolean;
  error?: string;
  message?: string;
};

// ── DEFAULT PRODUCT IMAGES (Unsplash CDN) ──
const IMAGES = {
  conch: 'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=400&q=80',
  grouper: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&q=80',
  snapper: 'https://images.unsplash.com/photo-1580476262798-bddd9f4b7369?w=400&q=80',
  salmon: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&q=80',
  tuna: 'https://images.unsplash.com/photo-1599084993091-1cb5c0721cc6?w=400&q=80',
  crab: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80',
  chicken: 'https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=400&q=80',
  pork: 'https://images.unsplash.com/photo-1432139509613-5c4255815697?w=400&q=80',
  beef: 'https://images.unsplash.com/photo-1558030006-450675393462?w=400&q=80',
  seafood: 'https://images.unsplash.com/photo-1534482421-64566f976cfa?w=400&q=80',
  mussel: 'https://images.unsplash.com/photo-1602524816894-f2a0b97da0f7?w=400&q=80',
  fish: 'https://images.unsplash.com/photo-1510130387422-82bed34b37e9?w=400&q=80',
};

// ── PRODUCTS ──
export const products: Product[] = [
  {
    id: 'p1', name: 'Bahamian Conch', price: 12.99, stock: 100, minStock: 10,
    category: 'seafood', supplierName: 'Spiny Tails Processing',
    image: IMAGES.conch,
    description: 'Fresh Bahamian conch, sustainably harvested from the clear waters of the Bahamas.',
  },
  {
    id: 'p2', name: 'Nassau Grouper', price: 18.99, stock: 20, minStock: 5,
    category: 'seafood', supplierName: 'Spiny Tails Processing',
    image: IMAGES.grouper,
    description: 'Premium Nassau grouper, wild-caught and fresh from local Bahamian waters.',
  },
  {
    id: 'p3', name: 'Lane Snapper', price: 14.99, stock: 40, minStock: 5,
    category: 'seafood', supplierName: 'Spiny Tails Processing',
    image: IMAGES.snapper,
    description: 'Fresh lane snapper, perfect for grilling or frying.',
  },
  {
    id: 'p4', name: 'Salmon 4oz', price: 8.99, stock: 50, minStock: 8,
    category: 'seafood', supplierName: 'Spiny Tails Processing',
    image: IMAGES.salmon,
    description: 'Premium Atlantic salmon fillet, 4oz portion, individually frozen.',
  },
  {
    id: 'p5', name: 'Salmon 6oz', price: 11.99, stock: 60, minStock: 8,
    category: 'seafood', supplierName: 'Spiny Tails Processing',
    image: IMAGES.salmon,
    description: 'Premium Atlantic salmon fillet, 6oz portion, individually frozen.',
  },
  {
    id: 'p6', name: 'Salmon 8oz', price: 14.99, stock: 30, minStock: 5,
    category: 'seafood', supplierName: 'Spiny Tails Processing',
    image: IMAGES.salmon,
    description: 'Premium Atlantic salmon fillet, 8oz portion, individually frozen.',
  },
  {
    id: 'p7', name: 'Yellowfin Tuna', price: 19.99, stock: 25, minStock: 5,
    category: 'seafood', supplierName: 'Spiny Tails Processing',
    image: IMAGES.tuna,
    description: 'Fresh yellowfin tuna, sashimi-grade quality.',
  },
  {
    id: 'p8', name: 'Snow Crab Pack (4x1.5lb)', price: 24.99, stock: 20, minStock: 3,
    category: 'seafood', supplierName: 'Spiny Tails Processing',
    image: IMAGES.crab,
    description: 'Premium snow crab clusters, 4 packs of 1.5lb each.',
  },
  {
    id: 'p9', name: 'Grouper Fillet 6/8oz', price: 16.99, stock: 18, minStock: 4,
    category: 'seafood', supplierName: 'Spiny Tails Processing',
    image: IMAGES.grouper,
    description: 'Fresh grouper fillet, 6-8oz portions, perfect for any recipe.',
  },
  {
    id: 'p10', name: 'Snapper Fillet 6/8oz', price: 15.99, stock: 15, minStock: 4,
    category: 'seafood', supplierName: 'Spiny Tails Processing',
    image: IMAGES.snapper,
    description: 'Fresh snapper fillet, 6-8oz portions, boneless and skin-on.',
  },
  {
    id: 'p11', name: 'Snapper Fingers (2lb bag)', price: 9.99, stock: 30, minStock: 5,
    category: 'seafood', supplierName: 'Spiny Tails Processing',
    image: IMAGES.snapper,
    description: 'Bite-sized snapper fingers, great for frying. 2lb bag.',
  },
  {
    id: 'p12', name: 'Black Mussel (10lb case)', price: 22.99, stock: 7, minStock: 2,
    category: 'seafood', supplierName: 'Spiny Tails Processing',
    image: IMAGES.mussel,
    description: 'Fresh black mussels, 10lb case. Perfect for seafood dishes.',
  },
  {
    id: 'p13', name: 'Swai Fillet (10lb case)', price: 18.99, stock: 6, minStock: 2,
    category: 'seafood', supplierName: 'Spiny Tails Processing',
    image: IMAGES.fish,
    description: 'Mild white fish fillets, 10lb case. Versatile and delicious.',
  },
  {
    id: 'p14', name: 'Chicken Leg Quarters', price: 6.99, stock: 80, minStock: 10,
    category: 'poultry', supplierName: 'Spiny Tails Processing',
    image: IMAGES.chicken,
    description: 'Fresh chicken leg quarters, great value for families.',
  },
  {
    id: 'p15', name: 'Chicken Wings', price: 8.99, stock: 70, minStock: 10,
    category: 'poultry', supplierName: 'Spiny Tails Processing',
    image: IMAGES.chicken,
    description: 'Fresh chicken wings, perfect for grilling or frying.',
  },
  {
    id: 'p16', name: 'Whole Chicken Griller', price: 12.99, stock: 40, minStock: 5,
    category: 'poultry', supplierName: 'Spiny Tails Processing',
    image: IMAGES.chicken,
    description: 'Whole fresh chicken, ideal for roasting or grilling.',
  },
  {
    id: 'p17', name: 'Pork Spareribs', price: 14.99, stock: 35, minStock: 5,
    category: 'meat', supplierName: 'Spiny Tails Processing',
    image: IMAGES.pork,
    description: 'Fresh pork spareribs, perfect for BBQ and slow cooking.',
  },
  {
    id: 'p18', name: 'Ribeye Steak', price: 29.99, stock: 8, minStock: 2,
    category: 'meat', supplierName: 'Spiny Tails Processing',
    image: IMAGES.beef,
    description: 'Premium ribeye steak, well-marbled and full of flavor.',
  },
  {
    id: 'p19', name: 'Breaded Crab Claws', price: 16.99, stock: 25, minStock: 4,
    category: 'seafood', supplierName: 'Spiny Tails Processing',
    image: IMAGES.crab,
    description: 'Crispy breaded crab claws, ready to fry. A Bahamian favorite.',
  },
];

// ── CUSTOMER STORAGE ──
const CUSTOMERS_KEY = 'bsc_customers';

function loadCustomers(): Customer[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOMERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistCustomers(customers: Customer[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers));
  } catch {}
}

export function saveCustomer(data: { name: string; phone: string; amountSpent?: number }): void {
  const customers = loadCustomers();
  const normalizedPhone = data.phone.replace(/\D/g, '');
  const normalizedName = data.name.trim().toLowerCase();

  const existingIdx = customers.findIndex(c =>
    c.phone.replace(/\D/g, '') === normalizedPhone ||
    c.name.trim().toLowerCase() === normalizedName
  );

  const now = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });

  if (existingIdx >= 0) {
    customers[existingIdx] = {
      ...customers[existingIdx],
      name: data.name,
      phone: data.phone,
      lastVisit: now,
      totalSpent: (customers[existingIdx].totalSpent || 0) + (data.amountSpent || 0),
      visitCount: (customers[existingIdx].visitCount || 0) + 1,
    };
  } else {
    customers.push({
      id: 'c_' + Date.now(),
      name: data.name,
      phone: data.phone,
      lastVisit: now,
      totalSpent: data.amountSpent || 0,
      visitCount: 1,
    });
  }
  persistCustomers(customers);
}

export function searchCustomers(query: string): Customer[] {
  if (!query || query.length < 2) return [];
  const customers = loadCustomers();
  const q = query.trim().toLowerCase();
  const qDigits = query.replace(/\D/g, '');
  return customers.filter(c => {
    const nameMatch = c.name.toLowerCase().includes(q);
    const phoneMatch = qDigits.length >= 3 && c.phone.replace(/\D/g, '').includes(qDigits);
    return nameMatch || phoneMatch;
  }).slice(0, 5);
}

export function getCustomerByName(name: string): Customer | null {
  const customers = loadCustomers();
  const q = name.trim().toLowerCase();
  return customers.find(c => c.name.trim().toLowerCase() === q) || null;
}

export function getCustomerByPhone(phone: string): Customer | null {
  const customers = loadCustomers();
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return customers.find(c => c.phone.replace(/\D/g, '').includes(digits)) || null;
}

export function getAllCustomers(): Customer[] {
  return loadCustomers().sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0));
}

// ── SALE ENGINE ──
export function completeSale(sale: Sale): SaleResult {
  for (const item of sale.items) {
    const product = products.find(p => p.id === item.productId);
    if (!product) {
      return { success: false, error: `Product not found: ${item.productName}`, message: `Product not found: ${item.productName}` };
    }
    if (product.stock - product.minStock < item.qty) {
      return { success: false, error: `Insufficient stock for ${item.productName}`, message: `Insufficient stock for ${item.productName}` };
    }
  }
  for (const item of sale.items) {
    const product = products.find(p => p.id === item.productId);
    if (product) product.stock -= item.qty;
  }
  return { success: true };
}
