"use client";

import { useState } from "react";

type Product = {
  name: string;
  price: number;
  stock: number;
};

const MIN_CASE = 2;
const MIN_UNIT = 10;

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([
    { name: "Snapper Fillet Portion 7oz", price: 8.2, stock: 50 },
    { name: "Grouper Fillet", price: 12, stock: 27 },
    { name: "Salmon6oz", price: 10.5, stock: 38 },
    { name: "Snapper Fillet case 10lb", price: 139.5, stock: 8 },
    { name: "Snapper Whole", price: 9.32, stock: 164 },
  ]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState("");

  const selectedProduct = products[selectedIndex];

  const stockAfter = selectedProduct.stock - quantity;

  // 🔐 INVENTORY PROTECTION RULE
  const violatesRule =
    stockAfter < MIN_UNIT || stockAfter < MIN_CASE;

  const handleSale = () => {
    // ⚠️ Large sale warning
    if (quantity >= 20) {
      const confirmLarge = confirm("Large sale detected. Continue?");
      if (!confirmLarge) return;
    }

    // 🔴 BLOCK if rule broken
    if (violatesRule) {
      setMessage(
        `❌ Cannot sell. Must keep at least ${MIN_UNIT} units or ${MIN_CASE} cases in stock.`
      );
      return;
    }

    // ✅ Process sale
    const updated = [...products];
    updated[selectedIndex].stock -= quantity;
    setProducts(updated);

    setMessage("✅ Sale recorded");
    setQuantity(1);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>BSC CONTROL</h1>

      <h2>POS</h2>

      {/* PRODUCT SELECT */}
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

      {/* QUANTITY INPUT */}
      <input
        type="number"
        value={quantity}
        onChange={(e) => setQuantity(Number(e.target.value))}
        style={{ marginLeft: 10 }}
      />

      <button onClick={handleSale} style={{ marginLeft: 10 }}>
        Record Sale
      </button>

      {/* PREVIEW */}
      <h3>Sale Preview</h3>
      <p>Product: {selectedProduct.name}</p>
      <p>Unit Price: ${selectedProduct.price}</p>
      <p>Quantity: {quantity}</p>
      <p>Total: ${(selectedProduct.price * quantity).toFixed(2)}</p>
      <p>Stock After: {stockAfter}</p>

      {/* WARNING */}
      {violatesRule && (
        <p style={{ color: "orange" }}>
          ⚠️ This sale will break minimum stock rule
        </p>
      )}

      {/* STATUS */}
      <h3>POS Summary</h3>
      <p>{message}</p>

      {/* INVENTORY */}
      <h3>Inventory</h3>
      {products.map((p, i) => (
        <p key={i}>
          {p.name}: {p.stock}
        </p>
      ))}
    </div>
  );
}