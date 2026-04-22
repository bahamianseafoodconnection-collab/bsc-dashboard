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
  const supabase = createClientInstance()

  const [items, setItems] = useState<InventoryRow[]>([])
  const [status, setStatus] = useState("Loading...")
  const [loading, setLoading] = useState(true)

  const [lowStockCount, setLowStockCount] = useState(0)
  const [reorderItems, setReorderItems] = useState<any[]>([])
  const [velocityData, setVelocityData] = useState<any[]>([])

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
      const reorderList: any[] = []
      const velocityList: any[] = []

      rows.forEach((item) => {
        const TARGET = 50

        if (item.quantity <= 20) low++

        if (item.quantity < TARGET) {
          reorderList.push({
            name: item.products?.name ?? "Unknown",
            needed: TARGET - item.quantity,
          })
        }

        const DAILY_USAGE = 5

        const daysLeft =
          item.quantity > 0 ? Math.floor(item.quantity / DAILY_USAGE) : 0

        velocityList.push({
          name: item.products?.name ?? "Unknown",
          daysLeft,
        })
      })

      setLowStockCount(low)
      setReorderItems(reorderList)
      setVelocityData(velocityList)

      setStatus("Ready")
      setLoading(false)
    }

    loadInventory()
  }, [])

  function money(value: number | null) {
    return `$${Number(value ?? 0).toFixed(2)}`
  }

  return (
    <>
      <h2 className="page-title">Inventory</h2>

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

      <div className="summary-card">
        <h2>Stock Runout Prediction</h2>

        {loading ? (
          <p>Loading...</p>
        ) : (
          velocityData.map((item, i) => (
            <div key={i} className="metric">
              <span>{item.name}</span>
              <span style={{ color: item.daysLeft <= 3 ? "red" : "inherit" }}>
                {item.daysLeft} days left
              </span>
            </div>
          ))
        )}
      </div>

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
                Cost: {money(item.cost_per_unit)} <br />
                Price: {money(item.selling_price)} <br />
                Value: {money(item.quantity * Number(item.cost_per_unit ?? 0))}
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