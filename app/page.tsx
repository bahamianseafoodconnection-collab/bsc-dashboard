"use client"

import { useMemo, useState } from "react"

type Product = {
  id: string
  name: string
  stock: number
  reorderLevel: number
  soldToday: number
  supplier: string
  reorderCost: number
}

type SupplierPayment = {
  id: string
  name: string
  amount: number
  status: "pending" | "paid"
}

export default function Page() {
  // DAILY OPERATIONS
  const [openingCash, setOpeningCash] = useState(0)
  const [cashSales, setCashSales] = useState(0)
  const [cardSales, setCardSales] = useState(0)
  const [payouts, setPayouts] = useState(0)
  const [deposits, setDeposits] = useState(0)
  const [actualCash, setActualCash] = useState(0)

  // PRODUCTS
  const [products, setProducts] = useState<Product[]>([])
  const [productName, setProductName] = useState("")
  const [stock, setStock] = useState(0)
  const [reorderLevel, setReorderLevel] = useState(0)
  const [soldToday, setSoldToday] = useState(0)
  const [supplier, setSupplier] = useState("")
  const [reorderCost, setReorderCost] = useState(0)

  // SUPPLIER PAYMENTS
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([])
  const [supplierName, setSupplierName] = useState("")
  const [supplierAmount, setSupplierAmount] = useState(0)

  // CALCULATIONS
  const expectedCash = openingCash + cashSales - payouts - deposits
  const variance = actualCash - expectedCash
  const totalSalesToday = cashSales + cardSales

  const lowStockItems = products.filter((p) => p.stock <= p.reorderLevel)
  const totalUnitsSold = products.reduce((sum, p) => sum + p.soldToday, 0)

  const totalReorderNeed = lowStockItems.reduce((sum, p) => {
    const neededUnits = Math.max(p.reorderLevel - p.stock, 0)
    return sum + neededUnits * p.reorderCost
  }, 0)

  const pendingPayments = supplierPayments.filter((p) => p.status === "pending")
  const paidPayments = supplierPayments.filter((p) => p.status === "paid")
  const totalSupplierDue = pendingPayments.reduce((sum, p) => sum + p.amount, 0)

  const cashAfterSupplierPayments = actualCash - totalSupplierDue
  const cashAfterReorders = cashAfterSupplierPayments - totalReorderNeed

  const topMovingProduct = useMemo(() => {
    if (products.length === 0) return null
    return [...products].sort((a, b) => b.soldToday - a.soldToday)[0]
  }, [products])

  const aiPriority = useMemo(() => {
    if (variance !== 0) return "🚨 Cash mismatch — investigate immediately"
    if (totalSalesToday === 0) return "⚠️ No sales activity today"
    if (totalSupplierDue > actualCash) return "🚨 Do not pay suppliers yet — cash too low"
    if (lowStockItems.length > 0 && cashAfterSupplierPayments > totalReorderNeed) {
      return "📦 Reorder low stock items now"
    }
    if (lowStockItems.length > 0 && cashAfterSupplierPayments <= totalReorderNeed) {
      return "⚠️ Low stock exists but cash is tight"
    }
    if (topMovingProduct && topMovingProduct.soldToday > 0) {
      return `🔥 Push ${topMovingProduct.name} today`
    }
    return "✅ Operations stable"
  }, [
    variance,
    totalSalesToday,
    totalSupplierDue,
    actualCash,
    lowStockItems.length,
    cashAfterSupplierPayments,
    totalReorderNeed,
    topMovingProduct,
  ])

  const score = useMemo(() => {
    let s = 100
    if (variance !== 0) s -= 35
    if (totalSalesToday === 0) s -= 20
    if (lowStockItems.length > 0) s -= 15
    if (totalSupplierDue > actualCash) s -= 20
    if (cashAfterReorders < 0) s -= 10
    return Math.max(s, 0)
  }, [
    variance,
    totalSalesToday,
    lowStockItems.length,
    totalSupplierDue,
    actualCash,
    cashAfterReorders,
  ])

  // ACTIONS
  const addProduct = () => {
    if (!productName || !supplier) return

    const newProduct: Product = {
      id: Date.now().toString(),
      name: productName,
      stock,
      reorderLevel,
      soldToday,
      supplier,
      reorderCost,
    }

    setProducts([...products, newProduct])

    setProductName("")
    setStock(0)
    setReorderLevel(0)
    setSoldToday(0)
    setSupplier("")
    setReorderCost(0)
  }

  const sellOne = (id: string) => {
    setProducts(
      products.map((p) =>
        p.id === id && p.stock > 0
          ? { ...p, stock: p.stock - 1, soldToday: p.soldToday + 1 }
          : p
      )
    )
  }

  const deleteProduct = (id: string) => {
    setProducts(products.filter((p) => p.id !== id))
  }

  const addSupplierPayment = () => {
    if (!supplierName || supplierAmount <= 0) return

    const newPayment: SupplierPayment = {
      id: Date.now().toString(),
      name: supplierName,
      amount: supplierAmount,
      status: "pending",
    }

    setSupplierPayments([...supplierPayments, newPayment])

    setSupplierName("")
    setSupplierAmount(0)
  }

  const markSupplierPaid = (id: string) => {
    setSupplierPayments(
      supplierPayments.map((p) =>
        p.id === id ? { ...p, status: "paid" } : p
      )
    )
  }

  const deleteSupplierPayment = (id: string) => {
    setSupplierPayments(supplierPayments.filter((p) => p.id !== id))
  }

  const box: React.CSSProperties = {
    background: "#ffffff",
    padding: "16px",
    borderRadius: "12px",
    marginBottom: "12px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  }

  const input: React.CSSProperties = {
    width: "100%",
    padding: "10px",
    marginBottom: "10px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    boxSizing: "border-box",
  }

  const button: React.CSSProperties = {
    padding: "8px 12px",
    marginRight: "8px",
    marginBottom: "8px",
    borderRadius: "8px",
    border: "none",
    cursor: "pointer",
  }

  return (
    <main
      style={{
        padding: 20,
        background: "#f3f4f6",
        minHeight: "100vh",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>BSC Control Dashboard</h1>
      <p>Operations Engine</p>

      <div style={box}>
        <h3>Control Center Score</h3>
        <p style={{ fontSize: 28, fontWeight: 700 }}>{score}/100</p>
      </div>

      <div style={box}>
        <h3>Daily Operations</h3>

        <input
          style={input}
          placeholder="Opening Cash"
          type="number"
          value={openingCash}
          onChange={(e) => setOpeningCash(Number(e.target.value) || 0)}
        />
        <input
          style={input}
          placeholder="Cash Sales"
          type="number"
          value={cashSales}
          onChange={(e) => setCashSales(Number(e.target.value) || 0)}
        />
        <input
          style={input}
          placeholder="Card Sales"
          type="number"
          value={cardSales}
          onChange={(e) => setCardSales(Number(e.target.value) || 0)}
        />
        <input
          style={input}
          placeholder="Payouts"
          type="number"
          value={payouts}
          onChange={(e) => setPayouts(Number(e.target.value) || 0)}
        />
        <input
          style={input}
          placeholder="Deposits"
          type="number"
          value={deposits}
          onChange={(e) => setDeposits(Number(e.target.value) || 0)}
        />
        <input
          style={input}
          placeholder="Actual Cash"
          type="number"
          value={actualCash}
          onChange={(e) => setActualCash(Number(e.target.value) || 0)}
        />

        <p>Expected Cash: ${expectedCash.toFixed(2)}</p>
        <p style={{ color: variance === 0 ? "green" : "red" }}>
          Variance: ${variance.toFixed(2)}
        </p>
        <p>Total Sales Today: ${totalSalesToday.toFixed(2)}</p>
      </div>

      <div style={box}>
        <h3>Add Product</h3>

        <input
          style={input}
          placeholder="Product Name"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
        />
        <input
          style={input}
          placeholder="Stock"
          type="number"
          value={stock}
          onChange={(e) => setStock(Number(e.target.value) || 0)}
        />
        <input
          style={input}
          placeholder="Reorder Level"
          type="number"
          value={reorderLevel}
          onChange={(e) => setReorderLevel(Number(e.target.value) || 0)}
        />
        <input
          style={input}
          placeholder="Sold Today"
          type="number"
          value={soldToday}
          onChange={(e) => setSoldToday(Number(e.target.value) || 0)}
        />
        <input
          style={input}
          placeholder="Supplier"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
        />
        <input
          style={input}
          placeholder="Reorder Cost Per Unit"
          type="number"
          value={reorderCost}
          onChange={(e) => setReorderCost(Number(e.target.value) || 0)}
        />

        <button
          style={{ ...button, background: "#0f172a", color: "#fff" }}
          onClick={addProduct}
        >
          Add Product
        </button>
      </div>

      <div style={box}>
        <h3>Inventory Movement</h3>

        {products.length === 0 && <p>No products entered</p>}

        {products.map((p) => (
          <div key={p.id} style={{ marginBottom: 10 }}>
            <strong>{p.name}</strong> | Stock: {p.stock} | Sold: {p.soldToday} | Supplier: {p.supplier}
            <div style={{ marginTop: 6 }}>
              <button
                style={{ ...button, background: "#16a34a", color: "#fff" }}
                onClick={() => sellOne(p.id)}
              >
                Sell 1
              </button>
              <button
                style={{ ...button, background: "#ef4444", color: "#fff" }}
                onClick={() => deleteProduct(p.id)}
              >
                Delete
              </button>
            </div>
            {p.stock <= p.reorderLevel && (
              <p style={{ color: "red" }}>
                ⚠️ Reorder Needed ({Math.max(p.reorderLevel - p.stock, 0)})
              </p>
            )}
          </div>
        ))}

        <p>Total Units Sold: {totalUnitsSold}</p>
        <p>Estimated Reorder Need: ${totalReorderNeed.toFixed(2)}</p>
      </div>

      <div style={box}>
        <h3>Supplier Payments</h3>

        <input
          style={input}
          placeholder="Supplier Name"
          value={supplierName}
          onChange={(e) => setSupplierName(e.target.value)}
        />
        <input
          style={input}
          placeholder="Amount"
          type="number"
          value={supplierAmount}
          onChange={(e) => setSupplierAmount(Number(e.target.value) || 0)}
        />

        <button
          style={{ ...button, background: "#0f172a", color: "#fff" }}
          onClick={addSupplierPayment}
        >
          Add Supplier Payment
        </button>

        {pendingPayments.length === 0 && <p>No pending supplier payments</p>}

        {pendingPayments.map((s) => (
          <div key={s.id} style={{ marginBottom: 8 }}>
            {s.name}: ${s.amount.toFixed(2)}
            <div style={{ marginTop: 6 }}>
              <button
                style={{ ...button, background: "#16a34a", color: "#fff" }}
                onClick={() => markSupplierPaid(s.id)}
              >
                Paid
              </button>
              <button
                style={{ ...button, background: "#ef4444", color: "#fff" }}
                onClick={() => deleteSupplierPayment(s.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        {paidPayments.length > 0 && (
          <>
            <h4>Paid</h4>
            {paidPayments.map((s) => (
              <div key={s.id} style={{ marginBottom: 8 }}>
                {s.name}: ${s.amount.toFixed(2)}
              </div>
            ))}
          </>
        )}

        <p>Total Supplier Due: ${totalSupplierDue.toFixed(2)}</p>
        <p style={{ color: cashAfterSupplierPayments >= 0 ? "green" : "red" }}>
          Cash After Supplier Payments: ${cashAfterSupplierPayments.toFixed(2)}
        </p>
        <p style={{ color: cashAfterReorders >= 0 ? "green" : "red" }}>
          Cash After Reorders: ${cashAfterReorders.toFixed(2)}
        </p>
      </div>

      <div style={box}>
        <h3>AI Priority</h3>
        <p>{aiPriority}</p>
        {topMovingProduct && <p>Top Moving Product: {topMovingProduct.name}</p>}
      </div>
    </main>
  )
}