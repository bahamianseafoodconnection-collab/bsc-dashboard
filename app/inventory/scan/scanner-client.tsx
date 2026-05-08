'use client';

// app/inventory/scan/scanner-client.tsx
// Client-side inventory scanner. Manual entry works with hardware barcode
// scanners (they emit keystrokes ending in Enter into the focused input).
//
// Flow:
//   1. Staff types/scans a barcode -> GET /api/barcode/[code]
//   2. Product preview renders with name + image (if any)
//   3. Staff picks location, quantity, unit, optional notes
//   4. Submit -> POST /api/inventory-movement (which inserts into inventory_movements)

import { useEffect, useRef, useState } from 'react';

const NAVY = '#060e1c';
const PANEL = '#0f1a2e';
const GOLD = '#c8860f';
const GOLD_BRIGHT = '#f4c842';
const TEXT_DIM = 'rgba(255,255,255,0.55)';
const BORDER = 'rgba(255,255,255,0.08)';
const RED = '#f87171';
const GREEN = '#4ade80';

type Product = {
  id: string | null;
  sku: string;
  barcode: string;
  name: string;
  description: string;
  image_url: string | null;
  unit_of_measure: string | null;
  exists_in_db: boolean;
};

type Location = { id: string; code: string; name: string };

type FlashMessage = { kind: 'success' | 'error' | 'info'; text: string } | null;

const UNIT_OPTIONS = ['lb', 'kg', 'case', 'box', 'unit', 'gal'];

