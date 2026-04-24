const completeSale = () => {
  if (!customerName || !customerPhone) {
    setStatus("❌ Customer name and phone required");
    return;
  }

  if (cart.length === 0) {
    setStatus("❌ Cart is empty");
    return;
  }

  // Process sale
  const updatedProducts = products.map((product) => {
    const cartItem = cart.find((item) => item.id === product.id);
    if (!cartItem) return product;

    return {
      ...product,
      stock: product.stock - cartItem.quantity,
    };
  });

  setProducts(updatedProducts);

  // ✅ FULL RESET (IMPORTANT)
  setCart([]);
  setCustomerName("");
  setCustomerPhone("");
  setQuantity(1);

  // ✅ Clean status (temporary only)
  setStatus("✅ Sale completed");

  // Optional: clear status after 2 seconds
  setTimeout(() => {
    setStatus("");
  }, 2000);
};