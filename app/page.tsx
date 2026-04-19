"use client"

import { useEffect, useState } from "react"

type Product = {
  id: string
  name: string
  stock: number
  reorder_level: number
  sold_today: number
}

export default function TestPage() {

  const [products, setProducts] = useState<Product[]>([])
  const [name, setName] = useState("")
  const [stock, setStock] = useState(0)
  const [reorderLevel, setReorderLevel] = useState(0)

  useEffect(() => {
    const load = async () => {
      // TEMP: no backend yet
      setProducts([])
    }
    load()
  }, [])

  const addProduct = async () => {
    if (!name) return

    const newProduct = {
      id: Date.now().toString(),
      name,
      stock,
      reorder_level: reorderLevel,
      sold_today: 0,
    }

    setProducts([...products, newProduct])

    setName("")
    setStock(0)
    setReorderLevel(0)
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Test Page (Safe Mode)</h1>

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