"use client";

import { useState } from "react";

type Product = {
  id: number;
  name: string;
  price: number;
  stock: number;
  min: number;
};

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([
    { id: 1, name: "Salmon 6oz", price: 10.5, stock: 36, min: 10 },
    { id: 2, name: "Grouper Fillet", price: 12, stock: 24, min: 5 },
    { id: 3, name: "Snapper Whole", price: 9.32, stock: 149, min: 20 },
    { id: 4, name: "Snapper Case 10lb", price: 139.5, stock: 8, min: 2 },
  ]);

  const [cart, setCart] = useState<any[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [status, setStatus] = useState("");

  const addToCart = (product: Product) => {
    const existing = cart.find(item => item.id === product.id);

    const newQty = existing ? existing.quantity + 1 : 1;
    const stockAfter = product.stock - newQty;

    if (stockAfter < product.min) {
      setStatus(`❌ Must keep at least ${product.min} in stock`);
      return;
    }

    if (existing) {
      setCart(cart.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }

    setStatus(`✔ Added ${product.name}`);
  };

  const removeItem = (id: number) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const completeSale = () => {
    if (!customerName || !customerPhone) {
      setStatus("❌ Customer info required");
      return;
    }

    const updatedProducts = products.map(product => {
      const item = cart.find(c => c.id === product.id);
      if (!item) return product;

      return {
        ...product,
        stock: product.stock - item.quantity,
      };
    });

    setProducts(updatedProducts);
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");

    setStatus("✅ Sale completed and customer saved");

    setTimeout(() => setStatus(""), 2000);
  };

  const total = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return (
    <div style={{ padding: 16 }}>

      <h2>POS Entry</h2>

      {/* 🔥 QUICK ADD GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {products.map(p => (
          <div
            key={p.id}
            onClick={() => addToCart(p)}
            style={{
              border: "1px solid #ccc",
              padding: 10,
              borderRadius: 8,
              cursor: "pointer",
              background: "#f9f9f9"
            }}
          >
            <strong>{p.name}</strong>
            <div>${p.price}</div>
            <div>{p.stock} avail</div>
          </div>
        ))}
      </div>

      {/* CUSTOMER INFO */}
      <h3>Customer Info</h3>

      <input
        placeholder="Customer Name"
        value={customerName}
        onChange={(e) => setCustomerName(e.target.value)}
      />

      <input
        placeholder="Phone / WhatsApp"
        value={customerPhone}
        onChange={(e) => setCustomerPhone(e.target.value)}
      />

      {/* CART */}
      <h3>Cart</h3>

      {cart.map(item => (
        <div key={item.id}>
          <strong>{item.name}</strong>
          <p>Qty: {item.quantity} × ${item.price}</p>
          <p>Total: ${(item.quantity * item.price).toFixed(2)}</p>
          <button onClick={() => removeItem(item.id)}>Remove</button>
        </div>
      ))}

      <h3>Total: ${total.toFixed(2)}</h3>

      <button onClick={completeSale}>Complete Sale</button>
      <button onClick={() => setCart([])}>Clear Cart</button>

      <h3>Status</h3>
      <p>{status}</p>

    </div>
  );
}