// File: app/pos/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(products[0]?.id);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [status, setStatus] = useState("");

  const selectedProduct = products.find((p) => p.id === selectedId)!;

  function handleCustomerNameChange(name: string) {
    setCustomerName(name);
    const existing = getCustomerByName(name);
    if (existing) setCustomerPhone(existing.phone);
  }

  function addToCart() {
    const existing = cart.find((c) => c.id === selectedProduct.id);
    if (existing) {
      setCart(cart.map((c) =>
        c.id === selectedProduct.id ? { ...c, qty: c.qty + qty } : c
      ));
    } else {
      setCart([...cart, { ...selectedProduct, qty }]);
    }
    setQty(1);
    setStatus(`✅ Added ${selectedProduct.name} to cart`);
  }

  function removeItem(id: string) {
    setCart(cart.filter((c) => c.id !== id));
  }

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

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

    saveCustomer({ name: customerName, phone: customerPhone });
    recordSaleFinancials(cartTotal);
    const invoice = createInvoice(sale);

    // ✅ REDIRECT TO INVOICE PAGE
    router.push(`/invoice?id=${encodeURIComponent(invoice.id)}`);
  }

  return (
    <div style={{
      padding: 20,
      backgroundColor: "#0a0f1e",
      minHeight: "100vh",
      color: "#ffffff",
      fontFamily: "sans-serif"
    }}>
      <h1 style={{ color: "#f5c518", marginBottom: 20 }}>🛒 POS — New Sale</h1>

      {/* PRODUCT SELECT */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ color: "#aaa", fontSize: 13 }}>Select Product</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={{
            display: "block", width: "100%", padding: "10px",
            marginTop: 6, borderRadius: 8, backgroundColor: "#1a2235",
            color: "#fff", border: "1px solid #2a3550", fontSize: 15
          }}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — ${p.price} ({p.stock} in stock)
            </option>
          ))}
        </select>
      </div>

      {/* PREVIEW */}
      <div style={{
        backgroundColor: "#1a2235", borderRadius: 10,
        padding: 14, marginBottom: 16, border: "1px solid #2a3550"
      }}>
        <p style={{ margin: "4px 0" }}>📦 <b>{selectedProduct.name}</b></p>
        <p style={{ margin: "4px 0", color: "#4ade80" }}>
          Price: ${selectedProduct.price.toFixed(2)}
        </p>
        <p style={{ margin: "4px 0", color: "#60a5fa" }}>
          Stock: {selectedProduct.stock} | Min: {selectedProduct.minStock}
        </p>
      </div>

      {/* QTY + ADD */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          type="number"
          value={qty}
          min={1}
          onChange={(e) => setQty(Number(e.target.value))}
          style={{
            flex: 1, padding: "10px", borderRadius: 8,
            backgroundColor: "#1a2235", color: "#fff",
            border: "1px solid #2a3550", fontSize: 15
          }}
        />
        <button
          onClick={addToCart}
          style={{
            flex: 2, padding: "10px 16px", borderRadius: 8,
            backgroundColor: "#f5c518", color: "#000",
            fontWeight: "bold", border: "none", fontSize: 15, cursor: "pointer"
          }}
        >
          + Add to Cart
        </button>
      </div>

      {/* CUSTOMER */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ color: "#aaa", fontSize: 13 }}>Customer Name</label>
        <input
          placeholder="Customer Name"
          value={customerName}
          onChange={(e) => handleCustomerNameChange(e.target.value)}
          style={{
            display: "block", width: "100%", padding: "10px",
            marginTop: 6, marginBottom: 10, borderRadius: 8,
            backgroundColor: "#1a2235", color: "#fff",
            border: "1px solid #2a3550", fontSize: 15, boxSizing: "border-box"
          }}
        />
        <label style={{ color: "#aaa", fontSize: 13 }}>Phone / WhatsApp</label>
        <input
          placeholder="Phone / WhatsApp"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          style={{
            display: "block", width: "100%", padding: "10px",
            marginTop: 6, borderRadius: 8,
            backgroundColor: "#1a2235", color: "#fff",
            border: "1px solid #2a3550", fontSize: 15, boxSizing: "border-box"
          }}
        />
      </div>

      {/* CART */}
      <h3 style={{ color: "#f5c518" }}>Cart</h3>
      {cart.length === 0 && (
        <p style={{ color: "#666" }}>No items added yet</p>
      )}
      {cart.map((item) => (
        <div key={item.id} style={{
          backgroundColor: "#1a2235", borderRadius: 10,
          padding: 12, marginBottom: 10, border: "1px solid #2a3550"
        }}>
          <p style={{ margin: "2px 0", fontWeight: "bold" }}>{item.name}</p>
          <p style={{ margin: "2px 0", color: "#aaa" }}>
            {item.qty} × ${item.price.toFixed(2)} ={" "}
            <span style={{ color: "#4ade80" }}>
              ${(item.qty * item.price).toFixed(2)}
            </span>
          </p>
          <button
            onClick={() => removeItem(item.id)}
            style={{
              marginTop: 6, padding: "4px 12px", borderRadius: 6,
              backgroundColor: "#7f1d1d", color: "#fff",
              border: "none", cursor: "pointer", fontSize: 13
            }}
          >
            Remove
          </button>
        </div>
      ))}

      {/* TOTAL */}
      <div style={{
        backgroundColor: "#0f1f0f", border: "1px solid #4ade80",
        borderRadius: 10, padding: 14, marginBottom: 20
      }}>
        <h3 style={{ margin: 0, color: "#4ade80" }}>
          Total: ${cartTotal.toFixed(2)}
        </h3>
      </div>

      {/* STATUS */}
      {status && (
        <p style={{
          padding: 10, borderRadius: 8,
          backgroundColor: status.includes("❌") ? "#3b0000" : "#0f2a0f",
          color: status.includes("❌") ? "#f87171" : "#4ade80",
          marginBottom: 16
        }}>
          {status}
        </p>
      )}

      {/* ACTIONS */}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={handleCompleteSale}
          style={{
            flex: 2, padding: "14px", borderRadius: 10,
            backgroundColor: "#f5c518", color: "#000",
            fontWeight: "bold", border: "none", fontSize: 16, cursor: "pointer"
          }}
        >
          ✅ Complete Sale
        </button>
        <button
          onClick={() => setCart([])}
          style={{
            flex: 1, padding: "14px", borderRadius: 10,
            backgroundColor: "#1a2235", color: "#aaa",
            border: "1px solid #2a3550", fontSize: 15, cursor: "pointer"
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
