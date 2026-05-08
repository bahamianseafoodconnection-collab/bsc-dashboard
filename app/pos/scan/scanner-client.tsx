'use client';

// app/pos/scan/scanner-client.tsx
// BSC POS Scanner - v4.2 hardened: ASCII-clean inputs, decimal sanitizers,
// diagnostic error reporting. iOS Safari-safe.

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

// -------------------------------------------------------------
// Types
// -------------------------------------------------------------

type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category: string;
  unit_of_measure: string;
  pack_size: string | null;
  image_url: string | null;
  status: string;
  is_bsc_processed: boolean;
  sell_nassau: boolean;
  sell_andros: boolean;
  sell_online: boolean;
  sell_wholesale: boolean;
};

type CostInfo = { cost_per_unit: number } | null;

type PricingInfo = {
  channel: string;
  pricing_mode: string;
  margin_multiplier: number;
  vat_multiplier: number;
  manual_unit_price: number | null;
};

type LookupResult = {
  product: Product | null;
  cost: CostInfo;
  pricing: PricingInfo[];
};

type UserRecord = {
  id: string;
  email: string;
  role: string;
};

type ChannelKey = 'nassau_pos' | 'andros_pos' | 'online_market' | 'local_wholesale';

type OnboardChannelState = {
  enabled: boolean;
  margin: string;
  vat: string;
};

// -------------------------------------------------------------
// Constants
// -------------------------------------------------------------

const CATEGORY_OPTIONS = [
  { v: 'fresh_seafood', l: 'Fresh Seafood' },
  { v: 'frozen_seafood', l: 'Frozen Seafood' },
  { v: 'processed_seafood', l: 'Processed Seafood' },
  { v: 'meat', l: 'Meat' },
  { v: 'produce', l: 'Produce' },
  { v: 'juice_smoothie', l: 'Juice / Smoothie' },
  { v: 'wellness_shot', l: 'Wellness Shot' },
  { v: 'grocery', l: 'Grocery' },
  { v: 'snack', l: 'Snack' },
  { v: 'beverage', l: 'Beverage' },
  { v: 'household', l: 'Household' },
  { v: 'toiletry', l: 'Toiletry' },
];

const UNIT_OPTIONS = ['lb', 'kg', 'g', 'oz', 'each', 'case', 'bag', 'box'];

const CHANNEL_LABELS: Record<ChannelKey, string> = {
  nassau_pos: 'Nassau POS',
  andros_pos: 'Andros POS',
  online_market: 'Online Market',
  local_wholesale: 'Wholesale',
};

const CHANNEL_DEFAULTS: Record<ChannelKey, { margin: number; vat: number }> = {
  nassau_pos: { margin: 1.38, vat: 1.0 },
  andros_pos: { margin: 1.43, vat: 1.0 },
  online_market: { margin: 1.25, vat: 1.0 },
  local_wholesale: { margin: 1.12, vat: 1.0 },
};

const ALL_CHANNELS: ChannelKey[] = [
  'nassau_pos',
  'andros_pos',
  'online_market',
  'local_wholesale',
];

const MANAGER_ROLES = ['founder', 'co_founder', 'manager'];
const PHOTO_ROLES = [
  'founder',
  'co_founder',
  'manager',
  'cashier',
  'right_hand',
  'supervisor',
  'processor',
  'andros_staff',
];

const EDIT_API = '/api/inventory/movements/update';
const ONBOARD_API = '/api/inventory/onboard';

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createBrowserClient(url, key);
}

function computePrice(p: PricingInfo, cost: number | null): number {
  if (p.pricing_mode === 'manual_override' && p.manual_unit_price != null) {
    return Number(p.manual_unit_price);
  }
  if (cost != null) {
    return cost * Number(p.margin_multiplier) * Number(p.vat_multiplier);
  }
  if (p.manual_unit_price != null) return Number(p.manual_unit_price);
  return 0;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

// Strip everything that isn't a digit or a decimal point. Keep one decimal max.
function sanitizeDecimal(input: string): string {
  let cleaned = input.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned.slice(firstDot + 1).replace(/\./g, '');
  }
  return cleaned;
}

// Allow letters, digits, hyphens, underscores. Strip everything else.
function sanitizeBarcode(input: string): string {
  return input.replace(/[^A-Za-z0-9_-]/g, '');
}

// Strip control characters and lone surrogates that break iOS Safari fetch.
function sanitizeText(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
}

// -------------------------------------------------------------
// Main Component
// -------------------------------------------------------------

