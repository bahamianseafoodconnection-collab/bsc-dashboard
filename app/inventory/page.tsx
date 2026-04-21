"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "@/lib/supabase/browser"

type InventoryItem = {
  id: number
  name: string
  quantity: number
  reorder_level: number
}

export default function InventoryPage() {
  const supabase = createClientInstance()

  const [items, setItems] = useState<InventoryItem[]>([])
  const [status, setStatus] = useState("Loading...")

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("*")

      if (error) {
        setStatus("Error loading inventory")
        return
      }

      setItems(data || [])
      setStatus("Loaded")
    }

    load()
  }, [])

  const totalItems = items.length
  const lowStock = items.filter(i => i.quantity < i.reorder_level).length
  const reorderSuggestions = lowStock

  return (
    <div>
      <h2 className="page-title">Inventory</h2>

      <div className="summary-card">
        <h2>Inventory Screen</h2>

        <div className="metric">
          <span>Items Tracked</span>
          <span>{totalItems}</span>
        </div>

        <div className="metric">
          <span>Low Stock Items</span>
          <span>{lowStock}</span>
        </div>

        <div className="metric">
          <span>Reorder Suggestions</span>
          <span>{reorderSuggestions}</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>System Status</h2>
        <p>{status}</p>
      </div>
    </div>
  )
}