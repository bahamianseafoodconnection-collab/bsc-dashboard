"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type SaleRow = {
  id: string
  item: string | null
  amount: number | null
  created_at: string | null
}

export default function POSPage() {
  const [item, setItem] = useState("")
  const [amount, setAmount] = useState("")
  const [sales, setSales] = useState<SaleRow[]>([])
  const [status, setStatus] = useState("Loading...")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    loadSales()
  }, [])

  async function loadSales() {
    const supabase = createClientInstance()

    const { data, error } = await supabase
      .from("sales")
      .select("id, item, amount, created_at")
      .order("created_at", { ascending: false })

    if (error) {
      console.log("POS load error:", error)
      setStatus("Error loading sales")
      setSales([])
      return
    }

    setSales((data as SaleRow[]) || [])
    setStatus("Ready")
  }

  async function handleRecordSale() {
    if (!item.trim() || !amount.trim()) {
      setStatus("Enter item and amount")
      return
    }

    const numericAmount = Number(amount)

    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      setStatus("Enter valid amount")
      return
    }

    setIsSaving(true)

    const supabase = createClientInstance()

    const { error } = await supabase.from("sales").insert([
      {
        item: item.trim(),
        amount: numericAmount,
      },
    ])

    if (error) {
      console.log("POS save error:", error)
      setStatus("Error saving sale")
      setIsSaving(false)
      return
    }

    setItem("")
    setAmount("")
    setStatus("Sale recorded")
    setIsSaving(false)
    loadSales()
  }

  const transactionsToday = sales.length
  const salesToday = sales.reduce((sum, sale) => sum + Number(sale.amount || 0), 0)

  return (
    <>
      <h1 className="page-title">POS</h1>

      <div className="summary-card">
        <h2>New Sale</h2>

        <div
          style={{
            display: "grid",
            gap: "12px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <input
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="Item"
              style={{
                padding: "14px 16px",
                borderRadius: "14px",
                border: "1px solid #d1d5db",
                fontSize: "16px",
              }}
            />

            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              inputMode="decimal"
              style={{
                padding: "14px 16px",
                borderRadius: "14px",
                border: "1px solid #d1d5db",
                fontSize: "16px",
              }}
            />
          </div>

          <button
            onClick={handleRecordSale}
            disabled={isSaving}
            style={{
              width: "fit-content",
              background: "#2563eb",
              color: "white",
              border: "none",
              borderRadius: "14px",
              padding: "14px 22px",
              fontSize: "16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {isSaving ? "Saving..." : "Record Sale"}
          </button>
        </div>
      </div>

      <div className="summary-card">
        <h2>POS Summary</h2>

        <div className="metric">
          <span>Status</span>
          <span>{status}</span>
        </div>

        <div className="metric">
          <span>Transactions Today</span>
          <span>{transactionsToday}</span>
        </div>

        <div className="metric">
          <span>Sales Today</span>
          <span>${salesToday.toFixed(2)}</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Recent POS Activity</h2>

        {sales.length === 0 ? (
          <p>No sales yet</p>
        ) : (
          sales.slice(0, 5).map((sale) => (
            <div key={sale.id} className="metric">
              <span>{sale.item || "Unnamed sale"}</span>
              <span>${Number(sale.amount || 0).toFixed(2)}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}