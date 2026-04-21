"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "@/lib/supabase/browser"

type InventoryItem = {
  id: number
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [status, setStatus] = useState("Loading...")

  useEffect(() => {
    const loadInventory = async () => {
      try {
        const supabase = createClientInstance()

        const { data, error } = await supabase
          .from("inventory")
          .select("*")

        if (error) {
          console.error(error)
          setStatus("Error loading inventory")
          return
        }

        setItems(data || [])
        setStatus("Ready")
      } catch (err) {
        console.error(err)
        setStatus("Error loading inventory")
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