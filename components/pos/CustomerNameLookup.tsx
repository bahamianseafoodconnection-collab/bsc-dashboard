'use client'

// CustomerNameLookup
//
// At the POS register, cashier types 2+ chars of a customer name and
// sees a dropdown of existing matches (with masked phone + email +
// lifetime totals). Click one → onPick() fires with the full row so
// the parent can autofill the checkout customer block.
//
// Backed by /api/pos/customer-search (service-role to bypass RLS).
// Debounced 250ms so we don't flood the server with every keystroke.
//
// See [[project-customer-name-autocomplete]] memory for design rationale.

import { useState, useEffect, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export interface CustomerMatch {
  id:                       string
  full_name:                string
  phone:                    string | null
  phone_e164:               string | null
  email:                    string | null
  total_orders:             number | null
  total_spent:              number | null
  email_marketing_consent:  boolean | null
  last_seen_at:             string | null
}

interface Props {
  onPick: (c: CustomerMatch) => void
}

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

// Mask phone to last-4 so the cashier confirms the right person without
// leaking the whole number on a public-facing screen.
function maskPhone(p: string | null | undefined): string {
  if (!p) return ''
  const digits = p.replace(/[^0-9]/g, '')
  if (digits.length < 4) return p
  return `••• ${digits.slice(-4)}`
}

function maskEmail(e: string | null | undefined): string {
  if (!e || !e.includes('@')) return ''
  const [u, d] = e.split('@')
  if (u.length <= 2) return `${u[0]}•@${d}`
  return `${u.slice(0, 2)}•••@${d}`
}

export default function CustomerNameLookup({ onPick }: Props) {
  const supabase = getSupabase()
  const [query,     setQuery]     = useState('')
  const [matches,   setMatches]   = useState<CustomerMatch[]>([])
  const [searching, setSearching] = useState(false)
  const [open,      setOpen]      = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const wrapRef     = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setMatches([])
      setSearching(false)
      setOpen(false)
      return
    }
    setSearching(true)
    setOpen(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const accessToken = session?.access_token
        if (!accessToken) { setSearching(false); return }
        const res = await fetch(`/api/pos/customer-search?q=${encodeURIComponent(trimmed)}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        })
        const j = await res.json()
        setMatches(j?.ok ? (j.matches ?? []) : [])
      } catch {
        setMatches([])
      } finally {
        setSearching(false)
      }
    }, 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, supabase])

  // Click-outside closes the dropdown.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function handlePick(m: CustomerMatch) {
    onPick(m)
    setQuery('')
    setMatches([])
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative mb-3">
      <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">
        Search by Name
      </label>
      <input
        type="text"
        placeholder="Start typing (e.g. Patricia)…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => { if (matches.length > 0) setOpen(true) }}
        className="w-full bg-gray-800 text-white rounded-xl px-4 py-2.5 border border-gray-700 text-sm focus:outline-none focus:border-yellow-400"
        autoComplete="off"
      />
      {open && (
        <div className="absolute left-0 right-0 mt-1 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl z-50 max-h-72 overflow-y-auto">
          {searching && matches.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-400 animate-pulse">Searching…</p>
          )}
          {!searching && matches.length === 0 && query.trim().length >= 2 && (
            <p className="px-4 py-3 text-xs text-gray-500">No matches — keep typing or use phone instead.</p>
          )}
          {matches.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => handlePick(m)}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-800 border-b border-gray-800 last:border-b-0">
              <p className="text-sm font-semibold text-white">{m.full_name}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {maskPhone(m.phone_e164 || m.phone)}
                {m.email ? ` · ${maskEmail(m.email)}` : ''}
              </p>
              <p className="text-[10px] text-gray-500 mt-0.5">
                {m.total_orders ?? 0} orders · ${Number(m.total_spent ?? 0).toFixed(2)} lifetime
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
