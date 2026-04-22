"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type InventoryDbRow = {
  id: string
  quantity: number | null
  cost_per_unit: number | null
  product_id: string | null
  products?:
    | { name?: string | null }
    | { name?: string | null }[]
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
  dailyTarget: number
  reorderQty: number
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryViewRow[]>([])
  const [status, setStatus] = useState("Loading...")

  useEffect(() => {
    const supabase = createClientInstance()

    async function loadInventory() {
      setStatus("Loading...")

      const [{ data: inventoryData }, { data: productsData }] =
        await Promise.all([
          supabase.from("inventory").select(`
            id,
            quantity,
            cost_per_unit,
            product_id,
            products ( name )
          `),
          supabase.from("products").select("id, name"),
        ])

      const productMap = new Map<string, string>()
      for (const p of productsData || []) {
        productMap.set(p.id, p.name ?? "Unknown")
      }

      const rows: InventoryViewRow[] = (inventoryData || []).map((row: InventoryDbRow) => {
        let joinedName: string | null = null

        if (Array.isArray(row.products)) {
          joinedName = row.products[0]?.name ?? null
        } else if (row.products && typeof row.products === "object") {
          joinedName = row.products.name ?? null
        }

        const fallbackName = row.product_id
          ? productMap.get(row.product_id)
          : null

        const name = joinedName ?? fallbackName ?? "Unknown"

        const quantity = Number(row.quantity ?? 0)
        const cost = Number(row.cost_per_unit ?? 0)
        const value = quantity * cost

        const dailySales = 5
        const daysLeft = quantity > 0 ? Math.floor(quantity / dailySales) : 0

        const reorderLevel = 10 * dailySales
        const reorderQty =
          quantity < reorderLevel ? reorderLevel - quantity : 0

        return {
          id: row.id,
          name,
          quantity,
          cost_per_unit: cost,
          value,
          daysLeft,
          dailyTarget: dailySales,
          reorderQty,
        }
      })

      setItems(rows)
      setStatus("Ready")
    }

    loadInventory()
  }, [])

  const totalValue = items.reduce((sum, i) => sum + i.value, 0)
  const lowStock = items.filter((i) => i.daysLeft <= 3)
  const reorderItems = items.filter((i) => i.reorderQty > 0)

  const money = (v: number) => `$${v.toFixed(2)}`

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
          <span>{money(totalValue)}</span>
        </div>

        <div className="metric">
          <span>Low Stock</span>
          <span style={{ color: lowStock.length ? "red" : "" }}>
            {lowStock.length}
          </span>
        </div>

        <div className="metric">
          <span>Reorder Items</span>
          <span style={{ color: reorderItems.length ? "red" : "" }}>
            {reorderItems.length}
          </span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Stock Runout + Daily Target</h2>

        {items.map((i) => (
          <div key={i.id} className="metric">
            <span>{i.name}</span>
            <span style={{ color: i.daysLeft <= 3 ? "red" : "" }}>
              {i.daysLeft} days | Sell {i.dailyTarget}/day
            </span>
          </div>
        ))}
      </div>

      <div className="summary-card">
        <h2>Reorder Suggestions</h2>

        {reorderItems.map((i) => (
          <div key={i.id} className="metric">
            <span>{i.name}</span>
            <span style={{ color