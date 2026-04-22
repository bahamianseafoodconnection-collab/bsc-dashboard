"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type SaleRow = {
  id: string
  item: string
  amount: number
  created_at: string
}

export default function POSPage() {
  const [item, setItem] = useState("")
  const [amount, setAmount] = useState("")
  const [sales, setSales] = useState<SaleRow[]>([])
  const [status, setStatus] = useState("Loading...")
  const [isSaving, setIsSaving] = useState(false)

  const loadSales = async () => {
    const supabase = createClientInstance()

    const { data, error } = await supabase
      .from("sales")
      .select("id, item, amount, created_at")
      .order("created_at", { ascending: false })

    if (error) {
      setStatus("Error loading sales")
      return
    }

    setSales(data || [])
    setStatus("Ready")
  }

  useEffect(() => {
    loadSales()
  }, [])

  const handleRecordSale = async () => {
    const trimmedItem = item.trim()
    const parsedAmount = Number(amount)

    if (!trimmedItem || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setStatus("Enter valid item and amount")
      return
    }

    setIsSaving(true)
    setStatus("Saving sale...")

    const supabase = createClientInstance()

    // 1. Save sale first
    const { error: saleError } = await supabase.from("sales").insert({
      item: trimmedItem,
      amount: parsedAmount,
    })

    if (saleError) {
      setStatus("Error saving sale")
      setIsSaving(false)
      return
    }

    // 2. Try to match product by name
    const { data: productMatch, error: productError } = await supabase
      .from("products")
      .select("id, name")
      .ilike("name", trimmedItem)
      .limit(1)
      .maybeSingle()

    if (!productError && productMatch) {
      // 3. Find inventory row for that product
      const { data: inventoryRow, error: inventoryError } = await supabase
        .from("inventory")
        .select("id, quantity")
        .eq("product_id", productMatch.id)
        .limit(1)
        .maybeSingle()

      if (!inventoryError && inventoryRow) {
        const nextQty = Math.max(0, Number(inventoryRow.quantity || 0) - 1)

        const { error: updateError } = await supabase
          .from("inventory")
          .update({ quantity: nextQty })
          .eq("id", inventoryRow.id)

        if (updateError) {
          setStatus("Sale saved - inventory update failed")
          await loadSales()
          setItem("")
          setAmount("")
          setIsSaving(false)
          return
        }

        setStatus("Sale recorded - inventory updated")
      } else {
        setStatus("Sale recorded - no inventory row found")
      }
    } else {
      setStatus("Sale recorded - no product match found")
    }

    // 4. Refresh page data
    await loadSales()

    // 5. Reset form
    setItem("")
    setAmount("")
    setIsSaving(false)
  }

  const salesToday = sales.reduce((sum, sale) => sum + Number(sale.amount || 0), 0)

  return (
    <>
      <h2 className="page-title">POS</h2>

      <div className="summary-card">
        <h2>New Sale</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "8px",
            marginTop: "12px",
          }}
        >
          <input
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="Item"
            style={{
              padding: "12px",
              borderRadius: "12px",
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
              padding: "12px",
              borderRadius: "12px",
              border: "1px solid #d1d5db",
              fontSize: "16px",
            }}
          />
        </div>

        <button
          onClick={handleRecordSale}
          disabled={isSaving}
          style={{
            marginTop: "12px",
            padding: "12px 16px",
            borderRadius: "12px",
            border: "none",
            background: "#2563eb",
            color: "#ffffff",
            fontSize: "16px",
            fontWeight: 600,
            opacity: isSaving ? 0.7 : 1,
          }}
        >
          {isSaving ? "Saving..." : "Record Sale"}
        </button>
      </div>

      <div className="summary-card">
        <h2>POS Summary</h2>

        <div className="metric">
          <span>Status</span>
          <span>{status}</span>
        </div>

        <div className="metric">
          <span>Transactions Today</span>
          <span>{sales.length}</span>
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
              <span>{sale.item}</span>
              <span>${Number(sale.amount).toFixed(2)}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}