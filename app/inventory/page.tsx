"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type InventoryRow = {
  id: string
  quantity: number
  unit: string | null
  product_id: string | null
  cost_per_unit?: number | null
  selling_price?: number | null
}

type ProductRow = {
  id: string
  name: string
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryRow[]>([])
  const [productMap, setProductMap] = useState<Record<string, string>>({})
  const [status, setStatus] = useState("Loading...")
  const supabase = createClientInstance()

  useEffect(() => {
    async function loadInventory() {
      setStatus("Loading...")

      const { data: inventoryData, error: inventoryError } = await supabase
        .from("inventory")
        .select(`
          id,
          quantity,
          unit,
          product_id,
          cost_per_unit,
          selling_price
        `)

      if (inventoryError) {
        console.error("Inventory load error:", inventoryError)
        setStatus("Error loading inventory")
        return
      }

      const inventoryRows = (inventoryData as InventoryRow[]) || []
      setItems(inventoryRows)

      const productIds = inventoryRows
        .map((item) => item.product_id)
        .filter((id): id is string => Boolean(id))

      if (productIds.length === 0) {
        setProductMap({})
        setStatus("Ready")
        return
      }

      const { data: productData, error: productError } = await supabase
        .from("products")
        .select("id, name")
        .in("id", productIds)

      if (productError) {
        console.error("Products load error:", productError)
        setStatus("Inventory loaded / product names missing")
        return
      }

      const map: Record<string, string> = {}
      ;((productData as ProductRow[]) || []).forEach((product) => {
        map[product.id] = product.name
      })

      setProductMap(map)
      setStatus("Ready")
    }

    loadInventory()
  }, [supabase])

  const totalInventoryValue = items.reduce((total, item) => {
    const sellPrice = Number(item.selling_price || 0)
    const qty = Number(item.quantity || 0)
    return total + sellPrice * qty
  }, 0)

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
          <span>Total Inventory Value</span>
          <span>${totalInventoryValue.toFixed(2)}</span>
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
            const name = item.product_id
              ? productMap[item.product_id] || "Missing Product Link"
              : "Missing Product Link"

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