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

  // CALCULATIONS
  const grossProfit = useMemo(() => sales - cost, [sales, cost])

  const totalExpenses = useMemo(
    () => rent + payroll + utilities + otherExpenses,
    [rent, payroll, utilities, otherExpenses]
  )

  const netProfit = useMemo(
    () => grossProfit - totalExpenses,
    [grossProfit, totalExpenses]
  )

  const totalPosition = useMemo(
    () => cash + bank,
    [cash, bank]
  )

  const aiInsight = useMemo(() => {
    if (sales === 0) return "⚠️ No sales entered — system idle"
    if (grossProfit < 0) return "⚠️ Cost exceeds sales"
    if (netProfit < 0) return "⚠️ Business losing money"
    if (totalPosition < 500) return "⚠️ Low cash position"
    return "✅ Business stable"
  }, [sales, grossProfit, netProfit, totalPosition])

  const card = {
    background: "#fff",
    padding: "16px",
    borderRadius: "12px",
    marginBottom: "12px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)"
  }

  const input = {
    width: "100%",
    padding: "10px",
    marginBottom: "10px",
    borderRadius: "8px",
    border: "1px solid #ccc"
  }

  return (
    <main style={{
      padding: "24px",
      background: "#f3f4f6",
      minHeight: "100vh",
      fontFamily: "Arial"
    }}>

      <h1 style={{ fontSize: "28px", fontWeight: "700" }}>
        BSC Control Dashboard
      </h1>

      <p style={{ marginBottom: "20px" }}>
        Live business control center
      </p>

      {/* SUMMARY */}
      <div style={card}>
        <p>Sales: ${sales.toFixed(2)}</p>
        <p>Gross Profit: ${grossProfit.toFixed(2)}</p>
        <p>Expenses: ${totalExpenses.toFixed(2)}</p>
        <p style={{ color: netProfit >= 0 ? "green" : "red" }}>
          Net Profit: ${netProfit.toFixed(2)}
        </p>
      </div>

      {/* INPUTS */}
      <div style={card}>
        <h2>Sales + Expenses</h2>

        <input type="number" style={input} placeholder="Sales"
          value={sales}
          onChange={(e) => setSales(Number(e.target.value) || 0)}
        />

        <input type="number" style={input} placeholder="Cost"
          value={cost}
          onChange={(e) => setCost(Number(e.target.value) || 0)}
        />

        <input type="number" style={input} placeholder="Rent"
          value={rent}
          onChange={(e) => setRent(Number(e.target.value) || 0)}
        />

        <input type="number" style={input} placeholder="Payroll"
          value={payroll}
          onChange={(e) => setPayroll(Number(e.target.value) || 0)}
        />

        <input type="number" style={input} placeholder="Utilities"
          value={utilities}
          onChange={(e) => setUtilities(Number(e.target.value) || 0)}
        />

        <input type="number" style={input} placeholder="Other Expenses"
          value={otherExpenses}
          onChange={(e) => setOtherExpenses(Number(e.target.value) || 0)}
        />
      </div>

      {/* CASH */}
      <div style={card}>
        <h2>Cash Position</h2>

        <input type="number" style={input} placeholder="Cash in Hand"
          value={cash}
          onChange={(e) => setCash(Number(e.target.value) || 0)}
        />

        <input type="number" style={input} placeholder="Bank"
          value={bank}
          onChange={(e) => setBank(Number(e.target.value) || 0)}
        />

        <p>Total Position: ${totalPosition.toFixed(2)}</p>
      </div>

      {/* AI */}
      <div style={card}>
        <h2>AI Insight</h2>
        <p style={{ color: "red", fontWeight: "600" }}>
          {aiInsight}
        </p>
      </div>

    </main>
  )
}