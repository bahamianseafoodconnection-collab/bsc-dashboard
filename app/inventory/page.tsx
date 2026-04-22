"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type InventoryItem = {
  id: string
  quantity: number
}

export default function InventoryPage() {
  const supabase = createClientInstance()

  const [itemsTracked, setItemsTracked] = useState(0)
  const [lowStock, setLowStock] = useState(0)
  const [suggestions, setSuggestions] = useState(0)
  const [status, setStatus] = useState("Loading...")

  useEffect(() => {
    const loadInventory = async () => {
      const { data, error } = await supabase
        .from("inventory")
        .select("id, quantity")

      if (error) {
        console.error(error)
        setStatus("Error loading inventory")
        return
      }

      const rows = data as InventoryItem[]

      // TOTAL ITEMS
      setItemsTracked(rows.length)

      // LOW STOCK RULE (LESS THAN OR EQUAL TO 20)
      const low = rows.filter((item) => item.quantity <= 20).length
      setLowStock(low)

      // SIMPLE SUGGESTION RULE
      setSuggestions(low)

      setStatus("Ready")
    }

    loadInventory()
  }, [supabase])

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