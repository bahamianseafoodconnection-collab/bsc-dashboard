"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

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
  const [status, setStatus] = useState("Loading...")
  const [transactionsToday, setTransactionsToday] = useState(0)
  const [salesToday, setSalesToday] = useState(0)
  const [recentSales, setRecentSales] = useState<SaleRow[]>([])

  async function loadData() {
    setStatus("Loading...")

    const { data: inventory } = await supabase
      .from("inventory")
      .select(`
        id,
        quantity,
        selling_price,
        products (
          name
        )
      `)

    const mapped = (inventory || []).map((item: any) => ({
      inventoryId: item.id,
      name: item.products?.name || "Unknown",
      price: item.selling_price || 0,
      quantity: item.quantity || 0,
    }))

    setProducts(mapped)

    if (mapped.length > 0 && !selectedProductId) {
      setSelectedProductId(mapped[0].inventoryId)
    }

    const { data: sales } = await supabase
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false })

    const safeSales = (sales || []).map((sale: any) => ({
      id: sale.id,
      item: sale.item,
      amount: sale.amount,
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

    if (product.quantity <= 0) {
      setStatus("Out of stock")
      return
    }

    setStatus("Saving...")

    await supabase.from("sales").insert({
      item: product.name,
      amount: product.price
    })

    await supabase
      .from("inventory")
      .update({
        quantity: product.quantity - 1,
      })
      .eq("id", product.inventoryId)

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
          {products.map((p) => (
            <option key={p.inventoryId} value={p.inventoryId}>
              {p.name} (${p.price}) ({p.quantity})
            </option>
          ))}
        </select>

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

        {recentSales.map((sale) => (
          <div key={sale.id} className="metric">
            <span>{sale.item}</span>
            <span>${sale.amount}</span>
          </div>
        ))}
      </div>
    </>
  )
}