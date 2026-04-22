"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

export default function InventoryPage() {
  const supabase = createClientInstance()

  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState("Loading...")

  useEffect(() => {
    async function loadInventory() {
      const { data, error } = await supabase
        .from("inventory")
        .select(`
          id,
          quantity,
          unit,
          product_id,
          products ( name )
        `)

      if (error) {
        console.error(error)
        setStatus("Error")
        setItems([])
      } else {
        setItems(data || [])
        setStatus("Ready")
      }

      setLoading(false)
    }

    loadInventory()
  }, [])

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
            <span>No inventory</span>
            <span>0</span>
          </div>
        ) : (
          items.map((item) => (
            <div className="metric" key={item.id}>
              <span>
                {item.products?.name || "Unknown"} ({item.unit})
              </span>
              <span>{item.quantity}</span>
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