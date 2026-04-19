"use client"

import { useEffect, useMemo, useState } from "react"

type HistoryItem = {
  id: string
  date: string
  sales: number
  cost: number
  grossProfit: number
  rent: number
  payroll: number
  utilities: number
  otherExpenses: number
  totalExpenses: number
  netProfit: number
  cash: number
  bank: number
  totalPosition: number
  aiInsight: string
}

type InventoryItem = {
  id: string
  name: string
  stock: number
  reorderLevel: number
  reorderQty: number
  unitCost: number
}

export default function Page() {
  // SALES + EXPENSES
  const [sales, setSales] = useState(0)
  const [cost, setCost] = useState(0)

  const [rent, setRent] = useState(0)
  const [payroll, setPayroll] = useState(0)
  const [utilities, setUtilities] = useState(0)
  const [otherExpenses, setOtherExpenses] = useState(0)

  // CASH
  const [cash, setCash] = useState(0)
  const [bank, setBank] = useState(0)

  // HISTORY
  const [history, setHistory] = useState<HistoryItem[]>([])

  // INVENTORY
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [itemName, setItemName] = useState("")
  const [stock, setStock] = useState(0)
  const [reorderLevel, setReorderLevel] = useState(0)
  const [reorderQty, setReorderQty] = useState(0)
  const [unitCost, setUnitCost] = useState(0)

  // CALCULATIONS
  const grossProfit = useMemo(() => sales - cost, [sales, cost])

  const totalExpenses = useMemo(
    () => rent + payroll + utilities + otherExpenses,
    [rent, payroll, utilities, otherExpenses]
  )

  const netProfit = useMemo(
    () => grossProfit - totalExpenses,
    [grossProfit, totalExpenses]
  )

  const totalPosition = useMemo(
    () => cash + bank,
    [cash, bank]
  )

  // AI INSIGHT
  const aiInsight = useMemo(() => {
    let messages: string[] = []

    if (sales <= 0) messages.push("⚠️ No sales entered — system idle")
    if (inventory.length === 0) messages.push("⚠️ No inventory items entered")
    if (netProfit < 0) messages.push("⚠️ Losing money — review expenses")
    if (totalPosition < 500) messages.push("⚠️ Low cash position")

    if (messages.length === 0) {
      return "📊 System healthy — keep pushing"
    }

    return messages.join("\n")
  }, [sales, netProfit, totalPosition, inventory])

  // SAVE CLOSEOUT
  const saveCloseout = () => {
    const item: HistoryItem = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString(),
      sales,
      cost,
      grossProfit,
      rent,
      payroll,
      utilities,
      otherExpenses,
      totalExpenses,
      netProfit,
      cash,
      bank,
      totalPosition,
      aiInsight
    }

    setHistory([item, ...history])
  }

  const clearInputs = () => {
    setSales(0)
    setCost(0)
    setRent(0)
    setPayroll(0)
    setUtilities(0)
    setOtherExpenses(0)
    setCash(0)
    setBank(0)
  }

  const clearHistory = () => {
    setHistory([])
  }

  // ADD INVENTORY
  const addItem = () => {
    if (!itemName) return

    const newItem: InventoryItem = {
      id: Date.now().toString(),
      name: itemName,
      stock,
      reorderLevel,
      reorderQty,
      unitCost
    }

    setInventory([...inventory, newItem])
    setItemName("")
    setStock(0)
    setReorderLevel(0)
    setReorderQty(0)
    setUnitCost(0)
  }

  const lowStockItems = inventory.filter(i => i.stock <= i.reorderLevel)

  const card = {
    background: "#fff",
    padding: "16px",
    borderRadius: "12px",
    marginBottom: "12px"
  }

  return (
    <main style={{ padding: 20, background: "#f3f4f6", minHeight: "100vh" }}>
      <h1>BSC Control Dashboard</h1>
      <p>Live business control center</p>

      {/* KPI */}
      <div style={card}>
        <p>Sales: ${sales.toFixed(2)}</p>
        <p>Gross Profit: ${grossProfit.toFixed(2)}</p>
        <p>Expenses: ${totalExpenses.toFixed(2)}</p>
        <p style={{ color: "green" }}>Net Profit: ${netProfit.toFixed(2)}</p>
      </div>

      {/* INPUT */}
      <div style={card}>
        <h3>Sales + Profit Input</h3>

        <input type="number" value={sales} onChange={e => setSales(Number(e.target.value))} placeholder="Sales" />
        <input type="number" value={cost} onChange={e => setCost(Number(e.target.value))} placeholder="Cost" />
        <input type="number" value={rent} onChange={e => setRent(Number(e.target.value))} placeholder="Rent" />
        <input type="number" value={payroll} onChange={e => setPayroll(Number(e.target.value))} placeholder="Payroll" />
        <input type="number" value={utilities} onChange={e => setUtilities(Number(e.target.value))} placeholder="Utilities" />
        <input type="number" value={otherExpenses} onChange={e => setOtherExpenses(Number(e.target.value))} placeholder="Other Expenses" />
      </div>

      {/* CASH */}
      <div style={card}>
        <h3>Cash Position</h3>
        <input type="number" value={cash} onChange={e => setCash(Number(e.target.value))} placeholder="Cash" />
        <input type="number" value={bank} onChange={e => setBank(Number(e.target.value))} placeholder="Bank" />
        <p>Total: ${totalPosition.toFixed(2)}</p>
      </div>

      {/* INVENTORY */}
      <div style={card}>
        <h3>Inventory</h3>
        <input placeholder="Item Name" value={itemName} onChange={e => setItemName(e.target.value)} />
        <input type="number" placeholder="Stock" value={stock} onChange={e => setStock(Number(e.target.value))} />
        <input type="number" placeholder="Reorder Level" value={reorderLevel} onChange={e => setReorderLevel(Number(e.target.value))} />
        <input type="number" placeholder="Reorder Qty" value={reorderQty} onChange={e => setReorderQty(Number(e.target.value))} />
        <input type="number" placeholder="Unit Cost" value={unitCost} onChange={e => setUnitCost(Number(e.target.value))} />

        <button onClick={addItem}>Add Item</button>

        {lowStockItems.length > 0 ? (
          <p style={{ color: "red" }}>
            ⚠️ Low stock: {lowStockItems.map(i => i.name).join(", ")}
          </p>
        ) : (
          <p style={{ color: "green" }}>✅ Inventory OK</p>
        )}
      </div>

      {/* AI */}
      <div style={card}>
        <h3>AI Insight</h3>
        <pre style={{ color: "red" }}>{aiInsight}</pre>
      </div>

      {/* ACTIONS */}
      <div style={card}>
        <button onClick={saveCloseout}>Save Today Closeout</button>
        <button onClick={clearInputs}>Clear Inputs</button>
        <button onClick={clearHistory}>Clear History</button>
      </div>

      {/* HISTORY */}
      <div style={card}>
        <h3>Saved Daily History</h3>
        {history.length === 0 && <p>No data</p>}
        {history.map(h => (
          <div key={h.id}>
            <strong>{h.date}</strong> - Net: ${h.netProfit.toFixed(2)}
          </div>
        ))}
      </div>
    </main>
  )
}