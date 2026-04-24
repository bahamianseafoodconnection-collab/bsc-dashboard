"use client";

import { useMemo, useState } from "react";
import {
  products,
  getCustomerByName,
  saveCustomer,
  completeSale,
  type Product,
} from "../../lib/store";

type CartItem = Product & {
  qty: number;
};

export default function POSPage() {
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [status, setStatus] = useState("");

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? products[0];

  const cartTotal = useMemo(() => {
    return cart.reduce((total, item) => total + item.price * item.qty, 0);
  }, [cart]);

  function handleCustomerNameChange(value: string) {
    setCustomerName(value);

    const savedCustomer = getCustomerByName(value);
    if (savedCustomer) {
      setCustomerPhone(savedCustomer.phone);
    }
  }

  function addToCart() {
    if (!selectedProduct) return;

    const safeQty = Math.max(1, Number(qty) || 1);
    const existingCartQty =
      cart.find((item) => item.id === selectedProduct.id)?.qty ?? 0;

    const stockAfterIfAdded =
      selectedProduct.stock - existingCartQty - safeQty;

    if (stockAfterIfAdded < selectedProduct.minStock) {
      setStatus(
        `❌ Cannot add ${safeQty}. Must keep at least ${selectedProduct.minStock} in stock.`
      );
      return;
    }

    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.id === selectedProduct.id);

      if (existingItem) {
        return currentCart.map((item) =>
          item.id === selectedProduct.id
            ? { ...item, qty: item.qty + safeQty }
            : item
        );
      }

      return [...currentCart, { ...selectedProduct, qty: safeQty }];
    });

    setQty(1);
    setStatus(`✅ Added ${selectedProduct.name} to cart`);
  }

  function removeFromCart(productId: string) {
    setCart((currentCart) => currentCart.filter((item) => item.id !== productId));
    setStatus("Removed item from cart");
  }

  function clearCart() {
    setCart([]);
    setQty(1);
    setStatus("Cart cleared");
  }

  function handleCompleteSale() {
    if (cart.length === 0) {
      setStatus("❌ Add at least one product to cart before completing sale.");
      return;
    }

    if (!customerName.trim() || !customerPhone.trim()) {
      setStatus("❌ Customer name and phone required");
      return;
    }

    saveCustomer({
      name: customerName.trim(),
      phone: customerPhone.trim(),
    });

    const result = completeSale({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      items: cart.map((item) => ({
        productId: item.id,
        productName: item.name,
        price: item.price,
        qty: item.qty,
        supplierName: item.supplierName ?? "BSC Marketplace",
      })),
      total: cartTotal,
    });

    if (!result.success) {
      setStatus(`❌ ${result.message}`);
      return;
    }

    setCart([]);
    setQty(1);
    setCustomerName("");
    setCustomerPhone("");
    setStatus("✅ Sale completed and customer saved");
  }

  if (!selectedProduct) {
    return <main><h1>POS</h1><p>No products found.</p></main>;
  }

  const existingCartQty =
    cart.find((item) => item.id === selectedProduct.id)?.qty ?? 0;

  const stockAfterIfAdded =
    selectedProduct.stock - existingCartQty - Math.max(1, Number(qty) || 1);

  return (
    <main>
      <h1>POS</h1>

      <section>
        <h2>New Sale</h2>

        <select
          value={selectedProductId}
          onChange={(event) => {
            setSelectedProductId(event.target.value);
            setQty(1);
            setStatus("");
          }}
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} (${product.price}) ({product.stock})
            </option>
          ))}
        </select>

        <input
          type="number"
          min="1"
          value={qty}
          onChange={(event) => setQty(Math.max(1, Number(event.target.value) || 1))}
        />

        <button onClick={addToCart}>Add to Cart</button>
      </section>

      <section>
        <h2>Preview</h2>
        <p>Product: {selectedProduct.name}</p>
        <p>Price: ${selectedProduct.price}</p>
        <p>Qty: {qty}</p>
        <p>Stock After If Added: {stockAfterIfAdded}</p>
        <p>Protected Minimum: {selectedProduct.minStock}</p>
      </section>

      <section>
        <h2>Customer Info</h2>

        <input
          value={customerName}
          onChange={(event) => handleCustomerNameChange(event.target.value)}
          placeholder="Customer Name"
        />

        <input
          value={customerPhone}
          onChange={(event) => setCustomerPhone(event.target.value)}
          placeholder="Customer phone / WhatsApp"
        />
      </section>

      <section>
        <h2>Cart</h2>

        {cart.map((item) => (
          <div key={item.id}>
            <h3>{item.name}</h3>
            <p>
              Qty: {item.qty} × ${item.price}
            </p>
            <p>Total: ${(item.qty * item.price).toFixed(2)}</p>
            <button onClick={() => removeFromCart(item.id)}>Remove</button>
          </div>
        ))}

        <h3>Total: ${cartTotal.toFixed(2)}</h3>

        <button onClick={handleCompleteSale}>Complete Sale</button>
        <button onClick={clearCart}>Clear Cart</button>
      </section>

      <section>
        <h2>Status</h2>
        <p>{status}</p>
      </section>
    </main>
  );
}