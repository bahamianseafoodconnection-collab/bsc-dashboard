"use client"

import { useState, useEffect } from "react"
import { createClientInstance } from "../../lib/supabase/browser"

type Sale = {
  id: number
  item: string
  amount: number
  created_at: string
}

export default function POSPage() {
  const supabase = createClientInstance()

  const [item, setItem] = useState("")
  const [amount, setAmount] = useState("")
  const [sales, setSales] = useState<Sale[]>([])
  const [status, setStatus] = useState("Ready")

  const fetchSales = async () => {
    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      setStatus("Error loading sales")
    } else {
      setSales(data || [])
    }
  }

  useEffect(() => {
    fetchSales()
  }, [])

  const handleSale = async () => {
    if (!item || !amount) return

    const { error } = await supabase.from("sales").insert([
      {
        item: item,
        amount: parseFloat(amount),
      },
    ])

    if (error) {
      console.error(error)
      setStatus("Error saving sale")
    } else {
      setStatus("Sale recorded")
      setItem("")
      setAmount("")
      fetchSales()
    }
  }

  const totalSales = sales.reduce((sum, s) => sum + s.amount, 0)

  return (
    <>
      <h2 className="page-title">POS</h2>

      <div className="summary-card">
        <h2>New Sale</h2>
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
        <button onClick={handleSale}>Record Sale</button>
      </div>

      <div className="summary-card">
        <h2>POS Summary</h2>

        <div className="metric">
          <span>Register Status</span>
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
        {sales.length === 0 ? (
          <p>No sales yet</p>
        ) : (
          sales.map((sale) => (
            <div key={sale.id} className="metric">
              <span>{sale.item}</span>
              <span>${sale.amount}</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}