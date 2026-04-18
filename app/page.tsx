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
  const [sales, setSales] = useState(0)
  const [cost, setCost] = useState(0)

  const [rent, setRent] = useState(0)
  const [payroll, setPayroll] = useState(0)
  const [utilities, setUtilities] = useState(0)
  const [otherExpenses, setOtherExpenses] = useState(0)

  const [cash, setCash] = useState(0)
  const [bank, setBank] = useState(0)

  const [history, setHistory] = useState<HistoryItem[]>([])

  const [itemName, setItemName] = useState("")
  const [stock, setStock] = useState(0)
  const [reorderLevel, setReorderLevel] = useState(0)
  const [reorderQty, setReorderQty] = useState(0)
  const [unitCost, setUnitCost] = useState(0)
  const [inventory, setInventory] = useState<InventoryItem[]>([])

  useEffect(() => {
    const savedHistory = localStorage.getItem("bsc-dashboard-history")
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory))
    }

    const savedInventory = localStorage.getItem("bsc-dashboard-inventory")
    if (savedInventory) {
      setInventory(JSON.parse(savedInventory))
    }
  }, [])

  useEffect(() => {
    localStorage.setItem("bsc-dashboard-history", JSON.stringify(history))
  }, [history])

  useEffect(() => {
    localStorage.setItem("bsc-dashboard-inventory", JSON.stringify(inventory))
  }, [inventory])

  const grossProfit = useMemo(() => sales - cost, [sales, cost])

  const totalExpenses = useMemo(() => {
    return rent + payroll + utilities + otherExpenses
  }, [rent, payroll, utilities, otherExpenses])

  const netProfit = useMemo(() => {
    return grossProfit - totalExpenses
  }, [grossProfit, totalExpenses])

  const totalPosition = useMemo(() => {
    return cash + bank
  }, [cash, bank])

  const lowStockItems = useMemo(() => {
    return inventory.filter((item) => item.stock <= item.reorderLevel)
  }, [inventory])

  const totalInventoryValue = useMemo(() => {
    return inventory.reduce((sum, item) => sum + item.stock * item.unitCost, 0)
  }, [inventory])

  const totalReorderValue = useMemo(() => {
    return lowStockItems.reduce((sum, item) => sum + item.reorderQty * item.unitCost, 0)
  }, [lowStockItems])

  const inventoryInsight = useMemo(() => {
    if (inventory.length === 0) return "⚠️ No inventory items entered"
    if (lowStockItems.length >= 3) return "⚠️ Multiple items need reorder now"
    if (lowStockItems.length > 0) return "⚠️ Reorder low stock items before they affect sales"
    return "📦 Inventory levels look healthy"
  }, [inventory, lowStockItems])

  const aiInsight = useMemo(() => {
    if (sales <= 0) return "⚠️ No sales entered — system idle"
    if (grossProfit < 0) return "⚠️ Cost is higher than sales"
    if (netProfit < 0) return "⚠️ Net profit is negative — reduce expenses or raise margin"
    if (totalPosition < 500) return "⚠️ Low cash position — prioritize sales or reduce spending"
    if (netProfit > 0 && totalPosition > 0) return "✅ Business is profitable and cash position is positive"
    return "📊 Review today’s numbers and update missing entries"
  }, [sales, grossProfit, netProfit, totalPosition])

  const formatMoney = (value: number) => `$${value.toFixed(2)}`

  const cardStyle = {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "20px",
    padding: "20px",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
  } as const

  const inputStyle = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: "14px",
    border: "1px solid #cbd5e1",
    fontSize: "18px",
    marginTop: "8px",
    boxSizing: "border-box" as const,
  }

  const buttonStyle = {
    padding: "14px 18px",
    borderRadius: "14px",
    border: "none",
    fontSize: "18px",
    fontWeight: 700,
    cursor: "pointer",
  } as const

  const saveCloseout = () => {
    const entry: HistoryItem = {
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
      aiInsight,
    }

    setHistory((prev) => [entry, ...prev])
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

  const saveInventoryItem = () => {
    if (!itemName.trim()) return

    const newItem: InventoryItem = {
      id: Date.now().toString(),
      name: itemName.trim(),
      stock,
      reorderLevel,
      reorderQty,
      unitCost,
    }

    setInventory((prev) => [newItem, ...prev])

    setItemName("")
    setStock(0)
    setReorderLevel(0)
    setReorderQty(0)
    setUnitCost(0)
  }

  const clearInventoryInputs = () => {
    setItemName("")
    setStock(0)
    setReorderLevel(0)
    setReorderQty(0)
    setUnitCost(0)
  }

  const deleteInventoryItem = (id: string) => {
    setInventory((prev) => prev.filter((item) => item.id !== id))
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        padding: "24px",
        fontFamily: "Arial, sans-serif",
        color: "#0f172a",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <section style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "56px", lineHeight: 1, margin: 0, fontWeight: 800 }}>
            BSC Control Dashboard
          </h1>
          <p style={{ fontSize: "20px", color: "#334155", marginTop: "16px" }}>
            Live business control center
          </p>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <div style={cardStyle}>
            <div style={{ fontSize: "14px", color: "#6b7280" }}>Sales</div>
            <div style={{ fontSize: "28px", fontWeight: 800, marginTop: "8px" }}>{formatMoney(sales)}</div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: "14px", color: "#6b7280" }}>Gross Profit</div>
            <div style={{ fontSize: "28px", fontWeight: 800, marginTop: "8px" }}>
              {formatMoney(grossProfit)}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: "14px", color: "#6b7280" }}>Expenses</div>
            <div style={{ fontSize: "28px", fontWeight: 800, marginTop: "8px" }}>
              {formatMoney(totalExpenses)}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: "14px", color: "#6b7280" }}>Net Profit</div>
            <div
              style={{
                fontSize: "28px",
                fontWeight: 800,
                marginTop: "8px",
                color: netProfit >= 0 ? "#3f8f2f" : "#dc2626",
              }}
            >
              {formatMoney(netProfit)}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: "14px", color: "#6b7280" }}>Cash in Hand</div>
            <div style={{ fontSize: "28px", fontWeight: 800, marginTop: "8px" }}>{formatMoney(cash)}</div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: "14px", color: "#6b7280" }}>Bank</div>
            <div style={{ fontSize: "28px", fontWeight: 800, marginTop: "8px" }}>{formatMoney(bank)}</div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: "14px", color: "#6b7280" }}>Total Position</div>
            <div style={{ fontSize: "28px", fontWeight: 800, marginTop: "8px" }}>
              {formatMoney(totalPosition)}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: "14px", color: "#6b7280" }}>Inventory Value</div>
            <div style={{ fontSize: "28px", fontWeight: 800, marginTop: "8px" }}>
              {formatMoney(totalInventoryValue)}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: "14px", color: "#6b7280" }}>Low Stock Items</div>
            <div
              style={{
                fontSize: "28px",
                fontWeight: 800,
                marginTop: "8px",
                color: lowStockItems.length > 0 ? "#dc2626" : "#3f8f2f",
              }}
            >
              {lowStockItems.length}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: "14px", color: "#6b7280" }}>Reorder Value</div>
            <div style={{ fontSize: "28px", fontWeight: 800, marginTop: "8px" }}>
              {formatMoney(totalReorderValue)}
            </div>
          </div>
        </section>

        <section style={{ ...cardStyle, marginBottom: "24px" }}>
          <h2 style={{ fontSize: "28px", marginTop: 0 }}>Sales + Profit Input</h2>

          <label>
            <div style={{ marginTop: "16px", fontSize: "16px" }}>Today Sales</div>
            <input
              type="number"
              value={sales}
              onChange={(e) => setSales(Number(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>

          <label>
            <div style={{ marginTop: "16px", fontSize: "16px" }}>Cost of Goods</div>
            <input
              type="number"
              value={cost}
              onChange={(e) => setCost(Number(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>

          <label>
            <div style={{ marginTop: "16px", fontSize: "16px" }}>Rent</div>
            <input
              type="number"
              value={rent}
              onChange={(e) => setRent(Number(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>

          <label>
            <div style={{ marginTop: "16px", fontSize: "16px" }}>Payroll</div>
            <input
              type="number"
              value={payroll}
              onChange={(e) => setPayroll(Number(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>

          <label>
            <div style={{ marginTop: "16px", fontSize: "16px" }}>Utilities</div>
            <input
              type="number"
              value={utilities}
              onChange={(e) => setUtilities(Number(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>

          <label>
            <div style={{ marginTop: "16px", fontSize: "16px" }}>Other Expenses</div>
            <input
              type="number"
              value={otherExpenses}
              onChange={(e) => setOtherExpenses(Number(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>
        </section>

        <section style={{ ...cardStyle, marginBottom: "24px" }}>
          <h2 style={{ fontSize: "28px", marginTop: 0 }}>Cash Position</h2>

          <label>
            <div style={{ marginTop: "16px", fontSize: "16px" }}>Cash in Hand</div>
            <input
              type="number"
              value={cash}
              onChange={(e) => setCash(Number(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>

          <label>
            <div style={{ marginTop: "16px", fontSize: "16px" }}>Bank</div>
            <input
              type="number"
              value={bank}
              onChange={(e) => setBank(Number(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>

          <div style={{ fontSize: "28px", fontWeight: 800, marginTop: "24px" }}>
            Total Position: {formatMoney(totalPosition)}
          </div>
        </section>

        <section style={{ ...cardStyle, marginBottom: "24px" }}>
          <h2 style={{ fontSize: "28px", marginTop: 0 }}>Inventory Input</h2>

          <label>
            <div style={{ marginTop: "16px", fontSize: "16px" }}>Item Name</div>
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              style={inputStyle}
            />
          </label>

          <label>
            <div style={{ marginTop: "16px", fontSize: "16px" }}>Current Stock</div>
            <input
              type="number"
              value={stock}
              onChange={(e) => setStock(Number(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>

          <label>
            <div style={{ marginTop: "16px", fontSize: "16px" }}>Reorder Level</div>
            <input
              type="number"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(Number(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>

          <label>
            <div style={{ marginTop: "16px", fontSize: "16px" }}>Reorder Quantity</div>
            <input
              type="number"
              value={reorderQty}
              onChange={(e) => setReorderQty(Number(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>

          <label>
            <div style={{ marginTop: "16px", fontSize: "16px" }}>Unit Cost</div>
            <input
              type="number"
              value={unitCost}
              onChange={(e) => setUnitCost(Number(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "24px" }}>
            <button
              onClick={saveInventoryItem}
              style={{ ...buttonStyle, background: "#0f172a", color: "#ffffff" }}
            >
              Save Item
            </button>
            <button
              onClick={clearInventoryInputs}
              style={{ ...buttonStyle, background: "#e5e7eb", color: "#111827" }}
            >
              Clear Inventory Inputs
            </button>
          </div>
        </section>

        <section style={{ ...cardStyle, marginBottom: "24px" }}>
          <h2 style={{ fontSize: "28px", marginTop: 0 }}>Inventory Alerts</h2>

          {lowStockItems.length === 0 ? (
            <p style={{ color: "#15803d", fontSize: "20px", fontWeight: 700 }}>✅ No low-stock items</p>
          ) : (
            <div style={{ display: "grid", gap: "16px" }}>
              {lowStockItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #fecaca",
                    borderRadius: "16px",
                    padding: "16px",
                    background: "#fff7f7",
                  }}
                >
                  <div style={{ fontSize: "22px", fontWeight: 700 }}>{item.name}</div>
                  <div style={{ marginTop: "8px" }}>Current Stock: {item.stock}</div>
                  <div>Reorder Level: {item.reorderLevel}</div>
                  <div>Reorder Quantity: {item.reorderQty}</div>
                  <div>Estimated Reorder Cost: {formatMoney(item.reorderQty * item.unitCost)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={{ ...cardStyle, marginBottom: "24px" }}>
          <h2 style={{ fontSize: "28px", marginTop: 0 }}>Inventory List</h2>

          {inventory.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: "20px" }}>No inventory items saved yet.</p>
          ) : (
            <div style={{ display: "grid", gap: "16px" }}>
              {inventory.map((item) => {
                const isLow = item.stock <= item.reorderLevel

                return (
                  <div
                    key={item.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: "16px",
                      padding: "16px",
                      background: "#ffffff",
                    }}
                  >
                    <div style={{ fontSize: "22px", fontWeight: 700 }}>{item.name}</div>
                    <div style={{ marginTop: "8px" }}>Stock: {item.stock}</div>
                    <div>Reorder Level: {item.reorderLevel}</div>
                    <div>Reorder Quantity: {item.reorderQty}</div>
                    <div>Unit Cost: {formatMoney(item.unitCost)}</div>
                    <div>Total Stock Value: {formatMoney(item.stock * item.unitCost)}</div>
                    <div
                      style={{
                        marginTop: "10px",
                        fontWeight: 700,
                        color: isLow ? "#dc2626" : "#15803d",
                      }}
                    >
                      {isLow ? "LOW STOCK" : "OK"}
                    </div>

                    <button
                      onClick={() => deleteInventoryItem(item.id)}
                      style={{
                        ...buttonStyle,
                        background: "#fee2e2",
                        color: "#991b1b",
                        marginTop: "14px",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section style={{ ...cardStyle, marginBottom: "24px" }}>
          <h2 style={{ fontSize: "28px", marginTop: 0 }}>AI Insight</h2>
          <p
            style={{
              fontSize: "22px",
              fontWeight: 700,
              color: aiInsight.startsWith("✅") ? "#15803d" : "#dc2626",
            }}
          >
            {aiInsight}
          </p>
          <p
            style={{
              fontSize: "20px",
              fontWeight: 700,
              color: inventoryInsight.startsWith("📦") ? "#15803d" : "#dc2626",
              marginTop: "16px",
            }}
          >
            {inventoryInsight}
          </p>
        </section>

        <section style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <button
              onClick={saveCloseout}
              style={{ ...buttonStyle, background: "#0f172a", color: "#ffffff" }}
            >
              Save Today Closeout
            </button>

            <button
              onClick={clearInputs}
              style={{ ...buttonStyle, background: "#e5e7eb", color: "#111827" }}
            >
              Clear Inputs
            </button>

            <button
              onClick={clearHistory}
              style={{ ...buttonStyle, background: "#f5d7d7", color: "#9f2f2f" }}
            >
              Clear History
            </button>
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={{ fontSize: "28px", marginTop: 0 }}>Saved Daily History</h2>

          {history.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: "20px" }}>No closeouts saved yet.</p>
          ) : (
            <div style={{ display: "grid", gap: "16px" }}>
              {history.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "16px",
                    padding: "16px",
                    background: "#ffffff",
                  }}
                >
                  <div style={{ fontSize: "18px", fontWeight: 700 }}>{entry.date}</div>
                  <div style={{ marginTop: "8px" }}>Sales: {formatMoney(entry.sales)}</div>
                  <div>Gross Profit: {formatMoney(entry.grossProfit)}</div>
                  <div>Total Expenses: {formatMoney(entry.totalExpenses)}</div>
                  <div>Net Profit: {formatMoney(entry.netProfit)}</div>
                  <div>Total Position: {formatMoney(entry.totalPosition)}</div>
                  <div style={{ marginTop: "8px", fontWeight: 700 }}>{entry.aiInsight}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}