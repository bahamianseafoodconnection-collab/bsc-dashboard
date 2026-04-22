"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type InventoryRow = {
  id: string
  quantity: number | null
  cost_per_unit: number | null
  product_id: string | null
  products: {
    name: string
  }[] | null
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryRow[]>([])
  const [status, setStatus] = useState("Loading...")

  useEffect(() => {
    loadInventory()
  }, [])

  async function loadInventory() {
    const supabase = createClientInstance()

    const { data, error } = await supabase
      .from("inventory")
      .select(`
        id,
        quantity,
        cost_per_unit,
        product_id,
        products ( name )
      `)

    if (error) {
      console.log("Inventory error:", error)
      setStatus("Error loading inventory")

      // IMPORTANT: still show data if available
      setItems((data as InventoryRow[]) || [])
      return
    }

    setItems((data as InventoryRow[]) || [])
    setStatus("Ready")
  }

  const totalValue = items.reduce((sum, item) => {
    return sum + (item.quantity || 0) * (item.cost_per_unit || 0)
  }, 0)

  return (
    <>
      <h1 className="page-title">Inventory</h1>

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