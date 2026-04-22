"use client"

import { useEffect, useMemo, useState } from "react"
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
  const [qty, setQty] = useState(1)

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

    if (inventoryError) {
      setStatus("Error loading inventory")
      return
    }

    const mapped = (inventory || []).map((item: any) => ({
      inventoryId: item.id,
      name: item.products?.name || "Unknown",
      price: Number(item.selling_price || 0),
      quantity: Number(item.quantity || 0),
    }))

    setProducts(mapped)

    if (mapped.length > 0 && !selectedProductId) {
      setSelectedProductId(mapped[0].inventoryId)
    }

    const { data: sales, error: salesError } = await supabase
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false })

    if (salesError) {
      setStatus("Error loading sales")
      return
    }

    const safeSales = (sales || []).map((sale: any) => ({
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

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.inventoryId === selectedProductId) || null
  }, [products, selectedProductId])

  const cleanQty = Number.isFinite(qty) && qty > 0 ? qty : 0
  const previewTotal = selectedProduct ? selectedProduct.price * cleanQty : 0
  const remainingStock = selectedProduct ? selectedProduct.quantity - cleanQty : 0

  async function handleSale() {
    const product = selectedProduct

    if (!product) {
      setStatus("Select product")
      return
    }

    if (cleanQty <= 0) {
      setStatus("Invalid qty")
      return
    }

    if (product.quantity < cleanQty) {
      setStatus("Not enough stock")
      return
    }

    setStatus("Saving...")

    const totalAmount = product.price * cleanQty

    const { error: insertError } = await supabase.from("sales").insert({
      item: product.name,
      amount: totalAmount,
    })

    if (insertError) {
      setStatus("Error saving sale")
      return
    }

    const { error: updateError } = await supabase
      .from("inventory")
      .update({
        quantity: product.quantity - cleanQty,
      })
      .eq("id", product.inventoryId)

    if (updateError) {
      setStatus("Error updating inventory")
      return
    }

    setQty(1)
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

        <input
          type="number"
          min="1"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          placeholder="Qty"
        />

        <button onClick={handleSale}>Record Sale</button>
      </div>

      <div className="summary-card">
        <h2>Sale Preview</h2>

        <div className="metric">
          <span>Product</span>
          <span>{selectedProduct ? selectedProduct.name : "-"}</span>
        </div>

        <div className="metric">
          <span>Unit Price</span>
          <span>${selectedProduct ? selectedProduct.price.toFixed(2) : "0.00"}</span>
        </div>

        <div className="metric">
          <span>Quantity</span>
          <span>{cleanQty}</span>
        </div>

        <div className="metric">
          <span>Total Sale</span>
          <span>${previewTotal.toFixed(2)}</span>
        </div>

        <div className="metric">
          <span>Stock After Sale</span>
          <span>{selectedProduct ? remainingStock : 0}</span>
        </div>
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