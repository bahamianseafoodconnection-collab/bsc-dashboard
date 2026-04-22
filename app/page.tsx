"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClientInstance } from "../lib/supabase/browser"

type BillRow = {
  id: number
  bill_type: string
  amount: number
  created_at: string | null
}

type CashRow = {
  id: string
  amount: number
  type: string | null
  note: string | null
  created_at: string | null
}

export default function DashboardPage() {
  const [billRows, setBillRows] = useState<BillRow[]>([])
  const [cashRows, setCashRows] = useState<CashRow[]>([])
  const [status, setStatus] = useState("Loading...")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClientInstance()

    async function loadDashboard() {
      const [billsRes, cashRes] = await Promise.all([
        supabase
          .from("bills")
          .select("id, bill_type, amount, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("cash")
          .select("id, amount, type, note, created_at")
          .order("created_at", { ascending: false }),
      ])

      if (billsRes.error) console.error("Bills load error:", billsRes.error)
      if (cashRes.error) console.error("Cash load error:", cashRes.error)

      setBillRows(billsRes.data ?? [])
      setCashRows(cashRes.data ?? [])

      if (billsRes.error || cashRes.error) {
        setStatus("Partial error")
      } else {
        setStatus("Ready")
      }

      setLoading(false)
    }

    loadDashboard()
  }, [])

  const billsCollected = 0
  const billCount = billRows.length

  const cashIn = cashRows
    .filter((row) => row.type === "in")
    .reduce((sum, row) => sum + Number(row.amount), 0)

  const manualCashOut = cashRows
    .filter((row) => row.type === "out")
    .reduce((sum, row) => sum + Number(row.amount), 0)

  const billsCashOut = billRows.reduce(
    (sum, row) => sum + Number(row.amount),
    0
  )

  const cashOut = manualCashOut + billsCashOut
  const netCash = cashIn - cashOut

  function money(value: number) {
    return `$${value.toFixed(2)}`
  }

  return (
    <>
      <h2 className="page-title">BSC Dashboard</h2>

      <div className="summary-card">
        <h2>Today&apos;s Summary</h2>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <>
            <div className="metric">
              <span>Bills Collected</span>
              <span>{money(billsCollected)}</span>
            </div>

            <div className="metric">
              <span>Bill Count</span>
              <span>{billCount}</span>
            </div>

            <div className="metric">
              <span>Cash In</span>
              <span>{money(cashIn)}</span>
            </div>

            <div className="metric">
              <span>Cash Out</span>
              <span>{money(cashOut)}</span>
            </div>

            <div className="metric">
              <span style={{ fontWeight: 700 }}>Net Cash</span>
              <span style={{ fontWeight: 700 }}>{money(netCash)}</span>
            </div>
          </>
        )}
      </div>

      <div className="summary-card">
        <h2>Control Center</h2>

        <div
          style={{
            display: "grid",
            gap: "12px",
          }}
        >
          <Link href="/bills" className="nav-button">
            💡 Bills
          </Link>

          <Link href="/inventory" className="nav-button">
            📦 Inventory
          </Link>

          <Link href="/cash" className="nav-button">
            💵 Cash
          </Link>
        </div>
      </div>

      <div className="summary-card">
        <h2>System Status</h2>

        <div className="metric">
          <span>Status</span>
          <span>{status}</span>
        </div>

        <div className="metric">
          <span>Database</span>
          <span>{loading ? "Loading..." : "Connected"}</span>
        </div>

        <div className="metric">
          <span>Bills Sync</span>
          <span>{loading ? "Loading..." : "Active"}</span>
        </div>

        <div className="metric">
          <span>Cash Sync</span>
          <span>{loading ? "Loading..." : "Active"}</span>
        </div>
      </div>
    </>
  )
}