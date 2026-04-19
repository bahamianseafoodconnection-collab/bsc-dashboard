"use client"

import { useEffect, useMemo, useState } from "react"

type SupplierItem = {
  id: string
  name: string
  amount: number
  status: "pending" | "paid"
}

type ProductItem = {
  id: string
  name: string
  costPrice: number
  sellingPrice: number
  stock: number
  reorderLevel: number
  quantitySold: number
}

export default function Page() {
  // BUSINESS INPUTS
  const [sales, setSales] = useState(0)
  const [cost, setCost] = useState(0)
  const [rent, setRent] = useState(0)
  const [payroll, setPayroll] = useState(0)
  const [utilities, setUtilities] = useState(0)
  const [otherExpenses, setOtherExpenses] = useState(0)
  const [cash, setCash] = useState(0)
  const [bank, setBank] = useState(0)

  // SUPPLIERS
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([])
  const [supplierName, setSupplierName] = useState("")
  const [supplierAmount, setSupplierAmount] = useState(0)

  // PRODUCTS
  const [products, setProducts] = useState<ProductItem[]>([])
  const [productName, setProductName] = useState("")
  const [costPrice, setCostPrice] = useState(0)
  const [sellingPrice, setSellingPrice] = useState(0)
  const [stock, setStock] = useState(0)
  const [reorderLevel, setReorderLevel] = useState(0)
  const [quantitySold, setQuantitySold] = useState(0)

  // STORAGE
  useEffect(() => {
    const savedSuppliers = localStorage.getItem("bsc-suppliers")
    const savedProducts = localStorage.getItem("bsc-products")

    if (savedSuppliers) setSuppliers(JSON.parse(savedSuppliers))
    if (savedProducts) setProducts(JSON.parse(savedProducts))
  }, [])

  useEffect(() => {
    localStorage.setItem("bsc-suppliers", JSON.stringify(suppliers))
  }, [suppliers])

  useEffect(() => {
    localStorage.setItem("bsc-products", JSON.stringify(products))
  }, [products])

  // CALCULATIONS
  const grossProfit = sales - cost
  const expenses = rent + payroll + utilities + otherExpenses
  const netProfit = grossProfit - expenses
  const totalPosition = cash + bank

  const pendingSuppliers = suppliers.filter((s) => s.status === "pending")
  const paidSuppliers = suppliers.filter((s) => s.status === "paid")
  const totalOwed = pendingSuppliers.reduce((sum, s) => sum + s.amount, 0)
  const cashAfterPayments = totalPosition - totalOwed

  const lowStockProducts = products.filter((p) => p.stock <= p.reorderLevel)

  const totalProductProfit = products.reduce((sum, p) => {
    const profitPerItem = p.sellingPrice - p.costPrice
    return sum + profitPerItem * p.quantitySold
  }, 0)

  const totalProductSalesValue = products.reduce((sum, p) => {
    return sum + p.sellingPrice * p.quantitySold
  }, 0)

  const totalReorderNeed = lowStockProducts.reduce((sum, p) => {
    const reorderQty = Math.max(p.reorderLevel - p.stock, 0)
    return sum + reorderQty * p.costPrice
  }, 0)

  const bestProduct = useMemo(() => {
    if (products.length === 0) return null

    let best = products[0]
    let bestValue = (best.sellingPrice - best.costPrice) * best.quantitySold

    for (const p of products) {
      const value = (p.sellingPrice - p.costPrice) * p.quantitySold
      if (value > bestValue) {
        best = p
        bestValue = value
      }
    }

    return best
  }, [products])

  const worstProduct = useMemo(() => {
    if (products.length === 0) return null

    let worst = products[0]
    let worstValue = (worst.sellingPrice - worst.costPrice) * worst.quantitySold

    for (const p of products) {
      const value = (p.sellingPrice - p.costPrice) * p.quantitySold
      if (value < worstValue) {
        worst = p
        worstValue = value
      }
    }

    return worst
  }, [products])

  const ai = useMemo(() => {
    if (sales === 0) return "⚠️ No sales"
    if (netProfit < 0) return "⚠️ Losing money"
    if (totalOwed > totalPosition) return "🚨 Cannot pay suppliers"
    if (cashAfterPayments < 500) return "⚠️ Low cash after supplier payments"
    if (products.length === 0) return "⚠️ No product tracking entered"
    if (totalProductProfit <= 0) return "⚠️ Product sales are not producing profit"
    if (lowStockProducts.length > 0) return "📦 Low stock items need reorder"
    return "✅ Stable position"
  }, [
    sales,
    netProfit,
    totalOwed,
    totalPosition,
    cashAfterPayments,
    products.length,
    totalProductProfit,
    lowStockProducts.length,
  ])

  // ACTIONS
  const addSupplier = () => {
    if (!supplierName || supplierAmount <= 0) return

    setSuppliers([
      ...suppliers,
      {
        id: Date.now().toString(),
        name: supplierName,
        amount: supplierAmount,
        status: "pending",
      },
    ])

    setSupplierName("")
    setSupplierAmount(0)
  }

  const markPaid = (id: string) => {
    setSuppliers(
      suppliers.map((s) =>
        s.id === id ? { ...s, status: "paid" } : s
      )
    )
  }

  const deleteSupplier = (id: string) => {
    setSuppliers(suppliers.filter((s) => s.id !== id))
  }

  const addProduct = () => {
    if (!productName || quantitySold < 0 || stock < 0) return

    setProducts([
      ...products,
      {
        id: Date.now().toString(),
        name: productName,
        costPrice,
        sellingPrice,
        stock,
        reorderLevel,
        quantitySold,
      },
    ])

    setProductName("")
    setCostPrice(0)
    setSellingPrice(0)
    setStock(0)
    setReorderLevel(0)
    setQuantitySold(0)
  }

  const deleteProduct = (id: string) => {
    setProducts(products.filter((p) => p.id !== id))
  }

  const box: React.CSSProperties = {
    background: "#fff",
    padding: "16px",
    borderRadius: "12px",
    marginBottom: "12px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  }

  const input: React.CSSProperties = {
    width: "100%",
    padding: "10px",
    marginBottom: "10px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    boxSizing: "border-box",
  }

  const button: React.CSSProperties = {
    padding: "10px 14px",
    marginRight: "8px",
    marginBottom: "8px",
    borderRadius: "8px",
    border: "none",
    cursor: "pointer",
  }

  return (
    <main
      style={{
        padding: 20,
        background: "#f3f4f6",
        minHeight: "100vh",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>BSC Control Dashboard</h1>
      <p>Live business control center</p>

      <div style={box}>
        <p>Sales: ${sales.toFixed(2)}</p>
        <p>Gross Profit: ${grossProfit.toFixed(2)}</p>
        <p>Expenses: ${expenses.toFixed(2)}</p>
        <p style={{ color: netProfit >= 0 ? "green" : "red" }}>
          Net Profit: ${netProfit.toFixed(2)}
        </p>
      </div>

      <div style={box}>
        <h3>Business Inputs</h3>
        <input
          style={input}
          placeholder="Sales"
          type="number"
          value={sales}
          onChange={(e) => setSales(Number(e.target.value) || 0)}
        />
        <input
          style={input}
          placeholder="Cost"
          type="number"
          value={cost}
          onChange={(e) => setCost(Number(e.target.value) || 0)}
        />
        <input
          style={input}
          placeholder="Rent"
          type="number"
          value={rent}
          onChange={(e) => setRent(Number(e.target.value) || 0)}
        />
        <input
          style={input}
          placeholder="Payroll"
          type="number"
          value={payroll}
          onChange={(e) => setPayroll(Number(e.target.value) || 0)}
        />
        <input
          style={input}
          placeholder="Utilities"
          type="number"
          value={utilities}
          onChange={(e) => setUtilities(Number(e.target.value) || 0)}
        />
        <input
          style={input}
          placeholder="Other Expenses"
          type="number"
          value={otherExpenses}
          onChange={(e) => setOtherExpenses(Number(e.target.value) || 0)}
        />
      </div>

      <div style={box}>
        <h3>Cash Position</h3>
        <input
          style={input}
          placeholder="Cash"
          type="number"
          value={cash}
          onChange={(e) => setCash(Number(e.target.value) || 0)}
        />
        <input
          style={input}
          placeholder="Bank"
          type="number"
          value={bank}
          onChange={(e) => setBank(Number(e.target.value) || 0)}
        />
        <p>Total Position: ${totalPosition.toFixed(2)}</p>
      </div>

      <div style={box}>
        <h3>Add Supplier Payment</h3>
        <input
          style={input}
          placeholder="Supplier Name"
          value={supplierName}
          onChange={(e) => setSupplierName(e.target.value)}
        />
        <input
          style={input}
          placeholder="Amount"
          type="number"
          value={supplierAmount}
          onChange={(e) => setSupplierAmount(Number(e.target.value) || 0)}
        />
        <button
          style={{ ...button, background: "#0f172a", color: "#fff" }}
          onClick={addSupplier}
        >
          Add Supplier
        </button>
      </div>

      <div style={box}>
        <h3>Pending Supplier Payments</h3>

        {pendingSuppliers.length === 0 && <p>No pending suppliers</p>}

        {pendingSuppliers.map((s) => (
          <div key={s.id} style={{ marginBottom: "8px" }}>
            {s.name}: ${s.amount.toFixed(2)}
            <div style={{ marginTop: "6px" }}>
              <button
                style={{ ...button, background: "#16a34a", color: "#fff" }}
                onClick={() => markPaid(s.id)}
              >
                Paid
              </button>
              <button
                style={{ ...button, background: "#ef4444", color: "#fff" }}
                onClick={() => deleteSupplier(s.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        <p>Total Owed: ${totalOwed.toFixed(2)}</p>
      </div>

      <div style={box}>
        <h3>Paid Supplier Payments</h3>
        {paidSuppliers.length === 0 && <p>No paid suppliers yet</p>}

        {paidSuppliers.map((s) => (
          <div key={s.id} style={{ marginBottom: "8px" }}>
            {s.name}: ${s.amount.toFixed(2)}
            <button
              style={{ ...button, background: "#ef4444", color: "#fff" }}
              onClick={() => deleteSupplier(s.id)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      <div style={box}>
        <h3>Cash After Supplier Payments</h3>
        <p style={{ color: cashAfterPayments >= 0 ? "green" : "red" }}>
          ${cashAfterPayments.toFixed(2)}
        </p>
      </div>

      <div style={box}>
        <h3>Product Tracking</h3>

        <input
          style={input}
          placeholder="Product Name"
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
        />

        <input
          style={input}
          placeholder="Cost Price"
          type="number"
          value={costPrice}
          onChange={(e) => setCostPrice(Number(e.target.value) || 0)}
        />

        <input
          style={input}
          placeholder="Selling Price"
          type="number"
          value={sellingPrice}
          onChange={(e) => setSellingPrice(Number(e.target.value) || 0)}
        />

        <input
          style={input}
          placeholder="Stock"
          type="number"
          value={stock}
          onChange={(e) => setStock(Number(e.target.value) || 0)}
        />

        <input
          style={input}
          placeholder="Reorder Level"
          type="number"
          value={reorderLevel}
          onChange={(e) => setReorderLevel(Number(e.target.value) || 0)}
        />

        <input
          style={input}
          placeholder="Quantity Sold"
          type="number"
          value={quantitySold}
          onChange={(e) => setQuantitySold(Number(e.target.value) || 0)}
        />

        <button
          style={{ ...button, background: "#0f172a", color: "#fff" }}
          onClick={addProduct}
        >
          Add Product
        </button>

        {products.length === 0 && <p>No products entered yet</p>}

        {products.map((p) => (
          <div key={p.id} style={{ marginBottom: "8px" }}>
            {p.name} | Sold: {p.quantitySold} | Profit: $
            {((p.sellingPrice - p.costPrice) * p.quantitySold).toFixed(2)}
            <div>
              <button
                style={{ ...button, background: "#ef4444", color: "#fff" }}
                onClick={() => deleteProduct(p.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}

        <p>Total Product Sales: ${totalProductSalesValue.toFixed(2)}</p>
        <p>Total Product Profit: ${totalProductProfit.toFixed(2)}</p>
        <p style={{ color: lowStockProducts.length ? "red" : "green" }}>
          {lowStockProducts.length
            ? `⚠️ ${lowStockProducts.length} low-stock product(s)`
            : "✅ Inventory OK"}
        </p>
        <p>Estimated Reorder Need: ${totalReorderNeed.toFixed(2)}</p>

        {bestProduct && (
          <p>
            Best Product: {bestProduct.name}
          </p>
        )}

        {worstProduct && (
          <p>
            Weakest Product: {worstProduct.name}
          </p>
        )}
      </div>

      <div style={box}>
        <h3>AI Insight</h3>
        <p>{ai}</p>
      </div>
    </main>
  )
}