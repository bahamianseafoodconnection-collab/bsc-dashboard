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
  const [items, setItems] = useState<CashRow[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState("Loading...")

  useEffect(() => {
    const supabase = createClientInstance()

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
      setStatus("Ready")
      setLoading(false)
    }

    loadCash()
  }, [])

  function money(value: number) {
    return `$${Number(value || 0).toFixed(2)}`
  }

  const totalCashIn = items
    .filter((item) => item.type === "in")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const totalCashOut = items
    .filter((item) => item.type === "out")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)

  const netCash = totalCashIn - totalCashOut

  return (
    <>
      <h2 className="page-title">Cash</h2>

      <div className="summary-card">
        <h2>Cash Summary</h2>

        <div className="metric">
          <span>Cash In</span>
          <span>{money(totalCashIn)}</span>
        </div>

        <div className="metric">
          <span>Cash Out</span>
          <span>{money(totalCashOut)}</span>
        </div>

        <div className="metric">
          <span>Net Cash</span>
          <span style={{ color: netCash < 0 ? "red" : "green" }}>
            {money(netCash)}
          </span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Cash Transactions</h2>

        {loading ? (
          <p>Loading cash...</p>
        ) : items.length === 0 ? (
          <p>No cash transactions found</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="metric" style={{ display: "block" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontWeight: 700,
                }}
              >
                <span>{item.note || (item.type === "in" ? "Cash In" : "Cash Out")}</span>
                <span style={{ color: item.type === "out" ? "red" : "green" }}>
                  {item.type === "out" ? "-" : "+"}
                  {money(Number(item.amount || 0))}
                </span>
              </div>

              <div style={{ fontSize: 14, color: "#64748b", marginTop: 6 }}>
                Type: {item.type || "unknown"}
                <br />
                Date: {item.created_at ? new Date(item.created_at).toLocaleString() : "N/A"}
              </div>
            </div>
          ))
        )}
      </div>

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