export default function ScannerClient() {
  const [user, setUser] = useState<UserRecord | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [barcode, setBarcode] = useState('');
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [directOnboarding, setDirectOnboarding] = useState(false);

  // Auth bootstrap
  useEffect(() => {
    const supabase = getSupabase();
    supabase
      .rpc('get_my_user_record')
      .single<UserRecord>()
      .then(({ data, error }) => {
        if (error || !data) {
          setAuthLoading(false);
          return;
        }
        setUser(data);
        setAuthLoading(false);
      });
  }, []);

  const lookupProduct = useCallback(async (code: string) => {
    setLookingUp(true);
    setLookupError(null);
    setLookupResult(null);
    setPhotoUrl(null);
    setPhotoMsg(null);
    try {
      const supabase = getSupabase();

      const { data: products, error } = await supabase
        .from('products')
        .select(
          'id, sku, barcode, name, description, category, unit_of_measure, pack_size, image_url, status, is_bsc_processed, sell_nassau, sell_andros, sell_online, sell_wholesale'
        )
        .or(`barcode.eq.${code},sku.eq.${code}`)
        .limit(1);

      if (error) throw error;

      const product =
        products && products.length > 0 ? (products[0] as Product) : null;

      if (!product) {
        setLookupResult({ product: null, cost: null, pricing: [] });
        setLookingUp(false);
        return;
      }

      const { data: costRows } = await supabase
        .from('product_costs')
        .select('cost_per_unit')
        .eq('product_id', product.id)
        .eq('is_current', true)
        .limit(1);

      const cost =
        costRows && costRows.length > 0 ? (costRows[0] as CostInfo) : null;

      const { data: pricingRows } = await supabase
        .from('product_pricing')
        .select(
          'channel, pricing_mode, margin_multiplier, vat_multiplier, manual_unit_price'
        )
        .eq('product_id', product.id)
        .eq('is_current', true)
        .eq('is_active', true);

      setLookupResult({
        product,
        cost,
        pricing: (pricingRows || []) as PricingInfo[],
      });
      setPhotoUrl(product.image_url);
      setLookingUp(false);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'Lookup failed');
      setLookingUp(false);
    }
  }, []);

  const handlePhotoUpload = useCallback(
    async (file: File, productId?: string) => {
      if (!user) return;
      setPhotoUploading(true);
      setPhotoMsg(null);
      try {
        const supabase = getSupabase();
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'jpg';
        const path = `products/${Date.now()}-${user.id.slice(0, 8)}.${safeExt}`;

        const { error: upErr } = await supabase.storage
          .from('bsc-uploads')
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;

        const { data: pubData } = supabase.storage
          .from('bsc-uploads')
          .getPublicUrl(path);
        const newUrl = pubData.publicUrl;
        setPhotoUrl(newUrl);

        if (productId) {
          const res = await fetch(EDIT_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'update_image',
              product_id: productId,
              image_url: newUrl,
            }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Failed to save photo');
          setPhotoMsg('Photo saved');
          if (scannedCode) lookupProduct(scannedCode);
        } else {
          setPhotoMsg('Photo ready');
        }
      } catch (e) {
        setPhotoMsg(null);
        alert(
          'Photo upload failed: ' +
            (e instanceof Error ? e.message : 'unknown')
        );
      } finally {
        setPhotoUploading(false);
      }
    },
    [user, scannedCode, lookupProduct]
  );

  function manualLookup() {
    const code = sanitizeBarcode(barcode);
    if (!code) return;
    setScannedCode(code);
    lookupProduct(code);
  }

  function reset() {
    setScannedCode(null);
    setLookupResult(null);
    setLookupError(null);
    setBarcode('');
    setPhotoUrl(null);
    setPhotoMsg(null);
    setEditing(false);
    setOnboarding(false);
    setDirectOnboarding(false);
  }

  const canEditCostPrice = !!user && MANAGER_ROLES.includes(user.role);
  const canTakePhoto = !!user && PHOTO_ROLES.includes(user.role);
  const canOnboard = !!user && PHOTO_ROLES.includes(user.role);

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: '50vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#1a2e5a',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div
        style={{
          minHeight: '50vh',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ fontWeight: 900, color: '#1a2e5a', marginBottom: 8 }}>
          Sign in required
        </div>
        <Link
          href="/staff-login?next=/pos/scan"
          style={{ color: '#1a2e5a', textDecoration: 'underline' }}
        >
          Go to staff login
        </Link>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f8f9fa',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <header
        style={{
          backgroundColor: '#1a2e5a',
          padding: '0 16px',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 56,
            maxWidth: 600,
            margin: '0 auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link
              href="/pos"
              style={{
                color: '#f4c842',
                fontSize: 13,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              &larr; Register
            </Link>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: 15 }}>
                Scanner
              </div>
              <div
                style={{
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: 10,
                }}
              >
                {`${user.role.toUpperCase()} - ${user.email}`}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: 16 }}>
        {!scannedCode && !lookingUp && !lookupResult && !directOnboarding && (
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 20,
              marginBottom: 16,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <div
              style={{
                fontWeight: 900,
                fontSize: 16,
                color: '#1a2e5a',
                textAlign: 'center',
                marginBottom: 4,
              }}
            >
              Enter Barcode or SKU
            </div>
            <div
              style={{
                fontSize: 12,
                color: '#64748b',
                textAlign: 'center',
                marginBottom: 16,
              }}
            >
              Type the barcode, paste from a Bluetooth scanner, or enter the SKU
            </div>

            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(sanitizeBarcode(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') manualLookup();
              }}
              placeholder="e.g. TROPIC-MAHI-79 or 8901234567890"
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              autoCapitalize="characters"
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: 10,
                border: '1.5px solid #e5e7eb',
                fontSize: 16,
                fontFamily: 'monospace',
                marginBottom: 12,
                boxSizing: 'border-box',
              }}
            />

            <button
              onClick={manualLookup}
              disabled={!barcode.trim()}
              style={{
                width: '100%',
                backgroundColor: barcode.trim() ? '#1a2e5a' : '#e5e7eb',
                color: barcode.trim() ? '#f4c842' : '#9ca3af',
                border: 'none',
                borderRadius: 10,
                padding: '14px',
                fontSize: 15,
                fontWeight: 800,
                cursor: barcode.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Look up
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 16,
                marginBottom: 12,
              }}
            >
              <div style={{ flex: 1, height: 1, backgroundColor: '#e5e7eb' }} />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#94a3b8',
                  letterSpacing: 1,
                }}
              >
                OR
              </span>
              <div style={{ flex: 1, height: 1, backgroundColor: '#e5e7eb' }} />
            </div>

            <button
              onClick={() => setDirectOnboarding(true)}
              style={{
                width: '100%',
                backgroundColor: '#fff',
                color: '#1a2e5a',
                border: '2px solid #1a2e5a',
                borderRadius: 10,
                padding: '14px',
                fontSize: 15,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              + Add New Product (Take Photo)
            </button>

            <div
              style={{
                marginTop: 16,
                padding: 12,
                backgroundColor: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: 8,
                fontSize: 11,
                color: '#0369a1',
                lineHeight: 1.5,
              }}
            >
              Tip: For fastest scanning, pair a Bluetooth barcode scanner. It
              types the barcode straight into this field. The Tera HW0002
              ($25-40) is a known-good pick.
            </div>
          </div>
        )}

        {lookingUp && (
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 32,
              textAlign: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <div style={{ color: '#1a2e5a', fontWeight: 700 }}>
              Looking up {scannedCode}...
            </div>
          </div>
        )}

        {lookupError && !lookingUp && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontWeight: 800,
                color: '#991b1b',
                marginBottom: 6,
              }}
            >
              Lookup failed
            </div>
            <div style={{ fontSize: 12, color: '#991b1b' }}>{lookupError}</div>
            <button
              onClick={reset}
              style={{
                marginTop: 12,
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #991b1b',
                backgroundColor: '#fff',
                color: '#991b1b',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        )}

        {lookupResult && lookupResult.product && !lookingUp && !editing && (
          <ProductView
            product={lookupResult.product}
            cost={lookupResult.cost}
            pricing={lookupResult.pricing}
            photoUrl={photoUrl}
            photoUploading={photoUploading}
            photoMsg={photoMsg}
            onPhotoUpload={(f) =>
              handlePhotoUpload(f, lookupResult.product!.id)
            }
            onEditClick={() => setEditing(true)}
            onReset={reset}
            canEdit={canEditCostPrice}
            canTakePhoto={canTakePhoto}
          />
        )}

        {lookupResult && lookupResult.product && editing && (
          <ProductEdit
            product={lookupResult.product}
            cost={lookupResult.cost}
            pricing={lookupResult.pricing}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              if (scannedCode) lookupProduct(scannedCode);
              setEditing(false);
            }}
          />
        )}

        {lookupResult &&
          !lookupResult.product &&
          !lookingUp &&
          !onboarding && (
            <div
              style={{
                backgroundColor: '#fff',
                borderRadius: 16,
                padding: 24,
                marginBottom: 16,
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 16,
                  color: '#1a2e5a',
                  marginBottom: 4,
                }}
              >
                Product not found
              </div>
              <div
                style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}
              >
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 700,
                  }}
                >
                  {scannedCode}
                </span>{' '}
                is not in the catalog yet.
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 20 }}>
                {canEditCostPrice
                  ? 'Onboard it now to make it sellable.'
                  : 'Submit it for Dedrick to review.'}
              </div>

              {canOnboard ? (
                <button
                  onClick={() => setOnboarding(true)}
                  style={{
                    width: '100%',
                    backgroundColor: '#1a2e5a',
                    color: '#f4c842',
                    border: 'none',
                    borderRadius: 10,
                    padding: '14px',
                    fontSize: 15,
                    fontWeight: 800,
                    cursor: 'pointer',
                    marginBottom: 10,
                  }}
                >
                  + Onboard New Product
                </button>
              ) : (
                <div
                  style={{
                    fontSize: 12,
                    color: '#94a3b8',
                    marginBottom: 10,
                  }}
                >
                  Your role cannot onboard new products.
                </div>
              )}

              <button
                onClick={reset}
                style={{
                  width: '100%',
                  backgroundColor: '#fff',
                  color: '#1a2e5a',
                  border: '1.5px solid #1a2e5a',
                  borderRadius: 10,
                  padding: '12px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Try Another Barcode
              </button>
            </div>
          )}

        {lookupResult &&
          !lookupResult.product &&
          onboarding &&
          scannedCode && (
            <ProductOnboard
              initialBarcode={scannedCode}
              barcodeEditable={false}
              photoUrl={photoUrl}
              photoUploading={photoUploading}
              photoMsg={photoMsg}
              onPhotoUpload={(f) => handlePhotoUpload(f)}
              userRole={user.role}
              onCancel={() => setOnboarding(false)}
              onSaved={() => {
                reset();
              }}
            />
          )}

        {directOnboarding && (
          <ProductOnboard
            initialBarcode=""
            barcodeEditable={true}
            photoUrl={photoUrl}
            photoUploading={photoUploading}
            photoMsg={photoMsg}
            onPhotoUpload={(f) => handlePhotoUpload(f)}
            userRole={user.role}
            onCancel={() => {
              setDirectOnboarding(false);
              setPhotoUrl(null);
              setPhotoMsg(null);
            }}
            onSaved={() => {
              reset();
            }}
          />
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// ProductView - existing product display
// -------------------------------------------------------------

function ProductView({
  product,
  cost,
  pricing,
  photoUrl,
  photoUploading,
  photoMsg,
  onPhotoUpload,
  onEditClick,
  onReset,
  canEdit,
  canTakePhoto,
}: {
  product: Product;
  cost: CostInfo;
  pricing: PricingInfo[];
  photoUrl: string | null;
  photoUploading: boolean;
  photoMsg: string | null;
  onPhotoUpload: (f: File) => void;
  onEditClick: () => void;
  onReset: () => void;
  canEdit: boolean;
  canTakePhoto: boolean;
}) {
  const channelTags: { key: ChannelKey; on: boolean }[] = [
    { key: 'nassau_pos', on: product.sell_nassau },
    { key: 'andros_pos', on: product.sell_andros },
    { key: 'online_market', on: product.sell_online },
    { key: 'local_wholesale', on: product.sell_wholesale },
  ];

  return (
    <div
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: product.status === 'active' ? '#16a34a' : '#b45309',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {product.status === 'active' ? 'Found' : product.status}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#1a2e5a',
            backgroundColor: '#f4c842',
            padding: '3px 8px',
            borderRadius: 6,
            letterSpacing: 0.5,
          }}
        >
          {product.category.replace(/_/g, ' ').toUpperCase()}
        </span>
      </div>

      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={product.name}
          style={{
            width: '100%',
            maxHeight: 240,
            objectFit: 'cover',
            borderRadius: 10,
            marginBottom: 12,
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: 140,
            backgroundColor: '#f8fafc',
            border: '2px dashed #cbd5e1',
            borderRadius: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          No product photo yet
        </div>
      )}

      {canTakePhoto && (
        <PhotoUploadButton
          uploading={photoUploading}
          onFile={onPhotoUpload}
          hasPhoto={!!photoUrl}
        />
      )}
      {photoMsg && (
        <div
          style={{
            marginTop: 6,
            padding: 8,
            backgroundColor: '#dcfce7',
            border: '1px solid #86efac',
            borderRadius: 6,
            fontSize: 12,
            color: '#166534',
            textAlign: 'center',
            fontWeight: 700,
          }}
        >
          {photoMsg}
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          fontWeight: 900,
          fontSize: 18,
          color: '#1a2e5a',
          marginBottom: 4,
        }}
      >
        {product.name}
      </div>
      <div
        style={{
          fontSize: 12,
          color: '#94a3b8',
          fontFamily: 'monospace',
          marginBottom: 16,
        }}
      >
        SKU: {product.sku}
        {product.barcode ? ` - Barcode: ${product.barcode}` : ''}
      </div>

      <div
        style={{
          borderTop: '1px solid #f0f0f0',
          paddingTop: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 4,
          }}
        >
          Cost
        </div>
        {cost ? (
          <div style={{ fontSize: 16, fontWeight: 900, color: '#1a2e5a' }}>
            ${Number(cost.cost_per_unit).toFixed(4)} per{' '}
            {product.unit_of_measure}
          </div>
        ) : (
          <div
            style={{ fontSize: 13, color: '#ef4444', fontWeight: 700 }}
          >
            No cost recorded yet
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: '1px solid #f0f0f0',
          paddingTop: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 8,
          }}
        >
          Pricing
        </div>
        {pricing.length === 0 ? (
          <div
            style={{ fontSize: 13, color: '#ef4444', fontWeight: 700 }}
          >
            No pricing configured
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6,
            }}
          >
            {pricing.map((p) => {
              const px = computePrice(
                p,
                cost ? Number(cost.cost_per_unit) : null
              );
              return (
                <div
                  key={p.channel}
                  style={{
                    backgroundColor: '#f0f9ff',
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#0369a1',
                      marginBottom: 2,
                    }}
                  >
                    {CHANNEL_LABELS[p.channel as ChannelKey] || p.channel}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 900,
                      color: '#1a2e5a',
                    }}
                  >
                    {px > 0 ? `$${fmt(px)}` : '-'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: '1px solid #f0f0f0',
          paddingTop: 12,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 8,
          }}
        >
          Sells On
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {channelTags.map((c) => (
            <span
              key={c.key}
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: 6,
                backgroundColor: c.on ? '#dcfce7' : '#f1f5f9',
                color: c.on ? '#166534' : '#94a3b8',
                border: c.on ? '1px solid #86efac' : '1px solid #e2e8f0',
              }}
            >
              {CHANNEL_LABELS[c.key]} {c.on ? 'ON' : 'OFF'}
            </span>
          ))}
        </div>
      </div>

      {canEdit ? (
        <button
          onClick={onEditClick}
          style={{
            width: '100%',
            marginTop: 10,
            backgroundColor: '#1a2e5a',
            color: '#f4c842',
            border: 'none',
            borderRadius: 10,
            padding: '14px',
            fontSize: 14,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Edit Cost / Price / Channels
        </button>
      ) : (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            backgroundColor: '#f8fafc',
            borderRadius: 8,
            fontSize: 12,
            color: '#64748b',
            textAlign: 'center',
          }}
        >
          Cost & price editing requires manager role.
        </div>
      )}

      <button
        onClick={onReset}
        style={{
          width: '100%',
          marginTop: 8,
          backgroundColor: '#fff',
          color: '#1a2e5a',
          border: '1.5px solid #1a2e5a',
          borderRadius: 10,
          padding: '12px',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Look up Another
      </button>
    </div>
  );
}

// -------------------------------------------------------------
// PhotoUploadButton - camera + file picker
// -------------------------------------------------------------

function PhotoUploadButton({
  uploading,
  onFile,
  hasPhoto,
}: {
  uploading: boolean;
  onFile: (f: File) => void;
  hasPhoto: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />

      <button
        onClick={() => cameraRef.current?.click()}
        disabled={uploading}
        style={{
          backgroundColor: '#1a2e5a',
          color: '#f4c842',
          border: 'none',
          borderRadius: 10,
          padding: '12px',
          fontSize: 13,
          fontWeight: 800,
          cursor: uploading ? 'not-allowed' : 'pointer',
          opacity: uploading ? 0.6 : 1,
        }}
      >
        {uploading
          ? 'Uploading...'
          : hasPhoto
          ? 'Replace Photo'
          : 'Take Photo'}
      </button>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{
          backgroundColor: '#fff',
          color: '#1a2e5a',
          border: '1.5px solid #1a2e5a',
          borderRadius: 10,
          padding: '12px',
          fontSize: 13,
          fontWeight: 700,
          cursor: uploading ? 'not-allowed' : 'pointer',
          opacity: uploading ? 0.6 : 1,
        }}
      >
        Upload File
      </button>
    </div>
  );
}

