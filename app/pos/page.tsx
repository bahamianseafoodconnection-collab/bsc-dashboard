"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "@/lib/supabase/browser"

type ProductOption = {
  inventoryId: string
  productId: string
  name: string
  sellingPrice: number
  quantity: number
}

type SaleRow = {
  id: string
  item: string
  amount: number
}

function getProductName(products: unknown): string {
  if (!products) return "Unknown Item"

  if (Array.isArray(products)) {
    const first = products[0] as { name?: unknown } | undefined
    return typeof first?.name === "string" ? first.name : "Unknown Item"
  }

  if (typeof products === "object") {
    const record = products as { name?: unknown }
    return typeof record.name === "string" ? record.name : "Unknown Item"
  }

  return "Unknown Item"
}

export default function POSPage() {
  const supabase = createClientInstance()

  const [products, setProducts] = useState<ProductOption[]>([])
  const [selectedInventoryId, setSelectedInventoryId] = useState("")
  const [amount, setAmount] = useState("")
  const [status, setStatus] = useState("Loading...")
  const [transactionsToday, setTransactionsToday] = useState(0)
  const [salesToday, setSalesToday] = useState(0)
  const [recentSales, setRecentSales] = useState<SaleRow[]>([])

  async function loadPOSData() {
    setStatus("Loading...")

    const { data: inventoryData, error: inventoryError } = await supabase
      .from("inventory")
      .select(`
        id,
        product_id,
        quantity,
        selling_price,
        products (
          name
        )
      `)
      .order("created_at", { ascending: true })

    if (inventoryError) {
      setStatus("Error loading products")
      return
    }

    const normalizedProducts: ProductOption[] = ((inventoryData as any[]) || [])
      .filter((row) => Number(row.quantity) > 0)
      .map((row) => ({
        inventoryId: String(row.id),
        productId: String(row.product_id),
        name: getProductName(row.products),
        sellingPrice: Number(row.selling_price ?? 0),
        quantity: Number(row.quantity ?? 0),
      }))

    setProducts(normalizedProducts)

    if (
      normalizedProducts.length > 0 &&
      !normalizedProducts.some((item) => item.inventoryId === selectedInventoryId)
    ) {
      setSelectedInventoryId(normalizedProducts[0].inventoryId)
    }

    const today = new Date()
    const startOfDay = new Date(today)
    startOfDay.setHours(0, 0, 0, 0)

    const { data: todaySalesData, error: todaySalesError } = await supabase
      .from("sales")
      .select("id, item, amount")
      .gte("created_at", startOfDay.toISOString())
      .order("created_at", { ascending: false })

    if (todaySalesError) {
      setStatus("Error loading sales")
      return
    }

    const safeTodaySales = ((todaySalesData as any[]) || []).map((row) => ({
      id: String(row.id),
      item: String(row.item ?? ""),
      amount: Number(row.amount ?? 0),
    }))

    setTransactionsToday(safeTodaySales.length)
    setSalesToday(
      safeTodaySales.reduce((total, sale) => total + Number(sale.amount || 0), 0)
    )
    setRecentSales(safeTodaySales.slice(0, 5))
    setStatus("Ready")
  }

  useEffect(() => {
    loadPOSData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleRecordSale() {
    const selectedProduct = products.find(
      (product) => product.inventoryId === selectedInventoryId
    )

    if (!selectedProduct) {
      setStatus("Select a product")
      return
    }

    const numericAmount = Number(amount)

    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      setStatus("Enter valid amount")
      return
    }

    if (selectedProduct.quantity <= 0) {
      setStatus("Out of stock")
      return
    }

    setStatus("Saving sale...")

    const { error: insertError } = await supabase.from("sales").insert({
      item: selectedProduct.name,
      amount: numericAmount,
    })

    if (insertError) {
      setStatus("Error saving sale")
      return
    }

    const { error: updateError } = await supabase
      .from("inventory")
      .update({
        quantity: selectedProduct.quantity - 1,
      })
      .eq("id", selectedProduct.inventoryId)

    if (updateError) {
      setStatus("Sale saved, inventory update failed")
      await loadPOSData()
      return
    }

    setAmount("")
    setStatus("Sale recorded")
    await loadPOSData()
  }

  return (
    <>
      <h2 className="page-title">POS</h2>

      <div className="summary-card">
        <h2>New Sale</h2>

        <div
          style={{
            display: "grid",
            gap: "12px",
          }}
        >
          <select
            value={selectedInventoryId}
            onChange={(e) => setSelectedInventoryId(e.target.value)}
            style={{
              width: "100%",
              padding: "14px 16px",
              borderRadius: "16px",
              border: "1px solid #cbd5e1",
              fontSize: "16px",
              background: "white",
            }}
          >
            {products.length === 0 ? (
              <option value="">No products available</option>
            ) : (
              products.map((product) => (
                <option key={product.inventoryId} value={product.inventoryId}>
                  {product.name} ({product.quantity} in stock)
                </option>
              ))
            )}
          </select>

          <input
            type="number"
            step="0.01"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

          <button onClick={handleRecordSale}>Record Sale</button>
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
            <div className="metric" key={sale.id}>
              <span>{sale.item}</span>
              <span>${Number(sale.amount).toFixed(2)}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}