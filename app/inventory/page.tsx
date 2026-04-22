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

type ReorderItem = {
  name: string
  needed: number
}

type VelocityItem = {
  name: string
  daysLeft: number
}

export default function InventoryPage() {
  const supabase = createClientInstance()

  const [items, setItems] = useState<InventoryRow[]>([])
  const [status, setStatus] = useState("Loading...")
  const [loading, setLoading] = useState(true)

  const [lowStockCount, setLowStockCount] = useState(0)
  const [reorderItems, setReorderItems] = useState<ReorderItem[]>([])
  const [velocityData, setVelocityData] = useState<VelocityItem[]>([])

  const [totalValue, setTotalValue] = useState(0)

  useEffect(() => {
    async function loadInventory() {
      setLoading(true)

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
      let total = 0

      const reorderList: ReorderItem[] = []
      const velocityList: VelocityItem[] = []

      rows.forEach((item) => {
        const TARGET = 50
        const DAILY_USAGE = 5

        const cost = Number(item.cost_per_unit ?? 0)

        // TOTAL VALUE
        total += item.quantity * cost

        // LOW STOCK
        if (item.quantity <= 20) low++

        // REORDER
        if (item.quantity < TARGET) {
          reorderList.push({
            name: item.products?.name ?? "Unknown",
            needed: TARGET - item.quantity,
          })
        }

        // VELOCITY
        const daysLeft =
          item.quantity > 0 ? Math.floor(item.quantity / DAILY_USAGE) : 0

        velocityList.push({
          name: item.products?.name ?? "Unknown",
          daysLeft,
        })
      })

      setTotalValue(total)
      setLowStockCount(low)
      setReorderItems(reorderList)
      setVelocityData(velocityList)

      setStatus("Ready")
      setLoading(false)
    }

    loadInventory()
  }, [supabase])

  function money(value: number) {
    return `$${value.toFixed(2)}`
  }

  return (
    <>
      <h2 className="page-title">Inventory</h2>

      {/* SUMMARY */}
      <div className="summary-card">
        <h2>Inventory Summary</h2>

        <div className="metric">
          <span>Items Tracked</span>
          <span>{items.length}</span>
        </div>

        <div className="metric">
          <span>Total Inventory Value</span>
          <span>{money(totalValue)}</span>
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

      {/* VELOCITY */}
      <div className="summary-card">
        <h2>Stock Runout Prediction</h2>

        {velocityData.map((item, i) => (
          <div key={i} className="metric">
            <span>{item.name}</span>
            <span style={{ color: item.daysLeft <= 3 ? "red" : "inherit" }}>
              {item.daysLeft} days left
            </span>
          </div>
        ))}
      </div>

      {/* REORDER */}
      <div className="summary-card">
        <h2>Reorder Suggestions</h2>

        {reorderItems.map((item, i) => (
          <div key={i} className="metric">
            <span>{item.name}</span>
            <span style={{ color: "red" }}>Buy {item.needed}</span>
          </div>
        ))}
      </div>

      {/* LIST */}
      <div className="summary-card">
        <h2>Inventory List</h2>

        {items.map((item) => (
          <div key={item.id} className="metric" style={{ display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
              <span>{item.products?.name}</span>
              <span>{item.quantity}</span>
            </div>

            <div style={{ fontSize: 14, color: "#64748b" }}>
              Unit: {item.unit} <br />
              Cost: {money(Number(item.cost_per_unit ?? 0))} <br />
              Price: {money(Number(item.selling_price ?? 0))} <br />
              Value: {money(item.quantity * Number(item.cost_per_unit ?? 0))}
            </div>
          </div>
        ))}
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