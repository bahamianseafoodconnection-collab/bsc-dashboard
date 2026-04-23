"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

type InventoryOption = {
  id: string;
  name: string;
  price: number;
  stock: number;
};

type SaleRow = {
  id: string;
  item: string;
  amount: number;
  created_at?: string;
};

const supabase = createClient();

export default function POSPage() {
  const [items, setItems] = useState<InventoryOption[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState("Loading...");
  const [isSaving, setIsSaving] = useState(false);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId]
  );

  const minimumStock = useMemo(() => {
    if (!selectedItem) return 0;
    const lowerName = selectedItem.name.toLowerCase();
    return lowerName.includes("case") ? 2 : 10;
  }, [selectedItem]);

  const maxAllowedQuantity = useMemo(() => {
    if (!selectedItem) return 0;
    return Math.max(selectedItem.stock - minimumStock, 0);
  }, [selectedItem, minimumStock]);

  const saleAmount = useMemo(() => {
    if (!selectedItem) return 0;
    return Number((selectedItem.price * quantity).toFixed(2));
  }, [selectedItem, quantity]);

  const stockAfterSale = useMemo(() => {
    if (!selectedItem) return 0;
    return selectedItem.stock - quantity;
  }, [selectedItem, quantity]);

  const totalSalesToday = useMemo(() => {
    return sales.reduce((sum, sale) => sum + Number(sale.amount || 0), 0);
  }, [sales]);

  useEffect(() => {
    void loadPageData();
  }, []);

  useEffect(() => {
    if (!selectedItem) return;

    if (maxAllowedQuantity <= 0) {
      setQuantity(0);
      return;
    }

    if (quantity < 1) {
      setQuantity(1);
      return;
    }

    if (quantity > maxAllowedQuantity) {
      setQuantity(maxAllowedQuantity);
    }
  }, [selectedItem, maxAllowedQuantity, quantity]);

  async function loadPageData() {
    setStatus("Loading...");

    const [inventoryResult, salesResult] = await Promise.all([
      supabase
        .from("inventory")
        .select("id, quantity, selling_price, products(name)")
        .order("created_at", { ascending: true }),
      supabase
        .from("sales")
        .select("id, item, amount, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (inventoryResult.error) {
      console.error("Inventory load error:", inventoryResult.error);
      setStatus("Error loading inventory");
    }

    if (salesResult.error) {
      console.error("Sales load error:", salesResult.error);
      setStatus("Error loading sales");
    }

    const inventoryRows = (inventoryResult.data || []) as any[];
    const salesRows = ((salesResult.data || []) as any[]).map((sale) => ({
      id: String(sale.id),
      item: String(sale.item ?? ""),
      amount: Number(sale.amount ?? 0),
      created_at: sale.created_at ? String(sale.created_at) : undefined,
    }));

    const mappedItems: InventoryOption[] = inventoryRows
      .map((row) => {
        const productName =
          row?.products && !Array.isArray(row.products)
            ? String(row.products.name ?? "")
            : row?.products?.[0]?.name
              ? String(row.products[0].name)
              : "Missing Product Link";

        return {
          id: String(row.id),
          name: productName,
          price: Number(row.selling_price ?? 0),
          stock: Number(row.quantity ?? 0),
        };
      })
      .filter((item) => item.stock > 0);

    setItems(mappedItems);
    setSales(salesRows);

    if (mappedItems.length > 0) {
      setSelectedId((current) => {
        const stillExists = mappedItems.some((item) => item.id === current);
        return stillExists ? current : mappedItems[0].id;
      });
    } else {
      setSelectedId("");
      setQuantity(0);
    }

    if (!inventoryResult.error && !salesResult.error) {
      setStatus("Ready");
    }
  }

  function changeQuantity(next: number) {
    if (!selectedItem) return;
    if (maxAllowedQuantity <= 0) {
      setQuantity(0);
      return;
    }
    const safeValue = Math.min(Math.max(next, 1), maxAllowedQuantity);
    setQuantity(safeValue);
  }

  function addQuantity(step: number) {
    changeQuantity(quantity + step);
  }

  async function recordSale() {
    if (!selectedItem) {
      setStatus("Select a product");
      return;
    }

    if (maxAllowedQuantity <= 0) {
      setStatus(`Must keep at least ${minimumStock} in stock`);
      return;
    }

    if (quantity < 1) {
      setStatus("Choose quantity");
      return;
    }

    if (quantity > maxAllowedQuantity) {
      setStatus(`Must keep at least ${minimumStock} in stock`);
      return;
    }

    if (quantity >= 10) {
      const confirmed = window.confirm("Large sale detected. Continue?");
      if (!confirmed) return;
    }

    setIsSaving(true);
    setStatus("Saving...");

    const amount = Number((selectedItem.price * quantity).toFixed(2));
    const updatedStock = selectedItem.stock - quantity;

    const saleInsert = await supabase.from("sales").insert({
      item: selectedItem.name,
      amount,
    });

    if (saleInsert.error) {
      console.error("Sale insert error:", saleInsert.error);
      setStatus("Error saving sale");
      setIsSaving(false);
      return;
    }

    const inventoryUpdate = await supabase
      .from("inventory")
      .update({ quantity: updatedStock })
      .eq("id", selectedItem.id);

    if (inventoryUpdate.error) {
      console.error("Inventory update error:", inventoryUpdate.error);
      setStatus("Error updating inventory");
      setIsSaving(false);
      return;
    }

    await loadPageData();

    setQuantity(1);
    setStatus("Sale recorded");
    setIsSaving(false);
  }

  const canSell =
    !!selectedItem && maxAllowedQuantity > 0 && quantity >= 1 && !isSaving;

  return (
    <main className="min-h-screen bg-neutral-100 pb-24">
      <div className="mx-auto max-w-md">
        <div className="bg-sky-500 px-6 py-7">
          <h1 className="text-4xl font-extrabold tracking-wide text-white">
            BSC CONTROL
          </h1>
        </div>

        <div className="px-4 py-6">
          <h2 className="mb-4 text-3xl font-bold text-slate-900">POS</h2>

          <section className="mb-6 rounded-[28px] border border-neutral-200 bg-white p-5 shadow-sm">
            <h3 className="mb-5 text-2xl font-bold text-slate-900">New Sale</h3>

            <div className="space-y-4">
              <select
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setQuantity(1);
                }}
                className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-lg text-slate-900 outline-none"
              >
                {items.length === 0 ? (
                  <option value="">No products available</option>
                ) : (
                  items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} (${item.price}) ({item.stock})
                    </option>
                  ))
                )}
              </select>

              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => addQuantity(-1)}
                  disabled={!selectedItem || quantity <= 1 || isSaving}
                  className="rounded-2xl border border-neutral-300 bg-white px-3 py-3 text-lg font-semibold text-slate-900 disabled:opacity-40"
                >
                  -1
                </button>

                <button
                  type="button"
                  onClick={() => addQuantity(1)}
                  disabled={!selectedItem || maxAllowedQuantity <= 0 || isSaving}
                  className="rounded-2xl border border-neutral-300 bg-white px-3 py-3 text-lg font-semibold text-slate-900 disabled:opacity-40"
                >
                  +1
                </button>

                <button
                  type="button"
                  onClick={() => addQuantity(5)}
                  disabled={!selectedItem || maxAllowedQuantity <= 0 || isSaving}
                  className="rounded-2xl border border-neutral-300 bg-white px-3 py-3 text-lg font-semibold text-slate-900 disabled:opacity-40"
                >
                  +5
                </button>

                <button
                  type="button"
                  onClick={() => addQuantity(10)}
                  disabled={!selectedItem || maxAllowedQuantity <= 0 || isSaving}
                  className="rounded-2xl border border-neutral-300 bg-white px-3 py-3 text-lg font-semibold text-slate-900 disabled:opacity-40"
                >
                  +10
                </button>
              </div>

              <div className="rounded-2xl border border-neutral-300 bg-neutral-50 px-4 py-3">
                <div className="text-sm font-medium text-slate-500">Quantity</div>
                <div className="text-3xl font-bold text-slate-900">
                  {quantity}
                </div>
              </div>

              <button
                type="button"
                onClick={recordSale}
                disabled={!canSell}
                className="w-full rounded-2xl bg-blue-600 px-4 py-4 text-xl font-bold text-white shadow-sm disabled:opacity-40"
              >
                {isSaving ? "Saving..." : "Record Sale"}
              </button>
            </div>
          </section>

          <section className="mb-6 rounded-[28px] border border-neutral-200 bg-white p-5 shadow-sm">
            <h3 className="mb-5 text-2xl font-bold text-slate-900">
              Sale Preview
            </h3>

            {selectedItem ? (
              <div className="space-y-4 text-lg text-slate-900">
                <div className="flex items-center justify-between gap-4 border-b border-neutral-200 pb-3">
                  <span>Product</span>
                  <span className="text-right font-medium">{selectedItem.name}</span>
                </div>

                <div className="flex items-center justify-between gap-4 border-b border-neutral-200 pb-3">
                  <span>Unit Price</span>
                  <span className="font-medium">
                    ${selectedItem.price.toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4 border-b border-neutral-200 pb-3">
                  <span>Quantity</span>
                  <span className="font-medium">{quantity}</span>
                </div>

                <div className="flex items-center justify-between gap-4 border-b border-neutral-200 pb-3">
                  <span>Total Sale</span>
                  <span className="font-medium">${saleAmount.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between gap-4 border-b border-neutral-200 pb-3">
                  <span>Stock After Sale</span>
                  <span className="font-medium">{stockAfterSale}</span>
                </div>

                {maxAllowedQuantity <= 0 ? (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800">
                    Low stock warning. Must keep at least {minimumStock} in stock.
                  </div>
                ) : stockAfterSale < minimumStock ? (
                  <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-red-700">
                    Must keep at least {minimumStock} in stock.
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-lg text-slate-500">Select a product to preview.</p>
            )}
          </section>

          <section className="mb-6 rounded-[28px] border border-neutral-200 bg-white p-5 shadow-sm">
            <h3 className="mb-5 text-2xl font-bold text-slate-900">
              POS Summary
            </h3>

            <div className="space-y-0 text-lg text-slate-900">
              <div className="flex items-center justify-between gap-4 border-b border-neutral-200 py-4">
                <span>Status</span>
                <span className="text-right font-medium">{status}</span>
              </div>

              <div className="flex items-center justify-between gap-4 border-b border-neutral-200 py-4">
                <span>Transactions Today</span>
                <span className="font-medium">{sales.length}</span>
              </div>

              <div className="flex items-center justify-between gap-4 py-4">
                <span>Sales Today</span>
                <span className="font-medium">${totalSalesToday.toFixed(2)}</span>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-neutral-200 bg-white p-5 shadow-sm">
            <h3 className="mb-5 text-2xl font-bold text-slate-900">
              Recent POS Activity
            </h3>

            {sales.length === 0 ? (
              <p className="text-lg text-slate-500">No sales yet</p>
            ) : (
              <div className="space-y-0">
                {sales.slice(0, 5).map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between gap-4 border-b border-neutral-200 py-4 last:border-b-0 last:pb-0"
                  >
                    <span className="text-lg text-slate-900">{sale.item}</span>
                    <span className="text-lg font-medium text-slate-900">
                      ${Number(sale.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}