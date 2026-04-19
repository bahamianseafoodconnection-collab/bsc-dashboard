"use client"

import { useState, useMemo } from "react"

export default function Page() {

  // FINANCIAL INPUTS
  const [sales, setSales] = useState(0)
  const [cost, setCost] = useState(0)
  const [rent, setRent] = useState(0)
  const [payroll, setPayroll] = useState(0)
  const [utilities, setUtilities] = useState(0)
  const [otherExpenses, setOtherExpenses] = useState(0)

  const [cash, setCash] = useState(0)
  const [bank, setBank] = useState(0)

  // DAILY OPERATIONS
  const [openingCash, setOpeningCash] = useState(0)
  const [cashSales, setCashSales] = useState(0)
  const [cardSales, setCardSales] = useState(0)
  const [payouts, setPayouts] = useState(0)
  const [deposits, setDeposits] = useState(0)
  const [actualCash, setActualCash] = useState(0)
  const [note, setNote] = useState("")

  // CALCULATIONS
  const grossProfit = sales - cost
  const expenses = rent + payroll + utilities + otherExpenses
  const netProfit = grossProfit - expenses
  const totalPosition = cash + bank

  const expectedCash =
    openingCash + cashSales - payouts - deposits

  const variance = actualCash - expectedCash

  // AI
  const ai = useMemo(() => {
    if (sales === 0) return "⚠️ No sales yet"

    if (variance !== 0)
      return "🚨 Cash mismatch — investigate immediately"

    if (netProfit < 0)
      return "⚠️ Losing money — reduce expenses"

    if (totalPosition < 500)
      return "⚠️ Low cash position"

    return "✅ Day is balanced"
  }, [sales, variance, netProfit, totalPosition])

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

        <input style={input} placeholder="Sales" type="number"
          value={sales} onChange={e => setSales(Number(e.target.value))}
        />

        <input style={input} placeholder="Cost"
          type="number" value={cost}
          onChange={e => setCost(Number(e.target.value))}
        />

        <input style={input} placeholder="Rent"
          type="number" value={rent}
          onChange={e => setRent(Number(e.target.value))}
        />

        <input style={input} placeholder="Payroll"
          type="number" value={payroll}
          onChange={e => setPayroll(Number(e.target.value))}
        />

        <input style={input} placeholder="Utilities"
          type="number" value={utilities}
          onChange={e => setUtilities(Number(e.target.value))}
        />

        <input style={input} placeholder="Other Expenses"
          type="number" value={otherExpenses}
          onChange={e => setOtherExpenses(Number(e.target.value))}
        />
      </div>

      {/* CASH */}
      <div style={box}>
        <h3>Cash Position</h3>

        <input style={input} placeholder="Cash"
          type="number" value={cash}
          onChange={e => setCash(Number(e.target.value))}
        />

        <input style={input} placeholder="Bank"
          type="number" value={bank}
          onChange={e => setBank(Number(e.target.value))}
        />

        <p>Total Position: ${totalPosition}</p>
      </div>

      {/* DAILY OPERATIONS */}
      <div style={box}>
        <h3>Daily Operations</h3>

        <input style={input} placeholder="Opening Cash"
          type="number" value={openingCash}
          onChange={e => setOpeningCash(Number(e.target.value))}
        />

        <input style={input} placeholder="Cash Sales"
          type="number" value={cashSales}
          onChange={e => setCashSales(Number(e.target.value))}
        />

        <input style={input} placeholder="Card Sales"
          type="number" value={cardSales}
          onChange={e => setCardSales(Number(e.target.value))}
        />

        <input style={input} placeholder="Payouts"
          type="number" value={payouts}
          onChange={e => setPayouts(Number(e.target.value))}
        />

        <input style={input} placeholder="Deposits"
          type="number" value={deposits}
          onChange={e => setDeposits(Number(e.target.value))}
        />

        <input style={input} placeholder="Actual Cash Count"
          type="number" value={actualCash}
          onChange={e => setActualCash(Number(e.target.value))}
        />

        <p>Expected Cash: ${expectedCash}</p>

        <p style={{ color: variance === 0 ? "green" : "red" }}>
          Variance: ${variance}
        </p>

        <input style={input}
          placeholder="Manager Note"
          value={note}
          onChange={e => setNote(e.target.value)}
        />
      </div>

      {/* AI */}
      <div style={box}>
        <h3>AI Insight</h3>
        <p>{ai}</p>
      </div>

    </main>
  )
}