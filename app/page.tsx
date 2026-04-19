"use client"

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

  // LOAD PRODUCTS
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("products").select("*")
      if (data) setProducts(data)
    }
    load()
  }, [])

  // ADD PRODUCT
  const addProduct = async () => {
    if (!name) return

    const { data } = await supabase
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

    if (data) {
      setProducts([...products, data[0]])
    }

    setName("")
    setStock(0)
    setReorderLevel(0)
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Supabase Test</h1>

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