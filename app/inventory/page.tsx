"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type InventoryItem = {
  id: number
  quantity: number
  reorder_level: number
}

export default function InventoryPage() {
  const supabase = createClientInstance()

  const [itemsTracked, setItemsTracked] = useState(0)
  const [lowStock, setLowStock] = useState(0)
  const [suggestions, setSuggestions] = useState(0)
  const [status, setStatus] = useState("Loading")

  async function loadInventory() {
    const { data, error } = await supabase
      .from("inventory")
      .select("*")

    if (error) {
      setStatus("Error loading inventory")
      return
    }

    const items = (data as InventoryItem[]) || []

    setItemsTracked(items.length)

    const low = items.filter(i => i.quantity < i.reorder_level)
    setLowStock(low.length)

    const suggest = low.filter(i => i.reorder_level - i.quantity > 0)
    setSuggestions(suggest.length)

    setStatus("Ready")
  }

  useEffect(() => {
    loadInventory()
  }, [])

  return (
    <>
      <h2 className="page-title">Inventory</h2>

      <div className="summary-card">
        <h2>Inventory Screen</h2>

        <div className="metric">
          <span>Items Tracked</span>
          <span>{itemsTracked}</span>
        </div>

        <div className="metric">
          <span>Low Stock Items</span>
          <span>{lowStock}</span>
        </div>

        <div className="metric">
          <span>Reorder Suggestions</span>
          <span>{suggestions}</span>
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