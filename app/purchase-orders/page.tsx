'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'

let _supabase: ReturnType<typeof createBrowserClient> | null = null
function getSupabase() {
  if (!_supabase) {
    _supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _supabase
}

interface PO {
  id: string
  supplier_name: string
  invoice_number: string
  total: number
  payment_status: string
  status: string
  created_at: string
  notes: string
  invoice_photo_url?: string
}

interface Supplier {
  id: string
  name: string
  code: string
}

export default function PurchaseOrdersPage() {
  const supabase = getSupabase()
  const [pos, setPOs] = useState<PO[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    supplier_id: '',
    supplier_name: '',
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    total: '',
    payment_status: 'unpaid',
    payment_method: '',
    payment_ref: '',
    notes: '',
    invoice_photo_url: '',
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: poData }, { data: supData }] = await Promise.all([
      supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('suppliers').select('id, name, code').eq('is_active', true).order('name'),
    ])
    if (poData) setPOs(poData)
    if (supData) setSuppliers(supData)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `invoices/${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('purchase-invoices')
        .upload(path, file, { upsert: true })
      if (error) throw error
      const { data: urlData } = supabase.storage
        .from('purchase-invoices')
        .getPublicUrl(path)
      setForm(prev => ({ ...prev, invoice_photo_url: urlData.publicUrl }))
    } catch (err: any) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  function handleSupplierChange(supplierId: string) {
    const sup = suppliers.find(s => s.id === supplierId)
    setForm(prev => ({
      ...prev,
      supplier_id: supplierId,
      supplier_name: sup?.name ?? '',
    }))
  }

  async function handleSave() {
    if (!form.supplier_id || !form.invoice_number || !form.total) {
      alert('Supplier, invoice number and total are required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        supplier_id:       form.supplier_id,
        supplier_name:     form.supplier_name,
        invoice_number:    form.invoice_number,
        invoice_date:      form.invoice_date,
        total:             parseFloat(form.total),
        total_amount:      parseFloat(form.total),
        subtotal:          parseFloat(form.total),
        currency:          'BSD',
        payment_status:    form.payment_status,
        payment_method:    form.payment_method || null,
        payment_ref:       form.payment_ref || null,
        payment_date:      form.payment_status === 'paid' ? form.invoice_date : null,
        notes:             form.notes || null,
        invoice_photo_url: form.invoice_photo_url || null,
        status:            'received',
        location:          'bsc_marketplace_nassau',
        created_by:        '7b62672c-9259-4c1b-98d4-3b78369a52ab',
      }

      const { data, error } = await supabase
        .from('purchase_orders')
        .insert(payload)
        .select('id')
        .single()

      if (error) throw error

      setSavedId(data.id)
      setShowNew(false)
      setForm({
        supplier_id: '', supplier_name: '', invoice_number: '',
        invoice_date: new Date().toISOString().split('T')[0],
        total: '', payment_status: 'unpaid', payment_method: '',
        payment_ref: '', notes: '', invoice_photo_url: '',
      })
      await loadData()
      setTimeout(() => setSavedId(null), 4000)
    } catch (err: any) {
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  function fmt(amount: number) {
    return '$' + Number(amount).toFixed(2)
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const statusColor = (s: string) =>
    s === 'paid' ? '#16a34a' : s === 'unpaid' ? '#ef4444' : '#f59e0b'

  return (
    <div className="min-h-screen bg-gray-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg" style={{ color: '#f5c518', fontFamily: "'Playfair Display', serif" }}>
              Purchase Orders
            </h1>
            <p className="text-xs text-gray-400">All supplier invoices · Nassau</p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2 rounded-xl text-sm font-bold"
            style={{ backgroundColor: '#f5c518', color: '#060d1f' }}
          >
            + New PO
          </button>
        </div>
      </header>

      {/* Success toast */}
      {savedId && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 rounded-xl px-6 py-3 text-sm font-bold shadow-xl"
          style={{ backgroundColor: '#16a34a', color: 'white' }}>
          ✓ Purchase order saved
        </div>
      )}

      {/* PO list */}
      <main className="p-4">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-gray-400 text-sm animate-pulse">Loading...</p>
          </div>
        ) : pos.length === 0 ? (
          <div className="text-center text-gray-500 py-16 text-sm">No purchase orders yet</div>
        ) : (
          <div className="space-y-3">
            {pos.map(po => (
              <div key={po.id} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{po.supplier_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      #{po.invoice_number} · {fmtDate(po.created_at)}
                    </p>
                    {po.notes && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{po.notes}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold" style={{ color: '#f5c518' }}>
                      {fmt(po.total)}
                    </p>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full mt-1 inline-block"
                      style={{
                        backgroundColor: statusColor(po.payment_status) + '22',
                        color: statusColor(po.payment_status)
                      }}>
                      {po.payment_status}
                    </span>
                  </div>
                </div>
                {po.invoice_photo_url && (
                  <a href={po.invoice_photo_url} target="_blank" rel="noreferrer"
                    className="mt-3 flex items-center gap-1.5 text-xs text-blue-400 underline">
                    📄 View Invoice Photo
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New PO modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center">
          <div
            className="bg-gray-900 rounded-t-3xl border-t border-gray-700 w-full max-w-lg flex flex-col"
            style={{ maxHeight: '95dvh', WebkitOverflowScrolling: 'touch' as any }}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-800 shrink-0">
              <h2 className="font-bold text-lg" style={{ fontFamily: "'Playfair Display', serif" }}>
                New Purchase Order
              </h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 text-2xl w-8 h-8 flex items-center justify-center">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

              {/* Invoice photo upload */}
              <div>
                <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wide">Invoice Photo</label>
                <input ref={fileRef} type="file" accept="image/*" capture="environment"
                  onChange={handlePhotoUpload} className="hidden" />
                {form.invoice_photo_url ? (
                  <div className="relative">
                    <img src={form.invoice_photo_url} alt="Invoice"
                      className="w-full rounded-xl object-cover max-h-48" />
                    <button
                      onClick={() => setForm(prev => ({ ...prev, invoice_photo_url: '' }))}
                      className="absolute top-2 right-2 bg-red-600 text-white rounded-full w-6 h-6 text-xs flex items-center justify-center">
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-full py-6 rounded-xl border-2 border-dashed border-gray-700 text-gray-400 text-sm font-medium disabled:opacity-50"
                  >
                    {uploading ? '⏳ Uploading...' : '📷 Tap to photograph invoice'}
                  </button>
                )}
              </div>

              {/* Supplier */}
              <div>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Supplier</label>
                <select
                  value={form.supplier_id}
                  onChange={e => handleSupplierChange(e.target.value)}
                  className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400"
                >
                  <option value="">Select supplier...</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Invoice number */}
              <div>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Invoice Number</label>
                <input type="text" placeholder="e.g. TPG-56124"
                  value={form.invoice_number}
                  onChange={e => setForm(prev => ({ ...prev, invoice_number: e.target.value }))}
                  className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Invoice Date</label>
                <input type="date"
                  value={form.invoice_date}
                  onChange={e => setForm(prev => ({ ...prev, invoice_date: e.target.value }))}
                  className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400"
                />
              </div>

              {/* Total */}
              <div>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Total Amount (BSD)</label>
                <input type="number" step="0.01" min="0" placeholder="0.00"
                  value={form.total}
                  onChange={e => setForm(prev => ({ ...prev, total: e.target.value }))}
                  className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400"
                />
              </div>

              {/* Payment status */}
              <div>
                <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wide">Payment Status</label>
                <div className="grid grid-cols-3 gap-2">
                  {['unpaid', 'paid', 'partial'].map(s => (
                    <button key={s} onClick={() => setForm(prev => ({ ...prev, payment_status: s }))}
                      className="py-2.5 rounded-xl text-xs font-bold capitalize"
                      style={form.payment_status === s
                        ? { backgroundColor: '#f5c518', color: '#060d1f' }
                        : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment method + ref (if paid) */}
              {form.payment_status !== 'unpaid' && (
                <>
                  <div>
                    <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wide">Payment Method</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['cash', 'wire', 'card'].map(m => (
                        <button key={m} onClick={() => setForm(prev => ({ ...prev, payment_method: m }))}
                          className="py-2.5 rounded-xl text-xs font-bold capitalize"
                          style={form.payment_method === m
                            ? { backgroundColor: '#f5c518', color: '#060d1f' }
                            : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Payment Ref #</label>
                    <input type="text" placeholder="e.g. 374958"
                      value={form.payment_ref}
                      onChange={e => setForm(prev => ({ ...prev, payment_ref: e.target.value }))}
                      className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400"
                    />
                  </div>
                </>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Notes (optional)</label>
                <textarea rows={3} placeholder="Products received, quantities, any issues..."
                  value={form.notes}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400 resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-6 pt-3 border-t border-gray-800 shrink-0">
              <div className="flex gap-3">
                <button onClick={() => setShowNew(false)}
                  className="flex-1 bg-gray-800 text-gray-300 rounded-xl py-3 text-sm font-medium">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving || uploading}
                  className="flex-1 rounded-xl py-3 text-sm font-bold disabled:opacity-50"
                  style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                  {saving ? 'Saving...' : 'Save PO'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
