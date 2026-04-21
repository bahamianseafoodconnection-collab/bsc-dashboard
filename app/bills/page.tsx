"use client"

import { useMemo, useState } from "react"

type BillItem = {
  id: number
  type: string
  amount: number
  createdAt: string
}

const billOptions = [
  "Light",
  "Water",
  "Internet",
  "Phone",
  "Gas",
  "Rent",
  "Other"
]

export default function BillsPage() {
  const [billType, setBillType] = useState("Light")
  const [amount, setAmount] = useState("")
  const [bills, setBills] = useState<BillItem[]>([])
  const [status, setStatus] = useState("Ready")

  function addBill() {
    const parsedAmount = Number(amount)

    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setStatus("Enter a valid bill amount")
      return
    }

    const newBill: BillItem = {
      id: Date.now(),
      type: billType,
      amount: parsedAmount,
      createdAt: new Date().toLocaleString()
    }

    setBills((current) => [newBill, ...current])
    setAmount("")
    setStatus(`${billType} bill added`)
  }

  const totalBills = useMemo(() => {
    return bills.reduce((sum, bill) => sum + bill.amount, 0)
  }, [bills])

  return (
    <>
      <h2 className="page-title">Bills</h2>

      <div className="summary-card">
        <h2>Add Bill Payment</h2>

        <div className="form-stack">
          <label className="form-label">Bill Type</label>
          <select
            className="form-input"
            value={billType}
            onChange={(e) => setBillType(e.target.value)}
          >
            {billOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <label className="form-label">Amount</label>
          <input
            className="form-input"
            type="number"
            inputMode="decimal"
            placeholder="Enter amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

          <button className="primary-btn" onClick={addBill}>
            Save Bill Payment
          </button>
        </div>
      </div>

      <div className="summary-card">
        <h2>Bill Summary</h2>

        <div className="metric">
          <span>Total Bills Collected</span>
          <strong>${totalBills.toFixed(2)}</strong>
        </div>

        <div className="metric">
          <span>Total Bill Entries</span>
          <strong>{bills.length}</strong>
        </div>

        <div className="metric">
          <span>Status</span>
          <strong>{status}</strong>
        </div>
      </div>

      <div className="summary-card">
        <h2>Recent Bill Payments</h2>

        {bills.length === 0 ? (
          <p className="empty-text">No bill payments added yet.</p>
        ) : (
          <div className="list-stack">
            {bills.map((bill) => (
              <div key={bill.id} className="list-item">
                <div>
                  <strong>{bill.type}</strong>
                  <div className="list-subtext">{bill.createdAt}</div>
                </div>
                <strong>${bill.amount.toFixed(2)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}