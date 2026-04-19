"use client"

import { createClient } from "@/lib/supabase/browser"
import { useEffect, useMemo, useState } from "react"

type Product = {
  id: string
  name: string
  stock: number
  reorderLevel: number
  soldToday: number
}

type Supplier = {
  id: string
  name: string
  amount: number
  status: "pending" | "paid"
}

type Report = {
  id: string
  date: string
  sales: number
  profit: number
  cash: number
  variance: number
  note: string
}

export default function Page() {
  // DAILY OPS
  const [openingCash, setOpeningCash] = useState(0)
  const [cashSales, setCashSales] = useState(0)
  const [cardSales, setCardSales] = useState(0)
  const [payouts, setPayouts] = useState(0)
  const [deposits, setDeposits] = useState(0)
  const [actualCash, setActualCash] = useState(0)
  const [note, setNote] = useState("")

  // INVENTORY
  const [products, setProducts] = useState<Product[]>([])
  const [productName, setProductName] = useState("")
  const [stock, setStock] = useState(0)
  const [reorderLevel, setReorderLevel] = useState(0)

  // SUPPLIERS
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierName, setSupplierName] = useState("")
  const [supplierAmount, setSupplierAmount] = useState(0)

  // REPORTS
  const [reports, setReports] = useState<Report[]>([])

  // CALCULATIONS
  const totalSales = cashSales + cardSales
  const expectedCash = openingCash + cashSales - payouts - deposits
  const variance = actualCash - expectedCash
  const profit = totalSales - payouts

  const totalSupplierDue = suppliers
    .filter((s) => s.status === "pending")
    .reduce((sum, s) => sum + s.amount, 0)

  const lowStock = products.filter((p) => p.stock <= p.reorderLevel)

  // TREND ENGINE
  const totalReports = reports.length

  const averageSales = useMemo(() => {
    if (reports.length === 0) return 0
    return reports.reduce((sum, r) => sum + r.sales, 0) / reports.length
  }, [reports])

  const averageCash = useMemo(() => {
    if (reports.length === 0) return 0
    return reports.reduce((sum, r) => sum + r.cash, 0) / reports.length
  }, [reports])

  const bestDay = useMemo(() => {
    if (reports.length === 0) return null
    return [...reports].sort((a, b) => b.sales - a.sales)[0]
  }, [reports])

  const worstDay = useMemo(() => {
    if (reports.length === 0) return null
    return [...reports].sort((a, b) => a.sales - b.sales)[0]
  }, [reports])

  const trendMessage = useMemo(() => {
    if (reports.length < 2) return "Need more saved days for trend analysis"
    const latest = reports[0]
    const previous = reports[1]

    if (latest.sales > previous.sales) return "📈 Sales improving vs previous saved day"
    if (latest.sales < previous.sales) return "📉 Sales lower than previous saved day"
    return "➖ Sales unchanged vs previous saved day"
  }, [reports])

  // AI
  const ai = useMemo(() => {
    if (variance !== 0) return "🚨 Fix cash mismatch"
    if (totalSales === 0) return "⚠️ No sales today"
    if (totalSupplierDue > actualCash) return "🚨 Do not pay suppliers yet"
    if (lowStock.length > 0) return "📦 Reorder inventory"
    if (reports.length >= 2 && reports[0].sales < reports[1].sales) {
      return "📉 Sales slipped from previous report"
    }
    return "✅ Good day"
  }, [variance, totalSales, totalSupplierDue, actualCash, lowStock, reports])

  // STORAGE
  useEffect(() => {
    const r = localStorage.getItem("reports")
    const p = localStorage.getItem("products")
    const s = localStorage.getItem("suppliers")

    if (r) setReports(JSON.parse(r))
    if (p) setProducts(JSON.parse(p))
    if (s) setSuppliers(JSON.parse(s))
  }, [])

  useEffect(() => {
    localStorage.setItem("reports", JSON.stringify(reports))
  }, [reports])

  useEffect(() => {
    localStorage.setItem("products", JSON.stringify(products))
  }, [products])

  useEffect(() => {
    localStorage.setItem("suppliers", JSON.stringify(suppliers))
  }, [suppliers])

  // ACTIONS
  const saveReport = () => {
    const newReport: Report = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
      sales: totalSales,
      profit,
      cash: actualCash,
      variance,
      note,
    }

    setReports([newReport, ...reports])
    setNote("")
  }

  const addProduct = () => {
    if (!productName) return

    setProducts([
      ...products,
      {
        id: Date.now().toString(),
        name: productName,
        stock,
        reorderLevel,
        soldToday: 0,
      },
    ])

    setProductName("")
    setStock(0)
    setReorderLevel(0)
  }

  const sellProduct = (id: string) => {
    setProducts(
      products.map((p) =>
        p.id === id && p.stock > 0
          ? { ...p, stock: p.stock - 1, soldToday: p.soldToday + 1 }
          : p
      )
    )
  }

  const addSupplier = () => {
    if (!supplierName || supplierAmount <= 0) return

    setSuppliers([
      ...suppliers,
      {
        id: Date.now().toString(),
        name: supplierName,
        amount: supplierAmount,
        status: "pending",
      },
    ])

    setSupplierName("")
    setSupplierAmount(0)
  }

  const markPaid = (id: string) => {
    setSuppliers(
      suppliers.map((s) =>
        s.id === id ? { ...s, status: "paid" } : s
      )
    )
  }

  const box: React.CSSProperties = {
    background: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  }

  const input: React.CSSProperties = {
    width: "100%",
    padding: 10,
    marginBottom: 10,
    borderRadius: 8,
    border: "1px solid #ccc",
    boxSizing: "border-box",
  }

  const button: React.CSSProperties = {
    padding: "8px 12px",
    marginRight: 8,
    marginBottom: 8,
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
  }

  return (
    <main style={{ padding: 20, background: "#f3f4f6", minHeight: "100vh", fontFamily: "Arial, sans-serif" }}>
      <h1>BSC Control Dashboard</h1>
      <p>Trend Engine</p>

      <div style={box}>
        <h3>Daily Operations</h3>
        <input style={input} placeholder="Opening Cash" type="number" value={openingCash} onChange={(e) => setOpeningCash(Number(e.target.value) || 0)} />
        <input style={input} placeholder="Cash Sales" type="number" value={cashSales} onChange={(e) => setCashSales(Number(e.target.value) || 0)} />
        <input style={input} placeholder="Card Sales" type="number" value={cardSales} onChange={(e) => setCardSales(Number(e.target.value) || 0)} />
        <input style={input} placeholder="Payouts" type="number" value={payouts} onChange={(e) => setPayouts(Number(e.target.value) || 0)} />
        <input style={input} placeholder="Deposits" type="number" value={deposits} onChange={(e) => setDeposits(Number(e.target.value) || 0)} />
        <input style={input} placeholder="Actual Cash" type="number" value={actualCash} onChange={(e) => setActualCash(Number(e.target.value) || 0)} />

        <p>Expected Cash: ${expectedCash.toFixed(2)}</p>
        <p style={{ color: variance === 0 ? "green" : "red" }}>Variance: ${variance.toFixed(2)}</p>
        <p>Total Sales: ${totalSales.toFixed(2)}</p>
        <p>Profit: ${profit.toFixed(2)}</p>
      </div>

      <div style={box}>
        <h3>Inventory</h3>
        <input style={input} placeholder="Product Name" value={productName} onChange={(e) => setProductName(e.target.value)} />
        <input style={input} placeholder="Stock" type="number" value={stock} onChange={(e) => setStock(Number(e.target.value) || 0)} />
        <input style={input} placeholder="Reorder Level" type="number" value={reorderLevel} onChange={(e) => setReorderLevel(Number(e.target.value) || 0)} />
        <button onClick={addProduct}>Add Product</button>

        {products.map((p) => (
          <div key={p.id}>
            {p.name} | Stock: {p.stock}
            <button onClick={() => sellProduct(p.id)}>Sell</button>
          </div>
        ))}

        <p style={{ color: lowStock.length ? "red" : "green" }}>
          {lowStock.length ? "⚠️ Low stock items" : "✅ Inventory OK"}
        </p>
      </div>

      <div style={box}>
        <h3>Suppliers</h3>
        <input style={input} placeholder="Name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
        <input style={input} placeholder="Amount" type="number" value={supplierAmount} onChange={(e) => setSupplierAmount(Number(e.target.value) || 0)} />
        <button onClick={addSupplier}>Add</button>

        {suppliers.map((s) => (
          <div key={s.id}>
            {s.name}: ${s.amount.toFixed(2)}
            <button onClick={() => markPaid(s.id)}>Paid</button>
          </div>
        ))}

        <p>Total Due: ${totalSupplierDue.toFixed(2)}</p>
      </div>

      <div style={box}>
        <h3>Daily Report</h3>
        <input style={input} placeholder="Manager Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <button onClick={saveReport}>Save Today</button>
      </div>

      <div style={box}>
        <h3>Trend Summary</h3>
        <p>Total Reports: {totalReports}</p>
        <p>Average Sales: ${averageSales.toFixed(2)}</p>
        <p>Average Cash: ${averageCash.toFixed(2)}</p>
        <p>{trendMessage}</p>
        {bestDay && <p>Best Day: {bestDay.date} — ${bestDay.sales.toFixed(2)}</p>}
        {worstDay && <p>Worst Day: {worstDay.date} — ${worstDay.sales.toFixed(2)}</p>}
      </div>

      <div style={box}>
        <h3>Saved Reports</h3>
        {reports.map((r) => (
          <div key={r.id}>
            {r.date} | Sales: ${r.sales.toFixed(2)} | Profit: ${r.profit.toFixed(2)} | Cash: ${r.cash.toFixed(2)}
          </div>
        ))}
      </div>

      <div style={box}>
        <h3>AI Insight</h3>
        <p>{ai}</p>
      </div>
    </main>
  )
}