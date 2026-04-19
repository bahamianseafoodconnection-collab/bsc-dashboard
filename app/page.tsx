"use client"

import { useState, useMemo } from "react"

export default function Page() {
  // CORE DATA
  const [sales, setSales] = useState(0)
  const [cost, setCost] = useState(0)

  const [rent, setRent] = useState(0)
  const [payroll, setPayroll] = useState(0)
  const [utilities, setUtilities] = useState(0)
  const [otherExpenses, setOtherExpenses] = useState(0)

  const [cash, setCash] = useState(0)
  const [bank, setBank] = useState(0)

  // OBLIGATIONS
  const [name, setName] = useState("")
  const [amount, setAmount] = useState(0)
  const [bills, setBills] = useState<any[]>([])

  // CALCULATIONS
  const grossProfit = useMemo(() => sales - cost, [sales, cost])
  const expenses = useMemo(() => rent + payroll + utilities + otherExpenses, [rent, payroll, utilities, otherExpenses])
  const netProfit = useMemo(() => grossProfit - expenses, [grossProfit, expenses])
  const totalCash = useMemo(() => cash + bank, [cash, bank])
  const totalBills = useMemo(() => bills.reduce((sum, b) => sum + b.amount, 0), [bills])

  const insight = useMemo(() => {
    if (sales === 0) return "⚠️ No sales"
    if (netProfit < 0) return "⚠️ Losing money"
    if (totalCash < totalBills) return "🚨 Cannot cover bills"
    return "✅ Stable"
  }, [sales, netProfit, totalCash, totalBills])

  // ADD BILL
  const addBill = () => {
    if (!name || amount <= 0) return
    setBills([...bills, { id: Date.now(), name, amount }])
    setName("")
    setAmount(0)
  }

  const box = {
    background: "#fff",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12
  }

  return (
    <main style={{ padding: 20, background: "#f3f4f6", minHeight: "100vh" }}>
      <h1>BSC Control Dashboard</h1>

      {/* METRICS */}
      <div style={box}>
        <p>Sales: ${sales}</p>
        <p>Gross Profit: ${grossProfit}</p>
        <p>Expenses: ${expenses}</p>
        <p style={{ color: netProfit >= 0 ? "green" : "red" }}>
          Net Profit: ${netProfit}
        </p>
      </div>

      {/* INPUT */}
      <div style={box}>
        <h3>Sales + Expenses</h3>

        <input placeholder="Sales" type="number" value={sales} onChange={(e) => setSales(Number(e.target.value))} />
        <input placeholder="Cost" type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} />

        <input placeholder="Rent" type="number" value={rent} onChange={(e) => setRent(Number(e.target.value))} />
        <input placeholder="Payroll" type="number" value={payroll} onChange={(e) => setPayroll(Number(e.target.value))} />
        <input placeholder="Utilities" type="number" value={utilities} onChange={(e) => setUtilities(Number(e.target.value))} />
        <input placeholder="Other" type="number" value={otherExpenses} onChange={(e) => setOtherExpenses(Number(e.target.value))} />
      </div>

      {/* CASH */}
      <div style={box}>
        <h3>Cash Position</h3>
        <input placeholder="Cash" type="number" value={cash} onChange={(e) => setCash(Number(e.target.value))} />
        <input placeholder="Bank" type="number" value={bank} onChange={(e) => setBank(Number(e.target.value))} />
        <p>Total: ${totalCash}</p>
      </div>

      {/* BILLS */}
      <div style={box}>
        <h3>Bills / Obligations</h3>

        <input placeholder="Bill name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Amount" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />

        <button onClick={addBill}>Add</button>

        {bills.map(b => (
          <div key={b.id}>
            {b.name}: ${b.amount}
          </div>
        ))}

        <p>Total Bills: ${totalBills}</p>
      </div>

      {/* AI */}
      <div style={box}>
        <h3>AI Insight</h3>
        <p>{insight}</p>
      </div>

    </main>
  )
}