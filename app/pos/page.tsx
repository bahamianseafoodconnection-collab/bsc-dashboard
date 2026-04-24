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
    { id: 4, name: "Snapper Fillet Case 10lb", price: 139.5, stock: 8, min: 2 },
  ]);

  const [selectedId, setSelectedId] = useState<number>(1);
  const [quantity, setQuantity] = useState<number>(1);
  const [cart, setCart] = useState<any[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [status, setStatus] = useState("");

  const selectedProduct = products.find(p => p.id === selectedId)!;

  const addToCart = () => {
    const stockAfter = selectedProduct.stock - quantity;

    if (stockAfter < selectedProduct.min) {
      setStatus(`❌ Must keep at least ${selectedProduct.min} in stock`);
      return;
    }

    const existing = cart.find(item => item.id === selectedId);

    if (existing) {
      setCart(cart.map(item =>
        item.id === selectedId
          ? { ...item, quantity: item.quantity + quantity }
          : item
      ));
    } else {
      setCart([
        ...cart,
        {
          id: selectedProduct.id,
          name: selectedProduct.name,
          price: selectedProduct.price,
          quantity,
        },
      ]);
    }

    setQuantity(1);
    setStatus(`✔ Added ${selectedProduct.name}`);
  };

  const removeItem = (id: number) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const completeSale = () => {
    if (!customerName || !customerPhone) {
      setStatus("❌ Customer name and phone required");
      return;
    }

    if (cart.length === 0) {
      setStatus("❌ Cart is empty");
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

    // FULL RESET
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setQuantity(1);

    setStatus("✅ Sale completed and customer saved");

    setTimeout(() => setStatus(""), 2000);
  };

  const total = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return (
    <div>
      <h2>POS</h2>

      <h3>New Sale</h3>

      <select
        value={selectedId}
        onChange={(e) => setSelectedId(Number(e.target.value))}
      >
        {products.map(p => (
          <option key={p.id} value={p.id}>
            {p.name} (${p.price}) ({p.stock})
          </option>
        ))}
      </select>

      <input
        type="number"
        value={quantity}
        min={1}
        onChange={(e) => setQuantity(Number(e.target.value))}
      />

      <button onClick={addToCart}>Add to Cart</button>

      <h3>Preview</h3>
      <p>Product: {selectedProduct.name}</p>
      <p>Price: ${selectedProduct.price}</p>
      <p>Qty: {quantity}</p>
      <p>Stock After If Added: {selectedProduct.stock - quantity}</p>
      <p>Protected Minimum: {selectedProduct.min}</p>

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