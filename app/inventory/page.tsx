"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type InventoryRow = {
  id: string
  quantity: number
  unit: string | null
  product_id: string | null
  products: {
    name: string
  } | null
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryRow[]>([])
  const [status, setStatus] = useState("Loading...")

  useEffect(() => {
    const loadInventory = async () => {
      const supabase = createClientInstance()

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

      if (error) {
        console.error(error)
        setStatus("Error loading inventory")
        return
      }

      setItems(data || [])
      setStatus("Ready")
    }

    loadInventory()
  }, [])

  return (
    <>
      <h2 className="page-title">Inventory</h2>

      <div className="summary-card">
        <h2>Inventory Summary</h2>

        <div className="metric">
          <span>Items Tracked</span>
          <span>{items.length}</span>
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
            const name = item.products?.name || "Missing Product Link"

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