'use client'

import { useState, useEffect, useCallback } from 'react'
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

interface InventoryRow {
  id: string | null
  product_id: string
  product_name: string
  sku: string
  category: string
  location: string
  cases_on_hand: number
  units_on_hand: number
  weight_lbs_on_hand: number
  units_per_case: number
  unit_type: string
  total_units: number
}

const LOCATIONS = [
  { value: 'bsc_marketplace_nassau', label: 'Nassau — BSC Marketplace' },
  { value: 'cetas_andros',           label: 'Andros — Ceta\'s Store' },
]

const CATEGORY_LABELS: Record<string, string> = {
  fresh_seafood:     'Fresh Seafood',
  frozen_seafood:    'Frozen Seafood',
  processed_seafood: 'Processed Seafood',
  meat:              'Meat',
  produce:           'Produce',
  beverage:          'Beverage',
  grocery:           'Grocery',
  snack:             'Snack',
  other:             'Other',
}

export default function InventoryPage() {
  const supabase = getSupabase()
  const [location, setLocation] = useState('bsc_marketplace_nassau')
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [edits, setEdits] = useState<Record<string, Partial<InventoryRow>>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const loadInventory = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, sku, name, category, units_per_case, unit_type,
        inventory!left(id, location, cases_on_hand, units_on_hand, weight_lbs_on_hand, units_per_case, unit_type)
      `)
      .eq('status', 'active')
      .or('sell_nassau.eq.true,sell_andros.eq.true')
      .order('name')

    if (!error && data) {
      const mapped: InventoryRow[] = data.map((p: any) => {
        const inv = Array.isArray(p.inventory)
          ? p.inventory.find((i: any) => i.location === location)
          : p.inventory?.location === location ? p.inventory : null

        const upc  = inv?.units_per_case ?? p.units_per_case ?? 1
        const utype = inv?.unit_type ?? p.unit_type ?? 'piece'
        const cases = inv?.cases_on_hand ?? 0
        const units = inv?.units_on_hand ?? 0
        const lbs   = inv?.weight_lbs_on_hand ?? 0

        return {
          id:                  inv?.id ?? null,
          product_id:          p.id,
          product_name:        p.name,
          sku:                 p.sku,
          category:            p.category,
          location,
          cases_on_hand:       cases,
          units_on_hand:       units,
          weight_lbs_on_hand:  lbs,
          units_per_case:      upc,
          unit_type:           utype,
          total_units:         utype === 'weight_lb' ? lbs : cases * upc + units,
        }
      })
      setRows(mapped)
      setEdits({})
    }
    setLoading(false)
  }, [supabase, location])

  useEffect(() => { loadInventory() }, [loadInventory])

  function getRow(productId: string): InventoryRow {
    const base = rows.find(r => r.product_id === productId)!
    return { ...base, ...(edits[productId] ?? {}) }
  }

  function handleEdit(productId: string, field: string, value: number) {
    setEdits(prev => ({
      ...prev,
      [productId]: { ...(prev[productId] ?? {}), [field]: value },
    }))
  }

  async function saveRow(productId: string) {
    setSaving(productId)
    const row = getRow(productId)
    const payload = {
      product_id:         productId,
      location,
      cases_on_hand:      row.cases_on_hand,
      units_on_hand:      row.units_on_hand,
      weight_lbs_on_hand: row.weight_lbs_on_hand,
      units_per_case:     row.units_per_case,
      unit_type:          row.unit_type,
      last_updated_at:    new Date().toISOString(),
      last_updated_by:    '7b62672c-9259-4c1b-98d4-3b78369a52ab',
    }

    const { error } = await supabase
      .from('inventory')
      .upsert(payload, { onConflict: 'product_id,location' })

    if (!error) {
      setSavedIds(prev => new Set([...prev, productId]))
      setTimeout(() => setSavedIds(prev => { const s = new Set(prev); s.delete(productId); return s }), 2000)
      setEdits(prev => { const e = { ...prev }; delete e[productId]; return e })
      await loadInventory()
    } else {
      alert('Save failed: ' + error.message)
    }
    setSaving(null)
  }

  const filtered = rows.filter(r =>
    !search || r.product_name.toLowerCase().includes(search.toLowerCase()) || r.sku.includes(search)
  )

  const grouped = filtered.reduce((acc, row) => {
    const cat = row.category
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(row)
    return acc
  }, {} as Record<string, InventoryRow[]>)

  return (
    <div className="min-h-screen bg-gray-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-900 border-b border-gray-800 px-4 py-3">
        <h1 className="font-bold text-lg" style={{ color: '#f5c518', fontFamily: "'Playfair Display', serif" }}>
          BSC Inventory
        </h1>
        <div className="flex gap-2 mt-3">
          {LOCATIONS.map(loc => (
            <button key={loc.value} onClick={() => setLocation(loc.value)}
              className="text-xs px-3 py-1.5 rounded-full font-medium transition-colors"
              style={location === loc.value
                ? { backgroundColor: '#f5c518', color: '#060d1f', fontWeight: 700 }
                : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
              {loc.label}
            </button>
          ))}
        </div>
        <input type="text" placeholder="Search product or SKU..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full mt-3 bg-gray-800 text-white rounded-xl px-4 py-2 text-sm border border-gray-700 focus:outline-none focus:border-yellow-400" />
      </header>

      <main className="p-4">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <p className="text-gray-400 text-sm animate-pulse">Loading inventory...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
                  {CATEGORY_LABELS[category] ?? category}
                </h2>
                <div className="space-y-2">
                  {items.map(baseRow => {
                    const row = getRow(baseRow.product_id)
                    const isDirty = !!edits[row.product_id]
                    const isSaved = savedIds.has(row.product_id)
                    const isSaving = saving === row.product_id
                    const totalUnits = row.unit_type === 'weight_lb'
                      ? row.weight_lbs_on_hand
                      : row.cases_on_hand * row.units_per_case + row.units_on_hand
                    const isLow = row.unit_type !== 'weight_lb' && totalUnits <= row.units_per_case

                    return (
                      <div key={row.product_id}
                        className="bg-gray-900 rounded-xl p-3 border"
                        style={{ borderColor: isLow && totalUnits > 0 ? '#f59e0b' : isSaved ? '#16a34a' : '#374151' }}>

                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{row.product_name}</p>
                            <p className="text-xs text-gray-500">{row.sku}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-2 shrink-0">
                            {isLow && totalUnits > 0 && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-900 text-amber-300">Low</span>
                            )}
                            {totalUnits === 0 && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-900 text-red-300">Out</span>
                            )}
                            {isSaved && (
                              <span className="text-xs font-bold" style={{ color: '#4ade80' }}>✓ Saved</span>
                            )}
                          </div>
                        </div>

                        {row.unit_type === 'weight_lb' ? (
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <label className="text-xs text-gray-400">Weight on hand (lbs)</label>
                              <input
                                type="number" step="0.1" min="0"
                                value={row.weight_lbs_on_hand}
                                onChange={e => handleEdit(row.product_id, 'weight_lbs_on_hand', parseFloat(e.target.value) || 0)}
                                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-yellow-400 mt-1"
                              />
                            </div>
                            <button
                              onClick={() => saveRow(row.product_id)}
                              disabled={!isDirty || isSaving}
                              className="mt-5 px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-30"
                              style={{ backgroundColor: isDirty ? '#f5c518' : '#1f2937', color: isDirty ? '#060d1f' : '#9ca3af' }}>
                              {isSaving ? '...' : 'Save'}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-end gap-2">
                            <div className="flex-1">
                              <label className="text-xs text-gray-400">Cases</label>
                              <input
                                type="number" min="0"
                                value={row.cases_on_hand}
                                onChange={e => handleEdit(row.product_id, 'cases_on_hand', parseInt(e.target.value) || 0)}
                                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-yellow-400 mt-1"
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-xs text-gray-400">Loose ({row.unit_type === 'bag' ? 'bags' : 'pcs'})</label>
                              <input
                                type="number" min="0"
                                value={row.units_on_hand}
                                onChange={e => handleEdit(row.product_id, 'units_on_hand', parseInt(e.target.value) || 0)}
                                className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700 focus:outline-none focus:border-yellow-400 mt-1"
                              />
                            </div>
                            <div className="text-center px-2">
                              <p className="text-xs text-gray-400">Total</p>
                              <p className="text-sm font-bold mt-1" style={{ color: totalUnits > 0 ? '#f5c518' : '#ef4444' }}>
                                {totalUnits}
                              </p>
                            </div>
                            <button
                              onClick={() => saveRow(row.product_id)}
                              disabled={!isDirty || isSaving}
                              className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-30 mb-0.5"
                              style={{ backgroundColor: isDirty ? '#f5c518' : '#1f2937', color: isDirty ? '#060d1f' : '#9ca3af' }}>
                              {isSaving ? '...' : 'Save'}
                            </button>
                          </div>
                        )}

                        {row.unit_type !== 'weight_lb' && (
                          <p className="text-xs text-gray-600 mt-1">{row.units_per_case} per case</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
