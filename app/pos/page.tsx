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

function getReserveMinimum(productName: string) {
  const name = productName.toLowerCase()

  const isCaseItem =
    name.includes("case") ||
    name.includes(" cs") ||
    name.startsWith("cs ") ||
    name.includes("case ") ||
    name.includes("lb case")

  if (isCaseItem) return 2

  return 10
}

function getReserveLabel(productName: string) {
  const min = getReserveMinimum(productName)
  return min === 2 ? "2 cases" : "10 pieces/portions"
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

    const mapped: ProductOption[] = ((inventory as any[]) || []).map((item) => ({
      inventoryId: String(item.id),
      name: item.products?.name || "Unknown",
      price: Number(item.selling_price || 0),
      quantity: Number(item.quantity || 0),
    }))

    setProducts(mapped)

    if (mapped.length > 0) {
      setSelectedProductId((current) => {
        const exists = mapped.some((p) => p.inventoryId === current)
        return exists ? current : mapped[0].inventoryId
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

  const selectedProduct = useMemo(() => {
    return products.find((p) => p.inventoryId === selectedProductId) || null
  }, [products, selectedProductId])

  const cleanQty = Number.isFinite(Number(qty)) ? Number(qty) : 0
  const reserveMinimum = selectedProduct ? getReserveMinimum(selectedProduct.name) : 0
  const reserveLabel = selectedProduct ? getReserveLabel(selectedProduct.name) : ""
  const total = selectedProduct ? cleanQty * selectedProduct.price : 0
  const remaining = selectedProduct ? selectedProduct.quantity - cleanQty : 0

  const overStock = selectedProduct ? cleanQty > selectedProduct.quantity : false
  const breaksReserve = selectedProduct ? remaining < reserveMinimum : false
  const lowStockWarning = selectedProduct
    ? remaining >= reserveMinimum && remaining <= reserveMinimum + 5
    : false

  async function handleSale() {
    const product = selectedProduct

    if (!product) {
      setStatus("Select product")
      return
    }

    if (!Number.isInteger(cleanQty) || cleanQty <= 0) {
      setStatus("Enter valid quantity")
      return
    }

    if (overStock) {
      setStatus("❌ Not enough stock")
      return
    }

    if (breaksReserve) {
      setStatus(`❌ Must keep at least ${reserveLabel} in stock`)
      return
    }

    setStatus("Saving...")

    const totalAmount = product.price * cleanQty

    const { error: saleError } = await supabase.from("sales").insert({
      item: product.name,
      amount: totalAmount,
    })

    if (saleError) {
      setStatus("Error saving sale")
      return
    }

    const { error: inventoryError } = await supabase
      .from("inventory")
      .update({
        quantity: product.quantity - cleanQty,
      })
      .eq("id", product.inventoryId)

    if (inventoryError) {
      setStatus("Sale saved, inventory update failed")
      await loadData()
      return
    }

    setQty(1)
    setStatus("✅ Sale recorded")
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
            products.map((p) => (
              <option key={p.inventoryId} value={p.inventoryId}>
                {p.name} (${p.price}) ({p.quantity})
              </option>
            ))
          )}
        </select>

        <input
          type="number"
          min="1"
          step="1"
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
          <span>${total.toFixed(2)}</span>
        </div>

        <div className="metric">
          <span>Stock After Sale</span>
          <span>{selectedProduct ? remaining : 0}</span>
        </div>

        <div className="metric">
          <span>Minimum Reserve</span>
          <span>{selectedProduct ? reserveLabel : "-"}</span>
        </div>

        {overStock && <p style={{ color: "red" }}>❌ Not enough stock</p>}

        {breaksReserve && !overStock && (
          <p style={{ color: "red" }}>
            ❌ Sale blocked. Must keep at least {reserveLabel} in stock.
          </p>
        )}

        {lowStockWarning && !breaksReserve && !overStock && (
          <p style={{ color: "orange" }}>
            ⚠️ Low stock warning. This sale leaves you close to reserve level.
          </p>
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