"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type InventoryRow = {
  id: string
  quantity: number
  unit: string | null
  product_id: string | null
  cost_per_unit?: number | null
  selling_price?: number | null
  products:
    | {
        name: string
      }[]
    | null
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryRow[]>([])
  const [status, setStatus] = useState("Loading...")
  const supabase = createClientInstance()

  useEffect(() => {
    async function loadInventory() {
      const { data, error } = await supabase
        .from("inventory")
        .select(`
          id,
          quantity,
          unit,
          product_id,
          cost_per_unit,
          selling_price,
          products (
            name
          )
        `)

      if (error) {
        console.error("Inventory load error:", error)
        setStatus("Error loading inventory")
        return
      }

      setItems((data as InventoryRow[]) || [])
      setStatus("Ready")
    }

    loadInventory()
  }, [supabase])

  const totalInventoryValue = items.reduce((total, item) => {
    const sellPrice = Number(item.selling_price || 0)
    const qty = Number(item.quantity || 0)
    return total + sellPrice * qty
  }, 0)

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
          <span>${totalInventoryValue.toFixed(2)}</span>
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
                : "Missing Product Link"

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