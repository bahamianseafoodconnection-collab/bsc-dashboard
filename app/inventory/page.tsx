"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "@/lib/supabase/browser"

type InventoryRow = {
  id: string
  quantity: number
  unit: string | null
  cost_per_unit: number | null
  selling_price: number | null
  last_updated: string | null
  product_id: string | null
  products:
    | {
        name: string
      }[]
    | null
}

export default function InventoryPage() {
  const supabase = createClientInstance()

  const [items, setItems] = useState<InventoryRow[]>([])
  const [status, setStatus] = useState("Loading...")
  const [totalValue, setTotalValue] = useState(0)

  useEffect(() => {
    loadInventory()
  }, [])

  async function loadInventory() {
    try {
      const { data, error } = await supabase
        .from("inventory")
        .select("*, products(name)")

      if (error) throw error

      const rows = (data ?? []) as InventoryRow[]
      setItems(rows)

      let total = 0
      rows.forEach((item) => {
        if (item.cost_per_unit && item.quantity) {
          total += item.cost_per_unit * item.quantity
        }
      })

      setTotalValue(total)
      setStatus("Ready")
    } catch (err) {
      console.error(err)
      setStatus("Error loading inventory")
    }
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
          <span>${totalValue.toFixed(2)}</span>
        </div>

        <div className="metric">
          <span>Status</span>
          <span>{status}</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Inventory List</h2>

        {items.length === 0 ? (
          <p>No inventory found</p>
        ) : (
          items.map((item) => {
            const name =
              item.products && item.products.length > 0
                ? item.products[0].name
                : "⚠️ Missing Product Link"

            return (
              <div key={item.id} className="metric">
                <span>{name}</span>
                <span>{item.quantity}</span>
              </div>
            )
          })
        )}
      </div>
    </>
  )
}