// File: lib/store.ts

export type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  minStock: number;
};

export const products: Product[] = [
  {
    id: "salmon-6oz",
    name: "Salmon 6oz",
    price: 10.5,
    stock: 36,
    minStock: 10,
  },
  {
    id: "grouper",
    name: "Grouper Fillet",
    price: 12,
    stock: 24,
    minStock: 5,
  },
  {
    id: "snapper-whole",
    name: "Snapper Whole",
    price: 9.32,
    stock: 149,
    minStock: 20,
  },
  {
    id: "snapper-case",
    name: "Snapper Fillet Case 10lb",
    price: 139.5,
    stock: 8,
    minStock: 2,
  },
];