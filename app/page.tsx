"use client"

import { useEffect, useMemo, useState } from "react"

type InventoryItem = {
  id: string
  name: string
  stock: number
  reorderLevel: number
  reorderQty: number
  unitCost: number
}

type ObligationItem = {
  id: string
  name: string
  amount: number
  status: "pending" | "paid"
}

export default function Page() {

  // SALES + CASH
  const [sales, setSales] = useState(0)
  const [cost, setCost] = useState(0)
  const [cash, setCash] = useState(0)
  const [bank, setBank] = useState(0)

  // EXPENSES
  const [rent, setRent] = useState(0)
  const [payroll, setPayroll] = useState(0)
  const [utilities, setUtilities] = useState(0)
  const [otherExpenses, setOtherExpenses] = useState(0)

  // OBLIGATIONS
  const [obligations, setObligations] = useState<ObligationItem[]>([])
  const [obName, setObName] = useState("")
  const [obAmount, setObAmount] = useState(0)

  // INVENTORY
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [itemName, setItemName] = useState("")
  const [stock, setStock] = useState(0)
  const [reorderLevel, setReorderLevel] = useState(0)
  const [reorderQty, setReorderQty] = useState(0)
  const [unitCost, setUnitCost] = useState(0)

  // CALCULATIONS
  const grossProfit = sales - cost
  const expenses = rent + payroll + utilities + otherExpenses
  const netProfit = grossProfit - expenses
  const totalPosition = cash + bank

  const pendingObligations = obligations.filter(o => o.status === "pending")
  const totalPending = pendingObligations.reduce((sum, o) => sum + o.amount, 0)

  const lowStockItems = inventory.filter(i => i.stock <= i.reorderLevel)
  const reorderCost = lowStockItems.reduce(
    (sum, i) => sum + (i.reorderQty * i.unitCost),
    0
  )

  const ai = useMemo(() => {
    if (sales === 0) return "⚠️ No sales"
    if (netProfit < 0) return "⚠️ Losing money"
    if (totalPending > totalPosition) return "🚨 Can't cover bills"
    if (lowStockItems.length > 0) return "📦 Reorder needed"
    return "✅ Stable"
  }, [sales, netProfit, totalPending, totalPosition, lowStockItems])

  // LOCAL STORAGE
  useEffect(() => {
    const savedInv = localStorage.getItem("inv")
    const savedOb = localStorage.getItem("ob")

    if (savedInv) setInventory(JSON.parse(savedInv))
    if (savedOb) setObligations(JSON.parse(savedOb))
  }, [])

  useEffect(() => {
    localStorage.setItem("inv", JSON.stringify(inventory))
  }, [inventory])

  useEffect(() => {
    localStorage.setItem("ob", JSON.stringify(obligations))
  }, [obligations])

  // ACTIONS
  const addInventory = () => {
    if (!itemName) return

    setInventory([
      ...inventory,
      {
        id: Date.now().toString(),
        name: itemName,
        stock,
        reorderLevel,
        reorderQty,
        unitCost
      }
    ])

    setItemName("")
    setStock(0)
    setReorderLevel(0)
    setReorderQty(0)
    setUnitCost(0)
  }

  const deleteItem = (id: string) => {
    setInventory(inventory.filter(i => i.id !== id))
  }

  const addObligation = () => {
    if (!obName || obAmount <= 0) return

    setObligations([
      ...obligations,
      { id: Date.now().toString(), name: obName, amount: obAmount, status: "pending" }
    ])

    setObName("")
    setObAmount(0)
  }

  const markPaid = (id: string) => {
    setObligations(obligations.map(o =>
      o.id === id ? { ...o, status: "paid" } : o
    ))
  }

  const box = {
    background: "#fff",
    padding: "16px",
    borderRadius: "12px",
    marginBottom: "12px"
  }

  const input = {
    width: "100%",
    padding: "10px",
    marginBottom: "10px"
  }

  return (
    <main style={{ padding: 20, background: "#f3f4f6", minHeight: "100vh" }}>
      <h1>BSC Control Dashboard</h1>

      {/* METRICS */}
      <div style={box}>
        <p>Sales: ${sales}</p>
        <p>Gross Profit: ${grossProfit}</p>
        <p>Expenses: ${expenses}</p>
        <p style={{ color: netProfit >= 0 ? "green" : "red" }}>
          Net Profit: ${netProfit}
        </p>
      </div>

      {/* INPUT */}
      <div style={box}>
        <h3>Sales + Expenses</h3>
        <input style={input} placeholder="Sales" type="number" value={sales} onChange={e => setSales(Number(e.target.value))} />
        <input style={input} placeholder="Cost" type="number" value={cost} onChange={e => setCost(Number(e.target.value))} />
        <input style={input} placeholder="Rent" type="number" value={rent} onChange={e => setRent(Number(e.target.value))} />
        <input style={input} placeholder="Payroll" type="number" value={payroll} onChange={e => setPayroll(Number(e.target.value))} />
        <input style={input} placeholder="Utilities" type="number" value={utilities} onChange={e => setUtilities(Number(e.target.value))} />
        <input style={input} placeholder="Other" type="number" value={otherExpenses} onChange={e => setOtherExpenses(Number(e.target.value))} />
      </div>

      {/* CASH */}
      <div style={box}>
        <h3>Cash</h3>
        <input style={input} placeholder="Cash" type="number" value={cash} onChange={e => setCash(Number(e.target.value))} />
        <input style={input} placeholder="Bank" type="number" value={bank} onChange={e => setBank(Number(e.target.value))} />
        <p>Total: ${totalPosition}</p>
      </div>

      {/* OBLIGATIONS */}
      <div style={box}>
        <h3>Obligations</h3>
        <input style={input} placeholder="Name" value={obName} onChange={e => setObName(e.target.value)} />
        <input style={input} placeholder="Amount" type="number" value={obAmount} onChange={e => setObAmount(Number(e.target.value))} />
        <button onClick={addObligation}>Add</button>

        {pendingObligations.map(o => (
          <div key={o.id}>
            {o.name}: ${o.amount}
            <button onClick={() => markPaid(o.id)}>Paid</button>
          </div>
        ))}
      </div>

      {/* INVENTORY */}
      <div style={box}>
        <h3>Inventory</h3>

        <input style={input} placeholder="Item Name" value={itemName} onChange={e => setItemName(e.target.value)} />
        <input style={input} placeholder="Stock" type="number" value={stock} onChange={e => setStock(Number(e.target.value))} />
        <input style={input} placeholder="Reorder Level" type="number" value={reorderLevel} onChange={e => setReorderLevel(Number(e.target.value))} />
        <input style={input} placeholder="Reorder Qty" type="number" value={reorderQty} onChange={e => setReorderQty(Number(e.target.value))} />
        <input style={input} placeholder="Unit Cost" type="number" value={unitCost} onChange={e => setUnitCost(Number(e.target.value))} />

        <button onClick={addInventory}>Add Item</button>

        {inventory.map(i => (
          <div key={i.id}>
            {i.name} (Stock: {i.stock})
            <button onClick={() => deleteItem(i.id)}>Delete</button>
          </div>
        ))}

        <p style={{ color: lowStockItems.length ? "red" : "green" }}>
          {lowStockItems.length ? "⚠️ Reorder needed" : "✅ Inventory OK"}
        </p>

        <p>Reorder Cost: ${reorderCost}</p>
      </div>

      {/* AI */}
      <div style={box}>
        <h3>AI Insight</h3>
        <p>{ai}</p>
      </div>

    </main>
  )
}