export default function ScannerClient() {
  const [barcode, setBarcode] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [productNameDraft, setProductNameDraft] = useState('');
  const [skuDraft, setSkuDraft] = useState('');

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [unit, setUnit] = useState<string>('lb');
  const [notes, setNotes] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<FlashMessage>(null);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Load locations + focus the barcode input on mount.
  useEffect(() => {
    barcodeInputRef.current?.focus();
    (async () => {
      try {
        const res = await fetch('/api/locations', { cache: 'no-store' });
        const json = await res.json();
        if (res.ok && Array.isArray(json.locations)) {
          setLocations(json.locations);
          if (json.locations.length > 0) {
            setLocationId(json.locations[0].id);
          }
        } else {
          setFlash({ kind: 'error', text: json.error || 'Could not load locations.' });
        }
      } catch {
        setFlash({ kind: 'error', text: 'Network error loading locations.' });
      }
    })();
  }, []);

  async function lookupBarcode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;

    setLookingUp(true);
    setFlash(null);
    setProduct(null);

    try {
      const res = await fetch(`/api/barcode/${encodeURIComponent(trimmed)}`, {
        cache: 'no-store',
      });
      const json = await res.json();

      if (!res.ok) {
        setFlash({ kind: 'error', text: json.error || 'Lookup failed.' });
        setLookingUp(false);
        return;
      }

      const p: Product = {
        id: json.id ?? null,
        sku: json.sku ?? '',
        barcode: json.barcode ?? trimmed,
        name: json.name ?? '',
        description: json.description ?? '',
        image_url: json.image_url ?? null,
        unit_of_measure: json.unit_of_measure ?? null,
        exists_in_db: Boolean(json.exists_in_db),
      };
      setProduct(p);
      setProductNameDraft(p.name);
      setSkuDraft(p.sku);
      if (p.unit_of_measure && UNIT_OPTIONS.includes(p.unit_of_measure)) {
        setUnit(p.unit_of_measure);
      }

      if (!p.exists_in_db) {
        setFlash({
          kind: 'info',
          text: 'New barcode — fill in the name to create the product on save.',
        });
      }
    } catch {
      setFlash({ kind: 'error', text: 'Network error during lookup.' });
    } finally {
      setLookingUp(false);
    }
  }

  function resetForNextScan() {
    setBarcode('');
    setProduct(null);
    setProductNameDraft('');
    setSkuDraft('');
    setQuantity('');
    setNotes('');
    barcodeInputRef.current?.focus();
  }

  async function submitMovement() {
    if (!product) return;
    if (!locationId) {
      setFlash({ kind: 'error', text: 'Pick a destination location.' });
      return;
    }
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      setFlash({ kind: 'error', text: 'Enter a quantity greater than zero.' });
      return;
    }
    if (!product.exists_in_db && !productNameDraft.trim()) {
      setFlash({ kind: 'error', text: 'New product needs a name.' });
      return;
    }

    setSubmitting(true);
    setFlash(null);

    try {
      const res = await fetch('/api/inventory-movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movement_type: 'receive',
          barcode: product.barcode,
          product_id: product.id,
          sku: skuDraft || product.sku,
          name: productNameDraft || product.name,
          to_location_id: locationId,
          quantity: qty,
          unit,
          notes,
          create_if_new: !product.exists_in_db,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setFlash({ kind: 'error', text: json.error || 'Save failed.' });
        setSubmitting(false);
        return;
      }

      const mvNumber = json.movement?.movement_number || json.movement?.id || 'saved';
      setFlash({
        kind: 'success',
        text: `Recorded ${qty} ${unit} of ${productNameDraft || product.name} (${mvNumber}).`,
      });
      resetForNextScan();
    } catch {
      setFlash({ kind: 'error', text: 'Network error during save.' });
    } finally {
      setSubmitting(false);
    }
  }

  const flashColor =
    flash?.kind === 'success' ? GREEN : flash?.kind === 'error' ? RED : GOLD_BRIGHT;
  const flashBg =
    flash?.kind === 'success'
      ? 'rgba(74,222,128,0.08)'
      : flash?.kind === 'error'
        ? 'rgba(248,113,113,0.08)'
        : 'rgba(244,200,66,0.08)';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: NAVY,
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, "DM Sans", sans-serif',
        padding: '24px 16px 80px',
      }}
    >
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 3,
              color: GOLD,
              fontWeight: 700,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            BSC · Inventory
          </div>
          <h1
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: 28,
              fontWeight: 700,
              margin: 0,
            }}
          >
            Receive Stock
          </h1>
          <p style={{ fontSize: 13, color: TEXT_DIM, margin: '6px 0 0' }}>
            Scan or type a barcode, confirm details, and record the receipt.
          </p>
        </div>

        {/* Flash */}
        {flash && (
          <div
            style={{
              background: flashBg,
              border: `1px solid ${flashColor}33`,
              color: flashColor,
              borderRadius: 10,
              padding: '12px 14px',
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 16,
            }}
          >
            {flash.text}
          </div>
        )}

        {/* Barcode entry */}
        <div
          style={{
            background: PANEL,
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            padding: 18,
            marginBottom: 16,
          }}
        >
          <label
            style={{
              display: 'block',
              fontSize: 11,
              letterSpacing: 1,
              color: TEXT_DIM,
              fontWeight: 700,
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Barcode
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              lookupBarcode(barcode);
            }}
            style={{ display: 'flex', gap: 8 }}
          >
            <input
              ref={barcodeInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Scan or type then press Enter"
              style={{
                flex: 1,
                padding: '13px 14px',
                borderRadius: 10,
                border: `1.5px solid ${BORDER}`,
                background: 'rgba(255,255,255,0.04)',
                color: '#fff',
                fontSize: 15,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={lookingUp || !barcode.trim()}
              style={{
                padding: '0 18px',
                borderRadius: 10,
                border: 'none',
                background: lookingUp || !barcode.trim() ? '#4b5563' : GOLD_BRIGHT,
                color: NAVY,
                fontWeight: 800,
                fontSize: 13,
                cursor: lookingUp || !barcode.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {lookingUp ? '...' : 'Look up'}
            </button>
          </form>
        </div>

        {/* Product preview + receive form */}
        {product && (
          <div
            style={{
              background: PANEL,
              border: `1px solid ${BORDER}`,
              borderRadius: 14,
              padding: 18,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt=""
                  style={{
                    width: 72,
                    height: 72,
                    objectFit: 'cover',
                    borderRadius: 10,
                    border: `1px solid ${BORDER}`,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 10,
                    border: `1px solid ${BORDER}`,
                    background: 'rgba(255,255,255,0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 26,
                    color: TEXT_DIM,
                  }}
                >
                  📦
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: 1,
                    color: product.exists_in_db ? GREEN : GOLD_BRIGHT,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  {product.exists_in_db ? 'In catalog' : 'New product'}
                </div>
                <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 4 }}>
                  Barcode {product.barcode}
                </div>
                {product.description && (
                  <div
                    style={{
                      fontSize: 12,
                      color: TEXT_DIM,
                      marginTop: 4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {product.description}
                  </div>
                )}
              </div>
            </div>

            <FieldLabel>Product name</FieldLabel>
            <input
              type="text"
              value={productNameDraft}
              onChange={(e) => setProductNameDraft(e.target.value)}
              placeholder="e.g. Tropic Snapper Portion 6/8oz"
              style={inputStyle}
            />

            <FieldLabel>SKU (optional)</FieldLabel>
            <input
              type="text"
              value={skuDraft}
              onChange={(e) => setSkuDraft(e.target.value)}
              placeholder="Leave blank to auto-assign"
              style={inputStyle}
            />

            <FieldLabel>Destination location</FieldLabel>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              style={{ ...inputStyle, appearance: 'none' }}
            >
              {locations.length === 0 && <option value="">Loading...</option>}
              {locations.map((l) => (
                <option key={l.id} value={l.id} style={{ background: PANEL }}>
                  {l.code} · {l.name}
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 2 }}>
                <FieldLabel>Quantity</FieldLabel>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0.00"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <FieldLabel>Unit</FieldLabel>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  style={{ ...inputStyle, appearance: 'none' }}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u} style={{ background: PANEL }}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <FieldLabel>Notes (optional)</FieldLabel>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Supplier, PO #, condition, anything worth remembering"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                type="button"
                onClick={resetForNextScan}
                disabled={submitting}
                style={{
                  flex: 1,
                  padding: '13px 0',
                  borderRadius: 10,
                  border: `1px solid ${BORDER}`,
                  background: 'transparent',
                  color: TEXT_DIM,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitMovement}
                disabled={submitting}
                style={{
                  flex: 2,
                  padding: '13px 0',
                  borderRadius: 10,
                  border: 'none',
                  background: submitting ? '#4b5563' : GOLD_BRIGHT,
                  color: NAVY,
                  fontWeight: 900,
                  fontSize: 14,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Saving...' : 'Record receipt'}
              </button>
            </div>
          </div>
        )}

        {!product && !lookingUp && (
          <p
            style={{
              textAlign: 'center',
              color: TEXT_DIM,
              fontSize: 12,
              marginTop: 24,
            }}
          >
            Hardware scanners are supported — keep this input focused.
          </p>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'block',
        fontSize: 11,
        letterSpacing: 1,
        color: TEXT_DIM,
        fontWeight: 700,
        textTransform: 'uppercase',
        margin: '14px 0 6px',
      }}
    >
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: `1.5px solid ${BORDER}`,
  background: 'rgba(255,255,255,0.04)',
  color: '#fff',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
};
