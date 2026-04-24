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

type Sale = {
  customerName: string;
  phone: string;
  items: CartItem[];
  total: number;
  date: string;
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
  const [sales, setSales] = useState<Sale[]>([]);
  const [status, setStatus] = useState("");

  const selectedProduct = products[selectedIndex];

  const addToCart = () => {
    setCart((prev) => {
      const existing = prev.find((i) => i.name === selectedProduct.name);

      if (existing) {
        return prev.map((i) =>
          i.name === selectedProduct.name
            ? { ...i, qty: i.qty + qty }
            : i
        );
      }

      return [...prev, { name: selectedProduct.name, price: selectedProduct.price, qty }];
    });

    setStatus(`Added ${selectedProduct.name} to cart`);
    setQty(1);
  };

  const removeItem = (name: string) => {
    setCart(cart.filter((i) => i.name !== name));
  };

  const total = cart.reduce((sum, i) => sum + i.qty * i.price, 0);

  const completeSale = () => {
    if (!customerName || !customerPhone) {
      setStatus("❌ Customer name and WhatsApp required");
      return;
    }

    // CHECK INVENTORY
    for (let item of cart) {
      const product = products.find((p) => p.name === item.name);
      if (!product) continue;

      if (product.stock - item.qty < product.min) {
        setStatus(`❌ Cannot sell ${item.name} below minimum stock`);
        return;
      }
    }

    // UPDATE INVENTORY
    const updatedProducts = products.map((p) => {
      const item = cart.find((i) => i.name === p.name);
      if (!item) return p;

      return {
        ...p,
        stock: p.stock - item.qty,
      };
    });

    setProducts(updatedProducts);

    // SAVE SALE (NEW)
    const newSale: Sale = {
      customerName,
      phone: customerPhone,
      items: cart,
      total,
      date: new Date().toLocaleString(),
    };

    setSales((prev) => [newSale, ...prev]);

    // RESET
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setQty(1);

    setStatus("✅ Sale completed and saved");
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
        onChange={(e) => setQty(Number(e.target.value))}
      />

      <button onClick={addToCart}>Add to Cart</button>

      <h3>Customer Info</h3>
      <input
        placeholder="Customer Name"
        value={customerName}
        onChange={(e) => setCustomerName(e.target.value)}
      />
      <input
        placeholder="WhatsApp Phone"
        value={customerPhone}
        onChange={(e) => setCustomerPhone(e.target.value)}
      />

      <h3>Cart</h3>
      {cart.map((i, idx) => (
        <div key={idx}>
          <strong>{i.name}</strong>
          <p>{i.qty} × ${i.price}</p>
          <p>Total: ${(i.qty * i.price).toFixed(2)}</p>
          <button onClick={() => removeItem(i.name)}>Remove</button>
        </div>
      ))}

      <h4>Total: ${total.toFixed(2)}</h4>

      <button onClick={completeSale}>Complete Sale</button>
      <button onClick={() => setCart([])}>Clear Cart</button>

      <h3>Status</h3>
      <p>{status}</p>

      <h3>Recent Sales (NEW)</h3>
      {sales.map((s, i) => (
        <div key={i}>
          <strong>{s.customerName}</strong> ({s.phone})
          <p>${s.total.toFixed(2)}</p>
          <small>{s.date}</small>
        </div>
      ))}
    </div>
  );
}