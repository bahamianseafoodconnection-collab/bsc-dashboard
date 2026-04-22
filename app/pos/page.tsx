"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "@/lib/supabase/browser"

type ProductOption = {
  inventoryId: string
  name: string
  price: number
  quantity: number
}

type SaleRow = {
  id: string
  item: string
  amount: number
}

export default function POSPage() {
  const supabase = createClientInstance()

  const [products, setProducts] = useState<ProductOption[]>([])
  const [selectedProductId, setSelectedProductId] = useState("")
  const [amount, setAmount] = useState("")
  const [status, setStatus] = useState("Loading...")
  const [transactionsToday, setTransactionsToday] = useState(0)
  const [salesToday, setSalesToday] = useState(0)
  const [recentSales, setRecentSales] = useState<SaleRow[]>([])

  async function loadData() {
    setStatus("Loading...")

    const { data: inventory, error: inventoryError } = await supabase
      .from("inventory")
      .select(`
        id,
        quantity,
        selling_price,
        products (
          name
        )
      `)
      .order("created_at", { ascending: true })

    if (inventoryError) {
      setStatus("Error loading inventory")
      return
    }

    const mapped: ProductOption[] = ((inventory as any[]) || []).map((item) => ({
      inventoryId: String(item.id),
      name: item.products?.name || "Unknown",
      price: Number(item.selling_price || 0),
      quantity: Number(item.quantity || 0),
    }))

    setProducts(mapped)

    if (mapped.length > 0) {
      setSelectedProductId((current) => {
        const stillExists = mapped.some((p) => p.inventoryId === current)
        return stillExists ? current : mapped[0].inventoryId
      })
    }

    const { data: sales, error: salesError } = await supabase
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false })

    if (salesError) {
      setStatus("Error loading sales")
      return
    }

    const safeSales: SaleRow[] = ((sales as any[]) || []).map((sale) => ({
      id: String(sale.id),
      item: String(sale.item || ""),
      amount: Number(sale.amount || 0),
    }))

    setTransactionsToday(safeSales.length)
    setSalesToday(
      safeSales.reduce((sum, sale) => sum + Number(sale.amount || 0), 0)
    )
    setRecentSales(safeSales.slice(0, 5))
    setStatus("Ready")
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleSale() {
    const product = products.find((p) => p.inventoryId === selectedProductId)

    if (!product) {
      setStatus("Select product")
      return
    }

    const value = Number(amount)

    if (!amount || Number.isNaN(value) || value <= 0) {
      setStatus("Enter amount")
      return
    }

    if (product.quantity <= 0) {
      setStatus("Out of stock")
      return
    }

    setStatus("Saving...")

    const { error: saleError } = await supabase.from("sales").insert({
      item: product.name,
      amount: value,
    })

    if (saleError) {
      setStatus("Error saving sale")
      return
    }

    const { error: inventoryUpdateError } = await supabase
      .from("inventory")
      .update({
        quantity: product.quantity - 1,
      })
      .eq("id", product.inventoryId)

    if (inventoryUpdateError) {
      setStatus("Sale saved, inventory update failed")
      await loadData()
      return
    }

    setAmount("")
    setStatus("Sale recorded")
    await loadData()
  }

  return (
    <>
      <h2 className="page-title">POS</h2>

      <div className="summary-card">
        <h2>New Sale</h2>

        <select
          value={selectedProductId}
          onChange={(e) => setSelectedProductId(e.target.value)}
        >
          {products.length === 0 ? (
            <option value="">No products available</option>
          ) : (
            products.map((product) => (
              <option key={product.inventoryId} value={product.inventoryId}>
                {product.name} ({product.quantity})
              </option>
            ))
          )}
        </select>

        <input
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <button onClick={handleSale}>Record Sale</button>
      </div>

      <div className="summary-card">
        <h2>POS Summary</h2>

        <div className="metric">
          <span>Status</span>
          <span>{status}</span>
        </div>

        <div className="metric">
          <span>Transactions Today</span>
          <span>{transactionsToday}</span>
        </div>

        <div className="metric">
          <span>Sales Today</span>
          <span>${salesToday.toFixed(2)}</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Recent POS Activity</h2>

        {recentSales.length === 0 ? (
          <p>No sales yet</p>
        ) : (
          recentSales.map((sale) => (
            <div key={sale.id} className="metric">
              <span>{sale.item}</span>
              <span>${sale.amount.toFixed(2)}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}