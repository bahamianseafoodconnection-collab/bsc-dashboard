"use client"

import { useState, useMemo, useEffect } from "react"

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

  // DAILY OPERATIONS
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

  const totalSupplierDue = suppliers
    .filter(s => s.status === "pending")
    .reduce((sum, s) => sum + s.amount, 0)

  const lowStock = products.filter(p => p.stock <= p.reorderLevel)

  // AI
  const ai = useMemo(() => {
    if (variance !== 0) return "🚨 Fix cash mismatch"
    if (totalSales === 0) return "⚠️ No sales today"
    if (totalSupplierDue > actualCash) return "🚨 Don't pay suppliers"
    if (lowStock.length > 0) return "📦 Reorder inventory"
    return "✅ Good day"
  }, [variance, totalSales, totalSupplierDue, actualCash, lowStock])

  // SAVE REPORT
  const saveReport = () => {
    const newReport: Report = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
      sales: totalSales,
      profit: totalSales - payouts,
      cash: actualCash,
      variance,
      note
    }

    setReports([newReport, ...reports])
  }

  // STORAGE
  useEffect(() => {
    const r = localStorage.getItem("reports")
    if (r) setReports(JSON.parse(r))
  }, [])

  useEffect(() => {
    localStorage.setItem("reports", JSON.stringify(reports))
  }, [reports])

  // ACTIONS
  const addProduct = () => {
    if (!productName) return

    setProducts([
      ...products,
      {
        id: Date.now().toString(),
        name: productName,
        stock,
        reorderLevel,
        soldToday: 0
      }
    ])

    setProductName("")
    setStock(0)
    setReorderLevel(0)
  }

  const sellProduct = (id: string) => {
    setProducts(products.map(p =>
      p.id === id && p.stock > 0
        ? { ...p, stock: p.stock - 1, soldToday: p.soldToday + 1 }
        : p
    ))
  }

  const addSupplier = () => {
    if (!supplierName || supplierAmount <= 0) return

    setSuppliers([
      ...suppliers,
      {
        id: Date.now().toString(),
        name: supplierName,
        amount: supplierAmount,
        status: "pending"
      }
    ])

    setSupplierName("")
    setSupplierAmount(0)
  }

  const markPaid = (id: string) => {
    setSuppliers(suppliers.map(s =>
      s.id === id ? { ...s, status: "paid" } : s
    ))
  }

  const box = {
    background: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12
  }

  const input = {
    width: "100%",
    padding: 10,
    marginBottom: 10
  }

  return (
    <main style={{ padding: 20, background: "#f3f4f6", minHeight: "100vh" }}>

      <h1>BSC Control Dashboard</h1>

      {/* DAILY OPS */}
      <div style={box}>
        <h3>Daily Operations</h3>

        <input style={input} placeholder="Opening Cash" type="number" value={openingCash} onChange={e => setOpeningCash(Number(e.target.value))} />
        <input style={input} placeholder="Cash Sales" type="number" value={cashSales} onChange={e => setCashSales(Number(e.target.value))} />
        <input style={input} placeholder="Card Sales" type="number" value={cardSales} onChange={e => setCardSales(Number(e.target.value))} />
        <input style={input} placeholder="Payouts" type="number" value={payouts} onChange={e => setPayouts(Number(e.target.value))} />
        <input style={input} placeholder="Deposits" type="number" value={deposits} onChange={e => setDeposits(Number(e.target.value))} />
        <input style={input} placeholder="Actual Cash" type="number" value={actualCash} onChange={e => setActualCash(Number(e.target.value))} />

        <p>Expected Cash: ${expectedCash}</p>
        <p style={{ color: variance === 0 ? "green" : "red" }}>Variance: ${variance}</p>
        <p>Total Sales: ${totalSales}</p>
      </div>

      {/* INVENTORY */}
      <div style={box}>
        <h3>Inventory</h3>

        <input style={input} placeholder="Product Name" value={productName} onChange={e => setProductName(e.target.value)} />
        <input style={input} placeholder="Stock" type="number" value={stock} onChange={e => setStock(Number(e.target.value))} />
        <input style={input} placeholder="Reorder Level" type="number" value={reorderLevel} onChange={e => setReorderLevel(Number(e.target.value))} />

        <button onClick={addProduct}>Add Product</button>

        {products.map(p => (
          <div key={p.id}>
            {p.name} | Stock: {p.stock}
            <button onClick={() => sellProduct(p.id)}>Sell</button>
          </div>
        ))}

        <p>{lowStock.length ? "⚠️ Low stock items" : "✅ Inventory OK"}</p>
      </div>

      {/* SUPPLIERS */}
      <div style={box}>
        <h3>Suppliers</h3>

        <input style={input} placeholder="Name" value={supplierName} onChange={e => setSupplierName(e.target.value)} />
        <input style={input} placeholder="Amount" type="number" value={supplierAmount} onChange={e => setSupplierAmount(Number(e.target.value))} />

        <button onClick={addSupplier}>Add</button>

        {suppliers.map(s => (
          <div key={s.id}>
            {s.name}: ${s.amount}
            <button onClick={() => markPaid(s.id)}>Paid</button>
          </div>
        ))}

        <p>Total Due: ${totalSupplierDue}</p>
      </div>

      {/* AI */}
      <div style={box}>
        <h3>AI Insight</h3>
        <p>{ai}</p>
      </div>

      {/* REPORT */}
      <div style={box}>
        <h3>Daily Report</h3>

        <input style={input} placeholder="Manager Note" value={note} onChange={e => setNote(e.target.value)} />

        <button onClick={saveReport}>Save Today</button>

        {reports.map(r => (
          <div key={r.id}>
            {r.date} | Sales: ${r.sales} | Cash: ${r.cash}
          </div>
        ))}
      </div>

    </main>
  )
}