// -------------------------------------------------------------
// ProductEdit - manager+ only
// -------------------------------------------------------------

function ProductEdit({
  product,
  cost,
  onCancel,
  onSaved,
}: {
  product: Product;
  cost: CostInfo;
  pricing: PricingInfo[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [costInput, setCostInput] = useState<string>(
    cost ? String(cost.cost_per_unit) : ''
  );
  const [channel, setChannel] = useState<ChannelKey>('nassau_pos');
  const [pricingMode, setPricingMode] = useState<'formula' | 'manual_override'>(
    'formula'
  );
  const [margin, setMargin] = useState<string>('1.38');
  const [vat, setVat] = useState<string>('1.00');
  const [manualPrice, setManualPrice] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    const def = CHANNEL_DEFAULTS[channel];
    if (def) {
      setMargin(def.margin.toFixed(2));
      setVat(def.vat.toFixed(2));
    }
  }, [channel]);

  async function callEdit(payload: object) {
    setSaving(true);
    setErr(null);
    setSavedMsg(null);
    try {
      const res = await fetch(EDIT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      let json: { error?: string; message?: string } = {};
      try {
        json = await res.json();
      } catch {
        const txt = await res.text().catch(() => '');
        throw new Error(`Server returned status ${res.status}: ${txt.slice(0, 200) || 'empty response'}`);
      }
      if (!res.ok) throw new Error(json.error || `Server returned status ${res.status}`);
      setSavedMsg(json.message || 'Saved');
      setTimeout(onSaved, 800);
    } catch (e) {
      const errName = e instanceof Error ? e.name : 'Error';
      const msg = e instanceof Error ? e.message : 'Save failed';
      setErr(`${errName}: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, color: '#1a2e5a' }}>
            {product.name}
          </div>
          <div
            style={{
              fontSize: 11,
              color: '#94a3b8',
              fontFamily: 'monospace',
            }}
          >
            {product.sku}
          </div>
        </div>
        <button
          onClick={onCancel}
          style={{
            background: 'none',
            border: 'none',
            fontSize: 22,
            color: '#94a3b8',
            cursor: 'pointer',
            lineHeight: 1,
          }}
          aria-label="Close"
        >
          x
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={lbl}>
          Cost per {product.unit_of_measure} ($)
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            inputMode="decimal"
            value={costInput}
            onChange={(e) => setCostInput(sanitizeDecimal(e.target.value))}
            style={{ ...input, flex: 1 }}
            autoComplete="off"
          />
          <button
            onClick={() =>
              callEdit({
                action: 'update_cost',
                product_id: product.id,
                cost_per_unit: parseFloat(costInput),
              })
            }
            disabled={
              saving || !costInput || isNaN(parseFloat(costInput))
            }
            style={{
              backgroundColor: '#1a2e5a',
              color: '#f4c842',
              border: 'none',
              borderRadius: 8,
              padding: '0 16px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            Save Cost
          </button>
        </div>
      </div>

      <div
        style={{
          marginBottom: 14,
          padding: 14,
          backgroundColor: '#f8fafc',
          borderRadius: 10,
          border: '1px solid #e2e8f0',
        }}
      >
        <label style={lbl}>Channel</label>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as ChannelKey)}
          style={input}
        >
          <option value="nassau_pos">Nassau POS (38%)</option>
          <option value="andros_pos">Andros POS (43%)</option>
          <option value="online_market">Online Market (25%)</option>
          <option value="local_wholesale">Wholesale (12%)</option>
        </select>

        <label style={lbl}>Mode</label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            marginBottom: 10,
          }}
        >
          <button
            onClick={() => setPricingMode('formula')}
            style={modeBtn(pricingMode === 'formula')}
          >
            Formula
          </button>
          <button
            onClick={() => setPricingMode('manual_override')}
            style={modeBtn(pricingMode === 'manual_override')}
          >
            Manual Price
          </button>
        </div>

        {pricingMode === 'formula' ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6,
            }}
          >
            <div>
              <label style={lbl}>Margin</label>
              <input
                type="text"
                inputMode="decimal"
                value={margin}
                onChange={(e) => setMargin(sanitizeDecimal(e.target.value))}
                style={input}
              />
            </div>
            <div>
              <label style={lbl}>VAT</label>
              <input
                type="text"
                inputMode="decimal"
                value={vat}
                onChange={(e) => setVat(sanitizeDecimal(e.target.value))}
                style={input}
              />
            </div>
          </div>
        ) : (
          <input
            type="text"
            inputMode="decimal"
            value={manualPrice}
            onChange={(e) => setManualPrice(sanitizeDecimal(e.target.value))}
            placeholder="$ price per unit"
            style={input}
          />
        )}

        <button
          onClick={() =>
            callEdit({
              action: 'update_price',
              product_id: product.id,
              channel,
              pricing_mode: pricingMode,
              margin_multiplier:
                pricingMode === 'formula' ? parseFloat(margin) : null,
              vat_multiplier: parseFloat(vat) || 1.0,
              manual_unit_price:
                pricingMode === 'manual_override'
                  ? parseFloat(manualPrice)
                  : null,
            })
          }
          disabled={saving}
          style={primaryBtn(saving)}
        >
          {saving
            ? 'Saving...'
            : `Save ${CHANNEL_LABELS[channel]} Price`}
        </button>
      </div>

      <ChannelToggle
        product={product}
        onSave={callEdit}
        saving={saving}
      />

      {savedMsg && (
        <div
          style={{
            backgroundColor: '#dcfce7',
            border: '1px solid #86efac',
            borderRadius: 8,
            padding: 10,
            fontSize: 13,
            color: '#166534',
            fontWeight: 700,
            textAlign: 'center',
            marginBottom: 10,
          }}
        >
          {savedMsg}
        </div>
      )}
      {err && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: 10,
            fontSize: 13,
            color: '#991b1b',
            fontWeight: 700,
            textAlign: 'center',
            marginBottom: 10,
          }}
        >
          {err}
        </div>
      )}

      <button
        onClick={onCancel}
        style={{
          width: '100%',
          marginTop: 12,
          backgroundColor: '#fff',
          color: '#1a2e5a',
          border: '1.5px solid #1a2e5a',
          borderRadius: 10,
          padding: '12px',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Done
      </button>
    </div>
  );
}

// -------------------------------------------------------------
// ChannelToggle
// -------------------------------------------------------------

function ChannelToggle({
  product,
  onSave,
  saving,
}: {
  product: Product;
  onSave: (p: object) => void;
  saving: boolean;
}) {
  const [n, setN] = useState(product.sell_nassau);
  const [a, setA] = useState(product.sell_andros);
  const [o, setO] = useState(product.sell_online);
  const [w, setW] = useState(product.sell_wholesale);

  return (
    <div
      style={{
        marginBottom: 14,
        padding: 14,
        backgroundColor: '#f8fafc',
        borderRadius: 10,
        border: '1px solid #e2e8f0',
      }}
    >
      <div style={{ ...lbl, marginTop: 0 }}>Sales Channels</div>
      {[
        { lab: 'Nassau POS', v: n, s: setN },
        { lab: 'Andros POS', v: a, s: setA },
        { lab: 'Online Market', v: o, s: setO },
        { lab: 'Wholesale', v: w, s: setW },
      ].map((c) => (
        <label
          key={c.lab}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
            borderBottom: '1px solid #f1f5f9',
            cursor: 'pointer',
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: '#1a2e5a',
              fontWeight: 600,
            }}
          >
            {c.lab}
          </span>
          <input
            type="checkbox"
            checked={c.v}
            onChange={(e) => c.s(e.target.checked)}
            style={{ width: 20, height: 20, cursor: 'pointer' }}
          />
        </label>
      ))}
      <button
        onClick={() =>
          onSave({
            action: 'update_channels',
            product_id: product.id,
            sell_nassau: n,
            sell_andros: a,
            sell_online: o,
            sell_wholesale: w,
          })
        }
        disabled={saving}
        style={{ ...primaryBtn(saving), marginTop: 8 }}
      >
        Save Channels
      </button>
    </div>
  );
}

// -------------------------------------------------------------
// ProductOnboard - full 4-channel onboard form
// -------------------------------------------------------------

function ProductOnboard({
  initialBarcode,
  barcodeEditable,
  photoUrl,
  photoUploading,
  photoMsg,
  onPhotoUpload,
  userRole,
  onCancel,
  onSaved,
}: {
  initialBarcode: string;
  barcodeEditable: boolean;
  photoUrl: string | null;
  photoUploading: boolean;
  photoMsg: string | null;
  onPhotoUpload: (f: File) => void;
  userRole: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isManager = MANAGER_ROLES.includes(userRole);

  const [barcode, setBarcode] = useState(initialBarcode);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('frozen_seafood');
  const [unit, setUnit] = useState('lb');
  const [packSize, setPackSize] = useState('');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');

  const [sellNassau, setSellNassau] = useState(true);
  const [sellAndros, setSellAndros] = useState(false);
  const [sellOnline, setSellOnline] = useState(false);
  const [sellWholesale, setSellWholesale] = useState(false);

  const [channelPricing, setChannelPricing] = useState<
    Record<ChannelKey, OnboardChannelState>
  >({
    nassau_pos: { enabled: true, margin: '1.38', vat: '1.00' },
    andros_pos: { enabled: false, margin: '1.43', vat: '1.00' },
    online_market: { enabled: false, margin: '1.25', vat: '1.00' },
    local_wholesale: { enabled: false, margin: '1.12', vat: '1.00' },
  });

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!isManager) return;
    setChannelPricing((prev) => ({
      ...prev,
      nassau_pos: { ...prev.nassau_pos, enabled: sellNassau },
      andros_pos: { ...prev.andros_pos, enabled: sellAndros },
      online_market: { ...prev.online_market, enabled: sellOnline },
      local_wholesale: { ...prev.local_wholesale, enabled: sellWholesale },
    }));
  }, [sellNassau, sellAndros, sellOnline, sellWholesale, isManager]);

  function updateChannelPricing(
    key: ChannelKey,
    field: keyof OnboardChannelState,
    value: string | boolean
  ) {
    setChannelPricing((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  }

  async function submit() {
    const cleanName = sanitizeText(name);
    if (!cleanName || !category || !unit) {
      setErr('Name, category, and unit are required');
      return;
    }
    if (
      !sellNassau &&
      !sellAndros &&
      !sellOnline &&
      !sellWholesale
    ) {
      setErr('Pick at least one channel where this product sells');
      return;
    }

    let costValue: number | null = null;
    if (cost) {
      const parsed = parseFloat(cost);
      if (isNaN(parsed) || parsed < 0) {
        setErr('Cost must be a positive number like 5.50 (digits and one decimal point only)');
        return;
      }
      costValue = parsed;
    }

    let finalBarcode = sanitizeBarcode(barcode);
    if (!finalBarcode) {
      const stamp = Date.now().toString().slice(-8);
      finalBarcode = `BSC-${stamp}`;
    }

    setSaving(true);
    setErr(null);

    try {
      const pricing: Array<{
        channel: ChannelKey;
        pricing_mode: 'formula';
        margin_multiplier: number;
        vat_multiplier: number;
      }> = [];

      if (isManager && costValue !== null) {
        for (const ch of ALL_CHANNELS) {
          const cp = channelPricing[ch];
          if (!cp.enabled) continue;
          const m = parseFloat(cp.margin);
          const v = parseFloat(cp.vat);
          if (isNaN(m) || m <= 0) continue;
          pricing.push({
            channel: ch,
            pricing_mode: 'formula',
            margin_multiplier: m,
            vat_multiplier: isNaN(v) ? 1.0 : v,
          });
        }
      }

      const payload = {
        barcode: finalBarcode,
        name: cleanName,
        category,
        unit_of_measure: unit,
        pack_size: sanitizeText(packSize) || null,
        description: sanitizeText(description) || null,
        image_url: photoUrl || null,
        cost_per_unit: costValue,
        sell_nassau: sellNassau,
        sell_andros: sellAndros,
        sell_online: sellOnline,
        sell_wholesale: sellWholesale,
        pricing,
      };

      let res: Response;
      try {
        res = await fetch(ONBOARD_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (netErr) {
        const msg = netErr instanceof Error ? netErr.message : 'Network error';
        throw new Error(`Network: ${msg}`);
      }

      let json: { error?: string; message?: string } = {};
      try {
        json = await res.json();
      } catch {
        const txt = await res.text().catch(() => '');
        throw new Error(`Server returned status ${res.status}: ${txt.slice(0, 200) || 'empty response'}`);
      }

      if (!res.ok) {
        throw new Error(json.error || `Server returned status ${res.status}`);
      }

      setDone(json.message || 'Saved.');
      setTimeout(onSaved, 1500);
    } catch (e) {
      const errName = e instanceof Error ? e.name : 'Error';
      const msg = e instanceof Error ? e.message : 'Onboard failed';
      setErr(`${errName}: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  const costNum = parseFloat(cost || '0');

  return (
    <div
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div>
          <div
            style={{
              fontWeight: 900,
              fontSize: 16,
              color: '#1a2e5a',
            }}
          >
            Onboard Product
          </div>
          {!barcodeEditable && (
            <div
              style={{
                fontSize: 11,
                color: '#94a3b8',
                fontFamily: 'monospace',
              }}
            >
              Barcode: {barcode}
            </div>
          )}
        </div>
        <button
          onClick={onCancel}
          style={{
            background: 'none',
            border: 'none',
            fontSize: 22,
            color: '#94a3b8',
            cursor: 'pointer',
            lineHeight: 1,
          }}
          aria-label="Close"
        >
          x
        </button>
      </div>

      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt="product"
          style={{
            width: '100%',
            maxHeight: 200,
            objectFit: 'cover',
            borderRadius: 10,
            marginBottom: 10,
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: 120,
            backgroundColor: '#f8fafc',
            border: '2px dashed #cbd5e1',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a3b8',
            fontSize: 13,
            marginBottom: 10,
          }}
        >
          No photo yet - take or upload one
        </div>
      )}

      <PhotoUploadButton
        uploading={photoUploading}
        onFile={onPhotoUpload}
        hasPhoto={!!photoUrl}
      />
      {photoMsg && (
        <div
          style={{
            marginTop: 6,
            padding: 8,
            backgroundColor: '#dcfce7',
            border: '1px solid #86efac',
            borderRadius: 6,
            fontSize: 12,
            color: '#166534',
            textAlign: 'center',
            fontWeight: 700,
          }}
        >
          {photoMsg}
        </div>
      )}

      <div
        style={{
          borderTop: '1px solid #f0f0f0',
          marginTop: 12,
          paddingTop: 12,
        }}
      >
        {barcodeEditable && (
          <>
            <label style={lbl}>Barcode / SKU</label>
            <input
              value={barcode}
              onChange={(e) => setBarcode(sanitizeBarcode(e.target.value))}
              placeholder="Leave blank to auto-generate (BSC-xxxxxxxx)"
              style={{ ...input, fontFamily: 'monospace' }}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
            <div
              style={{
                fontSize: 10,
                color: '#94a3b8',
                marginTop: -2,
                marginBottom: 8,
                lineHeight: 1.4,
              }}
            >
              Type a manufacturer UPC, your own SKU, or leave blank for an
              auto-generated BSC code.
            </div>
          </>
        )}

        <label style={lbl}>Product Name *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Mahi Steaks 1lb"
          style={input}
        />

        <label style={lbl}>Category *</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={input}
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.v} value={c.v}>
              {c.l}
            </option>
          ))}
        </select>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}
        >
          <div>
            <label style={lbl}>Unit *</label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              style={input}
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={lbl}>Pack Size</label>
            <input
              value={packSize}
              onChange={(e) => setPackSize(e.target.value)}
              placeholder="e.g. 2 lb bag"
              style={input}
            />
          </div>
        </div>

        <label style={lbl}>Description</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional product description"
          style={input}
        />

        <label style={lbl}>Initial Cost ($ per {unit})</label>
        <input
          type="text"
          inputMode="decimal"
          value={cost}
          onChange={(e) => setCost(sanitizeDecimal(e.target.value))}
          placeholder="e.g. 4.50"
          style={input}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 14,
          backgroundColor: '#f8fafc',
          borderRadius: 10,
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ ...lbl, marginTop: 0 }}>
          Where Does This Product Sell?
        </div>
        {[
          {
            lab: 'Nassau POS (38%)',
            v: sellNassau,
            s: setSellNassau,
            k: 'nassau_pos' as ChannelKey,
          },
          {
            lab: 'Andros POS (43%)',
            v: sellAndros,
            s: setSellAndros,
            k: 'andros_pos' as ChannelKey,
          },
          {
            lab: 'Online Market (25%)',
            v: sellOnline,
            s: setSellOnline,
            k: 'online_market' as ChannelKey,
          },
          {
            lab: 'Wholesale (12%)',
            v: sellWholesale,
            s: setSellWholesale,
            k: 'local_wholesale' as ChannelKey,
          },
        ].map((c) => (
          <label
            key={c.k}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 0',
              borderBottom: '1px solid #f1f5f9',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                fontSize: 13,
                color: '#1a2e5a',
                fontWeight: 600,
              }}
            >
              {c.lab}
            </span>
            <input
              type="checkbox"
              checked={c.v}
              onChange={(e) => c.s(e.target.checked)}
              style={{ width: 20, height: 20, cursor: 'pointer' }}
            />
          </label>
        ))}
      </div>

      {isManager && cost && costNum > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            backgroundColor: '#f0f9ff',
            borderRadius: 10,
            border: '1px solid #bae6fd',
          }}
        >
          <div style={{ ...lbl, marginTop: 0, color: '#0369a1' }}>
            Pricing Per Channel
          </div>
          <div
            style={{
              fontSize: 11,
              color: '#0369a1',
              marginBottom: 10,
              lineHeight: 1.4,
            }}
          >
            Sacred margins pre-filled. Adjust if needed. Only enabled
            channels create a price row.
          </div>

          {ALL_CHANNELS.map((ch) => {
            const cp = channelPricing[ch];
            const m = parseFloat(cp.margin);
            const v = parseFloat(cp.vat);
            const previewPrice =
              !isNaN(m) && !isNaN(v) ? costNum * m * v : 0;

            return (
              <div
                key={ch}
                style={{
                  marginBottom: 10,
                  padding: 10,
                  backgroundColor: '#fff',
                  borderRadius: 8,
                  border: cp.enabled
                    ? '1.5px solid #1a2e5a'
                    : '1px solid #e2e8f0',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: cp.enabled ? 8 : 0,
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: '#1a2e5a',
                    }}
                  >
                    {CHANNEL_LABELS[ch]}
                  </span>
                  <input
                    type="checkbox"
                    checked={cp.enabled}
                    onChange={(e) =>
                      updateChannelPricing(
                        ch,
                        'enabled',
                        e.target.checked
                      )
                    }
                    style={{
                      width: 18,
                      height: 18,
                      cursor: 'pointer',
                    }}
                  />
                </label>

                {cp.enabled && (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 6,
                      }}
                    >
                      <div>
                        <label style={lbl}>Margin</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={cp.margin}
                          onChange={(e) =>
                            updateChannelPricing(
                              ch,
                              'margin',
                              sanitizeDecimal(e.target.value)
                            )
                          }
                          style={input}
                        />
                      </div>
                      <div>
                        <label style={lbl}>VAT</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={cp.vat}
                          onChange={(e) =>
                            updateChannelPricing(
                              ch,
                              'vat',
                              sanitizeDecimal(e.target.value)
                            )
                          }
                          style={input}
                        />
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#0369a1',
                        marginTop: 6,
                        fontWeight: 700,
                      }}
                    >
                      Will price at{' '}
                      <strong>${fmt(previewPrice)}</strong> per {unit}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!isManager && (
        <div
          style={{
            marginTop: 14,
            backgroundColor: '#fef3c7',
            border: '1px solid #fde68a',
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
            color: '#92400e',
            lineHeight: 1.4,
          }}
        >
          Your role submits products as <strong>pending approval</strong>.
          Dedrick will set cost, pricing, and confirm channels before this
          product goes live.
        </div>
      )}

      {err && (
        <div
          style={{
            marginTop: 12,
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: 10,
            fontSize: 13,
            color: '#991b1b',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          {err}
        </div>
      )}
      {done && (
        <div
          style={{
            marginTop: 12,
            backgroundColor: '#dcfce7',
            border: '1px solid #86efac',
            borderRadius: 8,
            padding: 10,
            fontSize: 13,
            color: '#166534',
            fontWeight: 700,
            textAlign: 'center',
          }}
        >
          {done}
        </div>
      )}

      <button
        onClick={submit}
        disabled={saving || !name.trim()}
        style={{ ...primaryBtn(saving), marginTop: 14 }}
      >
        {saving
          ? 'Submitting...'
          : isManager
          ? 'Onboard & Make Live'
          : 'Submit for Approval'}
      </button>
      <button
        onClick={onCancel}
        style={{
          width: '100%',
          marginTop: 8,
          backgroundColor: '#fff',
          color: '#1a2e5a',
          border: '1.5px solid #1a2e5a',
          borderRadius: 10,
          padding: '12px',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  );
}

// -------------------------------------------------------------
// Shared styles
// -------------------------------------------------------------

const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginTop: 10,
  marginBottom: 4,
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1.5px solid #e5e7eb',
  fontSize: 14,
  fontFamily: 'inherit',
  marginBottom: 4,
  boxSizing: 'border-box',
};

function modeBtn(active: boolean): React.CSSProperties {
  return {
    padding: 9,
    borderRadius: 8,
    border: '2px solid',
    borderColor: active ? '#1a2e5a' : '#e5e7eb',
    backgroundColor: active ? '#1a2e5a' : '#fff',
    color: active ? '#f4c842' : '#64748b',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  };
}

function primaryBtn(saving: boolean): React.CSSProperties {
  return {
    width: '100%',
    backgroundColor: saving ? '#e5e7eb' : '#1a2e5a',
    color: saving ? '#9ca3af' : '#f4c842',
    border: 'none',
    borderRadius: 10,
    padding: '12px',
    fontSize: 14,
    fontWeight: 800,
    cursor: saving ? 'not-allowed' : 'pointer',
  };
}
