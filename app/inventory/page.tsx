"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type InventoryRow = {
  id: string
  quantity: number | null
  unit: string | null
  product_id: string
  products: {
    name: string | null
  } | null
}

export default function InventoryPage() {
  const supabase = createClientInstance()

  const [items, setItems] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState("Loading inventory...")

  useEffect(() => {
    async function loadInventory() {
      const { data, error } = await supabase
        .from("inventory")
        .select(`
          id,
          quantity,
          unit,
          product_id,
          products (
            name
          )
        `)
        .order("created_at", { ascending: true })

      if (error) {
        console.error("Inventory load error:", error)
        setStatus("Error loading inventory")
        setItems([])
        setLoading(false)
        return
      }

      const rows = (data ?? []) as InventoryRow[]
      setItems(rows)
      setStatus("Ready")
      setLoading(false)
    }

    loadInventory()
  }, [supabase])

  return (
    <div>
      <h2 className="page-title">Inventory</h2>

      <div className="summary-card">
        <h2>Inventory List</h2>

        {loading ? (
          <div className="metric">
            <span>Loading...</span>
            <span>...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="metric">
            <span>No inventory found</span>
            <span>0</span>
          </div>
        ) : (
          items.map((item) => (
            <div className="metric" key={item.id}>
              <span>
                {item.products?.name ?? "Unknown Product"}
                {item.unit ? ` (${item.unit})` : ""}
              </span>
              <span>{item.quantity ?? 0}</span>
            </div>
          ))
        )}
      </div>

      <div className="summary-card">
        <h2>System Status</h2>

        <div className="metric">
          <span>Inventory Status</span>
          <span>{status}</span>
        </div>
      </div>
    </div>
  )
}