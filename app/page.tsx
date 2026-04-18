"use client"

import { useEffect, useMemo, useState } from "react"

type HistoryItem = {
  id: string
  date: string
  sales: number
  cost: number
  grossProfit: number
  rent: number
  payroll: number
  utilities: number
  otherExpenses: number
  totalExpenses: number
  netProfit: number
  cash: number
  bank: number
  totalPosition: number
  aiInsight: string
}

export default function Page() {
  const [sales, setSales] = useState(0)
  const [cost, setCost] = useState(0)

  const [rent, setRent] = useState(0)
  const [payroll, setPayroll] = useState(0)
  const [utilities, setUtilities] = useState(0)
  const [otherExpenses, setOtherExpenses] = useState(0)

  const [cash, setCash] = useState(0)
  const [bank, setBank] = useState(0)

  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("bsc-dashboard-history")
    if (saved) {
      try {
        setHistory(JSON.parse(saved))
      } catch {
        setHistory([])
      }
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    localStorage.setItem("bsc-dashboard-history", JSON.stringify(history))
  }, [history, loaded])

  const grossProfit = useMemo(() => sales - cost, [sales, cost])

  const totalExpenses = useMemo(
    () => rent + payroll + utilities + otherExpenses,
    [rent, payroll, utilities, otherExpenses]
  )

  const netProfit = useMemo(
    () => grossProfit - totalExpenses,
    [grossProfit, totalExpenses]
  )

  const totalPosition = useMemo(() => cash + bank, [cash, bank])

  const aiInsight = useMemo(() => {
    if (sales <= 0) return "⚠️ No sales entered — system idle"
    if (grossProfit < 0) return "⚠️ You are losing money on product"
    if (netProfit < 0) return "⚠️ Expenses too high — reduce costs"
    if (totalPosition < 500) return "⚠️ Low cash position — protect cash"
    return "📈 Business is healthy — keep scaling"
  }, [sales, grossProfit, netProfit, totalPosition])

  const saveToday = () => {
    const now = new Date()
    const item: HistoryItem = {
      id: String(now.getTime()),
      date: now.toLocaleString(),
      sales,
      cost,
      grossProfit,
      rent,
      payroll,
      utilities,
      otherExpenses,
      totalExpenses,
      netProfit,
      cash,
      bank,
      totalPosition,
      aiInsight,
    }

    setHistory((prev) => [item, ...prev])
  }

  const clearInputs = () => {
    setSales(0)
    setCost(0)
    setRent(0)
    setPayroll(0)
    setUtilities(0)
    setOtherExpenses(0)
    setCash(0)
    setBank(0)
  }

  const deleteEntry = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id))
  }

  const clearHistory = () => {
    const confirmed = window.confirm("Delete all saved closeout history?")
    if (!confirmed) return
    setHistory([])
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px",
    marginTop: "6px",
    marginBottom: "14px",
    borderRadius: "10px",
    border: "1px solid #d1d5db",
    fontSize: "16px",
    boxSizing: "border-box",
  }

  const cardStyle: React.CSSProperties = {
    background: "#ffffff",
    padding: "16px",
    borderRadius: "16px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    flex: "1 1 180px",
  }

  const sectionStyle: React.CSSProperties = {
    marginTop: "24px",
    background: "#ffffff",
    padding: "20px",
    borderRadius: "16px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  }

  const buttonStyle: React.CSSProperties = {
    padding: "12px 16px",
    borderRadius: "10px",
    border: "none",
    background: "#111827",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: 700,
    cursor: "pointer",
  }

  const secondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: "#e5e7eb",
    color: "#111827",
  }

  return (
    <main
      style={{
        padding: "20px",
        background: "#f3f4f6",
        minHeight: "100vh",
        fontFamily: "Arial, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "56px", marginBottom: "8px" }}>BSC Control Dashboard</h1>
        <p style={{ fontSize: "18px", marginTop: 0 }}>Live business control center</p>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
          <div style={cardStyle}>
            <div>Sales</div>
            <div style={{ fontSize: "34px", fontWeight: 700, marginTop: "8px" }}>
              ${sales.toFixed(2)}
            </div>
          </div>

          <div style={cardStyle}>
            <div>Gross Profit</div>
            <div style={{ fontSize: "34px", fontWeight: 700, marginTop: "8px" }}>
              ${grossProfit.toFixed(2)}
            </div>
          </div>

          <div style={cardStyle}>
            <div>Expenses</div>
            <div style={{ fontSize: "34px", fontWeight: 700, marginTop: "8px" }}>
              ${totalExpenses.toFixed(2)}
            </div>
          </div>

          <div style={cardStyle}>
            <div>Net Profit</div>
            <div
              style={{
                fontSize: "34px",
                fontWeight: 700,
                marginTop: "8px",
                color: netProfit >= 0 ? "green" : "red",
              }}
            >
              ${netProfit.toFixed(2)}
            </div>
          </div>

          <div style={cardStyle}>
            <div>Cash in Hand</div>
            <div style={{ fontSize: "34px", fontWeight: 700, marginTop: "8px" }}>
              ${cash.toFixed(2)}
            </div>
          </div>

          <div style={cardStyle}>
            <div>Bank</div>
            <div style={{ fontSize: "34px", fontWeight: 700, marginTop: "8px" }}>
              ${bank.toFixed(2)}
            </div>
          </div>

          <div style={cardStyle}>
            <div>Total Position</div>
            <div style={{ fontSize: "34px", fontWeight: 700, marginTop: "8px" }}>
              ${totalPosition.toFixed(2)}
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <h2 style={{ fontSize: "28px", marginTop: 0 }}>Sales + Profit Input</h2>

          <label>Today Sales</label>
          <input
            type="number"
            style={inputStyle}
            value={sales}
            onChange={(e) => setSales(Number(e.target.value) || 0)}
          />

          <label>Cost of Goods</label>
          <input
            type="number"
            style={inputStyle}
            value={cost}
            onChange={(e) => setCost(Number(e.target.value) || 0)}
          />

          <label>Rent</label>
          <input
            type="number"
            style={inputStyle}
            value={rent}
            onChange={(e) => setRent(Number(e.target.value) || 0)}
          />

          <label>Payroll</label>
          <input
            type="number"
            style={inputStyle}
            value={payroll}
            onChange={(e) => setPayroll(Number(e.target.value) || 0)}
          />

          <label>Utilities</label>
          <input
            type="number"
            style={inputStyle}
            value={utilities}
            onChange={(e) => setUtilities(Number(e.target.value) || 0)}
          />

          <label>Other Expenses</label>
          <input
            type="number"
            style={inputStyle}
            value={otherExpenses}
            onChange={(e) => setOtherExpenses(Number(e.target.value) || 0)}
          />
        </div>

        <div style={sectionStyle}>
          <h2 style={{ fontSize: "28px", marginTop: 0 }}>Cash Position</h2>

          <label>Cash in Hand</label>
          <input
            type="number"
            style={inputStyle}
            value={cash}
            onChange={(e) => setCash(Number(e.target.value) || 0)}
          />

          <label>Bank</label>
          <input
            type="number"
            style={inputStyle}
            value={bank}
            onChange={(e) => setBank(Number(e.target.value) || 0)}
          />

          <h3 style={{ fontSize: "24px", marginBottom: 0 }}>
            Total Position: ${totalPosition.toFixed(2)}
          </h3>
        </div>

        <div style={sectionStyle}>
          <h2 style={{ fontSize: "28px", marginTop: 0 }}>AI Insight</h2>
          <p
            style={{
              color: aiInsight.includes("📈") ? "green" : "red",
              fontWeight: 700,
              fontSize: "18px",
              marginBottom: 0,
            }}
          >
            {aiInsight}
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "24px" }}>
          <button style={buttonStyle} onClick={saveToday}>
            Save Today Closeout
          </button>

          <button style={secondaryButtonStyle} onClick={clearInputs}>
            Clear Inputs
          </button>

          <button
            style={{ ...secondaryButtonStyle, background: "#fee2e2", color: "#991b1b" }}
            onClick={clearHistory}
          >
            Clear History
          </button>
        </div>

        <div style={sectionStyle}>
          <h2 style={{ fontSize: "28px", marginTop: 0 }}>Saved Daily History</h2>

          {history.length === 0 ? (
            <p>No closeouts saved yet.</p>
          ) : (
            <div style={{ display: "grid", gap: "16px" }}>
              {history.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "14px",
                    padding: "16px",
                    background: "#fafafa",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <strong>{item.date}</strong>
                    <button
                      onClick={() => deleteEntry(item.id)}
                      style={{
                        border: "none",
                        background: "#dc2626",
                        color: "#fff",
                        borderRadius: "8px",
                        padding: "8px 12px",
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>

                  <div style={{ marginTop: "12px", lineHeight: 1.8 }}>
                    <div>Sales: ${item.sales.toFixed(2)}</div>
                    <div>Cost of Goods: ${item.cost.toFixed(2)}</div>
                    <div>Gross Profit: ${item.grossProfit.toFixed(2)}</div>
                    <div>Total Expenses: ${item.totalExpenses.toFixed(2)}</div>
                    <div>Net Profit: ${item.netProfit.toFixed(2)}</div>
                    <div>Cash: ${item.cash.toFixed(2)}</div>
                    <div>Bank: ${item.bank.toFixed(2)}</div>
                    <div>Total Position: ${item.totalPosition.toFixed(2)}</div>
                    <div style={{ fontWeight: 700, color: item.aiInsight.includes("📈") ? "green" : "red" }}>
                      {item.aiInsight}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}