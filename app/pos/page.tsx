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
    { name: "Snapper Whole", price: 9.32, stock: 149, min: 10 },
    { name: "Snapper Fillet Portion 7oz", price: 8.2, stock: 50, min: 10 },
    { name: "Snapper Fillet Case 10lb", price: 139.5, stock: 8, min: 2 },
  ]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [status, setStatus] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const selectedProduct = products[selectedIndex];

  // ------------------------
  // ADD TO CART
  // ------------------------
  function addToCart() {
    if (!selectedProduct) return;

    const remaining = selectedProduct.stock - qty;

    if (remaining < selectedProduct.min) {
      setStatus(`❌ Must keep at least ${selectedProduct.min} in stock`);
      return;
    }

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

    // 🔥 RESET INPUT CLEANLY
    setQty(1);
    setStatus(`✅ Added ${selectedProduct.name} to cart`);
  }

  // ------------------------
  // REMOVE ITEM
  // ------------------------
  function removeItem(name: string) {
    setCart(cart.filter((i) => i.name !== name));
  }

  // ------------------------
  // COMPLETE SALE
  // ------------------------
  function completeSale() {
    if (!customerName || !customerPhone) {
      setStatus("❌ Customer name and phone required");
      return;
    }

    if (cart.length === 0) {
      setStatus("❌ Cart is empty");
      return;
    }

    const updatedProducts = products.map((p) => {
      const cartItem = cart.find((i) => i.name === p.name);
      if (!cartItem) return p;

      return {
        ...p,
        stock: p.stock - cartItem.qty,
      };
    });

    setProducts(updatedProducts);
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setStatus("✅ Sale completed successfully");
  }

  const total = cart.reduce((sum, i) => sum + i.qty * i.price, 0);

  return (
    <div>
      <h2>POS</h2>

      {/* ------------------------
          PRODUCT SELECT
      ------------------------ */}
      <h3>New Sale</h3>

      <select
        value={selectedIndex}
        onChange={(e) => {
          setSelectedIndex(Number(e.target.value));
          setQty(1); // 🔥 reset qty when switching product
        }}
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

      {/* ------------------------
          PREVIEW
      ------------------------ */}
      <h4>Preview</h4>
      <p>{selectedProduct.name}</p>
      <p>Price: ${selectedProduct.price}</p>
      <p>Qty: {qty}</p>
      <p>Stock After If Added: {selectedProduct.stock - qty}</p>
      <p>Protected Minimum: {selectedProduct.min}</p>

      {/* ------------------------
          CUSTOMER INFO
      ------------------------ */}
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

      {/* ------------------------
          CART
      ------------------------ */}
      <h3>Cart</h3>

      {cart.map((item, i) => (
        <div key={i}>
          <strong>{item.name}</strong>
          <p>
            Qty: {item.qty} × ${item.price}
          </p>
          <p>Total: ${(item.qty * item.price).toFixed(2)}</p>
          <button onClick={() => removeItem(item.name)}>Remove</button>
        </div>
      ))}

      <h3>Total: ${total.toFixed(2)}</h3>

      <button onClick={completeSale}>Complete Sale</button>

      <button onClick={() => setCart([])}>Clear Cart</button>

      {/* ------------------------
          STATUS
      ------------------------ */}
      <p>{status}</p>
    </div>
  );
}