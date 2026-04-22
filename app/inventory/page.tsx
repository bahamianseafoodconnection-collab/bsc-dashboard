"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type InventoryRow = {
  id: string
  quantity: number
  cost_per_unit: number | null
  product_id: string | null
  products: {
    name: string
  } | null
}

type BillRow = {
  bill_type: string
  amount: number
  created_at: string
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
      // INVENTORY
      const { data: inventory } = await supabase.from("inventory").select(`
        id,
        quantity,
        cost_per_unit,
        product_id,
        products ( name )
      `)

      // SALES (using bills as movement proxy)
      const { data: bills } = await supabase
        .from("bills")
        .select("bill_type, amount, created_at")

      if (!inventory) {
        setStatus("Error loading inventory")
        return
      }

      const invRows: InventoryRow[] = inventory

      let total = 0

      const velocityList: VelocityItem[] = []

      invRows.forEach((item) => {
        const name = item.products?.name ?? "Unknown"

        const cost = Number(item.cost_per_unit ?? 0)
        total += item.quantity * cost

        // 🔥 REAL SALES LOGIC
        const sales =
          bills?.filter((b: BillRow) =>
            b.bill_type.toLowerCase().includes(name.toLowerCase())
          ) || []

        const totalSold = sales.reduce(
          (sum: number, s: BillRow) => sum + s.amount,
          0
        )

        // average daily sales (simple version)
        const dailySales = totalSold > 0 ? totalSold / 7 : 1

        const daysLeft =
          item.quantity > 0 ? Math.floor(item.quantity / dailySales) : 0

        velocityList.push({
          name,
          daysLeft,
          dailySales: Number(dailySales.toFixed(1)),
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
        <h2>Inventory Value</h2>

        <div className="metric">
          <span>Total Value</span>
          <span>{money(totalValue)}</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>REAL Sales Velocity</h2>

        {velocity.map((item, i) => (
          <div key={i} className="metric">
            <span>{item.name}</span>
            <span>
              {item.daysLeft} days | {item.dailySales}/day
            </span>
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