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

type BillRow = {
  id: number
  bill_type: string
  amount: number
  created_at: string | null
}

type FeedItem = {
  id: string
  label: string
  amount: number
  kind: "in" | "out"
  created_at: string | null
}

export default function CashPage() {
  const [cashRows, setCashRows] = useState<CashRow[]>([])
  const [billRows, setBillRows] = useState<BillRow[]>([])
  const [status, setStatus] = useState("Loading...")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClientInstance()

    async function load() {
      const [cashRes, billRes] = await Promise.all([
        supabase.from("cash").select("*"),
        supabase.from("bills").select("*"),
      ])

      if (cashRes.error) console.error(cashRes.error)
      if (billRes.error) console.error(billRes.error)

      setCashRows(cashRes.data ?? [])
      setBillRows(billRes.data ?? [])

      setStatus(
        cashRes.error || billRes.error ? "Partial error" : "Ready"
      )

      setLoading(false)
    }

    load()
  }, [])

  // 🔢 CALCULATIONS
  const totalCashIn = cashRows
    .filter((x) => x.type === "in")
    .reduce((sum, x) => sum + Number(x.amount), 0)

  const totalCashOutManual = cashRows
    .filter((x) => x.type === "out")
    .reduce((sum, x) => sum + Number(x.amount), 0)

  const totalBillsOut = billRows.reduce(
    (sum, x) => sum + Number(x.amount),
    0
  )

  const totalCashOut = totalCashOutManual + totalBillsOut
  const netCash = totalCashIn - totalCashOut

  // ✅ FIXED FEED (TYPE SAFE)
  const feed: FeedItem[] = [
    ...cashRows.map((x): FeedItem => ({
      id: "cash-" + x.id,
      label: x.note || (x.type === "in" ? "Cash In" : "Cash Out"),
      amount: Number(x.amount),
      kind: x.type === "in" ? "in" : "out",
      created_at: x.created_at,
    })),
    ...billRows.map((x): FeedItem => ({
      id: "bill-" + x.id,
      label: "Bill: " + x.bill_type,
      amount: Number(x.amount),
      kind: "out", // 👈 forced correct type
      created_at: x.created_at,
    })),
  ]

  function money(v: number) {
    return `$${v.toFixed(2)}`
  }

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
          <span>{money(netCash)}</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Recent Activity</h2>

        {loading ? (
          <p>Loading...</p>
        ) : feed.length === 0 ? (
          <p>No transactions</p>
        ) : (
          feed.map((item) => (
            <div key={item.id} className="metric">
              <span>{item.label}</span>
              <span
                style={{
                  color: item.kind === "out" ? "red" : "green",
                }}
              >
                {item.kind === "out" ? "-" : "+"}
                {money(item.amount)}
              </span>
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