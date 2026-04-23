"use client";

import { useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  price: number;
  stock: number;
  protectedMinimum: number;
};

const startingProducts: Product[] = [
  { id: "snapper-case", name: "Snapper Fillet Case 10lb", price: 139.5, stock: 8, protectedMinimum: 2 },
  { id: "salmon-6oz", name: "Salmon 6oz", price: 10.5, stock: 37, protectedMinimum: 10 },
  { id: "grouper-fillet", name: "Grouper Fillet", price: 12, stock: 27, protectedMinimum: 10 },
  { id: "snapper-whole", name: "Snapper Whole", price: 9.32, stock: 149, protectedMinimum: 10 },
  { id: "snapper-portion", name: "Snapper Fillet Portion 7oz", price: 8.2, stock: 50, protectedMinimum: 10 },
];

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>(startingProducts);
  const [selectedId, setSelectedId] = useState(products[0].id);
  const [quantityText, setQuantityText] = useState("1");
  const [message, setMessage] = useState("");

  const selectedProduct = products.find((p) => p.id === selectedId) ?? products[0];
  const quantity = Math.max(0, Number(quantityText) || 0);

  const stockAfterSale = selectedProduct.stock - quantity;
  const totalSale = selectedProduct.price * quantity;
  const blocked = stockAfterSale < selectedProduct.protectedMinimum;

  const recentWarning = useMemo(() => {
    if (blocked) {
      return `Must keep at least ${selectedProduct.protectedMinimum} pieces/portions in stock`;
    }

    if (quantity >= 10) {
      return "Large sale detected. Review before recording.";
    }

    return "";
  }, [blocked, quantity, selectedProduct.protectedMinimum]);

  function recordSale() {
    if (quantity <= 0) {
      setMessage("❌ Enter a valid quantity.");
      return;
    }

    if (blocked) {
      setMessage(`❌ Sale blocked. Must keep at least ${selectedProduct.protectedMinimum} in stock.`);
      return;
    }

    setProducts((current) =>
      current.map((product) =>
        product.id === selectedProduct.id
          ? { ...product, stock: product.stock - quantity }
          : product
      )
    );

    setMessage("✅ Sale recorded");
    setQuantityText("1");
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "16px" }}>
      <h1 style={{ fontSize: 34, fontWeight: 800, marginBottom: 24 }}>POS</h1>

      <section style={cardStyle}>
        <h2 style={sectionTitle}>New Sale</h2>

        <label style={labelStyle}>Product</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          style={inputStyle}
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} (${product.price.toFixed(2)}) ({product.stock})
            </option>
          ))}
        </select>

        <label style={labelStyle}>Quantity</label>
        <input
          value={quantityText}
          onChange={(e) => setQuantityText(e.target.value)}
          inputMode="numeric"
          style={inputStyle}
        />

        <button onClick={recordSale} style={buttonStyle}>
          Record Sale
        </button>
      </section>

      <section style={cardStyle}>
        <h2 style={sectionTitle}>Sale Preview</h2>

        <Row label="Product" value={selectedProduct.name} />
        <Row label="Unit Price" value={`$${selectedProduct.price.toFixed(2)}`} />
        <Row label="Quantity" value={quantity.toString()} />
        <Row label="Total Sale" value={`$${totalSale.toFixed(2)}`} />
        <Row label="Stock After Sale" value={stockAfterSale.toString()} />
        <Row label="Protected Minimum" value={selectedProduct.protectedMinimum.toString()} />

        {recentWarning && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 12,
              background: blocked ? "#fde2e2" : "#fff3cd",
              color: blocked ? "#8a1f1f" : "#7a5a00",
              fontWeight: 700,
            }}
          >
            {recentWarning}
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={sectionTitle}>POS Summary</h2>
        <Row label="Status" value={message || "Ready"} />
      </section>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 0",
        borderBottom: "1px solid #eee",
        fontSize: 18,
      }}
    >
      <span>{label}</span>
      <strong style={{ textAlign: "right" }}>{value}</strong>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 18,
  marginBottom: 20,
  boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 800,
  marginBottom: 18,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: 700,
  marginBottom: 8,
  marginTop: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  fontSize: 18,
  marginBottom: 10,
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: "16px",
  borderRadius: 14,
  border: "none",
  background: "#2f86c7",
  color: "white",
  fontSize: 18,
  fontWeight: 800,
  marginTop: 12,
};