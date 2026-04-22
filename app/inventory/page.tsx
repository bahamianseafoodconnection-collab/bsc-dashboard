"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type InventoryRow = {
  id: string
  quantity: number
  unit: string | null
  cost_per_unit: number | null
  selling_price: number | null
  products: {
    name: string
  } | null
}

export default function InventoryPage() {
  const supabase = createClientInstance()

  const [items, setItems] = useState<InventoryRow[]>([])
  const [status, setStatus] = useState("Loading...")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadInventory() {
      const { data, error } = await supabase
        .from("inventory")
        .select(`
          id,
          quantity,
          unit,
          cost_per_unit,
          selling_price,
          products (
            name
          )
        `)
        .order("created_at", { ascending: true })

      if (error) {
        console.error(error)
        setStatus("Error loading inventory")
        setLoading(false)
        return
      }

      const rows = (data ?? []) as unknown as InventoryRow[]
      setItems(rows)
      setStatus("Ready")
      setLoading(false)
    }

    loadInventory()
  }, [supabase])

  function formatMoney(value: number | null) {
    if (value === null || value === undefined) return "$0.00"
    return `$${Number(value).toFixed(2)}`
  }

  function getStockValue(quantity: number, costPerUnit: number | null) {
    return quantity * Number(costPerUnit ?? 0)
  }

  return (
    <>
      <h2 className="page-title">Inventory</h2>

      <div className="summary-card">
        <h2>Inventory List</h2>

        {loading ? (
          <p>Loading inventory...</p>
        ) : items.length === 0 ? (
          <p>No inventory found.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="metric" style={{ display: "block" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  marginBottom: "8px",
                  fontWeight: 700,
                }}
              >
                <span>{item.products?.name ?? "Unnamed Product"}</span>
                <span>{item.quantity}</span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  rowGap: "6px",
                  columnGap: "12px",
                  fontSize: "14px",
                  color: "#475569",
                }}
              >
                <span>Unit</span>
                <span>{item.unit ?? "-"}</span>

                <span>Cost Per Unit</span>
                <span>{formatMoney(item.cost_per_unit)}</span>

                <span>Selling Price</span>
                <span>{formatMoney(item.selling_price)}</span>

                <span>Stock Value</span>
                <span>{formatMoney(getStockValue(item.quantity, item.cost_per_unit))}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="summary-card">
        <h2>System Status</h2>

        <div className="metric">
          <span>Inventory Status</span>
          <span>{status}</span>
        </div>
      </div>
    </>
  )
}