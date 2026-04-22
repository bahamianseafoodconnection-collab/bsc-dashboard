"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type BillRow = {
  id: number
  bill_type: string
  amount: number
  created_at: string | null
}

export default function BillsPage() {
  const [bills, setBills] = useState<BillRow[]>([])
  const [billType, setBillType] = useState("")
  const [amount, setAmount] = useState("")
  const [status, setStatus] = useState("Loading...")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClientInstance()

    async function loadBills() {
      const { data, error } = await supabase
        .from("bills")
        .select("id, bill_type, amount, created_at")
        .order("created_at", { ascending: false })

      if (error) {
        console.error(error)
        setStatus("Error loading bills")
        setBills([])
        setLoading(false)
        return
      }

      setBills((data ?? []) as BillRow[])
      setStatus("Ready")
      setLoading(false)
    }

    loadBills()
  }, [])

  async function handleAddBill() {
    if (!billType.trim() || !amount.trim()) {
      setStatus("Enter bill type and amount")
      return
    }

    const numericAmount = Number(amount)

    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      setStatus("Enter a valid amount")
      return
    }

    const supabase = createClientInstance()

    const { error } = await supabase.from("bills").insert([
      {
        bill_type: billType.trim(),
        amount: numericAmount,
      },
    ])

    if (error) {
      console.error(error)
      setStatus("Error saving bill")
      return
    }

    setBillType("")
    setAmount("")
    setStatus("Ready")

    const { data, error: reloadError } = await supabase
      .from("bills")
      .select("id, bill_type, amount, created_at")
      .order("created_at", { ascending: false })

    if (reloadError) {
      console.error(reloadError)
      setStatus("Error loading bills")
      return
    }

    setBills((data ?? []) as BillRow[])
  }

  const totalBills = bills.length
  const totalAmount = bills.reduce((sum, bill) => sum + Number(bill.amount ?? 0), 0)

  function money(value: number) {
    return `$${value.toFixed(2)}`
  }

  return (
    <>
      <h2 className="page-title">Bills</h2>

      <div className="summary-card">
        <h2>Add Bill</h2>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Bill type"
            value={billType}
            onChange={(e) => setBillType(e.target.value)}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 12,
              border: "1px solid #cbd5e1",
            }}
          />

          <input
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 12,
              border: "1px solid #cbd5e1",
            }}
          />
        </div>

        <button
          onClick={handleAddBill}
          style={{
            background: "#1d4ed8",
            color: "white",
            border: "none",
            borderRadius: 12,
            padding: "12px 18px",
            fontWeight: 700,
          }}
        >
          Add Bill
        </button>
      </div>

      <div className="summary-card">
        <h2>Bills Summary</h2>

        <div className="metric">
          <span>Total Bills</span>
          <span>{totalBills}</span>
        </div>

        <div className="metric">
          <span>Total Amount</span>
          <span>{money(totalAmount)}</span>
        </div>

        <div className="metric">
          <span>Status</span>
          <span>{status}</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Recent Bills</h2>

        {loading ? (
          <p>Loading...</p>
        ) : bills.length === 0 ? (
          <p>No bills yet</p>
        ) : (
          bills.map((bill) => (
            <div key={bill.id} className="metric">
              <span>{bill.bill_type}</span>
              <span>{money(Number(bill.amount ?? 0))}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}