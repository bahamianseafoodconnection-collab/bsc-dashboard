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
  const [itemStock, setItemStock] = useState(0)
  const [itemReorderLevel, setItemReorderLevel] = useState(0)
  const [itemReorderQty, setItemReorderQty] = useState(0)
  const [itemUnitCost, setItemUnitCost] = useState(0)

  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem(HISTORY_KEY)
      const savedInventory = localStorage.getItem(INVENTORY_KEY)

      if (savedHistory) {
        setHistory(JSON.parse(savedHistory))
      }

      if (savedInventory) {
        setInventory(JSON.parse(savedInventory))
      }
    } catch (error) {
      console.error("Failed to load saved data:", error)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
    } catch (error) {
      console.error("Failed to save history:", error)
    }
  }, [history])

  useEffect(() => {
    try {
      localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory))
    } catch (error) {
      console.error("Failed to save inventory:", error)
    }
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

  const aiInsight = useMemo(() => {
    const messages: string[] = []

    if (sales <= 0) {
      messages.push("⚠️ No sales entered — system idle")
    }

    if (grossProfit < 0) {
      messages.push("⚠️ Cost of goods is higher than sales")
    }

    if (netProfit < 0) {
      messages.push("⚠️ Net profit is negative — reduce expenses or increase sales")
    }

    if (totalPosition < 500) {
      messages.push("⚠️ Low cash position — prioritize sales or reduce spending")
    }

    if (inventory.length === 0) {
      messages.push("⚠️ No inventory items entered")
    } else if (lowStockItems.length > 0) {
      messages.push(`⚠️ ${lowStockItems.length} low-stock item(s) need reorder attention`)
    }

    if (messages.length === 0) {
      messages.push("✅ Business numbers look stable today")
    }

    return messages
  }, [sales, grossProfit, netProfit, totalPosition, inventory, lowStockItems])

  const addInventoryItem = () => {
    if (!itemName.trim()) return

    const newItem: InventoryItem = {
      id: crypto.randomUUID(),
      name: itemName.trim(),
      stock: itemStock,
      reorderLevel: itemReorderLevel,
      reorderQty: itemReorderQty,
      unitCost: itemUnitCost,
    }

    setInventory((prev) => [newItem, ...prev])

    setItemName("")
    setItemStock(0)
    setItemReorderLevel(0)
    setItemReorderQty(0)
    setItemUnitCost(0)
  }

  const deleteInventoryItem = (id: string) => {
    setInventory((prev) => prev.filter((item) => item.id !== id))
  }

  const saveTodayCloseout = () => {
    const newEntry: HistoryItem = {
      id: crypto.randomUUID(),
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
      aiInsight: aiInsight.join(" | "),
    }

    setHistory((prev) => [newEntry, ...prev])
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

  const cardStyle: React.CSSProperties = {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "24px",
    padding: "24px",
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
  }

  const statValueStyle: React.CSSProperties = {
    fontSize: "28px",
    fontWeight: 800,
    marginTop: "10px",
    color: "#0f172a",
  }

  const mutedLabelStyle: React.CSSProperties = {
    color: "#6b7280",
    fontSize: "14px",
    fontWeight: 500,
  }

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: "20px",
    fontWeight: 800,
    marginBottom: "18px",
    color: "#0f172a",
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: "14px",
    border: "1px solid #cbd5e1",
    fontSize: "18px",
    outline: "none",
    boxSizing: "border-box",
    marginTop: "8px",
    background: "#ffffff",
  }

  const buttonPrimary: React.CSSProperties = {
    background: "#0b1736",
    color: "#ffffff",
    border: "none",
    borderRadius: "16px",
    padding: "16px 20px",
    fontSize: "18px",
    fontWeight: 700,
    cursor: "pointer",
  }

  const buttonSecondary: React.CSSProperties = {
    background: "#e5e7eb",
    color: "#111827",
    border: "none",
    borderRadius: "16px",
    padding: "16px 20px",
    fontSize: "18px",
    fontWeight: 700,
    cursor: "pointer",
  }

  const buttonDanger: React.CSSProperties = {
    background: "#f8d7da",
    color: "#b91c1c",
    border: "none",
    borderRadius: "16px",
    padding: "16px 20px",
    fontSize: "18px",
    fontWeight: 700,
    cursor: "pointer",
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        padding: "28px",
        fontFamily: "Arial, sans-serif",
        color: "#111827",
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "grid",
          gap: "24px",
        }}
      >
        <section
          style={{
            ...cardStyle,
            background: "#f3f4f6",
            border: "none",
            boxShadow: "none",
            padding: "0",
          }}
        >
          <h1
            style={{
              fontSize: "clamp(40px, 7vw, 72px)",
              lineHeight: 1,
              margin: 0,
              fontWeight: 900,
              color: "#0b1736",
            }}
          >
            BSC Control Dashboard
          </h1>

          <p
            style={{
              marginTop: "18px",
              fontSize: "20px",
              color: "#1f2937",
            }}
          >
            Live business control center
          </p>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "16px",
          }}
        >
          <div style={cardStyle}>
            <div style={mutedLabelStyle}>Sales</div>
            <div style={statValueStyle}>${sales.toFixed(2)}</div>
          </div>

          <div style={cardStyle}>
            <div style={mutedLabelStyle}>Gross Profit</div>
            <div style={statValueStyle}>${grossProfit.toFixed(2)}</div>
          </div>

          <div style={cardStyle}>
            <div style={mutedLabelStyle}>Expenses</div>
            <div style={statValueStyle}>${totalExpenses.toFixed(2)}</div>
          </div>

          <div style={cardStyle}>
            <div style={mutedLabelStyle}>Net Profit</div>
            <div
              style={{
                ...statValueStyle,
                color: netProfit >= 0 ? "#16a34a" : "#dc2626",
              }}
            >
              ${netProfit.toFixed(2)}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={mutedLabelStyle}>Cash in Hand</div>
            <div style={statValueStyle}>${cash.toFixed(2)}</div>
          </div>

          <div style={cardStyle}>
            <div style={mutedLabelStyle}>Bank</div>
            <div style={statValueStyle}>${bank.toFixed(2)}</div>
          </div>

          <div style={cardStyle}>
            <div style={mutedLabelStyle}>Total Position</div>
            <div style={statValueStyle}>${totalPosition.toFixed(2)}</div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "24px",
          }}
        >
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>Sales + Profit Input</h2>

            <label style={mutedLabelStyle}>
              Today Sales
              <input
                type="number"
                value={sales}
                onChange={(e) => setSales(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </label>

            <label style={{ ...mutedLabelStyle, display: "block", marginTop: "16px" }}>
              Cost of Goods
              <input
                type="number"
                value={cost}
                onChange={(e) => setCost(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </label>

            <label style={{ ...mutedLabelStyle, display: "block", marginTop: "16px" }}>
              Rent
              <input
                type="number"
                value={rent}
                onChange={(e) => setRent(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </label>

            <label style={{ ...mutedLabelStyle, display: "block", marginTop: "16px" }}>
              Payroll
              <input
                type="number"
                value={payroll}
                onChange={(e) => setPayroll(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </label>

            <label style={{ ...mutedLabelStyle, display: "block", marginTop: "16px" }}>
              Utilities
              <input
                type="number"
                value={utilities}
                onChange={(e) => setUtilities(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </label>

            <label style={{ ...mutedLabelStyle, display: "block", marginTop: "16px" }}>
              Other Expenses
              <input
                type="number"
                value={otherExpenses}
                onChange={(e) => setOtherExpenses(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </label>
          </div>

          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>Cash Position</h2>

            <label style={mutedLabelStyle}>
              Cash in Hand
              <input
                type="number"
                value={cash}
                onChange={(e) => setCash(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </label>

            <label style={{ ...mutedLabelStyle, display: "block", marginTop: "16px" }}>
              Bank
              <input
                type="number"
                value={bank}
                onChange={(e) => setBank(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </label>

            <div
              style={{
                marginTop: "24px",
                fontSize: "22px",
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              Total Position: ${totalPosition.toFixed(2)}
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "24px",
          }}
        >
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>Inventory Input</h2>

            <label style={mutedLabelStyle}>
              Item Name
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                style={inputStyle}
              />
            </label>

            <label style={{ ...mutedLabelStyle, display: "block", marginTop: "16px" }}>
              Current Stock
              <input
                type="number"
                value={itemStock}
                onChange={(e) => setItemStock(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </label>

            <label style={{ ...mutedLabelStyle, display: "block", marginTop: "16px" }}>
              Reorder Level
              <input
                type="number"
                value={itemReorderLevel}
                onChange={(e) => setItemReorderLevel(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </label>

            <label style={{ ...mutedLabelStyle, display: "block", marginTop: "16px" }}>
              Reorder Quantity
              <input
                type="number"
                value={itemReorderQty}
                onChange={(e) => setItemReorderQty(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </label>

            <label style={{ ...mutedLabelStyle, display: "block", marginTop: "16px" }}>
              Unit Cost
              <input
                type="number"
                value={itemUnitCost}
                onChange={(e) => setItemUnitCost(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </label>

            <button
              onClick={addInventoryItem}
              style={{ ...buttonPrimary, marginTop: "20px", width: "100%" }}
            >
              Add Inventory Item
            </button>
          </div>

          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>Inventory Alerts</h2>

            {lowStockItems.length === 0 ? (
              <p
                style={{
                  fontSize: "18px",
                  fontWeight: 700,
                  color: "#16a34a",
                  margin: 0,
                }}
              >
                ✅ No low-stock items
              </p>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {lowStockItems.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      borderRadius: "16px",
                      padding: "14px",
                    }}
                  >
                    <div style={{ fontWeight: 800, color: "#991b1b" }}>{item.name}</div>
                    <div style={{ color: "#b91c1c", marginTop: "6px" }}>
                      Stock: {item.stock} | Reorder Level: {item.reorderLevel} | Suggested Reorder: {item.reorderQty}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Inventory List</h2>

          {inventory.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: "18px", margin: 0 }}>
              No inventory items saved yet.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {inventory.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "18px",
                    padding: "16px",
                    background: "#ffffff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "20px", fontWeight: 800 }}>{item.name}</div>
                      <div style={{ color: "#6b7280", marginTop: "8px" }}>
                        Stock: {item.stock} | Reorder Level: {item.reorderLevel} | Reorder Qty: {item.reorderQty} | Unit Cost: ${item.unitCost.toFixed(2)}
                      </div>
                    </div>

                    <button
                      onClick={() => deleteInventoryItem(item.id)}
                      style={{
                        ...buttonDanger,
                        padding: "12px 14px",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>AI Insight</h2>

          <div style={{ display: "grid", gap: "12px" }}>
            {aiInsight.map((message, index) => {
              const isGood = message.includes("✅")
              return (
                <div
                  key={index}
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: isGood ? "#15803d" : "#dc2626",
                    lineHeight: 1.4,
                  }}
                >
                  {message}
                </div>
              )
            })}
          </div>
        </section>

        <section
          style={{
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <button onClick={saveTodayCloseout} style={buttonPrimary}>
            Save Today Closeout
          </button>

          <button onClick={clearInputs} style={buttonSecondary}>
            Clear Inputs
          </button>

          <button onClick={clearHistory} style={buttonDanger}>
            Clear History
          </button>
        </section>

        <section style={cardStyle}>
          <h2 style={sectionTitleStyle}>Saved Daily History</h2>

          {history.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: "18px", margin: 0 }}>
              No closeouts saved yet.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "16px" }}>
              {history.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "18px",
                    padding: "18px",
                    background: "#ffffff",
                  }}
                >
                  <div style={{ fontSize: "18px", fontWeight: 800, marginBottom: "12px" }}>
                    {entry.date}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: "10px",
                      color: "#374151",
                    }}
                  >
                    <div>Sales: ${entry.sales.toFixed(2)}</div>
                    <div>Cost: ${entry.cost.toFixed(2)}</div>
                    <div>Gross Profit: ${entry.grossProfit.toFixed(2)}</div>
                    <div>Rent: ${entry.rent.toFixed(2)}</div>
                    <div>Payroll: ${entry.payroll.toFixed(2)}</div>
                    <div>Utilities: ${entry.utilities.toFixed(2)}</div>
                    <div>Other Expenses: ${entry.otherExpenses.toFixed(2)}</div>
                    <div>Total Expenses: ${entry.totalExpenses.toFixed(2)}</div>
                    <div>Net Profit: ${entry.netProfit.toFixed(2)}</div>
                    <div>Cash: ${entry.cash.toFixed(2)}</div>
                    <div>Bank: ${entry.bank.toFixed(2)}</div>
                    <div>Total Position: ${entry.totalPosition.toFixed(2)}</div>
                  </div>

                  <div
                    style={{
                      marginTop: "14px",
                      padding: "12px 14px",
                      borderRadius: "14px",
                      background: "#f9fafb",
                      color: "#111827",
                      fontWeight: 600,
                    }}
                  >
                    AI Insight: {entry.aiInsight}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}