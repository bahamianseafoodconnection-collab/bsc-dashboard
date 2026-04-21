"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { createClient } from "../lib/supabase/browser"

type Bill = {
  id: number
  bill_type: string
  amount: number
  created_at?: string
}

type DailyReport = {
  id: number
  report_date: string
  cash_in: number
  cash_out: number
  net_cash: number
}

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function isToday(dateValue?: string) {
  if (!dateValue) return false
  return dateValue.slice(0, 10) === todayString()
}

export default function DashboardPage() {
  const supabase = createClient()

  const [bills, setBills] = useState<Bill[]>([])
  const [dailyReport, setDailyReport] = useState<DailyReport | null>(null)
  const [status, setStatus] = useState("Loading")

  useEffect(() => {
    const load = async () => {
      const [billsResult, dailyReportResult] = await Promise.all([
        supabase.from("bills").select("*").order("id", { ascending: false }),
        supabase
          .from("daily_reports")
          .select("*")
          .eq("report_date", todayString())
          .order("id", { ascending: false })
          .limit(1),
      ])

      if (!billsResult.error) {
        setBills((billsResult.data as Bill[]) || [])
      }

      if (!dailyReportResult.error) {
        setDailyReport((dailyReportResult.data?.[0] as DailyReport) || null)
      }

      setStatus("Loaded")
    }

    load()
  }, [supabase])

  const todaysBills = useMemo(
    () => bills.filter((bill) => isToday(bill.created_at)),
    [bills]
  )

  const totalBills = useMemo(
    () => todaysBills.reduce((sum, bill) => sum + Number(bill.amount), 0),
    [todaysBills]
  )

  return (
    <>
      <h2 className="page-title">Dashboard</h2>

      <div className="summary-card">
        <h2>Today’s Summary</h2>

        <div className="metric">
          <span>Bills Collected</span>
          <span>${totalBills}</span>
        </div>

        <div className="metric">
          <span>Bill Count</span>
          <span>{todaysBills.length}</span>
        </div>

        <div className="metric">
          <span>Cash In</span>
          <span>${dailyReport?.cash_in ?? 0}</span>
        </div>

        <div className="metric">
          <span>Cash Out</span>
          <span>${dailyReport?.cash_out ?? 0}</span>
        </div>

        <div className="metric">
          <strong>Net Cash</strong>
          <strong>${dailyReport?.net_cash ?? 0}</strong>
        </div>
      </div>

      <div className="summary-card">
        <h2>Quick Actions</h2>

        <div className="quick-actions">
          <Link href="/bills" className="action-btn">
            Bills
          </Link>

          <Link href="/inventory" className="action-btn">
            Inventory
          </Link>

          <Link href="/cash" className="action-btn">
            Cash
          </Link>
        </div>
      </div>

      <div className="summary-card">
        <h2>System Status</h2>
        <div className="metric">
          <span>App Status</span>
          <span>{status}</span>
        </div>
      </div>
    </>
  )
}