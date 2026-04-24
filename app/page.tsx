"use client";

import { useState } from "react";

type Product = {
  name: string;
  price: number;
  stock: number;
  min: number;
};

type CartItem = {
  name: string;
  price: number;
  qty: number;
};

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([
    { name: "Salmon 6oz", price: 10.5, stock: 36, min: 10 },
    { name: "Grouper Fillet", price: 12, stock: 24, min: 5 },
    { name: "Snapper Whole", price: 9.32, stock: 149, min: 20 },
  ]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [status, setStatus] = useState("");

  const selectedProduct = products[selectedIndex];

  const addToCart = () => {
    if (!selectedProduct) return;

    setCart((prev) => {
      const existing = prev.find((item) => item.name === selectedProduct.name);

      if (existing) {
        return prev.map((item) =>
          item.name === selectedProduct.name
            ? { ...item, qty: item.qty + qty }
            : item
        );
      }

      return [...prev, { name: selectedProduct.name, price: selectedProduct.price, qty }];
    });

    setStatus(`Added ${selectedProduct.name} to cart`);
    setQty(1);
  };

  const removeItem = (name: string) => {
    setCart(cart.filter((item) => item.name !== name));
  };

  const total = cart.reduce((sum, item) => sum + item.qty * item.price, 0);

  const completeSale = () => {
    if (!customerName || !customerPhone) {
      setStatus("❌ Customer name and WhatsApp phone required before completing sale.");
      return;
    }

    // INVENTORY CHECK
    for (let item of cart) {
      const product = products.find((p) => p.name === item.name);
      if (!product) continue;

      const remaining = product.stock - item.qty;
      if (remaining < product.min) {
        setStatus(`❌ Cannot sell ${item.name}. Must keep at least ${product.min} in stock.`);
        return;
      }
    }

    // APPLY SALE
    const updatedProducts = products.map((product) => {
      const cartItem = cart.find((item) => item.name === product.name);
      if (!cartItem) return product;

      return {
        ...product,
        stock: product.stock - cartItem.qty,
      };
    });

    setProducts(updatedProducts);

    // RESET SYSTEM (IMPORTANT FIX)
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setQty(1);

    setStatus("✅ Sale completed and customer saved");
  };

  return (
    <div>
      <h2>POS</h2>

      <h3>New Sale</h3>

      <select
        value={selectedIndex}
        onChange={(e) => setSelectedIndex(Number(e.target.value))}
      >
        {products.map((p, i) => (
          <option key={i} value={i}>
            {p.name} (${p.price}) ({p.stock})
          </option>
        ))}
      </select>

      <input
        type="number"
        value={qty}
        min={1}
        onChange={(e) => setQty(Number(e.target.value))}
      />

      <button onClick={addToCart}>Add to Cart</button>

      <h4>Preview</h4>
      <p>Product: {selectedProduct.name}</p>
      <p>Price: ${selectedProduct.price}</p>
      <p>Qty: {qty}</p>
      <p>Stock After If Added: {selectedProduct.stock - qty}</p>
      <p>Protected Minimum: {selectedProduct.min}</p>

      <h3>Customer Info</h3>
      <input
        placeholder="Customer Name"
        value={customerName}
        onChange={(e) => setCustomerName(e.target.value)}
      />
      <input
        placeholder="Customer phone / WhatsApp"
        value={customerPhone}
        onChange={(e) => setCustomerPhone(e.target.value)}
      />

      <h3>Cart</h3>
      {cart.map((item, i) => (
        <div key={i}>
          <strong>{item.name}</strong>
          <p>Qty: {item.qty} × ${item.price}</p>
          <p>Total: ${(item.qty * item.price).toFixed(2)}</p>
          <button onClick={() => removeItem(item.name)}>Remove</button>
        </div>
      ))}

      <h4>Total: ${total.toFixed(2)}</h4>

      <button onClick={completeSale}>Complete Sale</button>
      <button onClick={() => setCart([])}>Clear Cart</button>

      <h4>Status</h4>
      <p>{status}</p>
    </div>
  );
}