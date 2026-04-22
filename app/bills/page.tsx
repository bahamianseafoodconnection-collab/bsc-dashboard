"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type BillRow = {
  id: string
  name: string
  amount: number
}

export default function BillsPage() {
  const supabase = createClientInstance()

  const [bills, setBills] = useState<BillRow[]>([])
  const [billName, setBillName] = useState("")
  const [amount, setAmount] = useState("")
  const [status, setStatus] = useState("Loading...")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBills()
  }, [])

  async function loadBills() {
    const { data, error } = await supabase
      .from("bills")
      .select("id, name, amount")
      .order("id", { ascending: false })

    if (error) {
      console.error(error)
      setStatus("Error loading bills")
      setLoading(false)
      return
    }

    setBills((data as BillRow[]) || [])
    setStatus("Ready")
    setLoading(false)
  }

  async function addBill() {
    const cleanName = billName.trim()
    const billAmount = Number(amount)

    if (!cleanName || !billAmount) return

    setStatus("Saving...")

    const { error: billError } = await supabase.from("bills").insert({
      name: cleanName,
      amount: billAmount,
    })

    if (billError) {
      console.error(billError)
      setStatus("Error saving bill")
      return
    }

    const { error: cashError } = await supabase.from("cash").insert({
      amount: billAmount,
      type: "out",
      note: cleanName,
    })

    if (cashError) {
      console.error(cashError)
      setStatus("Bill saved, but cash entry failed")
      await loadBills()
      setBillName("")
      setAmount("")
      return
    }

    setBillName("")
    setAmount("")
    await loadBills()
    setStatus("Ready")
  }

  const totalBills = bills.length
  const totalAmount = bills.reduce((sum, bill) => sum + Number(bill.amount || 0), 0)

  return (
    <>
      <h2 className="page-title">Bills</h2>

      <div className="summary-card">
        <h2>Add Bill</h2>

        <input
          placeholder="Bill type"
          value={billName}
          onChange={(e) => setBillName(e.target.value)}
        />

        <input
          placeholder="Amount"
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <button onClick={addBill}>Add Bill</button>
      </div>

      <div className="summary-card">
        <h2>Bills Summary</h2>

        <div className="metric">
          <span>Total Bills</span>
          <span>{totalBills}</span>
        </div>

        <div className="metric">
          <span>Total Amount</span>
          <span>${totalAmount.toFixed(2)}</span>
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
              <span>{bill.name}</span>
              <span>${Number(bill.amount).toFixed(2)}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}