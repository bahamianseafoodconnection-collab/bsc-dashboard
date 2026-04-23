"use client";

import { useState } from "react";

type Item = {
  name: string;
  price: number;
  stock: number;
  min: number;
};

export default function POSPage() {
  const [items, setItems] = useState<Item[]>([
    { name: "Salmon 6oz", price: 10.5, stock: 36, min: 10 },
    { name: "Grouper Fillet", price: 12, stock: 27, min: 5 },
    { name: "Snapper Whole", price: 9.32, stock: 149, min: 10 },
    { name: "Snapper Fillet Portion 7oz", price: 8.2, stock: 50, min: 10 },
    { name: "Snapper Fillet Case 10lb", price: 139.5, stock: 8, min: 2 },
  ]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState("");
  const [sales, setSales] = useState<any[]>([]);

  const selectedItem = items[selectedIndex];

  // 🔥 RESET quantity when switching product (fix your bug)
  const handleSelectChange = (index: number) => {
    setSelectedIndex(index);
    setQty(1);
    setMessage("");
  };

  const handleSale = () => {
    const product = items[selectedIndex];
    const stockAfter = product.stock - qty;

    // 🔒 PROTECTION RULE (REAL FIX)
    if (stockAfter < product.min) {
      setMessage(`❌ Cannot sell. Must keep at least ${product.min} in stock`);
      return;
    }

    const updatedItems = [...items];
    updatedItems[selectedIndex] = {
      ...product,
      stock: stockAfter,
    };

    setItems(updatedItems);

    setSales([
      ...sales,
      {
        product: product.name,
        total: qty * product.price,
      },
    ]);

    setMessage("✅ Sale recorded");
    setQty(1);
  };

  return (
    <div>
      <h1>POS</h1>

      <div>
        <h2>New Sale</h2>

        <select
          value={selectedIndex}
          onChange={(e) => handleSelectChange(Number(e.target.value))}
        >
          {items.map((item, index) => (
            <option key={index} value={index}>
              {item.name} (${item.price}) ({item.stock})
            </option>
          ))}
        </select>

        <input
          type="number"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        />

        <button onClick={handleSale}>Record Sale</button>
      </div>

      <div>
        <h3>Sale Preview</h3>
        <p>Product: {selectedItem.name}</p>
        <p>Price: ${selectedItem.price}</p>
        <p>Qty: {qty}</p>
        <p>Total: ${qty * selectedItem.price}</p>
        <p>Stock After: {selectedItem.stock - qty}</p>
        <p>Protected Minimum: {selectedItem.min}</p>
      </div>

      <div>
        <h3>Status</h3>
        <p>{message}</p>
      </div>
    </div>
  );
}