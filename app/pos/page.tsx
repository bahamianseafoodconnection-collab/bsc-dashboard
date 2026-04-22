"use client"

import { useEffect, useMemo, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type ProductOption = {
  inventoryId: string
  name: string
  price: number
  quantity: number
}

export default function POSPage() {
  const supabase = createClientInstance()

  const [products, setProducts] = useState<ProductOption[]>([])
  const [selectedProductId, setSelectedProductId] = useState("")
  const [qty, setQty] = useState(1)

  const [status, setStatus] = useState("Loading...")
  const [transactionsToday, setTransactionsToday] = useState(0)
  const [salesToday, setSalesToday] = useState(0)

  const MIN_STOCK = 5
  const LARGE_SALE_THRESHOLD = 20

  async function loadData() {
    const { data: inventory } = await supabase
      .from("inventory")
      .select(`
        id,
        quantity,
        selling_price,
        products ( name )
      `)

    const mapped = (inventory || []).map((item: any) => ({
      inventoryId: item.id,
      name: item.products?.name || "Unknown",
      price: Number(item.selling_price || 0),
      quantity: Number(item.quantity || 0),
    }))

    setProducts(mapped)

    if (mapped.length && !selectedProductId) {
      setSelectedProductId(mapped[0].inventoryId)
    }

    const { data: sales } = await supabase.from("sales").select("*")

    setTransactionsToday(sales?.length || 0)
    setSalesToday(
      (sales || []).reduce((sum: number, s: any) => sum + Number(s.amount || 0), 0)
    )

    setStatus("Ready")
  }

  useEffect(() => {
    loadData()
  }, [])

  const selectedProduct = useMemo(
    () => products.find(p => p.inventoryId === selectedProductId),
    [products, selectedProductId]
  )

  // CLEAN INPUT (removes leading zeros)
  const cleanQty = Number(qty) || 0

  const total = selectedProduct ? cleanQty * selectedProduct.price : 0
  const remaining = selectedProduct ? selectedProduct.quantity - cleanQty : 0

  const belowMinimum = selectedProduct && remaining < MIN_STOCK
  const overStock = selectedProduct && cleanQty > selectedProduct.quantity

  async function handleSale() {
    if (!selectedProduct) return

    if (cleanQty <= 0) {
      setStatus("Invalid quantity")
      return
    }

    if (overStock) {
      setStatus("❌ Not enough stock")
      return
    }

    // 🚨 PREVENT FULL DEPLETION
    if (remaining < MIN_STOCK) {
      setStatus(`❌ Must keep at least ${MIN_STOCK} in stock`)
      return
    }

    // ⚠️ LARGE SALE CONFIRM
    if (cleanQty >= LARGE_SALE_THRESHOLD) {
      const confirm = window.confirm("Large sale detected. Continue?")
      if (!confirm) return
    }

    setStatus("Saving...")

    const totalAmount = selectedProduct.price * cleanQty

    await supabase.from("sales").insert({
      item: selectedProduct.name,
      amount: totalAmount,
    })

    await supabase
      .from("inventory")
      .update({
        quantity: selectedProduct.quantity - cleanQty,
      })
      .eq("id", selectedProduct.inventoryId)

    setQty(1)
    await loadData()

    setStatus("✅ Sale recorded")
  }

  return (
    <>
      <h2>POS</h2>

      <div>
        <h3>New Sale</h3>

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

      <div>
        <h3>Sale Preview</h3>

        <p>Product: {selectedProduct?.name}</p>
        <p>Unit Price: ${selectedProduct?.price}</p>
        <p>Quantity: {cleanQty}</p>
        <p>Total: ${total}</p>
        <p>Stock After: {remaining}</p>

        {overStock && <p style={{ color: "red" }}>❌ Not enough stock</p>}
        {belowMinimum && <p style={{ color: "orange" }}>⚠️ Low stock warning</p>}
      </div>

      <div>
        <h3>POS Summary</h3>

        <p>Status: {status}</p>
        <p>Transactions Today: {transactionsToday}</p>
        <p>Sales Today: ${salesToday}</p>
      </div>
    </>
  )
}