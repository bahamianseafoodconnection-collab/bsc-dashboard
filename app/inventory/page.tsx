"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type ProductRelation =
  | { name: string }
  | { name?: string | null }
  | null

type InventoryRow = {
  id: string
  quantity: number
  unit: string | null
  cost_per_unit: number | null
  selling_price: number | null
  last_updated: string | null
  product_id: string | null
  products?: ProductRelation | ProductRelation[] | null
}

export default function InventoryPage() {
  const supabase = createClientInstance()

  const [items, setItems] = useState<InventoryRow[]>([])
  const [status, setStatus] = useState("Loading...")
  const [totalValue, setTotalValue] = useState(0)

  useEffect(() => {
    loadInventory()
  }, [])

  async function loadInventory() {
    try {
      const { data, error } = await supabase
        .from("inventory")
        .select("id, quantity, unit, cost_per_unit, selling_price, last_updated, product_id, products(name)")

      if (error) throw error

      const rows: InventoryRow[] = (data ?? []).map((item: any) => ({
        id: String(item.id),
        quantity: Number(item.quantity ?? 0),
        unit: item.unit ?? null,
        cost_per_unit:
          item.cost_per_unit === null || item.cost_per_unit === undefined
            ? null
            : Number(item.cost_per_unit),
        selling_price:
          item.selling_price === null || item.selling_price === undefined
            ? null
            : Number(item.selling_price),
        last_updated: item.last_updated ?? null,
        product_id: item.product_id ?? null,
        products: item.products ?? null,
      }))

      setItems(rows)

      const total = rows.reduce((sum, item) => {
        const cost = item.cost_per_unit ?? 0
        const qty = item.quantity ?? 0
        return sum + cost * qty
      }, 0)

      setTotalValue(total)
      setStatus("Ready")
    } catch (err) {
      console.error("Inventory load error:", err)
      setStatus("Error loading inventory")
      setItems([])
      setTotalValue(0)
    }
  }

  function getProductName(item: InventoryRow) {
    if (!item.products) return "⚠️ Missing Product Link"

    if (Array.isArray(item.products)) {
      return item.products[0]?.name || "⚠️ Missing Product Link"
    }

    return item.products.name || "⚠️ Missing Product Link"
  }

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
          <span>${totalValue.toFixed(2)}</span>
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
          items.map((item) => (
            <div key={item.id} className="metric">
              <span>{getProductName(item)}</span>
              <span>{item.quantity}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}