"use client"

import { useState, useEffect, useMemo } from "react"

type ObligationItem = {
  id: string
  name: string
  category: "supplier" | "rent" | "utility" | "payroll" | "other"
  amount: number
  dueDate: string
  status: "pending" | "paid"
  priority: "high" | "medium" | "low"
}

type HistoryItem = {
  date: string
  sales: number
  grossProfit: number
  expenses: number
  netProfit: number
  totalPosition: number
}

export default function Page() {

  // CORE INPUTS
  const [sales, setSales] = useState(0)
  const [cost, setCost] = useState(0)
  const [rent, setRent] = useState(0)
  const [payroll, setPayroll] = useState(0)
  const [utilities, setUtilities] = useState(0)
  const [otherExpenses, setOtherExpenses] = useState(0)
  const [cash, setCash] = useState(0)
  const [bank, setBank] = useState(0)

  // OBLIGATIONS
  const [obligations, setObligations] = useState<ObligationItem[]>([])
  const [name, setName] = useState("")
  const [category, setCategory] = useState<ObligationItem["category"]>("supplier")
  const [amount, setAmount] = useState(0)
  const [dueDate, setDueDate] = useState("")
  const [priority, setPriority] = useState<ObligationItem["priority"]>("medium")

  // HISTORY
  const [history, setHistory] = useState<HistoryItem[]>([])

  // CALCULATIONS
  const grossProfit = sales - cost
  const expenses = rent + payroll + utilities + otherExpenses
  const netProfit = grossProfit - expenses
  const totalPosition = cash + bank

  const pending = obligations.filter(o => o.status === "pending")
  const paid = obligations.filter(o => o.status === "paid")

  const totalPending = pending.reduce((sum, o) => sum + o.amount, 0)

  const today = new Date()
  const overdue = pending.filter(o => new Date(o.dueDate) < today)
  const dueSoon = pending.filter(o => {
    const diff = (new Date(o.dueDate).getTime() - today.getTime()) / (1000 * 3600 * 24)
    return diff <= 3 && diff >= 0
  })

  // LOCAL STORAGE
  useEffect(() => {
    const saved = localStorage.getItem("bsc-obligations")
    if (saved) setObligations(JSON.parse(saved))
  }, [])

  useEffect(() => {
    localStorage.setItem("bsc-obligations", JSON.stringify(obligations))
  }, [obligations])

  useEffect(() => {
    const saved = localStorage.getItem("bsc-history")
    if (saved) setHistory(JSON.parse(saved))
  }, [])

  useEffect(() => {
    localStorage.setItem("bsc-history", JSON.stringify(history))
  }, [history])

  // ACTIONS
  const addObligation = () => {
    if (!name || amount <= 0 || !dueDate) return

    setObligations([
      ...obligations,
      {
        id: Date.now().toString(),
        name,
        category,
        amount,
        dueDate,
        status: "pending",
        priority
      }
    ])

    setName("")
    setAmount(0)
    setDueDate("")
  }

  const markPaid = (id: string) => {
    setObligations(obligations.map(o =>
      o.id === id ? { ...o, status: "paid" } : o
    ))
  }

  const deleteItem = (id: string) => {
    setObligations(obligations.filter(o => o.id !== id))
  }

  const saveDay = () => {
    setHistory([
      {
        date: new Date().toLocaleDateString(),
        sales,
        grossProfit,
        expenses,
        netProfit,
        totalPosition
      },
      ...history
    ])
  }

  // AI
  const ai = useMemo(() => {
    if (sales === 0) return "⚠️ No sales yet"
    if (netProfit < 0) return "⚠️ Losing money"
    if (overdue.length > 0) return "🚨 Overdue bills"
    if (totalPending > totalPosition) return "🚨 Not enough cash for bills"
    if (dueSoon.length > 0) return "⚠️ Bills due soon"
    return "✅ Stable"
  }, [sales, netProfit, overdue, totalPending, totalPosition, dueSoon])

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

      <div style={box}>
        <p>Sales: ${sales}</p>
        <p>Gross Profit: ${grossProfit}</p>
        <p>Expenses: ${expenses}</p>
        <p style={{ color: netProfit >= 0 ? "green" : "red" }}>
          Net Profit: ${netProfit}
        </p>
      </div>

      <div style={box}>
        <h3>Inputs</h3>

        <input placeholder="Sales" type="number" style={input} value={sales} onChange={e => setSales(Number(e.target.value))} />
        <input placeholder="Cost" type="number" style={input} value={cost} onChange={e => setCost(Number(e.target.value))} />
        <input placeholder="Rent" type="number" style={input} value={rent} onChange={e => setRent(Number(e.target.value))} />
        <input placeholder="Payroll" type="number" style={input} value={payroll} onChange={e => setPayroll(Number(e.target.value))} />
        <input placeholder="Utilities" type="number" style={input} value={utilities} onChange={e => setUtilities(Number(e.target.value))} />
        <input placeholder="Other" type="number" style={input} value={otherExpenses} onChange={e => setOtherExpenses(Number(e.target.value))} />
      </div>

      <div style={box}>
        <h3>Cash</h3>
        <input placeholder="Cash" type="number" style={input} value={cash} onChange={e => setCash(Number(e.target.value))} />
        <input placeholder="Bank" type="number" style={input} value={bank} onChange={e => setBank(Number(e.target.value))} />
        <p>Total: ${totalPosition}</p>
      </div>

      <div style={box}>
        <h3>Add Obligation</h3>

        <input placeholder="Name" style={input} value={name} onChange={e => setName(e.target.value)} />

        <select style={input} value={category} onChange={e => setCategory(e.target.value as any)}>
          <option value="supplier">Supplier</option>
          <option value="rent">Rent</option>
          <option value="utility">Utility</option>
          <option value="payroll">Payroll</option>
          <option value="other">Other</option>
        </select>

        <input placeholder="Amount" type="number" style={input} value={amount} onChange={e => setAmount(Number(e.target.value))} />

        <input type="date" style={input} value={dueDate} onChange={e => setDueDate(e.target.value)} />

        <button onClick={addObligation}>Add</button>
      </div>

      <div style={box}>
        <h3>Pending Obligations</h3>

        {pending.map(o => (
          <div key={o.id}>
            {o.name} - ${o.amount}
            <button onClick={() => markPaid(o.id)}>Paid</button>
            <button onClick={() => deleteItem(o.id)}>Delete</button>
          </div>
        ))}
      </div>

      <div style={box}>
        <h3>AI Insight</h3>
        <p>{ai}</p>
      </div>

      <button onClick={saveDay}>Save Day</button>

      <div style={box}>
        <h3>History</h3>
        {history.map((h, i) => (
          <div key={i}>
            {h.date} - ${h.netProfit}
          </div>
        ))}
      </div>

    </main>
  )
}