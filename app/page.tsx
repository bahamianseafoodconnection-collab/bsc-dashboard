"use client"

import { useEffect, useState } from "react"
import { createClient } from "../lib/supabase/browser"

type Product = {
  id: string
  name: string
  stock: number
  reorder_level: number
  sold_today: number
}

export default function Page() {
  const supabase = createClient()

  const [products, setProducts] = useState<Product[]>([])
  const [name, setName] = useState("")
  const [stock, setStock] = useState(0)
  const [reorderLevel, setReorderLevel] = useState(0)
  const [status, setStatus] = useState("Ready")

  // LOAD PRODUCTS FROM DB
  useEffect(() => {
    const loadProducts = async () => {
      setStatus("Loading...")

      const { data, error } = await supabase
        .from("products")
        .select("*")

      if (error) {
        console.error(error)
        setStatus("Load failed")
        return
      }

      setProducts(data || [])
      setStatus("Loaded")
    }

    loadProducts()
  }, [])

  // ADD PRODUCT TO DB
  const addProduct = async () => {
    if (!name) return

    setStatus("Saving...")

    const { data, error } = await supabase
      .from("products")
      .insert([
        {
          name,
          stock,
          reorder_level: reorderLevel,
          sold_today: 0
        }
      ])
      .select()

    if (error) {
      console.error(error)
      setStatus("Save failed")
      return
    }

    if (data) {
      setProducts([...products, data[0]])
      setStatus("Saved")
    }

    setName("")
    setStock(0)
    setReorderLevel(0)
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>BSC Product Manager</h1>

      <p>Status: {status}</p>

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