"use client"

import { useState, useMemo } from "react"

type Product = {
  id: string
  name: string
  stock: number
  reorderLevel: number
  soldToday: number
}

export default function Page() {

  // DAILY OPERATIONS
  const [openingCash, setOpeningCash] = useState(0)
  const [cashSales, setCashSales] = useState(0)
  const [cardSales, setCardSales] = useState(0)
  const [payouts, setPayouts] = useState(0)
  const [deposits, setDeposits] = useState(0)
  const [actualCash, setActualCash] = useState(0)

  // INVENTORY
  const [products, setProducts] = useState<Product[]>([])
  const [name, setName] = useState("")
  const [stock, setStock] = useState(0)
  const [reorderLevel, setReorderLevel] = useState(0)
  const [soldToday, setSoldToday] = useState(0)

  // CALCULATIONS
  const expectedCash = openingCash + cashSales - payouts - deposits
  const variance = actualCash - expectedCash

  const lowStock = products.filter(p => p.stock <= p.reorderLevel)

  const totalSold = products.reduce((sum, p) => sum + p.soldToday, 0)

  // ACTIONS
  const addProduct = () => {
    if (!name) return

    setProducts([
      ...products,
      {
        id: Date.now().toString(),
        name,
        stock,
        reorderLevel,
        soldToday
      }
    ])

    setName("")
    setStock(0)
    setReorderLevel(0)
    setSoldToday(0)
  }

  const sellProduct = (id: string) => {
    setProducts(products.map(p => {
      if (p.id === id && p.stock > 0) {
        return {
          ...p,
          stock: p.stock - 1,
          soldToday: p.soldToday + 1
        }
      }
      return p
    }))
  }

  const deleteProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id))
  }

  // AI
  const ai = useMemo(() => {
    if (variance !== 0) return "🚨 Cash mismatch"
    if (lowStock.length > 0) return "⚠️ Low stock — reorder soon"
    if (totalSold === 0) return "⚠️ No product movement"
    return "✅ Operations running"
  }, [variance, lowStock, totalSold])

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

      {/* DAILY OPERATIONS */}
      <div style={box}>
        <h3>Daily Operations</h3>

        <input style={input} placeholder="Opening Cash" type="number" value={openingCash} onChange={e => setOpeningCash(Number(e.target.value))} />
        <input style={input} placeholder="Cash Sales" type="number" value={cashSales} onChange={e => setCashSales(Number(e.target.value))} />
        <input style={input} placeholder="Card Sales" type="number" value={cardSales} onChange={e => setCardSales(Number(e.target.value))} />
        <input style={input} placeholder="Payouts" type="number" value={payouts} onChange={e => setPayouts(Number(e.target.value))} />
        <input style={input} placeholder="Deposits" type="number" value={deposits} onChange={e => setDeposits(Number(e.target.value))} />
        <input style={input} placeholder="Actual Cash" type="number" value={actualCash} onChange={e => setActualCash(Number(e.target.value))} />

        <p>Expected Cash: ${expectedCash}</p>
        <p style={{ color: variance === 0 ? "green" : "red" }}>
          Variance: ${variance}
        </p>
      </div>

      {/* INVENTORY INPUT */}
      <div style={box}>
        <h3>Add Product</h3>

        <input style={input} placeholder="Product Name" value={name} onChange={e => setName(e.target.value)} />
        <input style={input} placeholder="Stock" type="number" value={stock} onChange={e => setStock(Number(e.target.value))} />
        <input style={input} placeholder="Reorder Level" type="number" value={reorderLevel} onChange={e => setReorderLevel(Number(e.target.value))} />
        <input style={input} placeholder="Sold Today" type="number" value={soldToday} onChange={e => setSoldToday(Number(e.target.value))} />

        <button onClick={addProduct}>Add Product</button>
      </div>

      {/* INVENTORY LIST */}
      <div style={box}>
        <h3>Inventory</h3>

        {products.map(p => (
          <div key={p.id}>
            {p.name} | Stock: {p.stock} | Sold: {p.soldToday}

            <button onClick={() => sellProduct(p.id)}>Sell 1</button>
            <button onClick={() => deleteProduct(p.id)}>Delete</button>

            {p.stock <= p.reorderLevel && (
              <p style={{ color: "red" }}>
                ⚠️ Reorder Needed ({p.reorderLevel - p.stock})
              </p>
            )}
          </div>
        ))}
      </div>

      {/* SUMMARY */}
      <div style={box}>
        <h3>Inventory Summary</h3>
        <p>Total Sold Today: {totalSold}</p>
        <p style={{ color: lowStock.length ? "red" : "green" }}>
          {lowStock.length ? "Low stock items present" : "Inventory OK"}
        </p>
      </div>

      {/* AI */}
      <div style={box}>
        <h3>AI Insight</h3>
        <p>{ai}</p>
      </div>

    </main>
  )
}