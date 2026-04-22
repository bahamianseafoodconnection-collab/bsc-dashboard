"use client"

import { useEffect, useState } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type Sale = {
  id: string
  item: string
  amount: number
  created_at: string
}

export default function POSPage() {
  const [item, setItem] = useState("")
  const [amount, setAmount] = useState("")
  const [sales, setSales] = useState<Sale[]>([])
  const [status, setStatus] = useState("Ready")

  useEffect(() => {
    loadSales()
  }, [])

  async function loadSales() {
    const supabase = createClientInstance()

    const { data } = await supabase
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false })

    setSales(data || [])
  }

  async function handleSale() {
    const supabase = createClientInstance()

    if (!item || !amount) return

    // 1. Save sale
    const { error } = await supabase.from("sales").insert({
      item,
      amount: parseFloat(amount),
    })

    if (error) {
      setStatus("Error saving sale")
      return
    }

    // 2. REDUCE INVENTORY
    const { data: products } = await supabase
      .from("products")
      .select("id, name")

    const product = products?.find(
      (p) => p.name?.toLowerCase() === item.toLowerCase()
    )

    if (product) {
      const { data: inventory } = await supabase
        .from("inventory")
        .select("*")
        .eq("product_id", product.id)
        .single()

      if (inventory) {
        await supabase
          .from("inventory")
          .update({
            quantity: (inventory.quantity || 0) - 1,
          })
          .eq("id", inventory.id)
      }
    }

    setItem("")
    setAmount("")
    setStatus("Sale recorded")

    loadSales()
  }

  const totalSales = sales.reduce((sum, s) => sum + Number(s.amount), 0)

  return (
    <>
      <h1 className="page-title">POS</h1>

      <div className="summary-card">
        <h2>New Sale</h2>

        <div className="metric">
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
        </div>

        <button onClick={handleSale}>Record Sale</button>
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
          <span>${totalSales.toFixed(2)}</span>
        </div>
      </div>

      <div className="summary-card">
        <h2>Recent POS Activity</h2>

        {sales.map((sale) => (
          <div key={sale.id} className="metric">
            <span>{sale.item}</span>
            <span>${sale.amount}</span>
          </div>
        ))}
      </div>
    </>
  )
}