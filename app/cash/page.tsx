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

type CashFeedItem = {
  id: string
  label: string
  amount: number
  kind: "in" | "out"
  source: "cash" | "bill"
  created_at: string | null
}

export default function CashPage() {
  const [cashRows, setCashRows] = useState<CashRow[]>([])
  const [billRows, setBillRows] = useState<BillRow[]>([])
  const [status, setStatus] = useState("Loading...")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClientInstance()

    async function loadCashPage() {
      const [cashResult, billsResult] = await Promise.all([
        supabase
          .from("cash")
          .select("id, amount, type, note, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("bills")
          .select("id, bill_type, amount, created_at")
          .order("created_at", { ascending: false }),
      ])

      if (cashResult.error) {
        console.error("Cash load error:", cashResult.error)
      }

      if (billsResult.error) {
        console.error("Bills load error:", billsResult.error)
      }

      setCashRows((cashResult.data ?? []) as CashRow[])
      setBillRows((billsResult.data ?? []) as BillRow[])

      if (cashResult.error && billsResult.error) {
        setStatus("Error loading cash")
      } else if (cashResult.error) {
        setStatus("Cash table error")
      } else if (billsResult.error) {
        setStatus("Bills linked to cash failed")
      } else {
        setStatus("Ready")
      }

      setLoading(false)
    }

    loadCashPage()
  }, [])

  const manualCashIn = cashRows
    .filter((row) => (row.type ?? "").toLowerCase() === "in")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)

  const manualCashOut = cashRows
    .filter((row) => (row.type ?? "").toLowerCase() === "out")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0)

  const billsCashOut = billRows.reduce(
    (sum, row) => sum + Number(row.amount ?? 0),
    0
  )

  const totalCashIn = manualCashIn
  const totalCashOut = manualCashOut + billsCashOut
  const netCash = totalCashIn - totalCashOut

  const feed: CashFeedItem[] = [
    ...cashRows.map((row) => ({
      id: `cash-${row.id}`,
      label:
        row.note?.trim() ||
        ((row.type ?? "").toLowerCase() === "in" ? "Cash In" : "Cash Out"),
      amount: Number(row.amount ?? 0),
      kind: ((row.type ?? "").toLowerCase() === "in" ? "in" : "out") as
        | "in"
        | "out",
      source: "cash" as const,
      created_at: row.created_at,
    })),
    ...billRows.map((row) => ({
      id: `bill-${row.id}`,
      label: `Bill: ${row.bill_type}`,
      amount: Number(row.amount ?? 0),
      kind: "out" as const,
      source: "bill" as const,
      created_at: row.created_at,
    })),
  ].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return bTime - aTime
  })

  function money(value: number) {
    return `$${value.toFixed(2)}`
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
          <span style={{ fontWeight: 700 }}>Net Cash</span>
          <span style={{ fontWeight: 700 }}>{money(netCash)}</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Recent Cash Activity</h2>

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
                  color: item.kind === "out" ? "#dc2626" : "#16a34a",
                  fontWeight: 600,
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

        <div className="metric">
          <span>Bill Sync to Cash</span>
          <span>Active</span>
        </div>
      </div>
    </>
  )
}