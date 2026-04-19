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

const HISTORY_KEY = "bsc-dashboard-history"
const INVENTORY_KEY = "bsc-dashboard-inventory"
const INPUTS_KEY = "bsc-dashboard-inputs"

export default function Page() {
  const [sales, setSales] = useState(0)
  const [cost, setCost] = useState(0)
  const [rent, setRent] = useState(0)
  const [payroll, setPayroll] = useState(0)
  const [utilities, setUtilities] = useState(0)
  const [otherExpenses, setOtherExpenses] = useState(0)
  const [cash, setCash] = useState(0)
  const [bank, setBank] = useState(0)

  const [history, setHistory] = useState<HistoryItem[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])

  const [itemName, setItemName] = useState("")
  const [stock, setStock] = useState(0)
  const [reorderLevel, setReorderLevel] = useState(0)
  const [reorderQty, setReorderQty] = useState(0)
  const [unitCost, setUnitCost] = useState(0)

  useEffect(() => {
    const savedHistory = localStorage.getItem(HISTORY_KEY)
    const savedInventory = localStorage.getItem(INVENTORY_KEY)
    const savedInputs = localStorage.getItem(INPUTS_KEY)

    if (savedHistory) {
      setHistory(JSON.parse(savedHistory))
    }

    if (savedInventory) {
      setInventory(JSON.parse(savedInventory))
    }

    if (savedInputs) {
      const parsed = JSON.parse(savedInputs)
      setSales(parsed.sales ?? 0)
      setCost(parsed.cost ?? 0)
      setRent(parsed.rent ?? 0)
      setPayroll(parsed.payroll ?? 0)
      setUtilities(parsed.utilities ?? 0)
      setOtherExpenses(parsed.otherExpenses ?? 0)
      setCash(parsed.cash ?? 0)
      setBank(parsed.bank ?? 0)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  }, [history])

  useEffect(() => {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory))
  }, [inventory])

  useEffect(() => {
    localStorage.setItem(
      INPUTS_KEY,
      JSON.stringify({
        sales,
        cost,
        rent,
        payroll,
        utilities,
        otherExpenses,
        cash,
        bank
      })
    )
  }, [sales, cost, rent, payroll, utilities, otherExpenses, cash, bank])

  const grossProfit = useMemo(() => sales - cost, [sales, cost])

  const totalExpenses = useMemo(
    () => rent + payroll + utilities + otherExpenses,
    [rent, payroll, utilities, otherExpenses]
  )

  const netProfit = useMemo(
    () => grossProfit - totalExpenses,
    [grossProfit, totalExpenses]
  )

  const totalPosition = useMemo(() => cash + bank, [cash, bank])

  const lowStockItems = useMemo(
    () => inventory.filter((item) => item.stock <= item.reorderLevel),
    [inventory]
  )

  const aiInsight = useMemo(() => {
    const messages: string[] = []

    if (sales <= 0) messages.push("⚠️ No sales entered — system idle")
    if (inventory.length === 0) messages.push("⚠️ No inventory items entered")
    if (grossProfit < 0) messages.push("⚠️ Cost of goods is higher than sales")
    if (netProfit < 0) messages.push("⚠️ Net profit is negative — review expenses")
    if (totalPosition < 500) messages.push("⚠️ Low cash position")

    if (messages.length === 0) {
      return "✅ Business looks stable today"
    }

    return messages.join("\n\n")
  }, [sales, inventory.length, grossProfit, netProfit, totalPosition])

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px",
    fontSize: "18px",
    borderRadius: "12px",
    border: "1px solid #d1d5db",
    marginTop: "8px",
    marginBottom: "20px",
    boxSizing: "border-box"
  }

  const cardStyle: React.CSSProperties = {
    background: "#ffffff",
    borderRadius: "24px",
    padding: "24px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
    marginBottom: "24px"
  }

  const metricCardStyle: React.CSSProperties = {
    background: "#ffffff",
    borderRadius: "18px",
    padding: "20px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
  }

  const buttonStyle: React.CSSProperties = {
    padding: "16px 22px",
    borderRadius: "18px",
    border: "none",
    fontWeight: 700,
    fontSize: "18px",
    cursor: "pointer"
  }

  const saveCloseout = () => {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      date: new Date().toLocaleString(),
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

    setHistory([newItem, ...history])
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

  const addInventoryItem = () => {
    if (!itemName.trim()) return

    const newItem: InventoryItem = {
      id: Date.now().toString(),
      name: itemName,
      stock,
      reorderLevel,
      reorderQty,
      unitCost
    }

    setInventory([newItem, ...inventory])
    setItemName("")
    setStock(0)
    setReorderLevel(0)
    setReorderQty(0)
    setUnitCost(0)
  }

  const clearInventory = () => {
    setInventory([])
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#eef0f4",
        padding: "24px",
        fontFamily: "Arial, sans-serif",
        color: "#0f172a"
      }}
    >
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "52px", marginBottom: "10px" }}>
          BSC Control Dashboard
        </h1>
        <p style={{ fontSize: "20px", marginBottom: "28px" }}>
          Live business control center
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "16px",
            marginBottom: "24px"
          }}
        >
          <div style={metricCardStyle}>
            <div>Sales</div>
            <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "8px" }}>
              ${sales.toFixed(2)}
            </div>
          </div>

          <div style={metricCardStyle}>
            <div>Gross Profit</div>
            <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "8px" }}>
              ${grossProfit.toFixed(2)}
            </div>
          </div>

          <div style={metricCardStyle}>
            <div>Expenses</div>
            <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "8px" }}>
              ${totalExpenses.toFixed(2)}
            </div>
          </div>

          <div style={metricCardStyle}>
            <div>Net Profit</div>
            <div
              style={{
                fontSize: "22px",
                fontWeight: 700,
                marginTop: "8px",
                color: netProfit >= 0 ? "green" : "red"
              }}
            >
              ${netProfit.toFixed(2)}
            </div>
          </div>

          <div style={metricCardStyle}>
            <div>Cash in Hand</div>
            <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "8px" }}>
              ${cash.toFixed(2)}
            </div>
          </div>

          <div style={metricCardStyle}>
            <div>Bank</div>
            <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "8px" }}>
              ${bank.toFixed(2)}
            </div>
          </div>

          <div style={metricCardStyle}>
            <div>Total Position</div>
            <div style={{ fontSize: "22px", fontWeight: 700, marginTop: "8px" }}>
              ${totalPosition.toFixed(2)}
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "28px", marginBottom: "20px" }}>
            Sales + Profit Input
          </h2>

          <label>Today Sales</label>
          <input
            style={inputStyle}
            type="number"
            value={sales}
            onChange={(e) => setSales(Number(e.target.value))}
          />

          <label>Cost of Goods</label>
          <input
            style={inputStyle}
            type="number"
            value={cost}
            onChange={(e) => setCost(Number(e.target.value))}
          />

          <label>Rent</label>
          <input
            style={inputStyle}
            type="number"
            value={rent}
            onChange={(e) => setRent(Number(e.target.value))}
          />

          <label>Payroll</label>
          <input
            style={inputStyle}
            type="number"
            value={payroll}
            onChange={(e) => setPayroll(Number(e.target.value))}
          />

          <label>Utilities</label>
          <input
            style={inputStyle}
            type="number"
            value={utilities}
            onChange={(e) => setUtilities(Number(e.target.value))}
          />

          <label>Other Expenses</label>
          <input
            style={inputStyle}
            type="number"
            value={otherExpenses}
            onChange={(e) => setOtherExpenses(Number(e.target.value))}
          />
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "28px", marginBottom: "20px" }}>
            Cash Position
          </h2>

          <label>Cash in Hand</label>
          <input
            style={inputStyle}
            type="number"
            value={cash}
            onChange={(e) => setCash(Number(e.target.value))}
          />

          <label>Bank</label>
          <input
            style={inputStyle}
            type="number"
            value={bank}
            onChange={(e) => setBank(Number(e.target.value))}
          />

          <h3 style={{ fontSize: "24px", marginTop: "16px" }}>
            Total Position: ${totalPosition.toFixed(2)}
          </h3>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "28px", marginBottom: "20px" }}>
            Inventory Input
          </h2>

          <label>Item Name</label>
          <input
            style={inputStyle}
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
          />

          <label>Stock</label>
          <input
            style={inputStyle}
            type="number"
            value={stock}
            onChange={(e) => setStock(Number(e.target.value))}
          />

          <label>Reorder Level</label>
          <input
            style={inputStyle}
            type="number"
            value={reorderLevel}
            onChange={(e) => setReorderLevel(Number(e.target.value))}
          />

          <label>Reorder Qty</label>
          <input
            style={inputStyle}
            type="number"
            value={reorderQty}
            onChange={(e) => setReorderQty(Number(e.target.value))}
          />

          <label>Unit Cost</label>
          <input
            style={inputStyle}
            type="number"
            value={unitCost}
            onChange={(e) => setUnitCost(Number(e.target.value))}
          />

          <button
            style={{ ...buttonStyle, background: "#0f172a", color: "#fff" }}
            onClick={addInventoryItem}
          >
            Add Inventory Item
          </button>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "28px", marginBottom: "20px" }}>
            Inventory Alerts
          </h2>

          {lowStockItems.length > 0 ? (
            <div style={{ color: "red", fontSize: "20px", fontWeight: 700 }}>
              ⚠️ Low stock: {lowStockItems.map((item) => item.name).join(", ")}
            </div>
          ) : (
            <div style={{ color: "green", fontSize: "20px", fontWeight: 700 }}>
              ✅ No low-stock items
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "28px", marginBottom: "20px" }}>
            Inventory List
          </h2>

          {inventory.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: "18px" }}>
              No inventory items saved yet.
            </p>
          ) : (
            inventory.map((item) => (
              <div
                key={item.id}
                style={{
                  borderBottom: "1px solid #e5e7eb",
                  paddingBottom: "12px",
                  marginBottom: "12px"
                }}
              >
                <strong>{item.name}</strong>
                <div>Stock: {item.stock}</div>
                <div>Reorder Level: {item.reorderLevel}</div>
                <div>Reorder Qty: {item.reorderQty}</div>
                <div>Unit Cost: ${item.unitCost.toFixed(2)}</div>
              </div>
            ))
          )}
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "28px", marginBottom: "20px" }}>
            AI Insight
          </h2>

          <div
            style={{
              whiteSpace: "pre-wrap",
              color: "red",
              fontSize: "18px",
              fontWeight: 700,
              lineHeight: 1.5
            }}
          >
            {aiInsight}
          </div>
        </div>

        <div style={{ marginBottom: "24px" }}>
          <button
            style={{
              ...buttonStyle,
              background: "#0b1a44",
              color: "#fff",
              marginRight: "12px",
              marginBottom: "12px"
            }}
            onClick={saveCloseout}
          >
            Save Today Closeout
          </button>

          <button
            style={{
              ...buttonStyle,
              background: "#e5e7eb",
              color: "#111827",
              marginRight: "12px",
              marginBottom: "12px"
            }}
            onClick={clearInputs}
          >
            Clear Inputs
          </button>

          <button
            style={{
              ...buttonStyle,
              background: "#f8d7da",
              color: "#991b1b",
              marginRight: "12px",
              marginBottom: "12px"
            }}
            onClick={clearHistory}
          >
            Clear History
          </button>

          <button
            style={{
              ...buttonStyle,
              background: "#fde68a",
              color: "#78350f",
              marginBottom: "12px"
            }}
            onClick={clearInventory}
          >
            Clear Inventory
          </button>
        </div>

        <div style={cardStyle}>
          <h2 style={{ fontSize: "28px", marginBottom: "20px" }}>
            Saved Daily History
          </h2>

          {history.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: "18px" }}>
              No closeouts saved yet.
            </p>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                style={{
                  borderBottom: "1px solid #e5e7eb",
                  paddingBottom: "14px",
                  marginBottom: "14px"
                }}
              >
                <strong>{item.date}</strong>
                <div>Sales: ${item.sales.toFixed(2)}</div>
                <div>Gross Profit: ${item.grossProfit.toFixed(2)}</div>
                <div>Total Expenses: ${item.totalExpenses.toFixed(2)}</div>
                <div>Net Profit: ${item.netProfit.toFixed(2)}</div>
                <div>Total Position: ${item.totalPosition.toFixed(2)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  )
}