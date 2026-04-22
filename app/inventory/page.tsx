"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type InventoryItem = {
  id: string
  quantity: number
  unit: string
  cost_per_unit: number
  selling_price: number
}

export default function InventoryPage() {
  const supabase = createClientInstance()

  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadInventory() {
      const { data, error } = await supabase
        .from("inventory")
        .select("*")

      if (error) {
        console.error(error)
      } else {
        setItems(data || [])
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

        {loading && <p>Loading...</p>}

        {!loading &&
          items.map((item) => (
            <div key={item.id} className="metric">
              <span>{item.unit}</span>
              <span>{item.quantity}</span>
            </div>
          ))}
      </div>
    </div>
  )
}