"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type SaleRow = {
  id: number
  item: string
  amount: number
  created_at: string
}

export default function POSPage() {
  const supabase = createClientInstance()

  const [item, setItem] = useState("")
  const [amount, setAmount] = useState("")
  const [sales, setSales] = useState<SaleRow[]>([])
  const [status, setStatus] = useState("Loading...")

  const loadSales = async () => {
    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      setStatus("Error loading sales")
    } else {
      setSales(data || [])
      setStatus("Ready")
    }
  }

  useEffect(() => {
    loadSales()
  }, [])

  const recordSale = async () => {
    if (!item || !amount) return

    const amt = parseFloat(amount)

    // 1. Save sale
    const { error: saleError } = await supabase.from("sales").insert({
      item,
      amount: amt,
    })

    // 2. Sync to CASH (THIS IS THE POWER)
    const { error: cashError } = await supabase.from("cash").insert({
      type: "in",
      amount: amt,
      note: `POS Sale: ${item}`,
    })

    if (saleError || cashError) {
      setStatus("Error saving sale")
    } else {
      setItem("")
      setAmount("")
      loadSales()
    }
  }

  const totalSales = sales.reduce((sum, s) => sum + s.amount, 0)

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

        <button onClick={recordSale}>Record Sale</button>
      </div>

      <div className="summary-card">
        <h2>POS Summary</h2>

        <div className="metric">
          <span>Register Status</span>
          <span>{status}</span>
        </div>

        <div className="metric">
          <span>Transactions Today</span>
          <span>{sales.length}</span>
        </div>

        <div className="metric">
          <span>Sales Today</span>
          <span>${totalSales.toFixed(2)}</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Recent POS Activity</h2>

        {sales.length === 0 ? (
          <p>No sales yet</p>
        ) : (
          sales.map((s) => (
            <div key={s.id} className="metric">
              <span>{s.item}</span>
              <span>${s.amount.toFixed(2)}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}