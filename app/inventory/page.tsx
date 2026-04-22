"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type InventoryRow = {
  id: string
  quantity: number
  cost_per_unit: number | null
  product_id: string | null
  products:
    | {
        name: string
      }[]
    | null
}

type VelocityItem = {
  name: string
  daysLeft: number
  dailySales: number
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryRow[]>([])
  const [velocity, setVelocity] = useState<VelocityItem[]>([])
  const [totalValue, setTotalValue] = useState(0)
  const [status, setStatus] = useState("Loading...")

  useEffect(() => {
    const supabase = createClientInstance()

    async function loadData() {
      const { data: inventory, error } = await supabase
        .from("inventory")
        .select(`
          id,
          quantity,
          cost_per_unit,
          product_id,
          products ( name )
        `)

      if (error || !inventory) {
        console.error(error)
        setStatus("Error loading inventory")
        return
      }

      const invRows: InventoryRow[] = inventory

      let total = 0

      const velocityList: VelocityItem[] = []

      invRows.forEach((item) => {
        // ✅ FIX: handle array properly
        const name = item.products?.[0]?.name ?? "Unknown"

        const cost = Number(item.cost_per_unit ?? 0)
        total += item.quantity * cost

        const dailySales = 5 // placeholder (we will upgrade next step)

        const daysLeft =
          item.quantity > 0 ? Math.floor(item.quantity / dailySales) : 0

        velocityList.push({
          name,
          daysLeft,
          dailySales,
        })
      })

      setItems(invRows)
      setVelocity(velocityList)
      setTotalValue(total)
      setStatus("Ready")
    }

    loadData()
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
          <span>Total Inventory Value</span>
          <span>{money(totalValue)}</span>
        </div>

        <div className="metric">
          <span>Items Tracked</span>
          <span>{items.length}</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Stock Runout</h2>

        {velocity.map((item, i) => (
          <div key={i} className="metric">
            <span>{item.name}</span>
            <span>{item.daysLeft} days left</span>
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