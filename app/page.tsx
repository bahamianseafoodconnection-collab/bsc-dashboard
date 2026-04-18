"use client"

import { useState } from "react"

export default function Page() {
  const [sales, setSales] = useState(0)
  const [cash, setCash] = useState(0)
  const [bank, setBank] = useState(0)

  return (
    <main style={{ padding: "24px", fontFamily: "Arial" }}>
      <h1>BSC Control Dashboard</h1>

      <section>
        <h2>Today Sales</h2>
        <input
          type="number"
          value={sales}
          onChange={(e) => setSales(Number(e.target.value))}
        />
        <p>${sales.toFixed(2)}</p>
      </section>

      <section>
        <h2>Cash in Hand</h2>
        <input
          type="number"
          value={cash}
          onChange={(e) => setCash(Number(e.target.value))}
        />
        <p>${cash.toFixed(2)}</p>
      </section>

      <section>
        <h2>Bank</h2>
        <input
          type="number"
          value={bank}
          onChange={(e) => setBank(Number(e.target.value))}
        />
        <p>${bank.toFixed(2)}</p>
      </section>
    </main>
  )
}