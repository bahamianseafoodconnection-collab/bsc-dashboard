"use client"

import { useEffect, useMemo, useState } from "react"

type SupplierItem = {
  id: string
  name: string
  amount: number
  status: "pending" | "paid"
}

export default function Page() {

  // CORE
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

  // STORAGE
  useEffect(() => {
    const saved = localStorage.getItem("bsc-suppliers")
    if (saved) setSuppliers(JSON.parse(saved))
  }, [])

  useEffect(() => {
    localStorage.setItem("bsc-suppliers", JSON.stringify(suppliers))
  }, [suppliers])

  // CALCULATIONS
  const grossProfit = sales - cost
  const expenses = rent + payroll + utilities + otherExpenses
  const netProfit = grossProfit - expenses
  const totalPosition = cash + bank

  const pendingSuppliers = suppliers.filter(s => s.status === "pending")
  const paidSuppliers = suppliers.filter(s => s.status === "paid")

  const totalOwed = pendingSuppliers.reduce((sum, s) => sum + s.amount, 0)

  const cashAfterPayments = totalPosition - totalOwed

  // ACTIONS
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

  const deleteSupplier = (id: string) => {
    setSuppliers(suppliers.filter(s => s.id !== id))
  }

  // AI ENGINE
  const ai = useMemo(() => {
    if (sales === 0) return "⚠️ No sales"
    if (netProfit < 0) return "⚠️ Losing money"
    if (totalOwed > totalPosition) return "🚨 Cannot pay suppliers"
    if (cashAfterPayments < 500) return "⚠️ Low cash after payments"
    return "✅ Stable position"
  }, [sales, netProfit, totalOwed, totalPosition, cashAfterPayments])

  const box = {
    background: "#fff",
    padding: "16px",
    borderRadius: "12px",
    marginBottom: "12px"
  }

  const input = {
    width: "100%",
    padding: "10px",
    marginBottom: "10px"
  }

  return (
    <main style={{ padding: 20, background: "#f3f4f6", minHeight: "100vh" }}>
      <h1>BSC Control Dashboard</h1>

      {/* FINANCIAL */}
      <div style={box}>
        <p>Sales: ${sales}</p>
        <p>Gross Profit: ${grossProfit}</p>
        <p>Expenses: ${expenses}</p>
        <p style={{ color: netProfit >= 0 ? "green" : "red" }}>
          Net Profit: ${netProfit}
        </p>
      </div>

      {/* INPUTS */}
      <div style={box}>
        <h3>Business Inputs</h3>
        <input style={input} placeholder="Sales" type="number" value={sales} onChange={e => setSales(Number(e.target.value))} />
        <input style={input} placeholder="Cost" type="number" value={cost} onChange={e => setCost(Number(e.target.value))} />
        <input style={input} placeholder="Rent" type="number" value={rent} onChange={e => setRent(Number(e.target.value))} />
        <input style={input} placeholder="Payroll" type="number" value={payroll} onChange={e => setPayroll(Number(e.target.value))} />
        <input style={input} placeholder="Utilities" type="number" value={utilities} onChange={e => setUtilities(Number(e.target.value))} />
        <input style={input} placeholder="Other" type="number" value={otherExpenses} onChange={e => setOtherExpenses(Number(e.target.value))} />
      </div>

      {/* CASH */}
      <div style={box}>
        <h3>Cash Position</h3>
        <input style={input} placeholder="Cash" type="number" value={cash} onChange={e => setCash(Number(e.target.value))} />
        <input style={input} placeholder="Bank" type="number" value={bank} onChange={e => setBank(Number(e.target.value))} />
        <p>Total: ${totalPosition}</p>
      </div>

      {/* SUPPLIER INPUT */}
      <div style={box}>
        <h3>Add Supplier Payment</h3>
        <input style={input} placeholder="Supplier Name" value={supplierName} onChange={e => setSupplierName(e.target.value)} />
        <input style={input} placeholder="Amount" type="number" value={supplierAmount} onChange={e => setSupplierAmount(Number(e.target.value))} />
        <button onClick={addSupplier}>Add Supplier</button>
      </div>

      {/* SUPPLIER LIST */}
      <div style={box}>
        <h3>Pending Supplier Payments</h3>

        {pendingSuppliers.map(s => (
          <div key={s.id}>
            {s.name}: ${s.amount}
            <button onClick={() => markPaid(s.id)}>Paid</button>
            <button onClick={() => deleteSupplier(s.id)}>Delete</button>
          </div>
        ))}

        <p>Total Owed: ${totalOwed}</p>
      </div>

      {/* CASH CONTROL */}
      <div style={box}>
        <h3>Cash After Payments</h3>
        <p style={{ color: cashAfterPayments >= 0 ? "green" : "red" }}>
          ${cashAfterPayments}
        </p>
      </div>

      {/* AI */}
      <div style={box}>
        <h3>AI Insight</h3>
        <p>{ai}</p>
      </div>

    </main>
  )
}