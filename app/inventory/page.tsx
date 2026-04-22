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
  }[] | null   // ✅ FIX: ARRAY instead of single object
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryRow[]>([])
  const [status, setStatus] = useState("Loading...")

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
          product_id,
          products ( name )
        `)

      if (error) {
        console.error(error)
        setStatus("Error loading inventory")
        return
      }

      setItems(data || [])
      setStatus("Ready")
    }

    loadInventory()
  }, [])

  let totalValue = 0

  items.forEach((item) => {
    if (item.cost_per_unit) {
      totalValue += item.quantity * item.cost_per_unit
    }
  })

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
          items.map((item) => (
            <div key={item.id} className="metric">
              <span>
                {item.products?.[0]?.name || "Unknown"}
              </span>
              <span>{item.quantity}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}