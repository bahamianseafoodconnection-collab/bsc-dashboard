"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "../../lib/supabase/browser";

type InventoryRow = {
  id: string;
  name: string;
  quantity: number;
  price: number;
  raw: any;
};

type SaleRow = {
  id?: string;
  item_name: string;
  amount: number;
  quantity: number;
  created_at?: string;
};

function getNumber(value: any, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getString(value: any, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function mapInventoryRow(row: any): InventoryRow {
  return {
    id: String(
      row.id ??
        row.product_id ??
        row.inventory_id ??
        crypto.randomUUID()
    ),
    name: getString(
      row.name ??
        row.product_name ??
        row.item_name ??
        row.title,
      "Unnamed Item"
    ),
    quantity: getNumber(
      row.quantity ??
        row.stock ??
        row.stock_quantity ??
        row.qty ??
        row.on_hand,
      0
    ),
    price: getNumber(
      row.price ??
        row.selling_price ??
        row.sale_price ??
        row.amount,
      0
    ),
    raw: row,
  };
}

function isCaseItem(name: string) {
  const lower = name.toLowerCase();
  return (
    lower.includes("case") ||
    lower.includes("cs") ||
    lower.includes("10lb case") ||
    lower.includes("box")
  );
}

function getMinimumAllowedStock(name: string) {
  return isCaseItem(name) ? 2 : 10;
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

export default function POSPage() {
  const supabase = createBrowserClient();

  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Ready");
  const [selectedId, setSelectedId] = useState("");
  const [quantityInput, setQuantityInput] = useState("1");
  const [transactionsToday, setTransactionsToday] = useState(0);
  const [salesToday, setSalesToday] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  async function loadInventory() {
    const { data, error } = await supabase.from("inventory").select("*").order("created_at", { ascending: false });

    if (error) {
      console.error("Inventory load error:", error);
      throw error;
    }

    const mapped = (data ?? []).map(mapInventoryRow);

    mapped.sort((a, b) => a.name.localeCompare(b.name));
    setInventory(mapped);

    if (!selectedId && mapped.length > 0) {
      setSelectedId(mapped[0].id);
    }
  }

  async function loadSales() {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();

    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .gte("created_at", start)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Sales load error:", error);
      throw error;
    }

    const sales = (data ?? []).map((row: any) => ({
      id: row.id,
      item_name: getString(row.item_name ?? row.name, "Unknown Sale"),
      amount: getNumber(row.amount ?? row.total, 0),
      quantity: getNumber(row.quantity, 1),
      created_at: row.created_at,
    }));

    setRecentSales(sales.slice(0, 5));
    setTransactionsToday(sales.length);
    setSalesToday(sales.reduce((sum, sale) => sum + sale.amount, 0));
  }

  async function refreshAll() {
    setLoading(true);
    try {
      await Promise.all([loadInventory(), loadSales()]);
      setStatus("Ready");
    } catch (error) {
      setStatus("Error loading data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedItem = useMemo(() => {
    return inventory.find((item) => item.id === selectedId) ?? null;
  }, [inventory, selectedId]);

  const quantity = useMemo(() => {
    const parsed = parseInt(quantityInput, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }, [quantityInput]);

  const minimumAllowed = selectedItem ? getMinimumAllowedStock(selectedItem.name) : 0;
  const stockAfterSale = selectedItem ? selectedItem.quantity - quantity : 0;
  const totalSale = selectedItem ? selectedItem.price * quantity : 0;

  const protectionMessage = useMemo(() => {
    if (!selectedItem) return "Select an item";
    if (quantity <= 0) return "Enter a valid quantity";
    if (quantity > selectedItem.quantity) return "Not enough stock available";

    if (stockAfterSale < minimumAllowed) {
      const floorText = isCaseItem(selectedItem.name)
        ? "Must keep at least 2 cases in stock"
        : "Must keep at least 10 pieces/portions in stock";

      return floorText;
    }

    return "";
  }, [selectedItem, quantity, stockAfterSale, minimumAllowed]);

  const canRecordSale =
    !!selectedItem &&
    quantity > 0 &&
    !protectionMessage &&
    !isSaving;

  async function handleRecordSale() {
    if (!selectedItem) {
      setStatus("Select an item first");
      return;
    }

    if (quantity <= 0) {
      setStatus("Enter a valid quantity");
      return;
    }

    if (protectionMessage) {
      setStatus(`Blocked: ${protectionMessage}`);
      return;
    }

    setIsSaving(true);
    setStatus("Recording sale...");

    try {
      const updatedQuantity = selectedItem.quantity - quantity;

      const inventoryUpdatePayload: any = {};

      if ("quantity" in selectedItem.raw) inventoryUpdatePayload.quantity = updatedQuantity;
      else if ("stock" in selectedItem.raw) inventoryUpdatePayload.stock = updatedQuantity;
      else if ("stock_quantity" in selectedItem.raw) inventoryUpdatePayload.stock_quantity = updatedQuantity;
      else if ("qty" in selectedItem.raw) inventoryUpdatePayload.qty = updatedQuantity;
      else if ("on_hand" in selectedItem.raw) inventoryUpdatePayload.on_hand = updatedQuantity;
      else inventoryUpdatePayload.quantity = updatedQuantity;

      const { error: inventoryError } = await supabase
        .from("inventory")
        .update(inventoryUpdatePayload)
        .eq("id", selectedItem.id);

      if (inventoryError) {
        console.error("Inventory update error:", inventoryError);
        throw inventoryError;
      }

      const salePayload = {
        item_name: selectedItem.name,
        amount: totalSale,
        quantity,
      };

      const { error: saleError } = await supabase.from("sales").insert([salePayload]);

      if (saleError) {
        console.error("Sale insert error:", saleError);
        throw saleError;
      }

      setStatus("✅ Sale recorded");
      setQuantityInput("1");
      await refreshAll();
    } catch (error) {
      console.error(error);
      setStatus("Error recording sale");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main style={{ padding: "24px 20px 120px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 24 }}>POS</h1>

      <section
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 24,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>New Sale</h2>

        <div style={{ display: "grid", gap: 12 }}>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            style={{
              width: "100%",
              border: "1px solid #d1d5db",
              borderRadius: 14,
              padding: "14px 16px",
              fontSize: 18,
              background: "#fff",
            }}
          >
            {inventory.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({formatMoney(item.price)}) ({item.quantity})
              </option>
            ))}
          </select>

          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={quantityInput}
            onChange={(e) => setQuantityInput(e.target.value)}
            placeholder="Quantity"
            style={{
              width: "100%",
              border: "1px solid #d1d5db",
              borderRadius: 14,
              padding: "14px 16px",
              fontSize: 18,
            }}
          />

          <button
            onClick={handleRecordSale}
            disabled={!canRecordSale}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "14px 18px",
              fontSize: 18,
              fontWeight: 700,
              cursor: canRecordSale ? "pointer" : "not-allowed",
              background: canRecordSale ? "#3b82f6" : "#dbeafe",
              color: canRecordSale ? "#ffffff" : "#2563eb",
            }}
          >
            {isSaving ? "Recording..." : "Record Sale"}
          </button>
        </div>
      </section>

      <section
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 24,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Sale Preview</h2>

        {selectedItem ? (
          <div style={{ display: "grid", gap: 14, fontSize: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span>Product</span>
              <strong style={{ textAlign: "right" }}>{selectedItem.name}</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span>Unit Price</span>
              <strong>{formatMoney(selectedItem.price)}</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span>Quantity</span>
              <strong>{quantity}</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span>Total Sale</span>
              <strong>{formatMoney(totalSale)}</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span>Stock After Sale</span>
              <strong>{stockAfterSale}</strong>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span>Protected Minimum</span>
              <strong>{minimumAllowed}</strong>
            </div>

            {protectionMessage ? (
              <div
                style={{
                  marginTop: 8,
                  background: "#fef2f2",
                  color: "#b91c1c",
                  border: "1px solid #fecaca",
                  borderRadius: 14,
                  padding: "12px 14px",
                  fontWeight: 700,
                }}
              >
                {protectionMessage}
              </div>
            ) : (
              <div
                style={{
                  marginTop: 8,
                  background: "#ecfdf5",
                  color: "#047857",
                  border: "1px solid #a7f3d0",
                  borderRadius: 14,
                  padding: "12px 14px",
                  fontWeight: 700,
                }}
              >
                Sale allowed
              </div>
            )}
          </div>
        ) : (
          <p style={{ fontSize: 18, color: "#6b7280" }}>No inventory items found.</p>
        )}
      </section>

      <section
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 24,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>POS Summary</h2>

        <div style={{ display: "grid", gap: 14, fontSize: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span>Status</span>
            <strong style={{ textAlign: "right" }}>
              {loading ? "Loading..." : status}
            </strong>
          </div>

          <div style={{ height: 1, background: "#e5e7eb" }} />

          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span>Transactions Today</span>
            <strong>{transactionsToday}</strong>
          </div>

          <div style={{ height: 1, background: "#e5e7eb" }} />

          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span>Sales Today</span>
            <strong>{formatMoney(salesToday)}</strong>
          </div>
        </div>
      </section>

      <section
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 24,
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Recent POS Activity</h2>

        <div style={{ display: "grid", gap: 14 }}>
          {recentSales.length === 0 ? (
            <p style={{ fontSize: 18, color: "#6b7280" }}>No sales yet today.</p>
          ) : (
            recentSales.map((sale, index) => (
              <div key={sale.id ?? `${sale.item_name}-${index}`}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    fontSize: 18,
                  }}
                >
                  <span>{sale.item_name}</span>
                  <strong>{formatMoney(sale.amount)}</strong>
                </div>
                {index !== recentSales.length - 1 && (
                  <div style={{ height: 1, background: "#e5e7eb", marginTop: 14 }} />
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}