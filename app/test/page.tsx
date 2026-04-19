"use client"

import { useEffect, useState } from "react"
import { createClient } from "../../lib/supabase/browser"

type Product = {
  id: string
  name: string
  stock: number
  reorder_level: number
  sold_today: number
}

export default function TestPage() {
  const supabase = createClient()

  const [products, setProducts] = useState<Product[]>([])
  const [name, setName] = useState("")
  const [stock, setStock] = useState(0)
  const [reorderLevel, setReorderLevel] = useState(0)
  const [status, setStatus] = useState("Ready")
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    const load = async () => {
      setStatus("Loading products...")
      setErrorMessage("")

      const { data, error } = await supabase.from("products").select("*")

      if (error) {
        setStatus("Load failed")
        setErrorMessage(error.message)
        return
      }

      if (data) {
        setProducts(data)
      } else {
        setProducts([])
      }

      setStatus("Products loaded")
    }

    load()
  }, [])

  const addProduct = async () => {
    if (!name.trim()) {
      setStatus("Missing product name")
      return
    }

    setStatus("Saving product...")
    setErrorMessage("")

    const { data, error } = await supabase
      .from("products")
      .insert([
        {
          name: name.trim(),
          stock,
          reorder_level: reorderLevel,
          sold_today: 0,
        },
      ])
      .select()

    if (error) {
      setStatus("Save failed")
      setErrorMessage(error.message)
      return
    }

    if (data && data.length > 0) {
      setProducts([...products, data[0]])
      setStatus("Product saved")
    } else {
      setStatus("Saved, but no row returned")
    }

    setName("")
    setStock(0)
    setReorderLevel(0)
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Supabase Test</h1>

      <p><strong>Status:</strong> {status}</p>

      {errorMessage ? (
        <p style={{ color: "red" }}>
          <strong>Error:</strong> {errorMessage}
        </p>
      ) : null}

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

      <input
        type="number"
        placeholder="Reorder Level"
        value={reorderLevel}
        onChange={(e) => setReorderLevel(Number(e.target.value))}
      />

      <button onClick={addProduct}>Add Product</button>

      <hr />

      {products.map((p) => (
        <div key={p.id}>
          {p.name} | Stock: {p.stock}
        </div>
      ))}
    </div>
  )
}