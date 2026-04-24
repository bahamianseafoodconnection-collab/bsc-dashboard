// File: app/market/page.tsx
"use client";

import { useState } from "react";
import { products, type Product } from "../../lib/store";

export default function MarketPage() {
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<{ product: Product; qty: number }[]>([]);
  const [view, setView] = useState<"shop" | "cart">("shop");

  const available = products.filter(
    (p) => p.stock > p.minStock
  );

  const filtered = available.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  function addToCart(product: Product) {
    const existing = cart.find((c) => c.product.id === product.id);
    if (existing) {
      setCart(cart.map((c) =>
        c.product.id === product.id
          ? { ...c, qty: c.qty + 1 }
          : c
      ));
    } else {
      setCart([...cart, { product, qty: 1 }]);
    }
  }

  function removeFromCart(id: string) {
    setCart(cart.filter((c) => c.product.id !== id));
  }

  function adjustQty(id: string, delta: number) {
    setCart(cart
      .map((c) =>
        c.product.id === id ? { ...c, qty: c.qty + delta } : c
      )
      .filter((c) => c.qty > 0)
    );
  }

  const cartTotal = cart.reduce(
    (sum, c) => sum + c.product.price * c.qty, 0
  );
  const cartCount = cart.reduce((sum, c) => sum + c.qty, 0);

  return (
    <div style={{
      padding: 20,
      backgroundColor: "#0a0f1e",
      minHeight: "100vh",
      color: "#fff",
      fontFamily: "sans-serif"
    }}>

      {/* HEADER */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20
      }}>
        <div>
          <h1 style={{ margin: 0, color: "#f5c518", fontSize: 22 }}>
            BSC Market
          </h1>
          <p style={{ margin: 0, color: "#aaa", fontSize: 13 }}>
            Fresh · Direct · Bahamian
          </p>
        </div>

        <button
          onClick={() => setView(view === "shop" ? "cart" : "shop")}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            backgroundColor: cartCount > 0 ? "#f5c518" : "#1a2235",
            color: cartCount > 0 ? "#000" : "#aaa",
            border: "1px solid #2a3550",
            fontWeight: "bold",
            cursor: "pointer",
            fontSize: 14
          }}
        >
          🛒 {cartCount > 0 ? `${cartCount}` : "Cart"}
        </button>
      </div>

      {view === "shop" ? (
        <>
          {/* SEARCH */}
          <input
            placeholder="🔍 Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 10,
              backgroundColor: "#1a2235",
              color: "#fff",
              border: "1px solid #2a3550",
              fontSize: 15,
              marginBottom: 20,
              boxSizing: "border-box"
            }}
          />

          {/* CATEGORY LABEL */}
          <p style={{ color: "#555", fontSize: 12, marginBottom: 12 }}>
            {filtered.length} PRODUCTS AVAILABLE
          </p>

          {/* PRODUCTS */}
          {filtered.length === 0 && (
            <p style={{ color: "#555", textAlign: "center", marginTop: 40 }}>
              No products found
            </p>
          )}

          {filtered.map((product) => {
            const inCart = cart.find((c) => c.product.id === product.id);
            const availableQty = product.stock - product.minStock;

            return (
              <div key={product.id} style={{
                backgroundColor: "#1a2235",
                borderRadius: 12,
                padding: 16,
                marginBottom: 14,
                border: "1px solid #2a3550"
              }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start"
                }}>
                  <div style={{ flex: 1 }}>
                    <p style={{
                      margin: 0,
                      fontWeight: "bold",
                      fontSize: 16
                    }}>
                      {product.name}
                    </p>
                    <p style={{
                      margin: "6px 0 2px",
                      color: "#4ade80",
                      fontSize: 20,
                      fontWeight: "bold"
                    }}>
                      ${product.price.toFixed(2)}
                    </p>
                    <p style={{ margin: 0, color: "#555", fontSize: 12 }}>
                      {availableQty} in stock
                    </p>
                  </div>

                  {inCart ? (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10
                    }}>
                      <button
                        onClick={() => adjustQty(product.id, -1)}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 8,
                          backgroundColor: "#2a3550",
                          color: "#fff",
                          border: "none",
                          fontSize: 18,
                          cursor: "pointer"
                        }}
                      >−</button>
                      <span style={{ fontWeight: "bold", fontSize: 16 }}>
                        {inCart.qty}
                      </span>
                      <button
                        onClick={() => adjustQty(product.id, 1)}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 8,
                          backgroundColor: "#f5c518",
                          color: "#000",
                          border: "none",
                          fontSize: 18,
                          cursor: "pointer",
                          fontWeight: "bold"
                        }}
                      >+</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(product)}
                      style={{
                        padding: "10px 18px",
                        borderRadius: 10,
                        backgroundColor: "#f5c518",
                        color: "#000",
                        fontWeight: "bold",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 14
                      }}
                    >
                      + Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <>
          {/* CART VIEW */}
          <h2 style={{ color: "#f5c518", marginBottom: 16 }}>
            Your Cart
          </h2>

          {cart.length === 0 && (
            <p style={{ color: "#555" }}>Your cart is empty</p>
          )}

          {cart.map((c) => (
            <div key={c.product.id} style={{
              backgroundColor: "#1a2235",
              borderRadius: 12,
              padding: 14,
              marginBottom: 12,
              border: "1px solid #2a3550"
            }}>
              <p style={{ margin: "0 0 4px", fontWeight: "bold" }}>
                {c.product.name}
              </p>
              <p style={{ margin: "2px 0", color: "#aaa", fontSize: 13 }}>
                {c.qty} × ${c.product.price.toFixed(2)} ={" "}
                <span style={{ color: "#4ade80", fontWeight: "bold" }}>
                  ${(c.qty * c.product.price).toFixed(2)}
                </span>
              </p>

              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 8
              }}>
                <button
                  onClick={() => adjustQty(c.product.id, -1)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    backgroundColor: "#2a3550",
                    color: "#fff",
                    border: "none",
                    fontSize: 16,
                    cursor: "pointer"
                  }}
                >−</button>
                <span style={{ fontWeight: "bold" }}>{c.qty}</span>
                <button
                  onClick={() => adjustQty(c.product.id, 1)}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    backgroundColor: "#f5c518",
                    color: "#000",
                    border: "none",
                    fontSize: 16,
                    cursor: "pointer",
                    fontWeight: "bold"
                  }}
                >+</button>
                <button
                  onClick={() => removeFromCart(c.product.id)}
                  style={{
                    marginLeft: "auto",
                    padding: "4px 12px",
                    borderRadius: 6,
                    backgroundColor: "#7f1d1d",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}

          {cart.length > 0 && (
            <>
              <div style={{
                backgroundColor: "#0f1f0f",
                border: "2px solid #4ade80",
                borderRadius: 12,
                padding: 16,
                marginBottom: 20,
                textAlign: "center"
              }}>
                <p style={{ margin: 0, color: "#aaa", fontSize: 13 }}>
                  Order Total
                </p>
                <h2 style={{ margin: "6px 0 0", color: "#4ade80", fontSize: 28 }}>
                  ${cartTotal.toFixed(2)}
                </h2>
              </div>

              <button style={{
                width: "100%",
                padding: "14px",
                borderRadius: 10,
                backgroundColor: "#f5c518",
                color: "#000",
                fontWeight: "bold",
                border: "none",
                fontSize: 16,
                cursor: "pointer",
                marginBottom: 12
              }}>
                📦 Place Order — Coming Soon
              </button>
            </>
          )}

          <button
            onClick={() => setView("shop")}
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 10,
              backgroundColor: "#1a2235",
              color: "#aaa",
              border: "1px solid #2a3550",
              fontSize: 15,
              cursor: "pointer"
            }}
          >
            ← Continue Shopping
          </button>
        </>
      )}
    </div>
  );
}
