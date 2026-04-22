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

  const [lowStockCount, setLowStockCount] = useState(0)
  const [reorderCount, setReorderCount] = useState(0)

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

      if (error) {
        console.error(error)
        setStatus("Error loading inventory")
        setLoading(false)
        return
      }

      const rows = (data ?? []) as unknown as InventoryRow[]
      setItems(rows)

      // 🔴 CONTROL LOGIC
      let low = 0
      let reorder = 0

      rows.forEach((item) => {
        if (item.quantity <= 20) low++
        if (item.quantity <= 10) reorder++
      })

      setLowStockCount(low)
      setReorderCount(reorder)

      setStatus("Ready")
      setLoading(false)
    }

    loadInventory()
  }, [supabase])

  function formatMoney(value: number | null) {
    if (!value) return "$0.00"
    return `$${Number(value).toFixed(2)}`
  }

  function stockValue(qty: number, cost: number | null) {
    return qty * Number(cost ?? 0)
  }

  return (
    <>
      <h2 className="page-title">Inventory</h2>

      {/* 🔴 CONTROL SUMMARY */}
      <div className="summary-card">
        <h2>Inventory Summary</h2>

        <div className="metric">
          <span>Items Tracked</span>
          <span>{items.length}</span>
        </div>

        <div className="metric">
          <span>Low Stock Items</span>
          <span style={{ color: lowStockCount > 0 ? "red" : "inherit" }}>
            {lowStockCount}
          </span>
        </div>

        <div className="metric">
          <span>Reorder Needed</span>
          <span style={{ color: reorderCount > 0 ? "red" : "inherit" }}>
            {reorderCount}
          </span>
        </div>
      </div>

      {/* 🔴 INVENTORY LIST */}
      <div className="summary-card">
        <h2>Inventory List</h2>

        {loading ? (
          <p>Loading...</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="metric" style={{ display: "block" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontWeight: 700,
                }}
              >
                <span>{item.products?.name}</span>
                <span>{item.quantity}</span>
              </div>

              <div style={{ fontSize: 14, color: "#64748b" }}>
                Unit: {item.unit} <br />
                Cost: {formatMoney(item.cost_per_unit)} <br />
                Price: {formatMoney(item.selling_price)} <br />
                Value: {formatMoney(stockValue(item.quantity, item.cost_per_unit))}
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