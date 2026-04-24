"use client";

import { useState } from "react";
import {
  products,
  completeSale,
  saveCustomer,
  getCustomerByName,
  type Product,
} from "../../lib/store";
import { recordSaleFinancials } from "../../lib/finance";
import { createInvoice } from "../../lib/invoices";

type CartItem = Product & { qty: number };

export default function POSPage() {
  const [selectedId, setSelectedId] = useState(products[0]?.id);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [status, setStatus] = useState("");

  const selectedProduct = products.find((p) => p.id === selectedId)!;

  // 🔹 AUTO FILL CUSTOMER
  function handleCustomerNameChange(name: string) {
    setCustomerName(name);

    const existing = getCustomerByName(name);
    if (existing) {
      setCustomerPhone(existing.phone);
    }
  }

  // 🔹 ADD TO CART
  function addToCart() {
    const existing = cart.find((c) => c.id === selectedProduct.id);

    if (existing) {
      setCart(
        cart.map((c) =>
          c.id === selectedProduct.id
            ? { ...c, qty: c.qty + qty }
            : c
        )
      );
    } else {
      setCart([...cart, { ...selectedProduct, qty }]);
    }

    setQty(1);
    setStatus(`Added ${selectedProduct.name} to cart`);
  }

  // 🔹 REMOVE ITEM
  function removeItem(id: string) {
    setCart(cart.filter((c) => c.id !== id));
  }

  const cartTotal = cart.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );

  // 🔹 COMPLETE SALE
  function handleCompleteSale() {
    if (!customerName || !customerPhone) {
      setStatus("❌ Customer name and phone required");
      return;
    }

    if (cart.length === 0) {
      setStatus("❌ Cart is empty");
      return;
    }

    const sale = {
      customerName,
      customerPhone,
      items: cart.map((item) => ({
        productId: item.id,
        productName: item.name,
        price: item.price,
        qty: item.qty,
        supplierName: item.supplierName,
      })),
      total: cartTotal,
    };

    const result = completeSale(sale);

    if (!result.success) {
      setStatus(`❌ ${result.message}`);
      return;
    }

    // ✅ SAVE CUSTOMER
    saveCustomer({ name: customerName, phone: customerPhone });

    // ✅ RECORD FINANCIALS
    recordSaleFinancials(cartTotal);

    // ✅ CREATE INVOICE
    const invoice = createInvoice(sale);

    setStatus(`✅ Sale completed — Invoice: ${invoice.id}`);

    // RESET
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>POS</h1>

      {/* NEW SALE */}
      <h3>New Sale</h3>

      <select
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} (${p.price}) ({p.stock})
          </option>
        ))}
      </select>

      <input
        type="number"
        value={qty}
        onChange={(e) => setQty(Number(e.target.value))}
        style={{ marginLeft: 10 }}
      />

      <button onClick={addToCart} style={{ marginLeft: 10 }}>
        Add to Cart
      </button>

      {/* PREVIEW */}
      <h3>Preview</h3>
      <p>Product: {selectedProduct.name}</p>
      <p>Price: ${selectedProduct.price}</p>
      <p>Qty: {qty}</p>
      <p>
        Stock After If Added:{" "}
        {selectedProduct.stock - qty}
      </p>
      <p>Protected Minimum: {selectedProduct.minStock}</p>

      {/* CUSTOMER */}
      <h3>Customer Info</h3>
      <input
        placeholder="Customer Name"
        value={customerName}
        onChange={(e) =>
          handleCustomerNameChange(e.target.value)
        }
      />
      <input
        placeholder="Customer phone / WhatsApp"
        value={customerPhone}
        onChange={(e) => setCustomerPhone(e.target.value)}
        style={{ marginLeft: 10 }}
      />

      {/* CART */}
      <h3>Cart</h3>
      {cart.map((item) => (
        <div key={item.id}>
          <b>{item.name}</b>
          <p>
            Qty: {item.qty} × ${item.price}
          </p>
          <p>Total: ${item.qty * item.price}</p>
          <button onClick={() => removeItem(item.id)}>
            Remove
          </button>
        </div>
      ))}

      <h3>Total: ${cartTotal.toFixed(2)}</h3>

      <button onClick={handleCompleteSale}>
        Complete Sale
      </button>

      <button onClick={() => setCart([])} style={{ marginLeft: 10 }}>
        Clear Cart
      </button>

      {/* STATUS */}
      <h3>Status</h3>
      <p>{status}</p>
    </div>
  );
}