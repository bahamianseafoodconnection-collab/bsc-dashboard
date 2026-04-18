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
  const netProfit = useMemo(() => grossProfit - totalExpenses, [grossProfit, totalExpenses])
  const totalPosition = useMemo(() => cash + bank, [cash, bank])

  const aiInsight = useMemo(() => {
    if (sales <= 0) return "⚠️ No sales entered yet — update today’s numbers."
    if (grossProfit < 0) return "⚠️ Cost is higher than sales — check pricing or cost entry."
    if (netProfit < 0) return "⚠️ Net profit is negative — cut expenses or increase margin."
    if (totalPosition < 500) return "⚠️ Low cash position — prioritize collections and cash control."
    if (netProfit > 0 && totalPosition > 0) return "✅ Business is profitable today — protect cash and reinvest carefully."
    return "📊 Review today’s numbers and update missing fields."
  }, [sales, grossProfit, netProfit, totalPosition])

  const inputStyle = {
    width: "100%",
    maxWidth: "340px",
    padding: "12px",
    fontSize: "20px",
    borderRadius: "10px",
    border: "1px solid #9ca3af",
    marginTop: "10px",
    marginBottom: "12px",
  } as const

  const cardStyle = {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "18px",
    padding: "20px",
    marginTop: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  } as const

  const numberTextStyle = {
    fontSize: "34px",
    fontWeight: 700,
    marginTop: "8px",
  } as const

  const handleNumber =
    (setter: React.Dispatch<React.SetStateAction<number>>) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      setter(raw === "" ? 0 : Number(raw))
    }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        padding: "24px",
        fontFamily: "Arial, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "56px", marginBottom: "8px" }}>BSC Control Dashboard</h1>
        <p style={{ fontSize: "22px", color: "#4b5563", marginBottom: "24px" }}>
          Live business control center for BSC Marketplace
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "20px",
          }}
        >
          <div style={cardStyle}>
            <div style={{ color: "#6b7280", fontSize: "14px" }}>Today Sales</div>
            <div style={numberTextStyle}>${sales.toFixed(2)}</div>
          </div>

          <div style={cardStyle}>
            <div style={{ color: "#6b7280", fontSize: "14px" }}>Gross Profit</div>
            <div style={{ ...numberTextStyle, color: grossProfit < 0 ? "#dc2626" : "#111827" }}>
              ${grossProfit.toFixed(2)}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ color: "#6b7280", fontSize: "14px" }}>Total Expenses</div>
            <div style={numberTextStyle}>${totalExpenses.toFixed(2)}</div>
          </div>

          <div style={cardStyle}>
            <div style={{ color: "#6b7280", fontSize: "14px" }}>Net Profit</div>
            <div style={{ ...numberTextStyle, color: netProfit < 0 ? "#dc2626" : "#16a34a" }}>
              ${netProfit.toFixed(2)}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ color: "#6b7280", fontSize: "14px" }}>Cash in Hand</div>
            <div style={numberTextStyle}>${cash.toFixed(2)}</div>
          </div>

          <div style={cardStyle}>
            <div style={{ color: "#6b7280", fontSize: "14px" }}>Bank</div>
            <div style={numberTextStyle}>${bank.toFixed(2)}</div>
          </div>

          <div style={cardStyle}>
            <div style={{ color: "#6b7280", fontSize: "14px" }}>Total Position</div>
            <div style={numberTextStyle}>${totalPosition.toFixed(2)}</div>
          </div>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "34px", marginBottom: "18px" }}>Sales + Profit Input</h2>

          <div style={{ marginBottom: "18px" }}>
            <label style={{ fontSize: "20px", fontWeight: 700 }}>Today Sales</label>
            <br />
            <input
              type="number"
              value={sales}
              onChange={handleNumber(setSales)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: "18px" }}>
            <label style={{ fontSize: "20px", fontWeight: 700 }}>Cost of Goods Sold</label>
            <br />
            <input
              type="number"
              value={cost}
              onChange={handleNumber(setCost)}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "34px", marginBottom: "18px" }}>Expense Input</h2>

          <div style={{ marginBottom: "18px" }}>
            <label style={{ fontSize: "20px", fontWeight: 700 }}>Rent</label>
            <br />
            <input
              type="number"
              value={rent}
              onChange={handleNumber(setRent)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: "18px" }}>
            <label style={{ fontSize: "20px", fontWeight: 700 }}>Payroll</label>
            <br />
            <input
              type="number"
              value={payroll}
              onChange={handleNumber(setPayroll)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: "18px" }}>
            <label style={{ fontSize: "20px", fontWeight: 700 }}>Utilities</label>
            <br />
            <input
              type="number"
              value={utilities}
              onChange={handleNumber(setUtilities)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: "18px" }}>
            <label style={{ fontSize: "20px", fontWeight: 700 }}>Other Expenses</label>
            <br />
            <input
              type="number"
              value={otherExpenses}
              onChange={handleNumber(setOtherExpenses)}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "34px", marginBottom: "18px" }}>Cash Position</h2>

          <div style={{ marginBottom: "18px" }}>
            <label style={{ fontSize: "20px", fontWeight: 700 }}>Cash in Hand</label>
            <br />
            <input
              type="number"
              value={cash}
              onChange={handleNumber(setCash)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: "18px" }}>
            <label style={{ fontSize: "20px", fontWeight: 700 }}>Bank</label>
            <br />
            <input
              type="number"
              value={bank}
              onChange={handleNumber(setBank)}
              style={inputStyle}
            />
          </div>
        </div>

        <div
          style={{
            ...cardStyle,
            border: "2px solid #facc15",
            background: "#fffbeb",
          }}
        >
          <h2 style={{ fontSize: "34px", marginBottom: "12px" }}>AI Insight</h2>
          <p
            style={{
              fontSize: "28px",
              fontWeight: 700,
              color: aiInsight.includes("⚠️") ? "#dc2626" : "#16a34a",
              lineHeight: 1.4,
            }}
          >
            {aiInsight}
          </p>
        </div>
      </div>
    </main>
  )
}