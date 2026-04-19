"use client"

import { useEffect, useMemo, useState } from "react"

type SupplierItem = {
  id: string
  name: string
  amount: number
  status: "pending" | "paid"
}

type ProductItem = {
  id: string
  name: string
  costPrice: number
  sellingPrice: number
  stock: number
  reorderLevel: number
  quantitySold: number
}

export default function Page() {

  // BUSINESS INPUTS
  const [sales, setSales] = useState(0)
  const [cost, setCost] = useState(0)
  const [rent, setRent] = useState(0)
  const [payroll, setPayroll] = useState(0)
  const [utilities, setUtilities] = useState(0)
  const [otherExpenses, setOtherExpenses] = useState(0)
  const [cash, setCash] = useState(0)
  const [bank, setBank] = useState(0)

  // SUPPLIERS
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([])
  const [supplierName, setSupplierName] = useState("")
  const [supplierAmount, setSupplierAmount] = useState(0)

  // PRODUCTS
  const [products, setProducts] = useState<ProductItem[]>([])
  const [productName, setProductName] = useState("")
  const [costPrice, setCostPrice] = useState(0)
  const [sellingPrice, setSellingPrice] = useState(0)
  const [stock, setStock] = useState(0)
  const [reorderLevel, setReorderLevel] = useState(0)
  const [quantitySold, setQuantitySold] = useState(0)

  // STORAGE
  useEffect(() => {
    const s = localStorage.getItem("suppliers")
    const p = localStorage.getItem("products")
    if (s) setSuppliers(JSON.parse(s))
    if (p) setProducts(JSON.parse(p))
  }, [])

  useEffect(() => {
    localStorage.setItem("suppliers", JSON.stringify(suppliers))
  }, [suppliers])

  useEffect(() => {
    localStorage.setItem("products", JSON.stringify(products))
  }, [products])

  // CORE CALCULATIONS
  const grossProfit = sales - cost
  const expenses = rent + payroll + utilities + otherExpenses
  const netProfit = grossProfit - expenses
  const totalPosition = cash + bank

  const pendingSuppliers = suppliers.filter(s => s.status === "pending")
  const totalOwed = pendingSuppliers.reduce((sum, s) => sum + s.amount, 0)
  const cashAfterPayments = totalPosition - totalOwed

  const lowStock = products.filter(p => p.stock <= p.reorderLevel)

  const productProfit = products.reduce(
    (sum, p) => sum + (p.sellingPrice - p.costPrice) * p.quantitySold,
    0
  )

  // 🎯 SMART DAILY TARGET
  const targetSales = useMemo(() => {
    const base = expenses * 1.2 // expenses + 20% profit goal
    return Math.max(base, 1)
  }, [expenses])

  const progress = Math.min((sales / targetSales) * 100, 100)

  // 🧠 AI DECISION ENGINE
  const ai = useMemo(() => {
    if (sales === 0) return "⚠️ Start sales immediately"

    if (sales < targetSales * 0.5)
      return "🚨 Sales behind target — push fast moving items"

    if (netProfit < 0)
      return "🚨 Losing money — reduce expenses immediately"

    if (totalOwed > totalPosition)
      return "🚨 Do NOT pay suppliers — protect cash"

    if (lowStock.length > 0)
      return "📦 Restock critical items now"

    if (productProfit > 0)
      return "🔥 Push profitable products"

    return "✅ Business running stable"
  }, [sales, targetSales, netProfit, totalOwed, totalPosition, lowStock, productProfit])

  // 📊 PERFORMANCE SCORE
  const score = useMemo(() => {
    let s = 100

    if (netProfit < 0) s -= 30
    if (sales < targetSales) s -= 20
    if (totalOwed > totalPosition) s -= 30
    if (lowStock.length > 0) s -= 10

    return Math.max(s, 0)
  }, [netProfit, sales, targetSales, totalOwed, totalPosition, lowStock])

  // ACTIONS
  const addSupplier = () => {
    if (!supplierName || supplierAmount <= 0) return
    setSuppliers([
      ...suppliers,
      { id: Date.now().toString(), name: supplierName, amount: supplierAmount, status: "pending" }
    ])
    setSupplierName("")
    setSupplierAmount(0)
  }

  const markPaid = (id: string) => {
    setSuppliers(suppliers.map(s =>
      s.id === id ? { ...s, status: "paid" } : s
    ))
  }

  const addProduct = () => {
    if (!productName) return
    setProducts([
      ...products,
      {
        id: Date.now().toString(),
        name: productName,
        costPrice,
        sellingPrice,
        stock,
        reorderLevel,
        quantitySold
      }
    ])
    setProductName("")
    setCostPrice(0)
    setSellingPrice(0)
    setStock(0)
    setReorderLevel(0)
    setQuantitySold(0)
  }

  const box = { background: "#fff", padding: 16, borderRadius: 12, marginBottom: 12 }
  const input = { width: "100%", padding: 10, marginBottom: 10 }

  return (
    <main style={{ padding: 20, background: "#f3f4f6", minHeight: "100vh" }}>
      <h1>BSC Control Dashboard</h1>

      {/* 🎯 TARGET */}
      <div style={box}>
        <h3>Daily Target</h3>
        <p>Target Sales: ${targetSales.toFixed(0)}</p>
        <p>Progress: {progress.toFixed(0)}%</p>
      </div>

      {/* 📊 SCORE */}
      <div style={box}>
        <h3>Performance Score</h3>
        <p style={{ fontSize: 24 }}>{score}/100</p>
      </div>

      {/* 💰 FINANCIAL */}
      <div style={box}>
        <p>Sales: ${sales}</p>
        <p>Net Profit: ${netProfit}</p>
        <p>Cash After Payments: ${cashAfterPayments}</p>
      </div>

      {/* INPUTS */}
      <div style={box}>
        <h3>Inputs</h3>
        <input style={input} placeholder="Sales" type="number" value={sales} onChange={e => setSales(Number(e.target.value))} />
        <input style={input} placeholder="Cost" type="number" value={cost} onChange={e => setCost(Number(e.target.value))} />
        <input style={input} placeholder="Rent" type="number" value={rent} onChange={e => setRent(Number(e.target.value))} />
        <input style={input} placeholder="Payroll" type="number" value={payroll} onChange={e => setPayroll(Number(e.target.value))} />
      </div>

      {/* SUPPLIERS */}
      <div style={box}>
        <h3>Suppliers</h3>
        <input style={input} placeholder="Name" value={supplierName} onChange={e => setSupplierName(e.target.value)} />
        <input style={input} placeholder="Amount" type="number" value={supplierAmount} onChange={e => setSupplierAmount(Number(e.target.value))} />
        <button onClick={addSupplier}>Add</button>

        {pendingSuppliers.map(s => (
          <div key={s.id}>
            {s.name}: ${s.amount}
            <button onClick={() => markPaid(s.id)}>Paid</button>
          </div>
        ))}
      </div>

      {/* PRODUCTS */}
      <div style={box}>
        <h3>Products</h3>

        <input style={input} placeholder="Name" value={productName} onChange={e => setProductName(e.target.value)} />
        <input style={input} placeholder="Sell Price" type="number" value={sellingPrice} onChange={e => setSellingPrice(Number(e.target.value))} />
        <input style={input} placeholder="Cost" type="number" value={costPrice} onChange={e => setCostPrice(Number(e.target.value))} />
        <input style={input} placeholder="Stock" type="number" value={stock} onChange={e => setStock(Number(e.target.value))} />
        <input style={input} placeholder="Sold" type="number" value={quantitySold} onChange={e => setQuantitySold(Number(e.target.value))} />

        <button onClick={addProduct}>Add Product</button>
      </div>

      {/* 🧠 AI */}
      <div style={box}>
        <h3>AI Decision</h3>
        <p>{ai}</p>
      </div>

    </main>
  )
}