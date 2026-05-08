"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

// Skip prerendering. Cash dashboard is per-user, runtime only.
export const dynamic = 'force-dynamic'

type BillRow = {
  id: number
  bill_type: string
  amount: number
  created_at: string
}

type SaleRow = {
  id: number
  item: string
  amount: number
  created_at: string
}

type FeedItem = {
  id: string
  label: string
  amount: number
  kind: "in" | "out"
  created_at: string
}

export default function CashPage() {
  const [cashIn, setCashIn] = useState(0)
  const [cashOut, setCashOut] = useState(0)
  const [status, setStatus] = useState("Loading")
  const [feed, setFeed] = useState<FeedItem[]>([])

  useEffect(() => {
    async function loadCashData() {
      try {
        const supabase = createClientInstance()

        const { data: salesData, error: salesError } = await supabase
          .from("sales")
          .select("id, item, amount, created_at")
          .order("created_at", { ascending: false })

        const { data: billsData, error: billsError } = await supabase
          .from("bills")
          .select("id, bill_type, amount, created_at")
          .order("created_at", { ascending: false })

        if (salesError || billsError) {
          console.error("Sales error:", salesError)
          console.error("Bills error:", billsError)
          setStatus("Error loading cash")
          return
        }

        const sales: SaleRow[] = salesData || []
        const bills: BillRow[] = billsData || []

        const totalIn = sales.reduce((sum, row) => sum + Number(row.amount || 0), 0)
        const totalOut = bills.reduce((sum, row) => sum + Number(row.amount || 0), 0)

        setCashIn(totalIn)
        setCashOut(totalOut)

        const salesFeed: FeedItem[] = sales.map((row) => ({
          id: `sale-${row.id}`,
          label: `Sale: ${row.item}`,
          amount: Number(row.amount || 0),
          kind: "in",
          created_at: row.created_at,
        }))

        const billsFeed: FeedItem[] = bills.map((row) => ({
          id: `bill-${row.id}`,
          label: `Bill: ${row.bill_type}`,
          amount: Number(row.amount || 0),
          kind: "out",
          created_at: row.created_at,
        }))

        const combinedFeed = [...salesFeed, ...billsFeed].sort((a, b) => {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })

        setFeed(combinedFeed)
        setStatus("Ready")
      } catch (e) {
        const msg = e instanceof Error ? e.message : "init failed"
        setStatus("Error: " + msg)
      }
    }

    loadCashData()
  }, [])

  const netCash = cashIn - cashOut

  return (
    <>
      <h2 className="page-title">Cash</h2>

      <div className="summary-card">
        <h2>Cash Summary</h2>

        <div className="metric">
          <span>Cash In</span>
          <span>${cashIn.toFixed(2)}</span>
        </div>

        <div className="metric">
          <span>Cash Out</span>
          <span>${cashOut.toFixed(2)}</span>
        </div>

        <div className="metric">
          <span>Net Cash</span>
          <span>${netCash.toFixed(2)}</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Recent Activity</h2>

        {feed.length === 0 ? (
          <p>No cash activity yet</p>
        ) : (
          feed.slice(0, 10).map((entry) => (
            <div key={entry.id} className="metric">
              <span>{entry.label}</span>
              <span>
                {entry.kind === "in" ? "+" : "-"}${entry.amount.toFixed(2)}
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
          <span>POS Sync to Cash</span>
          <span>Active</span>
        </div>

        <div className="metric">
          <span>Bills Sync to Cash</span>
          <span>Active</span>
        </div>
      </div>
    </>
  )
}
