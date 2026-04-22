"use client"

import { useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

export default function POSPage() {
  const supabase = createClientInstance()

  const [item, setItem] = useState("")
  const [amount, setAmount] = useState("")
  const [status, setStatus] = useState("Ready")

  async function handleSale() {
    if (!item || !amount) {
      setStatus("Enter item + amount")
      return
    }

    const { error } = await supabase.from("cash").insert([
      {
        amount: Number(amount),
        type: "in",
        note: item,
      },
    ])

    if (error) {
      setStatus("Error saving sale")
    } else {
      setStatus("Sale recorded")
      setItem("")
      setAmount("")
    }
  }

  return (
    <>
      <h2 className="page-title">POS</h2>

      <div className="summary-card">
        <h2>New Sale</h2>

        <input
          placeholder="Item"
          value={item}
          onChange={(e) => setItem(e.target.value)}
        />

        <input
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <button onClick={handleSale}>Record Sale</button>
      </div>

      <div className="summary-card">
        <h2>Status</h2>

        <div className="metric">
          <span>POS</span>
          <span>{status}</span>
        </div>
      </div>
    </>
  )
}