// File: app/pos/page.tsx

"use client";

import { useMemo, useState } from "react";
import { products as startingProducts, type Product } from "@/lib/store";

type CartItem = Product & {
  cartQty: number;
};

type Customer = {
  name: string;
  phone: string;
};

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>(startingProducts);
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [status, setStatus] = useState("");

  const selectedProduct = products.find((p) => p.id === selectedId);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.cartQty, 0);
  }, [cart]);

  function handleCustomerNameChange(value: string) {
    setCustomerName(value);

    const foundCustomer = customers.find(
      (customer) => customer.name.toLowerCase() === value.toLowerCase()
    );

    if (foundCustomer) {
      setCustomerPhone(foundCustomer.phone);
      setStatus(`✅ Customer found: ${foundCustomer.name}`);
    }
  }

  function addToCart() {
    if (!selectedProduct) return;

    const safeQty = Number(qty);

    if (!safeQty || safeQty <= 0) {
      setStatus("❌ Enter a valid quantity");
      return;
    }

    const alreadyInCart =
      cart.find((item) => item.id === selectedProduct.id)?.cartQty ?? 0;

    const stockAfterIfAdded =
      selectedProduct.stock - alreadyInCart - safeQty;

    if (stockAfterIfAdded < selectedProduct.minStock) {
      setStatus(
        `❌ Cannot add. Must keep at least ${selectedProduct.minStock} in stock`
      );
      return;
    }

    setCart((currentCart) => {
      const existing = currentCart.find((item) => item.id === selectedProduct.id);

      if (existing) {
        return currentCart.map((item) =>
          item.id === selectedProduct.id
            ? { ...item, cartQty: item.cartQty + safeQty }
            : item
        );
      }

      return [...currentCart, { ...selectedProduct, cartQty: safeQty }];
    });

    setQty(1);
    setStatus(`✅ Added ${selectedProduct.name} to cart`);
  }

  function removeFromCart(productId: string) {
    setCart((currentCart) => currentCart.filter((item) => item.id !== productId));
    setStatus("✅ Item removed from cart");
  }

  function clearCart() {
    setCart([]);
    setQty(1);
    setStatus("✅ Cart cleared");
  }

  function completeSale() {
    if (cart.length === 0) {
      setStatus("❌ Add items to cart before completing sale");
      return;
    }

    if (!customerName.trim() || !customerPhone.trim()) {
      setStatus("❌ Customer name and phone required");
      return;
    }

    for (const item of cart) {
      const product = products.find((p) => p.id === item.id);

      if (!product) {
        setStatus(`❌ Product missing: ${item.name}`);
        return;
      }

      const stockAfterSale = product.stock - item.cartQty;

      if (stockAfterSale < product.minStock) {
        setStatus(
          `❌ Cannot complete sale. ${item.name} must keep at least ${item.minStock} in stock`
        );
        return;
      }
    }

    setProducts((currentProducts) =>
      currentProducts.map((product) => {
        const soldItem = cart.find((item) => item.id === product.id);

        if (!soldItem) return product;

        return {
          ...product,
          stock: product.stock - soldItem.cartQty,
        };
      })
    );

    setCustomers((currentCustomers) => {
      const customerExists = currentCustomers.some(
        (customer) =>
          customer.name.toLowerCase() === customerName.trim().toLowerCase()
      );

      if (customerExists) {
        return currentCustomers.map((customer) =>
          customer.name.toLowerCase() === customerName.trim().toLowerCase()
            ? { name: customerName.trim(), phone: customerPhone.trim() }
            : customer
        );
      }

      return [
        ...currentCustomers,
        { name: customerName.trim(), phone: customerPhone.trim() },
      ];
    });

    setCart([]);
    setQty(1);
    setCustomerName("");
    setCustomerPhone("");
    setStatus("✅ Sale completed, customer saved, inventory updated");
  }

  const previewStockAfter = selectedProduct
    ? selectedProduct.stock -
      (cart.find((item) => item.id === selectedProduct.id)?.cartQty ?? 0) -
      Number(qty || 0)
    : 0;

  return (
    <main>
      <h1>POS</h1>

      <section>
        <h2>New Sale</h2>

        <select
          value={selectedId}
          onChange={(event) => {
            setSelectedId(event.target.value);
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
          onChange={(event) => setQty(Number(event.target.value))}
        />

        <button onClick={addToCart}>Add to Cart</button>
      </section>

      {selectedProduct && (
        <section>
          <h2>Preview</h2>
          <p>Product: {selectedProduct.name}</p>
          <p>Price: ${selectedProduct.price}</p>
          <p>Qty: {qty}</p>
          <p>Stock After If Added: {previewStockAfter}</p>
          <p>Protected Minimum: {selectedProduct.minStock}</p>
        </section>
      )}

      <section>
        <h2>Customer Info</h2>

        <input
          value={customerName}
          onChange={(event) => handleCustomerNameChange(event.target.value)}
          placeholder="Customer Name"
          list="saved-customers"
        />

        <datalist id="saved-customers">
          {customers.map((customer) => (
            <option key={customer.phone} value={customer.name} />
          ))}
        </datalist>

        <input
          value={customerPhone}
          onChange={(event) => setCustomerPhone(event.target.value)}
          placeholder="Customer phone / WhatsApp"
        />
      </section>

      <section>
        <h2>Cart</h2>

        {cart.length === 0 && <p>Total: $0.00</p>}

        {cart.map((item) => (
          <div key={item.id}>
            <h3>{item.name}</h3>
            <p>
              Qty: {item.cartQty} × ${item.price}
            </p>
            <p>Total: ${(item.cartQty * item.price).toFixed(2)}</p>
            <button onClick={() => removeFromCart(item.id)}>Remove</button>
          </div>
        ))}

        {cart.length > 0 && <h3>Total: ${cartTotal.toFixed(2)}</h3>}

        <button onClick={completeSale}>Complete Sale</button>
        <button onClick={clearCart}>Clear Cart</button>
      </section>

      <section>
        <h2>Status</h2>
        <p>{status}</p>
      </section>
    </main>
  );
}