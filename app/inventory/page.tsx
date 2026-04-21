"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

export default function InventoryPage() {
  const supabase = createClientInstance()

  const [items, setItems] = useState<any[]>([])
  const [status, setStatus] = useState("Loading")

  useEffect(() => {
    const loadInventory = async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("*")

      if (error) {
        setStatus("Error loading inventory")
      } else {
        setItems(data || [])
        setStatus("Ready")
      }
    }

    loadInventory()
  }, [])

  return (
    <>
      <h2 className="page-title">Inventory</h2>

      <div className="summary-card">
        <h2>Inventory Screen</h2>

        <div className="metric">
          <span>Items Tracked</span>
          <span>{items.length}</span>
        </div>

        <div className="metric">
          <span>Low Stock Items</span>
          <span>0</span>
        </div>

        <div className="metric">
          <span>Reorder Suggestions</span>
          <span>0</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>System Status</h2>

        <div className="metric">
          <span>Inventory Status</span>
          <span>{status}</span>
        </div>
      </div>
    </>
  )
}