export type CartItem = {
  name: string;
  price: number;
  qty: number;
};

export type Sale = {
  customerName: string;
  phone: string;
  items: CartItem[];
  total: number;
  date: string;
};

let sales: Sale[] = [];
let customers: { name: string; phone: string }[] = [];

export function addSale(sale: Sale) {
  sales.unshift(sale);

  // Save customer
  if (!customers.find((c) => c.phone === sale.phone)) {
    customers.push({
      name: sale.customerName,
      phone: sale.phone,
    });
  }
}

export function getSales() {
  return sales;
}

export function getCustomers() {
  return customers;
}

export function getTodayRevenue() {
  return sales.reduce((sum, s) => sum + s.total, 0);
}