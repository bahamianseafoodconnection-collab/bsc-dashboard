"use client"

import { useState } from "react"

export default function BillsPage() {
  const [billType, setBillType] = useState("Light")
  const [amount, setAmount] = useState("")
  const [bills, setBills] = useState<any[]>([])
  const [status, setStatus] = useState("Ready")

  function addBill() {
    const value = Number(amount)

    if (!amount || isNaN(value) || value <= 0) {
      setStatus("Enter valid amount")
      return
    }

    const newBill = {
      id: Date.now(),
      type: billType,
      amount: value,
      date: new Date().toLocaleString()
    }

    setBills([newBill, ...bills])
    setAmount("")
    setStatus("Bill added")
  }

  const total = bills.reduce((sum, b) => sum + b.amount, 0)

  return (
    <>
      <h2 className="page-title">Bills</h2>

      <div className="summary-card">
        <h2>Add Bill</h2>

        <select
          className="form-input"
          value={billType}
          onChange={(e) => setBillType(e.target.value)}
        >
          <option>Light</option>
          <option>Water</option>
          <option>Internet</option>
          <option>Phone</option>
        </select>

        <input
          className="form-input"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <button className="action-btn" onClick={addBill}>
          Save Bill
        </button>

        <p>{status}</p>
      </div>

      <div className="summary-card">
        <h2>Summary</h2>

        <div className="metric">
          <span>Total</span>
          <strong>${total}</strong>
        </div>

        <div className="metric">
          <span>Count</span>
          <strong>{bills.length}</strong>
        </div>
      </div>

      <div className="summary-card">
        <h2>Recent</h2>

        {bills.map((b) => (
          <div key={b.id} className="metric">
            <span>{b.type}</span>
            <strong>${b.amount}</strong>
          </div>
        ))}
      </div>
    </>
  )
}