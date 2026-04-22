"use client"

import { useEffect, useMemo, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type Bill = {
  id: number
  bill_type: string
  amount: number
  created_at: string
}

export default function BillsPage() {
  const supabase = createClientInstance()

  const [billType, setBillType] = useState("")
  const [amount, setAmount] = useState("")
  const [bills, setBills] = useState<Bill[]>([])
  const [status, setStatus] = useState("Loading")

  async function loadBills() {
    const { data, error } = await supabase
      .from("bills")
      .select("*")
      .order("id", { ascending: false })

    if (error) {
      setStatus("Error loading bills")
      return
    }

    setBills((data as Bill[]) || [])
    setStatus("Ready")
  }

  useEffect(() => {
    loadBills()
  }, [])

  async function addBill() {
    const value = Number(amount)

    if (!billType.trim() || !amount || isNaN(value) || value <= 0) {
      setStatus("Enter valid bill type and amount")
      return
    }

    const { error } = await supabase.from("bills").insert([
      {
        bill_type: billType.trim(),
        amount: value,
      },
    ])

    if (error) {
      setStatus("Error adding bill")
      return
    }

    setBillType("")
    setAmount("")
    setStatus("Bill added")
    loadBills()
  }

  const total = useMemo(() => {
    return bills.reduce((sum, bill) => sum + Number(bill.amount), 0)
  }, [bills])

  return (
    <>
      <h2 className="page-title">Bills</h2>

      <div className="summary-card">
        <h2>Add Bill</h2>

        <div style={{ display: "grid", gap: "12px" }}>
          <input
            value={billType}
            onChange={(e) => setBillType(e.target.value)}
            placeholder="Bill type"
            style={{
              padding: "12px",
              borderRadius: "12px",
              border: "1px solid #dbe3ea",
              fontSize: "16px",
            }}
          />

          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            inputMode="decimal"
            style={{
              padding: "12px",
              borderRadius: "12px",
              border: "1px solid #dbe3ea",
              fontSize: "16px",
            }}
          />

          <button
            onClick={addBill}
            style={{
              padding: "12px",
              borderRadius: "12px",
              border: "none",
              background: "#1d9bf0",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: 700,
            }}
          >
            Add Bill
          </button>
        </div>
      </div>

      <div className="summary-card">
        <h2>Bills Summary</h2>

        <div className="metric">
          <span>Total Bills</span>
          <span>{bills.length}</span>
        </div>

        <div className="metric">
          <span>Total Amount</span>
          <span>${total}</span>
        </div>

        <div className="metric">
          <span>Status</span>
          <span>{status}</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Recent Bills</h2>

        {bills.length === 0 ? (
          <p style={{ margin: 0 }}>No bills added yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {bills.slice(0, 10).map((bill) => (
              <div
                key={bill.id}
                className="metric"
              >
                <span>{bill.bill_type}</span>
                <span>${bill.amount}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}