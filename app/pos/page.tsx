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

    const { data: inventory, error } = await supabase
      .from("inventory")
      .select(`
        id,
        quantity,
        selling_price,
        products (
          name
        )
      `)

    if (error) {
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

    const { data: sales } = await supabase
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false })

    const safeSales = (sales || []).map((sale: any) => ({
      id: String(sale.id),
      item: String(sale.item || ""),
      amount: Number(sale.amount || 0),
    }))

    setTransactionsToday(safeSales.length)
    setSalesToday(
      safeSales.reduce((sum, s) => sum + s.amount, 0)
    )
    setRecentSales(safeSales.slice(0, 5))

    setStatus("Ready")
  }

  useEffect(() => {
    loadData()
  }, [])

  const selectedProduct = useMemo(() => {
    return products.find(p => p.inventoryId === selectedProductId) || null
  }, [products, selectedProductId])

  const cleanQty = Number(qty) || 0
  const total = selectedProduct ? cleanQty * selectedProduct.price : 0
  const remaining = selectedProduct ? selectedProduct.quantity - cleanQty : 0

  // 🔴 RULES
  const isOverStock = selectedProduct && cleanQty > selectedProduct.quantity
  const isLowStock = selectedProduct && remaining <= 5

  async function handleSale() {
    if (!selectedProduct) return

    if (cleanQty <= 0) {
      setStatus("Invalid quantity")
      return
    }

    if (isOverStock) {
      setStatus("❌ Not enough stock")
      return
    }

    setStatus("Saving...")

    const totalAmount = selectedProduct.price * cleanQty

    const { error: insertError } = await supabase
      .from("sales")
      .insert({
        item: selectedProduct.name,
        amount: totalAmount,
      })

    if (insertError) {
      setStatus("Error saving sale")
      return
    }

    const { error: updateError } = await supabase
      .from("inventory")
      .update({
        quantity: selectedProduct.quantity - cleanQty,
      })
      .eq("id", selectedProduct.inventoryId)

    if (updateError) {
      setStatus("Error updating inventory")
      return
    }

    setQty(1)
    await loadData()
    setStatus("✅ Sale recorded")
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
          {products.map(p => (
            <option key={p.inventoryId} value={p.inventoryId}>
              {p.name} (${p.price}) ({p.quantity})
            </option>
          ))}
        </select>

        <input
          type="number"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        />

        <button onClick={handleSale}>Record Sale</button>
      </div>

      <div className="summary-card">
        <h2>Sale Preview</h2>

        <div className="metric">
          <span>Product</span>
          <span>{selectedProduct?.name}</span>
        </div>

        <div className="metric">
          <span>Unit Price</span>
          <span>${selectedProduct?.price.toFixed(2)}</span>
        </div>

        <div className="metric">
          <span>Quantity</span>
          <span>{cleanQty}</span>
        </div>

        <div className="metric">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>

        <div className="metric">
          <span>Stock After</span>
          <span>{remaining}</span>
        </div>

        {isOverStock && (
          <p style={{ color: "red" }}>❌ Not enough stock</p>
        )}

        {isLowStock && !isOverStock && (
          <p style={{ color: "orange" }}>⚠️ Low stock warning</p>
        )}
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

        {recentSales.map(sale => (
          <div key={sale.id} className="metric">
            <span>{sale.item}</span>
            <span>${sale.amount.toFixed(2)}</span>
          </div>
        ))}
      </div>
    </>
  )
}