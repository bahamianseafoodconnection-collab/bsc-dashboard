"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type Sale = {
  id: string
  item: string
  amount: number
  created_at: string
}

type Product = {
  id: string
  name: string
}

type InventoryRow = {
  id: string
  product_id: string
  quantity: number
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").trim()
}

export default function POSPage() {
  const [item, setItem] = useState("")
  const [amount, setAmount] = useState("")
  const [sales, setSales] = useState<Sale[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [status, setStatus] = useState("Ready")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    loadSales()
    loadProducts()
  }, [])

  async function loadProducts() {
    const supabase = createClientInstance()

    const { data, error } = await supabase
      .from("products")
      .select("id, name")
      .order("name", { ascending: true })

    if (!error) {
      setProducts(data || [])
    }
  }

  async function loadSales() {
    const supabase = createClientInstance()

    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false })

    if (!error) {
      setSales(data || [])
    }
  }

  async function handleSale() {
    if (!item || !amount) return

    setIsSaving(true)
    setStatus("Saving sale...")

    const supabase = createClientInstance()
    const parsedAmount = parseFloat(amount)

    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setStatus("Enter valid amount")
      setIsSaving(false)
      return
    }

    const cleanInput = normalizeName(item)

    const matchedProduct = products.find(
      (product) => normalizeName(product.name) === cleanInput
    )

    const { error: saleError } = await supabase.from("sales").insert({
      item: item.trim(),
      amount: parsedAmount,
    })

    if (saleError) {
      setStatus("Error saving sale")
      setIsSaving(false)
      return
    }

    if (!matchedProduct) {
      setStatus("Sale saved - no inventory match")
      setItem("")
      setAmount("")
      await loadSales()
      setIsSaving(false)
      return
    }

    const { data: inventoryRows, error: inventoryReadError } = await supabase
      .from("inventory")
      .select("id, product_id, quantity")
      .eq("product_id", matchedProduct.id)
      .limit(1)

    if (inventoryReadError) {
      setStatus("Sale saved - inventory read error")
      setItem("")
      setAmount("")
      await loadSales()
      setIsSaving(false)
      return
    }

    const inventoryRow: InventoryRow | undefined = inventoryRows?.[0]

    if (!inventoryRow) {
      setStatus("Sale saved - inventory row missing")
      setItem("")
      setAmount("")
      await loadSales()
      setIsSaving(false)
      return
    }

    const newQuantity = Math.max((inventoryRow.quantity || 0) - 1, 0)

    const { error: inventoryUpdateError } = await supabase
      .from("inventory")
      .update({
        quantity: newQuantity,
      })
      .eq("id", inventoryRow.id)

    if (inventoryUpdateError) {
      setStatus("Sale saved - inventory update error")
      setItem("")
      setAmount("")
      await loadSales()
      setIsSaving(false)
      return
    }

    setItem("")
    setAmount("")
    setStatus("Sale recorded")

    await loadSales()
    setIsSaving(false)
  }

  const totalSales = sales.reduce((sum, sale) => sum + Number(sale.amount || 0), 0)

  return (
    <>
      <h1 className="page-title">POS</h1>

      <div className="summary-card">
        <h2>New Sale</h2>

        <div className="metric">
          <input
            placeholder="Item"
            value={item}
            onChange={(e) => setItem(e.target.value)}
          />

          <input
            placeholder="Amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <button onClick={handleSale} disabled={isSaving}>
          {isSaving ? "Saving..." : "Record Sale"}
        </button>
      </div>

      <div className="summary-card">
        <h2>POS Summary</h2>

        <div className="metric">
          <span>Status</span>
          <span>{status}</span>
        </div>

        <div className="metric">
          <span>Transactions Today</span>
          <span>{sales.length}</span>
        </div>

        <div className="metric">
          <span>Sales Today</span>
          <span>${totalSales.toFixed(2)}</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Recent POS Activity</h2>

        {sales.length === 0 ? (
          <p>No sales yet</p>
        ) : (
          sales.slice(0, 5).map((sale) => (
            <div key={sale.id} className="metric">
              <span>{sale.item}</span>
              <span>${Number(sale.amount).toFixed(2)}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}