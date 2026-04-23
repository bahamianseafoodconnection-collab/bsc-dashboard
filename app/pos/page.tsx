"use client";

import { useState } from "react";

type Product = {
  name: string;
  price: number;
  stock: number;
  min: number;
};

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([
    { name: "Snapper Fillet Case 10lb", price: 139.5, stock: 8, min: 2 },
    { name: "Salmon 6oz", price: 10.5, stock: 37, min: 10 },
    { name: "Grouper Fillet", price: 12, stock: 19, min: 10 },
    { name: "Snapper Whole", price: 9.32, stock: 149, min: 10 },
    { name: "Snapper Fillet Portion 7oz", price: 8.2, stock: 50, min: 10 },
  ]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState("");

  const product = products[selectedIndex];

  function handleSale() {
    const remaining = product.stock - qty;

    if (remaining < product.min) {
      setMessage(`❌ Must keep at least ${product.min} in stock`);
      return;
    }

    const updated = [...products];
    updated[selectedIndex].stock = remaining;
    setProducts(updated);

    setMessage("✅ Sale recorded");
  }

  return (
    <div>
      <h2>POS</h2>

      <div style={{ border: "1px solid #ddd", padding: 20, borderRadius: 10 }}>
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
          onChange={(e) => setQty(Number(e.target.value))}
          style={{ display: "block", marginTop: 10 }}
        />

        <button
          onClick={handleSale}
          style={{
            marginTop: 10,
            width: "100%",
            padding: 10,
            background: "#2f86c7",
            color: "white",
            border: "none",
            borderRadius: 5,
          }}
        >
          Record Sale
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        <h3>Sale Preview</h3>
        <p>Product: {product.name}</p>
        <p>Price: ${product.price}</p>
        <p>Qty: {qty}</p>
        <p>Total: ${product.price * qty}</p>
        <p>Stock After: {product.stock - qty}</p>
      </div>

      <div style={{ marginTop: 20 }}>
        <strong>{message}</strong>
      </div>
    </div>
  );
}