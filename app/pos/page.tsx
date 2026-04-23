"use client";

import { useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  protectedMinimum: number;
  unitType: "piece" | "case";
};

type CartItem = Product & {
  quantity: number;
};

const startingProducts: Product[] = [
  {
    id: "salmon-6oz",
    name: "Salmon 6oz",
    price: 10.5,
    stock: 36,
    protectedMinimum: 10,
    unitType: "piece",
  },
  {
    id: "grouper-fillet",
    name: "Grouper Fillet",
    price: 12,
    stock: 24,
    protectedMinimum: 5,
    unitType: "piece",
  },
  {
    id: "snapper-whole",
    name: "Snapper Whole",
    price: 9.32,
    stock: 149,
    protectedMinimum: 10,
    unitType: "piece",
  },
  {
    id: "snapper-fillet-portion-7oz",
    name: "Snapper Fillet Portion 7oz",
    price: 8.2,
    stock: 50,
    protectedMinimum: 10,
    unitType: "piece",
  },
  {
    id: "snapper-fillet-case-10lb",
    name: "Snapper Fillet Case 10lb",
    price: 139.5,
    stock: 8,
    protectedMinimum: 2,
    unitType: "case",
  },
];

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>(startingProducts);
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [status, setStatus] = useState("");

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const quantityNumber = Math.max(1, Number(quantity) || 1);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cart]);

  function getCartQuantity(productId: string) {
    return cart
      .filter((item) => item.id === productId)
      .reduce((sum, item) => sum + item.quantity, 0);
  }

  function addToCart() {
    if (!selectedProduct) return;

    const alreadyInCart = getCartQuantity(selectedProduct.id);
    const totalRequested = alreadyInCart + quantityNumber;
    const stockAfter = selectedProduct.stock - totalRequested;

    if (stockAfter < selectedProduct.protectedMinimum) {
      setStatus(
        `❌ Cannot add ${quantityNumber}. ${selectedProduct.name} must keep at least ${selectedProduct.protectedMinimum} ${selectedProduct.unitType === "case" ? "cases" : "pieces/portions"} in stock.`
      );
      return;
    }

    setCart((currentCart) => {
      const existing = currentCart.find((item) => item.id === selectedProduct.id);

      if (existing) {
        return currentCart.map((item) =>
          item.id === selectedProduct.id
            ? { ...item, quantity: item.quantity + quantityNumber }
            : item
        );
      }

      return [...currentCart, { ...selectedProduct, quantity: quantityNumber }];
    });

    setQuantity("1");
    setStatus(`✅ Added ${selectedProduct.name} to cart`);
  }

  function removeFromCart(productId: string) {
    setCart((currentCart) => currentCart.filter((item) => item.id !== productId));
    setStatus("Item removed from cart");
  }

  function completeSale() {
    if (cart.length === 0) {
      setStatus("❌ Cart is empty");
      return;
    }

    for (const item of cart) {
      const product = products.find((p) => p.id === item.id);
      if (!product) continue;

      const stockAfter = product.stock - item.quantity;

      if (stockAfter < product.protectedMinimum) {
        setStatus(
          `❌ Sale blocked. ${product.name} must keep at least ${product.protectedMinimum} ${product.unitType === "case" ? "cases" : "pieces/portions"} in stock.`
        );
        return;
      }
    }

    setProducts((currentProducts) =>
      currentProducts.map((product) => {
        const cartItem = cart.find((item) => item.id === product.id);

        if (!cartItem) return product;

        return {
          ...product,
          stock: product.stock - cartItem.quantity,
        };
      })
    );

    setCart([]);
    setQuantity("1");
    setStatus(
      `✅ Sale completed. Customer: ${
        customerName || "Walk-in"
      }. Total: $${cartTotal.toFixed(2)}`
    );
  }

  function clearCart() {
    setCart([]);
    setQuantity("1");
    setStatus("Cart cleared");
  }

  return (
    <main style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
      <h1>POS</h1>

      <section style={{ border: "1px solid #ddd", padding: "16px", borderRadius: "12px", marginBottom: "20px" }}>
        <h2>New Sale</h2>

        <label>
          Product
          <select
            value={selectedProductId}
            onChange={(e) => {
              setSelectedProductId(e.target.value);
              setQuantity("1");
              setStatus("");
            }}
            style={{ display: "block", width: "100%", padding: "10px", marginTop: "6px", marginBottom: "12px" }}
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} (${product.price}) ({product.stock})
              </option>
            ))}
          </select>
        </label>

        <label>
          Quantity
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={{ display: "block", width: "100%", padding: "10px", marginTop: "6px", marginBottom: "12px" }}
          />
        </label>

        {selectedProduct && (
          <div style={{ marginBottom: "12px" }}>
            <p>Product: {selectedProduct.name}</p>
            <p>Price: ${selectedProduct.price.toFixed(2)}</p>
            <p>Qty: {quantityNumber}</p>
            <p>Total: ${(selectedProduct.price * quantityNumber).toFixed(2)}</p>
            <p>Stock After If Added: {selectedProduct.stock - getCartQuantity(selectedProduct.id) - quantityNumber}</p>
            <p>Protected Minimum: {selectedProduct.protectedMinimum}</p>
          </div>
        )}

        <button
          onClick={addToCart}
          style={{
            width: "100%",
            padding: "12px",
            background: "#2f86c7",
            color: "white",
            border: "none",
            borderRadius: "8px",
            fontWeight: "bold",
          }}
        >
          Add to Cart
        </button>
      </section>

      <section style={{ border: "1px solid #ddd", padding: "16px", borderRadius: "12px", marginBottom: "20px" }}>
        <h2>Customer Info</h2>

        <input
          type="text"
          placeholder="Customer name"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          style={{ display: "block", width: "100%", padding: "10px", marginBottom: "10px" }}
        />

        <input
          type="tel"
          placeholder="Customer phone / WhatsApp"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          style={{ display: "block", width: "100%", padding: "10px" }}
        />
      </section>

      <section style={{ border: "1px solid #ddd", padding: "16px", borderRadius: "12px", marginBottom: "20px" }}>
        <h2>Cart</h2>

        {cart.length === 0 ? (
          <p>No items in cart</p>
        ) : (
          <>
            {cart.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "10px",
                  borderBottom: "1px solid #eee",
                  padding: "8px 0",
                }}
              >
                <div>
                  <strong>{item.name}</strong>
                  <p>
                    Qty: {item.quantity} × ${item.price.toFixed(2)}
                  </p>
                </div>

                <div style={{ textAlign: "right" }}>
                  <strong>${(item.price * item.quantity).toFixed(2)}</strong>
                  <br />
                  <button onClick={() => removeFromCart(item.id)}>Remove</button>
                </div>
              </div>
            ))}

            <h3>Total: ${cartTotal.toFixed(2)}</h3>

            <button
              onClick={completeSale}
              style={{
                width: "100%",
                padding: "12px",
                background: "green",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontWeight: "bold",
                marginBottom: "10px",
              }}
            >
              Complete Sale
            </button>

            <button
              onClick={clearCart}
              style={{
                width: "100%",
                padding: "12px",
                background: "#999",
                color: "white",
                border: "none",
                borderRadius: "8px",
              }}
            >
              Clear Cart
            </button>
          </>
        )}
      </section>

      <section>
        <h2>Status</h2>
        <p>{status}</p>
      </section>
    </main>
  );
}