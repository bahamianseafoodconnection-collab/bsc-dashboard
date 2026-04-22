"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type InventoryDbRow = {
  id: string
  quantity: number | null
  cost_per_unit: number | null
  product_id: string | null
  selling_price?: number | null
  last_updated?: string | null
  products?:
    | {
        name?: string | null
      }
    | {
        name?: string | null
      }[]
    | null
}

type ProductRow = {
  id: string
  name: string | null
}

type InventoryViewRow = {
  id: string
  name: string
  quantity: number
  cost_per_unit: number
  value: number
  daysLeft: number
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryViewRow[]>([])
  const [status, setStatus] = useState("Loading...")

  useEffect(() => {
    const supabase = createClientInstance()

    async function loadInventory() {
      setStatus("Loading...")

      const [{ data: inventoryData, error: inventoryError }, { data: productsData, error: productsError }] =
        await Promise.all([
          supabase
            .from("inventory")
            .select(`
              id,
              quantity,
              cost_per_unit,
              product_id,
              selling_price,
              last_updated,
              products ( name )
            `),
          supabase
            .from("products")
            .select("id, name"),
        ])

      if (inventoryError) {
        console.error("Inventory load error:", inventoryError)
        setStatus("Error loading inventory")
        return
      }

      if (productsError) {
        console.error("Products load error:", productsError)
      }

      const inventoryRows: InventoryDbRow[] = Array.isArray(inventoryData) ? inventoryData : []
      const productRows: ProductRow[] = Array.isArray(productsData) ? productsData : []

      const productMap = new Map<string, string>()
      for (const product of productRows) {
        if (product.id) {
          productMap.set(product.id, product.name ?? "Unknown")
        }
      }

      const viewRows: InventoryViewRow[] = inventoryRows.map((row) => {
        let joinedName: string | null = null

        if (Array.isArray(row.products)) {
          joinedName = row.products[0]?.name ?? null
        } else if (row.products && typeof row.products === "object") {
          joinedName = row.products.name ?? null
        }

        const fallbackName = row.product_id ? productMap.get(row.product_id) ?? null : null
        const finalName = joinedName ?? fallbackName ?? "Unknown"

        const quantity = Number(row.quantity ?? 0)
        const costPerUnit = Number(row.cost_per_unit ?? 0)
        const value = quantity * costPerUnit

        const dailySales = 5
        const daysLeft = quantity > 0 ? Math.floor(quantity / dailySales) : 0

        return {
          id: row.id,
          name: finalName,
          quantity,
          cost_per_unit: costPerUnit,
          value,
          daysLeft,
        }
      })

      setItems(viewRows)
      setStatus("Ready")
    }

    loadInventory()
  }, [])

  const totalInventoryValue = items.reduce((sum, item) => sum + item.value, 0)
  const lowStockItems = items.filter((item) => item.daysLeft <= 3)
  const reorderItems = items.filter((item) => item.daysLeft <= 10)

  function money(value: number) {
    return `$${value.toFixed(2)}`
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
          <span>{money(totalInventoryValue)}</span>
        </div>

        <div className="metric">
          <span>Low Stock</span>
          <span style={{ color: lowStockItems.length > 0 ? "red" : "inherit" }}>
            {lowStockItems.length}
          </span>
        </div>

        <div className="metric">
          <span>Reorder Items</span>
          <span style={{ color: reorderItems.length > 0 ? "red" : "inherit" }}>
            {reorderItems.length}
          </span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Stock Runout</h2>

        {items.length === 0 ? (
          <p>No inventory items</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="metric">
              <span>{item.name}</span>
              <span style={{ color: item.daysLeft <= 3 ? "red" : "inherit" }}>
                {item.daysLeft} days left
              </span>
            </div>
          ))
        )}
      </div>

      <div className="summary-card">
        <h2>System Status</h2>

        <div className="metric">
          <span>Status</span>
          <span>{status}</span>
        </div>
      </div>
    </>
  )
}