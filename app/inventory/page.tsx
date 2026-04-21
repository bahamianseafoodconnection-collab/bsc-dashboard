"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type InventoryItem = {
  id: number
  name: string
  quantity: number
  reorder_level: number
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [status, setStatus] = useState("Loading...")

  useEffect(() => {
    const supabase = createClientInstance()

    const loadInventory = async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("id, name, quantity, reorder_level")
        .order("id", { ascending: true })

      if (error) {
        setStatus("Error loading inventory")
        return
      }

      setItems(data || [])
      setStatus("Inventory ready")
    }

    loadInventory()
  }, [])

  const totalItems = items.length
  const lowStockItems = items.filter(
    (item) => item.quantity <= item.reorder_level
  ).length
  const reorderSuggestions = lowStockItems

  return (
    <>
      <h2 className="page-title">Inventory</h2>

      <div className="summary-card">
        <h2>Inventory Screen</h2>

        <div className="metric">
          <span>Items Tracked</span>
          <span>{totalItems}</span>
        </div>

        <div className="metric">
          <span>Low Stock Items</span>
          <span>{lowStockItems}</span>
        </div>

        <div className="metric">
          <span>Reorder Suggestions</span>
          <span>{reorderSuggestions}</span>
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