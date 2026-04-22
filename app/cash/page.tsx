"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type CashRow = {
  id: string
  amount: number
  type: string | null
  note: string | null
  created_at: string | null
}

export default function CashPage() {
  const supabase = createClientInstance()

  const [items, setItems] = useState<CashRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState("Loading...")

  const [cashIn, setCashIn] = useState(0)
  const [cashOut, setCashOut] = useState(0)

  useEffect(() => {
    async function loadCash() {
      const { data, error } = await supabase
        .from("cash")
        .select("id, amount, type, note, created_at")
        .order("created_at", { ascending: false })

      if (error) {
        console.error(error)
        setStatus("Error loading cash")
        setLoading(false)
        return
      }

      const rows = (data ?? []) as CashRow[]
      setItems(rows)

      let totalIn = 0
      let totalOut = 0

      rows.forEach((item) => {
        if (item.type === "in") totalIn += item.amount
        if (item.type === "out") totalOut += item.amount
      })

      setCashIn(totalIn)
      setCashOut(totalOut)

      setStatus("Ready")
      setLoading(false)
    }

    loadCash()
  }, [supabase])

  function money(val: number) {
    return `$${val.toFixed(2)}`
  }

  return (
    <>
      <h2 className="page-title">Cash</h2>

      {/* SUMMARY */}
      <div className="summary-card">
        <h2>Cash Summary</h2>

        <div className="metric">
          <span>Cash In</span>
          <span>{money(cashIn)}</span>
        </div>

        <div className="metric">
          <span>Cash Out</span>
          <span>{money(cashOut)}</span>
        </div>

        <div className="metric">
          <span>Net Cash</span>
          <span style={{ fontWeight: 700 }}>
            {money(cashIn - cashOut)}
          </span>
        </div>
      </div>

      {/* LIST */}
      <div className="summary-card">
        <h2>Transactions</h2>

        {loading ? (
          <p>Loading...</p>
        ) : items.length === 0 ? (
          <p>No transactions</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="metric">
              <span>
                {item.type === "in" ? "Cash In" : "Cash Out"} -{" "}
                {item.note ?? "No note"}
              </span>

              <span
                style={{
                  color: item.type === "out" ? "red" : "green",
                }}
              >
                {money(item.amount)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* STATUS */}
      <div className="summary-card">
        <h2>System Status</h2>

        <div className="metric">
          <span>Status</span>
          <span>{status}</span>
        </div>
      </div>
    </>
  )
}