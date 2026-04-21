"use client"

import { useEffect, useState } from "react"
import { createClient } from "../lib/supabase/browser"

type Product = {
  id: string
  name: string
  stock: number
}

type Bill = {
  id: number
  type: string
  amount: number
}

export default function Page() {
  const supabase = createClient()

  // PRODUCTS
  const [products, setProducts] = useState<Product[]>([])
  const [name, setName] = useState("")
  const [stock, setStock] = useState(0)

  // BILLS
  const [billType, setBillType] = useState("")
  const [billAmount, setBillAmount] = useState(0)
  const [bills, setBills] = useState<Bill[]>([])

  // CASH CONTROL
  const [cashIn, setCashIn] = useState(0)
  const [cashOut, setCashOut] = useState(0)

  const [status, setStatus] = useState("Ready")

  // LOAD PRODUCTS
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("products").select("*")
      setProducts(data || [])
    }
    load()
  }, [])

  // ADD PRODUCT
  const addProduct = async () => {
    if (!name) return

    const { data } = await supabase
      .from("products")
      .insert([{ name, stock }])
      .select()

    if (data) {
      setProducts([...products, data[0]])
      setStatus("Product Saved")
    }

    setName("")
    setStock(0)
  }

  // ADD BILL
  const addBill = () => {
    if (!billType || billAmount <= 0) return

    const newBill = {
      id: Date.now(),
      type: billType,
      amount: billAmount
    }

    setBills([...bills, newBill])
    setStatus("Bill Paid")

    setBillType("")
    setBillAmount(0)
  }

  // CASH TOTAL
  const netCash = cashIn - cashOut

  return (
    <div style={{ padding: 20 }}>
      <h1>BSC CONTROL SYSTEM</h1>

      <p>Status: {status}</p>

      <hr />

      {/* PRODUCTS */}
      <h2>Products</h2>

      <input
        placeholder="Product name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <input
        type="number"
        placeholder="Stock"
        value={stock}
        onChange={(e) => setStock(Number(e.target.value))}
      />

      <button onClick={addProduct}>Add Product</button>

      <div>
        {products.map((p) => (
          <div key={p.id}>
            {p.name} | Stock: {p.stock}
          </div>
        ))}
      </div>

      <hr />

      {/* BILL PAYMENTS */}
      <h2>Bill Payments</h2>

      <select
        value={billType}
        onChange={(e) => setBillType(e.target.value)}
      >
        <option value="">Select Bill</option>
        <option value="Light">Light</option>
        <option value="Water">Water</option>
        <option value="Phone">Phone</option>
      </select>

      <input
        type="number"
        placeholder="Amount"
        value={billAmount}
        onChange={(e) => setBillAmount(Number(e.target.value))}
      />

      <button onClick={addBill}>Pay Bill</button>

      <div>
        {bills.map((b) => (
          <div key={b.id}>
            {b.type} Bill Paid: ${b.amount}
          </div>
        ))}
      </div>

      <hr />

      {/* CASH CONTROL */}
      <h2>Daily Cash Control</h2>

      <input
        type="number"
        placeholder="Cash In"
        value={cashIn}
        onChange={(e) => setCashIn(Number(e.target.value))}
      />

      <input
        type="number"
        placeholder="Cash Out"
        value={cashOut}
        onChange={(e) => setCashOut(Number(e.target.value))}
      />

      <h3>Net Cash: ${netCash}</h3>
    </div>
  )
}