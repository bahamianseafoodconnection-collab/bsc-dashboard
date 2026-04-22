"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type CashRow = {
  id: string
  amount: number
  type: string
  note: string | null
  created_at: string | null
}

export default function POSPage() {
  const supabase = createClientInstance()

  const [item, setItem] = useState("")
  const [amount, setAmount] = useState("")
  const [status, setStatus] = useState("Ready")
  const [salesToday, setSalesToday] = useState(0)
  const [totalToday, setTotalToday] = useState(0)
  const [recentSales, setRecentSales] = useState<CashRow[]>([])

  useEffect(() => {
    loadPOS()
  }, [])

  async function loadPOS() {
    const today = new Date()
    const startOfDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    ).toISOString()

    const { data, error } = await supabase
      .from("cash")
      .select("id, amount, type, note, created_at")
      .eq("type", "in")
      .gte("created_at", startOfDay)
      .order("created_at", { ascending: false })

    if (error) {
      setStatus("Error loading POS")
      return
    }

    const rows = (data ?? []) as CashRow[]
    setRecentSales(rows)
    setSalesToday(rows.length)

    const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    setTotalToday(total)

    setStatus("Ready")
  }

  async function handleSale() {
    if (!item || !amount) {
      setStatus("Enter item + amount")
      return
    }

    const numericAmount = Number(amount)

    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      setStatus("Enter valid amount")
      return
    }

    const { error } = await supabase.from("cash").insert([
      {
        amount: numericAmount,
        type: "in",
        note: item,
      },
    ])

    if (error) {
      setStatus("Error saving sale")
      return
    }

    setItem("")
    setAmount("")
    setStatus("Sale recorded")
    await loadPOS()
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
        <h2>POS Summary</h2>

        <div className="metric">
          <span>Register Status</span>
          <span>{status}</span>
        </div>

        <div className="metric">
          <span>Transactions Today</span>
          <span>{salesToday}</span>
        </div>

        <div className="metric">
          <span>Sales Today</span>
          <span>${totalToday.toFixed(2)}</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Recent POS Activity</h2>

        {recentSales.length === 0 ? (
          <p>No sales yet</p>
        ) : (
          recentSales.slice(0, 5).map((sale) => (
            <div key={sale.id} className="metric">
              <span>{sale.note || "Sale"}</span>
              <span>${Number(sale.amount).toFixed(2)}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}