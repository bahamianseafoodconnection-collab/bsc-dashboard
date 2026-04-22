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
  product_id: string | null
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
  dailyTarget: number
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryRow[]>([])
  const [status, setStatus] = useState("Loading...")
  const [loading, setLoading] = useState(true)

  const [lowStockCount, setLowStockCount] = useState(0)
  const [reorderItems, setReorderItems] = useState<ReorderItem[]>([])
  const [velocityData, setVelocityData] = useState<VelocityItem[]>([])

  const [totalValue, setTotalValue] = useState(0)
  const [lowStockValue, setLowStockValue] = useState(0)

  useEffect(() => {
    const supabase = createClientInstance()

    async function loadInventory() {
      const { data, error } = await supabase.from("inventory").select(`
        id,
        quantity,
        unit,
        cost_per_unit,
        selling_price,
        last_updated,
        product_id,
        products ( name )
      `)

      if (error) {
        console.error(error)
        setStatus("Error loading inventory")
        setLoading(false)
        return
      }

      const rows: InventoryRow[] = (data ?? []).map((item: any) => ({
        id: item.id,
        quantity: Number(item.quantity ?? 0),
        unit: item.unit ?? null,
        cost_per_unit: item.cost_per_unit ?? 0,
        selling_price: item.selling_price ?? 0,
        last_updated: item.last_updated ?? null,
        product_id: item.product_id ?? null,
        products: item.products ?? null,
      }))

      setItems(rows)

      let low = 0
      let totalVal = 0
      let lowVal = 0

      const reorderList: ReorderItem[] = []
      const velocityList: VelocityItem[] = []

      rows.forEach((item) => {
        const TARGET = 50
        const DAILY_USAGE = 5

        const name = item.products?.name ?? "Unknown"
        const cost = Number(item.cost_per_unit ?? 0)
        const value = item.quantity * cost

        totalVal += value

        if (item.quantity <= 20) {
          low++
          lowVal += value
        }

        if (item.quantity < TARGET) {
          reorderList.push({
            name,
            needed: TARGET - item.quantity,
          })
        }

        const daysLeft =
          item.quantity > 0 ? Math.floor(item.quantity / DAILY_USAGE) : 0

        velocityList.push({
          name,
          daysLeft,
          dailyTarget: DAILY_USAGE,
        })
      })

      setLowStockCount(low)
      setLowStockValue(lowVal)
      setTotalValue(totalVal)

      setReorderItems(reorderList)
      setVelocityData(velocityList)

      setStatus("Ready")
      setLoading(false)
    }

    loadInventory()
  }, [])

  function money(val: number) {
    return `$${val.toFixed(2)}`
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
          <span>Low Stock Value</span>
          <span style={{ color: "red" }}>{money(lowStockValue)}</span>
        </div>

        <div className="metric">
          <span>Reorder Items</span>
          <span style={{ color: reorderItems.length > 0 ? "red" : "inherit" }}>
            {reorderItems.length}
          </span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Stock Runout + Daily Target</h2>

        {velocityData.map((item, i) => (
          <div key={i} className="metric">
            <span>{item.name}</span>
            <span>
              {item.daysLeft} days | Sell {item.dailyTarget}/day
            </span>
          </div>
        ))}
      </div>

      <div className="summary-card">
        <h2>Reorder Suggestions</h2>

        {reorderItems.map((item, i) => (
          <div key={i} className="metric">
            <span>{item.name}</span>
            <span style={{ color: "red" }}>Buy {item.needed}</span>
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