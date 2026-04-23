'use client'

import { useEffect, useMemo, useState } from 'react'
import { createBrowserClient } from '../../lib/supabase/browser'

type ProductOption = {
  id: string
  name: string
  price: number
  quantity: number
}

type SaleRow = {
  id: string
  product_name: string
  amount: number
  created_at: string
}

export default function PosPage() {
  const supabase = useMemo(() => createBrowserClient(), [])

  const [products, setProducts] = useState<ProductOption[]>([])
  const [sales, setSales] = useState<SaleRow[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [quantityInput, setQuantityInput] = useState('1')
  const [status, setStatus] = useState('Loading...')
  const [isSaving, setIsSaving] = useState(false)

  async function loadData() {
    setStatus('Loading...')

    const { data: inventoryData, error: inventoryError } = await supabase
      .from('inventory')
      .select(`
        id,
        quantity,
        products (
          id,
          name,
          price
        )
      `)
      .order('id', { ascending: true })

    const { data: salesData, error: salesError } = await supabase
      .from('sales')
      .select('id, product_name, amount, created_at')
      .order('created_at', { ascending: false })
      .limit(10)

    if (inventoryError || salesError) {
      setStatus('Error loading sales')
      return
    }

    const mappedProducts: ProductOption[] =
      (inventoryData || [])
        .filter((row: any) => row.products)
        .map((row: any) => ({
          id: row.products.id,
          name: row.products.name,
          price: Number(row.products.price || 0),
          quantity: Number(row.quantity || 0),
        })) || []

    setProducts(mappedProducts)
    setSales((salesData as SaleRow[]) || [])
    setStatus('Ready')

    if (!selectedProductId && mappedProducts.length > 0) {
      setSelectedProductId(mappedProducts[0].id)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedProduct = products.find((item) => item.id === selectedProductId)

  const quantity = Number(quantityInput || 0)
  const unitPrice = Number(selectedProduct?.price || 0)
  const totalSale = unitPrice * quantity
  const stockAfterSale = Number(selectedProduct?.quantity || 0) - quantity

  async function recordSale() {
    if (!selectedProduct) {
      setStatus('Select a product')
      return
    }

    if (!quantity || quantity <= 0) {
      setStatus('Enter valid quantity')
      return
    }

    const currentQty = Number(selectedProduct.quantity || 0)

    if (quantity > currentQty) {
      setStatus('Not enough stock')
      return
    }

    setIsSaving(true)

    const { error: saleError } = await supabase.from('sales').insert({
      product_name: selectedProduct.name,
      amount: totalSale,
    })

    if (saleError) {
      setStatus('Error recording sale')
      setIsSaving(false)
      return
    }

    const { error: inventoryError } = await supabase
      .from('inventory')
      .update({
        quantity: currentQty - quantity,
      })
      .eq('product_id', selectedProduct.id)

    if (inventoryError) {
      setStatus('Sale saved but inventory failed')
      setIsSaving(false)
      return
    }

    setQuantityInput('1')
    setStatus('Sale recorded')
    await loadData()
    setIsSaving(false)
  }

  const transactionsToday = sales.length
  const salesToday = sales.reduce((sum, sale) => sum + Number(sale.amount || 0), 0)

  return (
    <main className="mx-auto max-w-md p-4">
      <div className="mb-6 bg-blue-500 p-4 text-3xl font-bold text-white">
        BSC CONTROL
      </div>

      <h1 className="mb-4 text-2xl font-bold">POS</h1>

      <section className="mb-4 rounded-3xl border bg-white p-4">
        <h2 className="mb-4 text-2xl font-bold">New Sale</h2>

        <div className="space-y-3">
          <select
            className="w-full rounded-xl border p-3"
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} (${product.price}) ({product.quantity})
              </option>
            ))}
          </select>

          <input
            className="w-full rounded-xl border p-3"
            inputMode="numeric"
            value={quantityInput}
            onChange={(e) => setQuantityInput(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Quantity"
          />

          <button
            className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
            onClick={recordSale}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Record Sale'}
          </button>
        </div>
      </section>

      <section className="mb-4 rounded-3xl border bg-white p-4">
        <h2 className="mb-4 text-2xl font-bold">Sale Preview</h2>

        <div className="space-y-3 text-lg">
          <div className="flex justify-between gap-4">
            <span>Product</span>
            <span className="text-right">{selectedProduct?.name || '-'}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Unit Price</span>
            <span>${unitPrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Quantity</span>
            <span>{quantity}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Total Sale</span>
            <span>${totalSale.toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span>Stock After Sale</span>
            <span>{stockAfterSale}</span>
          </div>
        </div>
      </section>

      <section className="mb-4 rounded-3xl border bg-white p-4">
        <h2 className="mb-4 text-2xl font-bold">POS Summary</h2>

        <div className="space-y-3 text-lg">
          <div className="flex justify-between">
            <span>Status</span>
            <span>{status}</span>
          </div>
          <div className="flex justify-between">
            <span>Transactions Today</span>
            <span>{transactionsToday}</span>
          </div>
          <div className="flex justify-between">
            <span>Sales Today</span>
            <span>${salesToday.toFixed(2)}</span>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border bg-white p-4">
        <h2 className="mb-4 text-2xl font-bold">Recent POS Activity</h2>

        <div className="space-y-3">
          {sales.length === 0 ? (
            <p>No sales yet</p>
          ) : (
            sales.map((sale) => (
              <div key={sale.id} className="flex justify-between gap-4 border-b pb-2 last:border-b-0">
                <span>{sale.product_name}</span>
                <span>${Number(sale.amount || 0).toFixed(2)}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  )
}