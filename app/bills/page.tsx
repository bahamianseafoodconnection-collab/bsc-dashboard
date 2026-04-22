"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type Bill = {
  id: string
  name: string
  amount: number
}

export default function BillsPage() {
  const supabase = createClientInstance()

  const [bills, setBills] = useState<Bill[]>([])
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")

  useEffect(() => {
    loadBills()
  }, [])

  async function loadBills() {
    const { data } = await supabase.from("bills").select("*")
    setBills(data || [])
  }

  async function addBill() {
    if (!name || !amount) return

    const billAmount = Number(amount)

    // 1. Insert bill
    const { error: billError } = await supabase.from("bills").insert({
      name,
      amount: billAmount,
    })

    if (billError) {
      console.error(billError)
      return
    }

    // 2. 🔥 AUTO INSERT INTO CASH (OUTFLOW)
    const { error: cashError } = await supabase.from("cash").insert({
      amount: billAmount,
      type: "out",
      note: name,
    })

    if (cashError) {
      console.error(cashError)
    }

    setName("")
    setAmount("")
    loadBills()
  }

  return (
    <>
      <h2 className="page-title">Bills</h2>

      <div className="summary-card">
        <h2>Add Bill</h2>

        <input
          placeholder="Bill name"
          value={name}
          onChange={(e) => setName(e.target.value)}
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
        <h2>Bills List</h2>

        {bills.map((bill) => (
          <div key={bill.id} className="metric">
            <span>{bill.name}</span>
            <span>${bill.amount}</span>
          </div>
        ))}
      </div>
    </>
  )
}