"use client"

import { useState } from "react"

export default function Page() {
  const [sales, setSales] = useState(0)
  const [cash, setCash] = useState(0)
  const [bank, setBank] = useState(0)

  const total = cash + bank

  const handleNumber = (value: string) => {
    const num = Number(value)
    return isNaN(num) ? 0 : num
  }

  return (
    <main style={{ padding: "24px", fontFamily: "Arial" }}>
      <h1>BSC Control Dashboard</h1>

      {/* SALES */}
      <section>
        <h2>Today Sales</h2>
        <input
          type="number"
          value={sales}
          onChange={(e) => setSales(handleNumber(e.target.value))}
        />
        <p>${sales.toFixed(2)}</p>
      </section>

      {/* CASH */}
      <section>
        <h2>Cash in Hand</h2>
        <input
          type="number"
          value={cash}
          onChange={(e) => setCash(handleNumber(e.target.value))}
        />
        <p>${cash.toFixed(2)}</p>
      </section>

      {/* BANK */}
      <section>
        <h2>Bank</h2>
        <input
          type="number"
          value={bank}
          onChange={(e) => setBank(handleNumber(e.target.value))}
        />
        <p>${bank.toFixed(2)}</p>
      </section>

      {/* TOTAL */}
      <section>
        <h2>Total Position</h2>
        <p>${total.toFixed(2)}</p>
      </section>

      {/* DECISION ALERT */}
      <section style={{ marginTop: "20px" }}>
        <h2>AI Insight</h2>
        {total < 500 ? (
          <p style={{ color: "red" }}>
            ⚠️ Low cash position – prioritize sales or reduce spending
          </p>
        ) : (
          <p style={{ color: "green" }}>
            ✅ Healthy cash position
          </p>
        )}
      </section>
    </main>
  )
}