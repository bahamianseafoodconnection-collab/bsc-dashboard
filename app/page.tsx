"use client"

import { useMemo, useState } from "react"

export default function Page() {
  const [sales, setSales] = useState(0)
  const [cost, setCost] = useState(0)

  const [rent, setRent] = useState(0)
  const [payroll, setPayroll] = useState(0)
  const [utilities, setUtilities] = useState(0)
  const [otherExpenses, setOtherExpenses] = useState(0)

  const [cash, setCash] = useState(0)
  const [bank, setBank] = useState(0)

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
    if (sales <= 0) return "⚠️ No sales entered — system idle"
    if (grossProfit < 0) return "⚠️ You are losing money on product"
    if (netProfit < 0) return "⚠️ Expenses too high — reduce costs"
    if (totalPosition < 500) return "⚠️ Low cash position — protect cash"
    return "📈 Business is healthy — keep scaling"
  }, [sales, grossProfit, netProfit, totalPosition])

  const inputStyle = {
    width: "100%",
    padding: "10px",
    marginTop: "6px",
    marginBottom: "12px",
    borderRadius: "8px",
    border: "1px solid #ccc"
  }

  const cardStyle = {
    background: "#fff",
    padding: "16px",
    borderRadius: "12px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
    flex: "1",
    minWidth: "120px"
  }

  return (
    <main style={{ padding: "20px", background: "#f5f5f5", minHeight: "100vh", fontFamily: "Arial" }}>

      <h1>BSC Control Dashboard</h1>
      <p>Live business control center</p>

      {/* TOP METRICS */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "20px" }}>
        <div style={cardStyle}>
          <p>Sales</p>
          <strong>${sales.toFixed(2)}</strong>
        </div>

        <div style={cardStyle}>
          <p>Gross Profit</p>
          <strong>${grossProfit.toFixed(2)}</strong>
        </div>

        <div style={cardStyle}>
          <p>Total Expenses</p>
          <strong>${totalExpenses.toFixed(2)}</strong>
        </div>

        <div style={cardStyle}>
          <p>Net Profit</p>
          <strong style={{ color: netProfit >= 0 ? "green" : "red" }}>
            ${netProfit.toFixed(2)}
          </strong>
        </div>
      </div>

      {/* INPUTS */}
      <div style={{ marginTop: "30px", background: "#fff", padding: "20px", borderRadius: "12px" }}>
        <h2>Sales + Cost</h2>

        <label>Today Sales</label>
        <input type="number" style={inputStyle}
          value={sales}
          onChange={(e) => setSales(Number(e.target.value) || 0)}
        />

        <label>Cost of Goods</label>
        <input type="number" style={inputStyle}
          value={cost}
          onChange={(e) => setCost(Number(e.target.value) || 0)}
        />

        <h2>Expenses</h2>

        <label>Rent</label>
        <input type="number" style={inputStyle}
          value={rent}
          onChange={(e) => setRent(Number(e.target.value) || 0)}
        />

        <label>Payroll</label>
        <input type="number" style={inputStyle}
          value={payroll}
          onChange={(e) => setPayroll(Number(e.target.value) || 0)}
        />

        <label>Utilities</label>
        <input type="number" style={inputStyle}
          value={utilities}
          onChange={(e) => setUtilities(Number(e.target.value) || 0)}
        />

        <label>Other Expenses</label>
        <input type="number" style={inputStyle}
          value={otherExpenses}
          onChange={(e) => setOtherExpenses(Number(e.target.value) || 0)}
        />
      </div>

      {/* CASH POSITION */}
      <div style={{ marginTop: "30px", background: "#fff", padding: "20px", borderRadius: "12px" }}>
        <h2>Cash Position</h2>

        <label>Cash in Hand</label>
        <input type="number" style={inputStyle}
          value={cash}
          onChange={(e) => setCash(Number(e.target.value) || 0)}
        />

        <label>Bank</label>
        <input type="number" style={inputStyle}
          value={bank}
          onChange={(e) => setBank(Number(e.target.value) || 0)}
        />

        <h3>Total Position: ${totalPosition.toFixed(2)}</h3>
      </div>

      {/* AI INSIGHT */}
      <div style={{ marginTop: "30px", background: "#fff", padding: "20px", borderRadius: "12px" }}>
        <h2>AI Insight</h2>
        <p style={{ color: "red", fontWeight: "bold" }}>{aiInsight}</p>
      </div>

    </main>
  )
}