"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "../lib/supabase/browser"

type Product = {
  id: string
  name: string
  stock: number
}

type Bill = {
  id: number
  bill_type: string
  amount: number
  created_at?: string
}

type DailyReport = {
  id: number
  report_date: string
  cash_in: number
  cash_out: number
  net_cash: number
}

export default function Page() {
  const supabase = createClient()

  const [status, setStatus] = useState("Ready")
  const [errorMessage, setErrorMessage] = useState("")

  // PRODUCTS
  const [products, setProducts] = useState<Product[]>([])
  const [name, setName] = useState("")
  const [stock, setStock] = useState(0)

  // BILLS
  const [billType, setBillType] = useState("")
  const [billAmount, setBillAmount] = useState(0)
  const [bills, setBills] = useState<Bill[]>([])

  // CASH
  const [cashIn, setCashIn] = useState(0)
  const [cashOut, setCashOut] = useState(0)
  const [dailyReportId, setDailyReportId] = useState<number | null>(null)

  const netCash = useMemo(() => cashIn - cashOut, [cashIn, cashOut])

  useEffect(() => {
    const loadSystem = async () => {
      setStatus("Loading...")
      setErrorMessage("")

      const [
        productsResult,
        billsResult,
        dailyReportResult,
      ] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("bills").select("*").order("id", { ascending: false }),
        supabase
          .from("daily_reports")
          .select("*")
          .eq("report_date", new Date().toISOString().slice(0, 10))
          .order("id", { ascending: false })
          .limit(1),
      ])

      if (productsResult.error) {
        console.error(productsResult.error)
        setErrorMessage(productsResult.error.message)
      } else {
        setProducts((productsResult.data as Product[]) || [])
      }

      if (billsResult.error) {
        console.error(billsResult.error)
        setErrorMessage((prev) => prev || billsResult.error!.message)
      } else {
        setBills((billsResult.data as Bill[]) || [])
      }

      if (dailyReportResult.error) {
        console.error(dailyReportResult.error)
        setErrorMessage((prev) => prev || dailyReportResult.error!.message)
      } else {
        const report = dailyReportResult.data?.[0] as DailyReport | undefined
        if (report) {
          setDailyReportId(report.id)
          setCashIn(Number(report.cash_in || 0))
          setCashOut(Number(report.cash_out || 0))
        }
      }

      setStatus("Loaded")
    }

    loadSystem()
  }, [supabase])

  const addProduct = async () => {
    if (!name.trim()) {
      setStatus("Missing product name")
      return
    }

    setStatus("Saving product...")
    setErrorMessage("")

    const { data, error } = await supabase
      .from("products")
      .insert([{ name: name.trim(), stock }])
      .select()

    if (error) {
      console.error(error)
      setStatus("Product save failed")
      setErrorMessage(error.message)
      return
    }

    if (data?.[0]) {
      setProducts([...products, data[0] as Product])
      setName("")
      setStock(0)
      setStatus("Product saved")
    }
  }

  const addBill = async () => {
    if (!billType || billAmount <= 0) {
      setStatus("Enter valid bill info")
      return
    }

    setStatus("Saving bill...")
    setErrorMessage("")

    const { data, error } = await supabase
      .from("bills")
      .insert([
        {
          bill_type: billType,
          amount: billAmount,
        },
      ])
      .select()

    if (error) {
      console.error(error)
      setStatus("Bill save failed")
      setErrorMessage(error.message)
      return
    }

    if (data?.[0]) {
      setBills([data[0] as Bill, ...bills])
      setBillType("")
      setBillAmount(0)
      setStatus("Bill saved")
    }
  }

  const saveCashControl = async () => {
    setStatus("Saving cash control...")
    setErrorMessage("")

    const today = new Date().toISOString().slice(0, 10)

    if (dailyReportId) {
      const { error } = await supabase
        .from("daily_reports")
        .update({
          cash_in: cashIn,
          cash_out: cashOut,
          net_cash: netCash,
        })
        .eq("id", dailyReportId)

      if (error) {
        console.error(error)
        setStatus("Cash save failed")
        setErrorMessage(error.message)
        return
      }

      setStatus("Cash control updated")
      return
    }

    const { data, error } = await supabase
      .from("daily_reports")
      .insert([
        {
          report_date: today,
          cash_in: cashIn,
          cash_out: cashOut,
          net_cash: netCash,
        },
      ])
      .select()

    if (error) {
      console.error(error)
      setStatus("Cash save failed")
      setErrorMessage(error.message)
      return
    }

    if (data?.[0]) {
      setDailyReportId((data[0] as DailyReport).id)
      setStatus("Cash control saved")
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>BSC CONTROL SYSTEM</h1>

      <p>Status: {status}</p>
      {errorMessage ? <p style={{ color: "red" }}>Error: {errorMessage}</p> : null}

      <hr />

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

      <div style={{ marginTop: 12 }}>
        {products.map((p) => (
          <div key={p.id}>
            {p.name} | Stock: {p.stock}
          </div>
        ))}
      </div>

      <hr />

      <h2>Bill Payments</h2>

      <select value={billType} onChange={(e) => setBillType(e.target.value)}>
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

      <div style={{ marginTop: 12 }}>
        {bills.map((b) => (
          <div key={b.id}>
            {b.bill_type} Bill Paid: ${b.amount}
          </div>
        ))}
      </div>

      <hr />

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

      <button onClick={saveCashControl}>Save Cash Control</button>

      <h3>Net Cash: ${netCash}</h3>
    </div>
  )
}