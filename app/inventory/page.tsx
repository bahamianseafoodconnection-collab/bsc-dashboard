"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type InventoryRow = {
  id: string
  quantity: number
  unit: string | null
  cost_per_unit: number | null
  selling_price: number | null
  last_updated: string | null
  products: {
    name: string
  } | null
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState("Loading...")

  const [lowStockCount, setLowStockCount] = useState(0)
  const [reorderItems, setReorderItems] = useState<any[]>([])

  // 🔥 NEW CASH INTELLIGENCE
  const [inventoryValue, setInventoryValue] = useState(0)
  const [decision, setDecision] = useState("Analyzing...")

  useEffect(() => {
    const supabase = createClientInstance()

    async function loadInventory() {
      const { data, error } = await supabase
        .from("inventory")
        .select(`
          id,
          quantity,
          unit,
          cost_per_unit,
          selling_price,
          last_updated,
          products ( name )
        `)

      if (error) {
        console.error(error)
        setStatus("Error loading inventory")
        setLoading(false)
        return
      }

      const rows = (data ?? []) as InventoryRow[]
      setItems(rows)

      let low = 0
      let totalValue = 0
      const reorderList: any[] = []

      rows.forEach((item) => {
        const TARGET = 50

        const cost = Number(item.cost_per_unit ?? 0)
        const qty = Number(item.quantity ?? 0)

        const value = cost * qty
        totalValue += value

        if (qty <= 20) low++

        if (qty < TARGET) {
          reorderList.push({
            name: item.products?.name ?? "Unknown",
            needed: TARGET - qty,
          })
        }
      })

      // 🔥 DECISION ENGINE
      let decisionText = "Stable"

      if (totalValue > 5000) {
        decisionText = "⚠️ High cash tied in inventory — slow purchasing"
      } else if (low > 2) {
        decisionText = "⚠️ Low stock risk — reorder carefully"
      } else {
        decisionText = "✅ Healthy inventory balance"
      }

      setInventoryValue(totalValue)
      setLowStockCount(low)
      setReorderItems(reorderList)
      setDecision(decisionText)

      setStatus("Ready")
      setLoading(false)
    }

    loadInventory()
  }, [])

  function money(v: number) {
    return `$${v.toFixed(2)}`
  }

  return (
    <>
      <h2 className="page-title">Inventory</h2>

      {/* 🔥 SUMMARY */}
      <div className="summary-card">
        <h2>Inventory Summary</h2>

        <div className="metric">
          <span>Items Tracked</span>
          <span>{items.length}</span>
        </div>

        <div className="metric">
          <span>Low Stock</span>
          <span style={{ color: lowStockCount > 0 ? "red" : "inherit" }}>
            {lowStockCount}
          </span>
        </div>

        <div className="metric">
          <span>Reorder Items</span>
          <span style={{ color: reorderItems.length > 0 ? "red" : "inherit" }}>
            {reorderItems.length}
          </span>
        </div>
      </div>

      {/* 🔥 CASH INTELLIGENCE */}
      <div className="summary-card">
        <h2>Inventory Cash Impact</h2>

        <div className="metric">
          <span>Total Inventory Value</span>
          <span>{money(inventoryValue)}</span>
        </div>

        <div className="metric">
          <span>Decision</span>
          <span>{decision}</span>
        </div>
      </div>

      {/* REORDER */}
      <div className="summary-card">
        <h2>Reorder Suggestions</h2>

        {loading ? (
          <p>Loading...</p>
        ) : reorderItems.length === 0 ? (
          <p>Stock levels are good</p>
        ) : (
          reorderItems.map((item, i) => (
            <div key={i} className="metric">
              <span>{item.name}</span>
              <span style={{ color: "red" }}>Buy {item.needed}</span>
            </div>
          ))
        )}
      </div>

      {/* LIST */}
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
                Cost: {money(Number(item.cost_per_unit ?? 0))} <br />
                Price: {money(Number(item.selling_price ?? 0))} <br />
                Value:{" "}
                {money(
                  Number(item.quantity) * Number(item.cost_per_unit ?? 0)
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="summary-card">
        <h2>System Status</h2>

        <div className="metric">
          <span>Status</span>
          <span>{status}</span>
        </div>
      </div>
    </>
  )
}