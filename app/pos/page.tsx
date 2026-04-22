"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

export default function POSPage() {
  const supabase = createClientInstance()

  const [item, setItem] = useState("")
  const [amount, setAmount] = useState("")
  const [status, setStatus] = useState("Ready")
  const [salesToday, setSalesToday] = useState(0)
  const [transactions, setTransactions] = useState(0)
  const [recent, setRecent] = useState<any[]>([])

  function normalize(text: string) {
    return text.toLowerCase().replace(/\s/g, "")
  }

  async function recordSale() {
    if (!item || !amount) return

    setStatus("Saving...")

    // SAVE SALE
    const { error: saleError } = await supabase.from("sales").insert({
      item,
      amount: Number(amount),
    })

    if (saleError) {
      console.error(saleError)
      setStatus("Error saving sale")
      return
    }

    // 🚨 FIX: GET INVENTORY DIRECTLY (NO RELATION)
    const { data: invData } = await supabase
      .from("inventory")
      .select("*")

    const match = (invData || []).find((row: any) => {
      if (!row.name) return false
      return normalize(row.name) === normalize(item)
    })

    // UPDATE INVENTORY
    if (match) {
      await supabase
        .from("inventory")
        .update({
          quantity: Number(match.quantity || 0) - 1,
        })
        .eq("id", match.id)
    } else {
      console.warn("NO MATCH FOUND:", item)
    }

    setItem("")
    setAmount("")

    loadData()
    setStatus("Sale recorded")
  }

  async function loadData() {
    const { data } = await supabase
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false })

    const sales = data || []

    setTransactions(sales.length)

    const total = sales.reduce(
      (sum: number, s: any) => sum + Number(s.amount || 0),
      0
    )

    setSalesToday(total)
    setRecent(sales.slice(0, 5))
  }

  useEffect(() => {
    loadData()
  }, [])

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
          <span>Status</span>
          <span>{status}</span>
        </div>

        <div className="metric">
          <span>Transactions Today</span>
          <span>{transactions}</span>
        </div>

        <div className="metric">
          <span>Sales Today</span>
          <span>${salesToday.toFixed(2)}</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Recent POS Activity</h2>

        {recent.length === 0 ? (
          <p>No sales yet</p>
        ) : (
          recent.map((r) => (
            <div key={r.id} className="metric">
              <span>{r.item}</span>
              <span>${Number(r.amount).toFixed(2)}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}