'use client';

// /admin/inventory
//
// Live inventory spreadsheet — founder direction 2026-05-27:
// "the very same excel spreadsheet information display needs to be
// saved and used for updating, adding products to various channel
// needs to be implemented in my dashboard for adding more items and
// editing."
//
// Mirrors the column layout of Fresh Inventory List.xlsx so it's
// instantly familiar to the founder. One row per product. Inline
// edits autosave per cell. Channel toggles are clickable. Cost-edit
// flows through the existing /api/inventory/receive endpoint so the
// recalc trigger fires and per-channel prices update everywhere.
//
// Phase 1 (this commit): full read-only display + search + nav.
// Phase 2 (next commit): cell-level inline edit (cost, channel
// toggles, name) with autosave.
// Phase 3 (future): bulk select, bulk channel-flip, paste-from-Excel.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface ProductRow {
  id:                   string;
  sku:                  string;
  name:                 string;
  description:          string | null;
  category:             string | null;
  unit_of_measure:      string | null;
  pack_size:            string | null;
  vat_category:         string | null;
  status:               string | null;
  sell_nassau:          boolean;
  sell_andros:          boolean;
  sell_online:          boolean;
  sell_wholesale:       boolean;
  image_url:            string | null;
  primary_supplier_id:  string | null;
  stock_count:          number | null;
  low_stock_threshold:  number | null;
  // Joined / computed
  supplier_name?:       string | null;
  cost_per_unit?:       number | null;
  nassau_price?:        number | null;
  andros_price?:        number | null;
  online_price?:        number | null;
  wholesale_price?:     number | null;
}

type ChannelKey = 'nassau' | 'andros' | 'online' | 'wholesale';

const CATEGORY_OPTIONS = [
  'fresh_seafood', 'frozen_seafood', 'meat', 'frozen_meat',
  'produce', 'grocery', 'spices', 'dry_goods', 'beverages',
] as const;

const UOM_OPTIONS = ['lb', 'each', 'case'] as const;

// Channels shown in the Margins panel (order matters for display).
const MARGIN_CHANNELS = ['nassau_pos', 'andros_pos', 'online_market', 'local_wholesale', 'us_resale'] as const;
const CHANNEL_LABELS: Record<string, string> = {
  nassau_pos:      'Nassau POS',
  andros_pos:      'Andros POS',
  online_market:   'Online /market',
  local_wholesale: 'Local Wholesale',
  us_resale:       'US Resale',
};

// Add-Product modal: maps each "Show on channels" checkbox to its
// pricing_channel enum so the per-channel margin block lines up.
const ADD_CHANNELS: { flag: 'sell_nassau' | 'sell_andros' | 'sell_online' | 'sell_wholesale'; channel: string; label: string }[] = [
  { flag: 'sell_nassau',    channel: 'nassau_pos',      label: 'Nassau POS' },
  { flag: 'sell_andros',    channel: 'andros_pos',      label: 'Andros POS' },
  { flag: 'sell_online',    channel: 'online_market',   label: 'Online /market' },
  { flag: 'sell_wholesale', channel: 'local_wholesale', label: 'Local Wholesale' },
];
const DEFAULT_MARGIN_PCT: Record<string, number> = {
  nassau_pos: 35, andros_pos: 45, online_market: 30, local_wholesale: 20,
};

type SortField = 'sku' | 'name' | 'supplier_name' | 'cost_per_unit' | 'stock_count' | 'online_price';
type SortDir   = 'asc' | 'desc';

export default function AdminInventoryPage() {
  const [rows, setRows]       = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filterSupplier, setFilterSupplier] = useState<string>('');
  const [filterStatus, setFilterStatus]     = useState<string>('active');
  const [error, setError]     = useState<string | null>(null);

  // Phase 2 + 3 — inline edit state. `editingCell` = { id, field } so
  // only ONE cell across the table is in edit mode at a time.
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  // Phase 3 — bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Phase 3 — photo upload (camera / gallery / file — one input,
  // OS picks the right sheet on each platform)
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null);
  const [uploadingId, setUploadingId]         = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase 4 — all-suppliers list (for inline reassign + Add Row modal)
  const [allSuppliers, setAllSuppliers] = useState<Array<{ id: string; name: string; code: string | null }>>([]);
  useEffect(() => {
    supabase.from('suppliers').select('id, name, code').eq('is_active', true).order('name')
      .then(({ data }) => setAllSuppliers((data ?? []) as Array<{ id: string; name: string; code: string | null }>));
  }, []);

  // Phase 4 — sortable columns
  const [sortField, setSortField] = useState<SortField>('sku');
  const [sortDir, setSortDir]     = useState<SortDir>('asc');
  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  // Phase 4 — in-page Add Row modal
  const [showAddRow, setShowAddRow] = useState(false);
  const [addRowForm, setAddRowForm] = useState({
    supplier_id: '', sku: '', name: '', category: 'frozen_seafood' as string,
    unit_of_measure: 'each', pack_size: '',
    cost_per_unit: '', online_sell_price: '', image_url: '', stock_count: '',
    sell_nassau: true, sell_andros: true, sell_online: true, sell_wholesale: false,
  });
  const [addRowSaving, setAddRowSaving] = useState(false);

  // Add-Product modal: per-channel margin % (channel enum → percent string),
  // prefilled from the live channel margins. The founder can override per
  // product; the selling-price preview + the stored price follow this.
  const [addMargins, setAddMargins] = useState<Record<string, string>>({});

  // ─── Per-row Edit modal ──────────────────────────────────────────────
  // Full edit of one product (name / category / UoM / pack / cost / stock /
  // channels / status / photo). Saves changed fields in one PATCH.
  type EditForm = {
    name: string; category: string; unit_of_measure: string; pack_size: string;
    cost_per_unit: string; stock_count: string; status: string;
    sell_nassau: boolean; sell_andros: boolean; sell_online: boolean; sell_wholesale: boolean;
  };
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  function openEdit(r: ProductRow) {
    setEditProductId(r.id);
    setEditForm({
      name: r.name ?? '',
      category: r.category ?? 'frozen_seafood',
      unit_of_measure: r.unit_of_measure ?? 'each',
      pack_size: r.pack_size ?? '',
      cost_per_unit: r.cost_per_unit != null ? String(r.cost_per_unit) : '',
      stock_count: r.stock_count != null ? String(r.stock_count) : '',
      status: r.status ?? 'active',
      sell_nassau: !!r.sell_nassau, sell_andros: !!r.sell_andros,
      sell_online: !!r.sell_online, sell_wholesale: !!r.sell_wholesale,
    });
  }

  async function saveEdit() {
    if (!editProductId || !editForm) return;
    const orig = rows.find((r) => r.id === editProductId);
    if (!orig) return;
    if (!editForm.name.trim()) { showToast(false, 'Name required'); return; }

    // Only send fields that actually changed.
    const patch: Record<string, unknown> = {};
    if (editForm.name.trim() !== (orig.name ?? ''))                    patch.name = editForm.name.trim();
    if (editForm.category !== (orig.category ?? ''))                   patch.category = editForm.category;
    if (editForm.unit_of_measure !== (orig.unit_of_measure ?? ''))     patch.unit_of_measure = editForm.unit_of_measure;
    if ((editForm.pack_size.trim() || null) !== (orig.pack_size ?? null)) patch.pack_size = editForm.pack_size.trim() || null;
    if (editForm.status !== (orig.status ?? ''))                       patch.status = editForm.status;
    for (const k of ['sell_nassau', 'sell_andros', 'sell_online', 'sell_wholesale'] as const) {
      if (editForm[k] !== !!orig[k]) patch[k] = editForm[k];
    }
    const stockNum = editForm.stock_count === '' ? null : Number(editForm.stock_count);
    if (stockNum !== (orig.stock_count ?? null)) {
      if (stockNum !== null && (!Number.isFinite(stockNum) || stockNum < 0)) { showToast(false, 'Stock must be ≥ 0'); return; }
      patch.stock_count = stockNum;
    }
    const costNum = editForm.cost_per_unit === '' ? null : Number(editForm.cost_per_unit);
    const costChanged = costNum !== null && costNum !== (orig.cost_per_unit ?? null);
    if (costChanged) {
      if (!Number.isFinite(costNum) || costNum <= 0) { showToast(false, 'Cost must be > 0'); return; }
      patch.cost_per_unit = costNum;
    }

    if (Object.keys(patch).length === 0) { showToast(false, 'No changes'); setEditProductId(null); setEditForm(null); return; }

    setEditSaving(true);
    try {
      const res = await callPatch(editProductId, patch);
      // Apply to the grid row
      setRows((prev) => prev.map((r) => {
        if (r.id !== editProductId) return r;
        const u: ProductRow = { ...r };
        if (patch.name !== undefined)            u.name = patch.name as string;
        if (patch.category !== undefined)        u.category = patch.category as string;
        if (patch.unit_of_measure !== undefined) u.unit_of_measure = patch.unit_of_measure as string;
        if (patch.pack_size !== undefined)       u.pack_size = patch.pack_size as string | null;
        if (patch.status !== undefined)          u.status = patch.status as string;
        if (patch.stock_count !== undefined)     u.stock_count = patch.stock_count as number | null;
        for (const k of ['sell_nassau', 'sell_andros', 'sell_online', 'sell_wholesale'] as const) {
          if (patch[k] !== undefined) (u[k] as boolean) = patch[k] as boolean;
        }
        if (costChanged) {
          u.cost_per_unit = costNum;
          if (res.new_prices) {
            u.nassau_price    = res.new_prices.nassau_pos      ?? u.nassau_price;
            u.andros_price    = res.new_prices.andros_pos      ?? u.andros_price;
            u.online_price    = res.new_prices.online_market   ?? u.online_price;
            u.wholesale_price = res.new_prices.local_wholesale ?? u.wholesale_price;
          }
        }
        return u;
      }));
      showToast(true, `${orig.sku} updated`);
      setEditProductId(null);
      setEditForm(null);
    } catch (err) {
      showToast(false, `Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setEditSaving(false);
    }
  }

  // Add-Product modal photo upload (camera / gallery / file — one input,
  // no `capture` attribute so the OS offers all three on mobile).
  const addPhotoRef = useRef<HTMLInputElement>(null);
  const [addPhotoUploading, setAddPhotoUploading] = useState(false);

  async function onAddRowPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAddPhotoUploading(true);
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error('File over 12 MB');
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const slug = (addRowForm.sku.trim() || 'new').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const path = `products/${slug}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('site-images')
        .upload(path, file, {
          upsert:       true,
          contentType:  file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          cacheControl: '3600',
        });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('site-images').getPublicUrl(path);
      setAddRowForm((f) => ({ ...f, image_url: urlData.publicUrl }));
      showToast(true, '📸 Photo attached');
    } catch (err) {
      showToast(false, `Photo upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAddPhotoUploading(false);
    }
  }

  // Bump to force the grid to reload prices (e.g. after a margin cascade).
  const [refreshTick, setRefreshTick] = useState(0);

  // ─── Channel margins panel (founder direction 2026-05-28) ────────────
  // Edit a channel's margin %, then apply → reprices ALL products on that
  // channel from current cost × (1 + margin), instantly.
  type MarginRow = { channel: string; margin_pct: number; updated_at?: string | null };
  const [showMargins, setShowMargins]   = useState(false);
  const [margins, setMargins]           = useState<MarginRow[]>([]);
  const [marginDraft, setMarginDraft]   = useState<Record<string, string>>({}); // channel → percent string
  const [marginsLoading, setMarginsLoading] = useState(false);
  const [applyingChannel, setApplyingChannel] = useState<string | null>(null);

  async function loadMargins(): Promise<MarginRow[]> {
    setMarginsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/admin/channel-margins', {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const rows = (json.margins ?? []) as MarginRow[];
      setMargins(rows);
      setMarginDraft(Object.fromEntries(rows.map((m) => [m.channel, String(Math.round(m.margin_pct * 1000) / 10)])));
      return rows;
    } catch (err) {
      showToast(false, `Load margins failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    } finally {
      setMarginsLoading(false);
    }
  }

  function toggleMarginsPanel() {
    const next = !showMargins;
    setShowMargins(next);
    if (next && margins.length === 0) loadMargins();
  }

  async function applyMargin(channel: string) {
    const pctStr = marginDraft[channel] ?? '';
    const pct = Number(pctStr);
    if (!Number.isFinite(pct) || pct < 0 || pct > 500) {
      showToast(false, 'Margin must be a number between 0 and 500%'); return;
    }
    const marginDecimal = Math.round(pct * 100) / 10000; // 35 → 0.35
    const label = CHANNEL_LABELS[channel] ?? channel;
    if (!window.confirm(
      `Apply ${pct}% margin to EVERY active product on ${label}?\n\n` +
      `This reprices each product to its current cost × ${(1 + marginDecimal).toFixed(2)} and takes effect immediately across the site.`
    )) return;

    setApplyingChannel(channel);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/admin/channel-margins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channel, margin_pct: marginDecimal }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      showToast(true, `${label}: ${pct}% applied — ${json.repriced} product${json.repriced === 1 ? '' : 's'} repriced`);
      setMargins((prev) => prev.map((m) => m.channel === channel ? { ...m, margin_pct: marginDecimal } : m));
      setRefreshTick((t) => t + 1); // pull fresh prices into the grid
    } catch (err) {
      showToast(false, `Apply failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setApplyingChannel(null);
    }
  }

  function openAddRow() {
    setAddRowForm({
      supplier_id: '', sku: '', name: '', category: 'frozen_seafood',
      unit_of_measure: 'each', pack_size: '',
      cost_per_unit: '', online_sell_price: '', image_url: '', stock_count: '',
      sell_nassau: true, sell_andros: true, sell_online: true, sell_wholesale: false,
    });
    // Seed the per-channel margin inputs from live margins (fallback to
    // the documented defaults until they load), then refresh from server.
    const seed = (rows: MarginRow[]) => {
      const byCh = new Map(rows.map((m) => [m.channel, Math.round(m.margin_pct * 1000) / 10]));
      setAddMargins(Object.fromEntries(
        ADD_CHANNELS.map(({ channel }) => [channel, String(byCh.get(channel) ?? DEFAULT_MARGIN_PCT[channel] ?? 0)]),
      ));
    };
    seed(margins);
    if (margins.length === 0) loadMargins().then(seed);
    setShowAddRow(true);
  }

  async function submitAddRow() {
    const f = addRowForm;
    if (!f.supplier_id) { showToast(false, 'Pick a supplier'); return; }
    if (!f.sku.trim())  { showToast(false, 'SKU required'); return; }
    if (!f.name.trim()) { showToast(false, 'Name required'); return; }
    const cost  = f.cost_per_unit     === '' ? null : Number(f.cost_per_unit);
    const price = f.online_sell_price === '' ? null : Number(f.online_sell_price);
    if (cost  !== null && (!Number.isFinite(cost)  || cost  < 0)) { showToast(false, 'Cost must be ≥ 0'); return; }
    if (price !== null && (!Number.isFinite(price) || price < 0)) { showToast(false, 'Online price must be ≥ 0'); return; }

    // A product can only GO LIVE on a channel if it has a price there.
    // Selected channels are priced from cost × margin, so a cost is required
    // whenever any channel is ticked — otherwise it'd be flagged-but-unpriced
    // (invisible / blank on POS + /market).
    const selectedLabels = ADD_CHANNELS.filter(({ flag }) => f[flag]).map(({ label }) => label);
    if (selectedLabels.length > 0 && cost === null) {
      showToast(false, `Enter a cost so it can go live on ${selectedLabels.join(', ')} (price = cost × margin), or untick the channels.`);
      return;
    }

    // Per-channel selling prices from the founder's margin blocks:
    // price = cost × (1 + margin%). Only for enabled channels with a cost.
    const channelPrices: Record<string, number> = {};
    if (cost !== null) {
      for (const { flag, channel } of ADD_CHANNELS) {
        if (!f[flag]) continue;
        const m = Number(addMargins[channel]);
        if (Number.isFinite(m) && m >= 0) {
          channelPrices[channel] = Math.round(cost * (1 + m / 100) * 100) / 100;
        }
      }
    }

    setAddRowSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/supplier/add-product', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          supplier_id:       f.supplier_id,
          sku:               f.sku.trim(),
          name:              f.name.trim(),
          category:          f.category,
          unit_of_measure:   f.unit_of_measure.trim(),
          pack_size:         f.pack_size.trim() || undefined,
          cost_per_unit:     cost,
          online_sell_price: price,
          channel_prices:    Object.keys(channelPrices).length > 0 ? channelPrices : undefined,
          image_url:         f.image_url || undefined,
          stock_count:       f.stock_count === '' ? undefined : Number(f.stock_count),
          channels: {
            nassau:    f.sell_nassau,
            andros:    f.sell_andros,
            online:    f.sell_online,
            wholesale: f.sell_wholesale,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      // Reload from the server so the auto-computed per-channel prices show
      // exactly as priced (no hardcoded margin guesses that could drift).
      showToast(true, selectedLabels.length > 0
        ? `${json.sku} added — live on ${selectedLabels.join(', ')}`
        : `${json.sku} — ${f.name} added`);
      setShowAddRow(false);
      setRefreshTick((t) => t + 1);
    } catch (err) {
      showToast(false, `Add failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setAddRowSaving(false);
    }
  }

  function openPhotoPicker(productId: string) {
    setPendingUploadId(productId);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';  // reset so picking the same file fires onChange
      fileInputRef.current.click();
    }
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !pendingUploadId) { setPendingUploadId(null); return; }
    const row = rows.find((r) => r.id === pendingUploadId);
    if (!row) { setPendingUploadId(null); return; }
    setUploadingId(row.id);
    setPendingUploadId(null);
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error('File over 12 MB');
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const slug = row.sku.toLowerCase();
      const path = `products/${slug}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('site-images')
        .upload(path, file, {
          upsert:      true,
          contentType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
          cacheControl: '3600',
        });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('site-images').getPublicUrl(path);
      const newUrl = urlData.publicUrl;
      await callPatch(row.id, { image_url: newUrl });
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, image_url: newUrl } : r));
      showToast(true, `📸 ${row.sku} photo updated`);
    } catch (err) {
      showToast(false, `Photo upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploadingId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function clearSelection() { setSelectedIds(new Set()); }
  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  }

  async function callPatch(productId: string, body: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not signed in');
    const res = await fetch(`/api/admin/products/${productId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body:    JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json as { ok: true; new_prices?: Record<string, number>; updated_fields: string[] };
  }

  // Generic cell-save dispatcher — branches on field
  async function saveCell(row: ProductRow, field: string, rawValue: string) {
    setEditingCell(null);
    let parsedValue: unknown = rawValue;

    if (field === 'cost_per_unit' || field === 'stock_count') {
      const num = Number(rawValue);
      if (!Number.isFinite(num) || num < 0) {
        showToast(false, `${field} must be a non-negative number`);
        return;
      }
      if (field === 'cost_per_unit' && num <= 0) {
        showToast(false, 'Cost must be > 0'); return;
      }
      parsedValue = num;
    }
    if (field === 'name') {
      if (!rawValue.trim()) { showToast(false, 'Name cannot be empty'); return; }
      parsedValue = rawValue.trim();
    }
    // No-op shortcut
    if (parsedValue === (row as unknown as Record<string, unknown>)[field]) return;

    setSavingId(row.id);
    try {
      const res = await callPatch(row.id, { [field]: parsedValue });
      setRows((prev) => prev.map((r) => {
        if (r.id !== row.id) return r;
        const updated = { ...r, [field]: parsedValue } as ProductRow;
        // Cost cascade — also update the per-channel prices from the API response
        if (field === 'cost_per_unit' && res.new_prices) {
          updated.nassau_price    = res.new_prices.nassau_pos      ?? updated.nassau_price;
          updated.andros_price    = res.new_prices.andros_pos      ?? updated.andros_price;
          updated.online_price    = res.new_prices.online_market   ?? updated.online_price;
          updated.wholesale_price = res.new_prices.local_wholesale ?? updated.wholesale_price;
        }
        // Supplier reassign — update the joined supplier_name from the cached list
        if (field === 'primary_supplier_id') {
          const sup = allSuppliers.find((s) => s.id === parsedValue);
          updated.supplier_name = sup?.name ?? null;
        }
        return updated;
      }));
      const niceField = field.replace(/_/g, ' ');
      showToast(true,
        field === 'cost_per_unit'
          ? `Cost saved → channel prices auto-updated`
          : `${niceField} saved`,
      );
    } catch (err) {
      showToast(false, `Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingId(null);
    }
  }

  // Bulk action — archive / channel-flip across all selected rows
  async function bulkApply(patch: Record<string, unknown>, summary: string) {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setSavingId('__bulk__');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await fetch('/api/admin/products/bulk', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ ids, patch }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);

      // Update local rows
      setRows((prev) => prev.map((r) =>
        selectedIds.has(r.id) ? { ...r, ...(patch as Partial<ProductRow>) } : r
      ));
      // If status flipped to archived → also drop them from view if filter is "active"
      if (patch.status === 'archived' && filterStatus === 'active') {
        setRows((prev) => prev.filter((r) => !selectedIds.has(r.id)));
      }
      clearSelection();
      showToast(true, `${json.updated_count} rows · ${summary}`);
    } catch (err) {
      showToast(false, `Bulk failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingId(null);
    }
  }

  async function toggleChannel(row: ProductRow, channel: ChannelKey) {
    const key = `sell_${channel === 'nassau' ? 'nassau' : channel === 'andros' ? 'andros' : channel === 'online' ? 'online' : 'wholesale'}` as const;
    const current = row[key] as boolean;
    setSavingId(row.id);
    // Optimistic flip
    setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, [key]: !current } : r));
    try {
      await callPatch(row.id, { [key]: !current });
      showToast(true, `${row.sku} · ${channel} ${!current ? 'ON' : 'OFF'}`);
    } catch (err) {
      // Revert
      setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, [key]: current } : r));
      showToast(false, `Toggle failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Pull products + supplier name in one go
        const { data: products, error: prodErr } = await supabase
          .from('products')
          .select(`
            id, sku, name, description, category, unit_of_measure, pack_size,
            vat_category, status, sell_nassau, sell_andros, sell_online, sell_wholesale,
            image_url, primary_supplier_id, stock_count, low_stock_threshold,
            suppliers:primary_supplier_id ( name )
          `)
          .eq('status', filterStatus)
          .order('sku');

        if (prodErr) throw prodErr;

        const ids = (products ?? []).map((p) => p.id);
        if (ids.length === 0) {
          if (!cancelled) { setRows([]); setLoading(false); }
          return;
        }

        // Pull current costs + per-channel prices in parallel
        const [costsRes, pricesRes] = await Promise.all([
          supabase.from('product_costs')
            .select('product_id, cost_per_unit')
            .eq('is_current', true)
            .in('product_id', ids),
          supabase.from('product_pricing')
            .select('product_id, channel, manual_unit_price')
            .eq('is_current', true)
            .in('product_id', ids),
        ]);

        const costMap = new Map<string, number>();
        for (const c of (costsRes.data ?? []) as Array<{ product_id: string; cost_per_unit: number | null }>) {
          if (c.cost_per_unit !== null) costMap.set(c.product_id, c.cost_per_unit);
        }
        const priceMap = new Map<string, Map<string, number>>();
        for (const p of (pricesRes.data ?? []) as Array<{ product_id: string; channel: string; manual_unit_price: number | null }>) {
          if (p.manual_unit_price === null) continue;
          let inner = priceMap.get(p.product_id);
          if (!inner) { inner = new Map(); priceMap.set(p.product_id, inner); }
          inner.set(p.channel, p.manual_unit_price);
        }

        type RawSupplierJoin = { name?: string | null } | { name?: string | null }[] | null;
        const merged: ProductRow[] = (products ?? []).map((p) => {
          const sj = (p as unknown as { suppliers: RawSupplierJoin }).suppliers;
          const supplier_name = Array.isArray(sj) ? sj[0]?.name ?? null : sj?.name ?? null;
          const inner = priceMap.get(p.id);
          return {
            ...(p as ProductRow),
            supplier_name,
            cost_per_unit:    costMap.get(p.id) ?? null,
            nassau_price:     inner?.get('nassau_pos')      ?? null,
            andros_price:     inner?.get('andros_pos')      ?? null,
            online_price:     inner?.get('online_market')   ?? null,
            wholesale_price:  inner?.get('local_wholesale') ?? null,
          };
        });

        if (!cancelled) {
          setRows(merged);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filterStatus, refreshTick]);

  // Distinct supplier list for filter dropdown
  const suppliers = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of rows) {
      if (r.supplier_name && r.primary_supplier_id) {
        set.set(r.primary_supplier_id, r.supplier_name);
      }
    }
    return Array.from(set, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  // Filter + sort rows
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filteredRows = rows.filter((r) => {
      if (filterSupplier && r.primary_supplier_id !== filterSupplier) return false;
      if (!q) return true;
      return (
        r.sku.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.supplier_name ?? '').toLowerCase().includes(q)
      );
    });
    // Sort
    const sorted = [...filteredRows].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortField];
      const bv = (b as unknown as Record<string, unknown>)[sortField];
      // Nulls sink to bottom regardless of sort direction
      if (av == null && bv != null) return 1;
      if (av != null && bv == null) return -1;
      if (av == null && bv == null) return 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return sorted;
  }, [rows, search, filterSupplier, sortField, sortDir]);

  // Quick stats summary at the top
  const stats = useMemo(() => {
    const n = filtered.length;
    const onlineN  = filtered.filter((r) => r.sell_online).length;
    const noPhoto  = filtered.filter((r) => !r.image_url).length;
    const noCost   = filtered.filter((r) => r.cost_per_unit == null).length;
    const noPrice  = filtered.filter((r) =>
      r.nassau_price == null && r.andros_price == null && r.online_price == null && r.wholesale_price == null
    ).length;
    return { n, onlineN, noPhoto, noCost, noPrice };
  }, [filtered]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-screen-2xl px-3 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link href="/dashboard" className="text-xs font-semibold text-slate-500 hover:text-navy">← Dashboard</Link>
                <span className="text-slate-300">·</span>
                <h1 className="font-display text-lg font-extrabold text-navy sm:text-xl">📊 Inventory Spreadsheet</h1>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Live inventory across every channel. Tap any cell to edit — changes save instantly and
                cascade to POS, /market, and receipts.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-navy bg-navy-50/30 px-2 py-1">
                  <span className="text-xs font-bold text-navy">
                    {selectedIds.size} selected
                  </span>
                  <button
                    onClick={() => bulkApply({ sell_online: true }, '→ on /market')}
                    disabled={savingId === '__bulk__'}
                    className="rounded bg-emerald-500 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    On /market
                  </button>
                  <button
                    onClick={() => bulkApply({ sell_online: false }, '→ off /market')}
                    disabled={savingId === '__bulk__'}
                    className="rounded bg-slate-500 px-2 py-1 text-[11px] font-bold text-white hover:bg-slate-600 disabled:opacity-50"
                  >
                    Off /market
                  </button>
                  <button
                    onClick={() => bulkApply({ status: 'archived' }, 'archived')}
                    disabled={savingId === '__bulk__'}
                    className="rounded bg-red-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Archive
                  </button>
                  <button
                    onClick={clearSelection}
                    className="rounded border border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-slate-500"
                  >
                    Clear
                  </button>
                </div>
              )}
              <button
                onClick={toggleMarginsPanel}
                className={`rounded-lg border-2 px-3 py-2 text-sm font-extrabold transition ${
                  showMargins ? 'border-navy bg-navy text-gold' : 'border-navy text-navy hover:bg-navy-50/40'
                }`}
              >
                ⚙ Margins
              </button>
              <button
                onClick={openAddRow}
                className="rounded-lg bg-gold px-4 py-2 text-sm font-extrabold text-navy hover:bg-gold-300 transition"
              >
                + Add Row
              </button>
            </div>
          </div>

          {/* ─── Channel margins panel ─── */}
          {showMargins && (
            <div className="mt-3 rounded-xl border-2 border-navy/20 bg-navy-50/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-extrabold uppercase tracking-wider text-navy">
                  Channel margins · price = cost × (1 + margin)
                </p>
                <span className="text-[11px] font-semibold text-slate-500">
                  Applying reprices every active product on that channel instantly
                </span>
              </div>
              {marginsLoading ? (
                <p className="py-3 text-center text-xs text-slate-500">Loading margins…</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {MARGIN_CHANNELS.map((ch) => {
                    const live = margins.find((m) => m.channel === ch);
                    const livePct = live ? Math.round(live.margin_pct * 1000) / 10 : null;
                    const draft = marginDraft[ch] ?? '';
                    const dirty = livePct !== null && Number(draft) !== livePct;
                    return (
                      <div key={ch} className="rounded-lg border border-slate-200 bg-white p-2.5">
                        <p className="text-[11px] font-bold text-navy">{CHANNEL_LABELS[ch]}</p>
                        <div className="mt-1.5 flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={draft}
                            onChange={(e) => setMarginDraft((d) => ({ ...d, [ch]: e.target.value.replace(/[^0-9.]/g, '') }))}
                            className={`w-16 rounded-md border px-2 py-1 text-right text-sm font-bold outline-none focus:border-navy ${
                              dirty ? 'border-amber-400 text-amber-700' : 'border-slate-300 text-navy'
                            }`}
                            aria-label={`${CHANNEL_LABELS[ch]} margin percent`}
                          />
                          <span className="text-xs font-semibold text-slate-500">%</span>
                          <button
                            onClick={() => applyMargin(ch)}
                            disabled={applyingChannel === ch || draft === ''}
                            className="ml-auto rounded-md bg-navy px-2.5 py-1 text-[11px] font-extrabold text-gold transition hover:opacity-90 disabled:opacity-40"
                          >
                            {applyingChannel === ch ? '…' : 'Apply'}
                          </button>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {livePct !== null ? `Live: ${livePct}%` : '—'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Stats strip */}
          {!loading && (
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
              <Pill label="Showing" value={stats.n} />
              <Pill label="On /market" value={stats.onlineN} tone="green" />
              <Pill label="No photo" value={stats.noPhoto} tone={stats.noPhoto > 0 ? 'amber' : 'slate'} />
              <Pill label="No cost"  value={stats.noCost}  tone={stats.noCost > 0 ? 'red' : 'slate'} />
              <Pill label="No price" value={stats.noPrice} tone={stats.noPrice > 0 ? 'red' : 'slate'} />
            </div>
          )}

          {/* Filter row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU, name, supplier…"
              className="h-9 min-w-[200px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-navy"
            />
            <select
              value={filterSupplier}
              onChange={(e) => setFilterSupplier(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-navy outline-none focus:border-navy"
            >
              <option value="">All suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-navy outline-none focus:border-navy"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="discontinued">Discontinued</option>
              <option value="draft">Draft</option>
              <option value="pending_approval">Pending approval</option>
            </select>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto mt-4 max-w-screen-2xl rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900">
          ⚠ {error}
        </div>
      )}

      {/* Hidden file input — triggered by any photo cell click.
          NO `capture` attribute: forcing capture="environment" jumps
          straight to the back camera on iOS with no chooser, which
          blocks staff who want to upload from gallery / Files / Drive.
          Without capture, iOS shows the full sheet:
            - Take Photo (camera)
            - Photo Library (gallery)
            - Choose File (Files / Drive / cloud)
          Desktop: native file picker. Either way, full choice. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={onFileSelected}
        className="hidden"
      />
      {/* Add-Product modal photo input — kept at top level (NOT inside the
          modal overlay) so its programmatic .click() doesn't bubble to the
          overlay's close-on-click handler and dismiss the modal. */}
      <input
        ref={addPhotoRef}
        type="file"
        accept="image/*"
        onChange={onAddRowPhoto}
        className="hidden"
      />

      {/* Phase 4 — Add Row modal. Bottom-sheet on mobile, centered dialog on
          desktop. Flex column with a scrollable body so every field + the
          action buttons are always reachable on any screen size. */}
      {showAddRow && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
          onClick={() => !addRowSaving && setShowAddRow(false)}
        >
          <div
            className="flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 border-b border-slate-200 px-5 py-3">
              <h2 className="text-base font-extrabold text-navy">+ Add new product</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Sets up the product + its opening cost, then auto-prices it on every
                channel you enable below using your channel margins (cost × margin).
                Online price is an optional manual override.
              </p>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {/* Product photo — camera / gallery / file */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Product photo</label>
                <div className="flex items-center gap-3">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    {addRowForm.image_url
                      ? <img src={addRowForm.image_url} alt="" className="h-full w-full object-cover" />
                      : <span className="text-2xl text-slate-300">📷</span>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => addPhotoRef.current?.click()}
                      disabled={addPhotoUploading}
                      className="rounded-lg border-2 border-navy px-3 py-1.5 text-xs font-extrabold text-navy hover:bg-navy-50/40 disabled:opacity-50"
                    >
                      {addPhotoUploading ? 'Uploading…' : addRowForm.image_url ? '↻ Change photo' : '📷 Take / upload photo'}
                    </button>
                    {addRowForm.image_url && !addPhotoUploading && (
                      <button
                        type="button"
                        onClick={() => setAddRowForm((f) => ({ ...f, image_url: '' }))}
                        className="text-left text-[11px] font-semibold text-slate-400 hover:text-red-500"
                      >
                        Remove
                      </button>
                    )}
                    <span className="text-[10px] text-slate-400">Camera, gallery, or file · up to 12 MB</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Supplier *</label>
                <select
                  value={addRowForm.supplier_id}
                  onChange={(e) => setAddRowForm((f) => ({ ...f, supplier_id: e.target.value }))}
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="">— pick supplier —</option>
                  {allSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">SKU *</label>
                  <input
                    type="text" value={addRowForm.sku}
                    onChange={(e) => setAddRowForm((f) => ({ ...f, sku: e.target.value }))}
                    placeholder="B00084"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Name *</label>
                  <input
                    type="text" value={addRowForm.name}
                    onChange={(e) => setAddRowForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Category *</label>
                  <select
                    value={addRowForm.category}
                    onChange={(e) => setAddRowForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">UoM *</label>
                  <select
                    value={addRowForm.unit_of_measure}
                    onChange={(e) => setAddRowForm((f) => ({ ...f, unit_of_measure: e.target.value }))}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    {UOM_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Pack size</label>
                  <input
                    type="text" value={addRowForm.pack_size}
                    onChange={(e) => setAddRowForm((f) => ({ ...f, pack_size: e.target.value }))}
                    placeholder="2lb bag"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Cost (per unit)</label>
                  <input
                    type="number" step="0.01" min="0" inputMode="decimal"
                    value={addRowForm.cost_per_unit}
                    onChange={(e) => setAddRowForm((f) => ({ ...f, cost_per_unit: e.target.value }))}
                    placeholder="e.g. 14.20"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Quantity in stock</label>
                  <input
                    type="number" step="1" min="0" inputMode="numeric"
                    value={addRowForm.stock_count}
                    onChange={(e) => setAddRowForm((f) => ({ ...f, stock_count: e.target.value }))}
                    placeholder="e.g. 24"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <p className="-mt-1 text-[10px] text-slate-400">Selling prices below are calculated from cost × each channel margin.</p>
              <div>
                <p className="mb-1 text-xs font-bold text-slate-600">Show on channels:</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  {(['sell_nassau', 'sell_andros', 'sell_online', 'sell_wholesale'] as const).map((k) => {
                    const label = k.replace('sell_', '');
                    return (
                      <label key={k} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1">
                        <input
                          type="checkbox"
                          checked={addRowForm[k]}
                          onChange={(e) => setAddRowForm((f) => ({ ...f, [k]: e.target.checked }))}
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Per-channel margin + live selling-price preview. One block per
                  enabled channel; margin is editable, price = cost × (1+margin). */}
              <div>
                <p className="mb-1.5 text-xs font-bold text-slate-600">Margin &amp; selling price per channel</p>
                {(() => {
                  const cost = addRowForm.cost_per_unit === '' ? null : Number(addRowForm.cost_per_unit);
                  const enabled = ADD_CHANNELS.filter(({ flag }) => addRowForm[flag]);
                  if (enabled.length === 0) {
                    return <p className="text-[11px] text-slate-400">Enable a channel above to set its margin.</p>;
                  }
                  return (
                    <div className="grid grid-cols-2 gap-2">
                      {enabled.map(({ channel, label }) => {
                        const mStr = addMargins[channel] ?? '';
                        const m = Number(mStr);
                        const validCost = cost !== null && Number.isFinite(cost) && cost > 0;
                        const validM = Number.isFinite(m) && m >= 0;
                        const sell = validCost && validM ? cost * (1 + m / 100) : null;
                        return (
                          <div key={channel} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                            <p className="text-[11px] font-bold text-navy">{label}</p>
                            <div className="mt-1 flex items-center gap-1">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={mStr}
                                onChange={(e) => {
                                  const v = e.target.value.replace(/[^0-9.]/g, '');
                                  setAddMargins((d) => ({ ...d, [channel]: v }));
                                }}
                                className="w-14 rounded-md border border-slate-300 px-2 py-1 text-right text-sm font-bold text-navy outline-none focus:border-navy"
                                aria-label={`${label} margin percent`}
                              />
                              <span className="text-xs font-semibold text-slate-500">% margin</span>
                            </div>
                            <p className="mt-1 text-sm font-extrabold text-emerald-700">
                              {sell !== null ? `$${sell.toFixed(2)}` : '—'}
                              <span className="ml-1 text-[10px] font-semibold text-slate-400">sells at</span>
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                onClick={() => setShowAddRow(false)}
                disabled={addRowSaving}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white"
              >
                Cancel
              </button>
              <button
                onClick={submitAddRow}
                disabled={addRowSaving}
                className="rounded-lg bg-gold px-5 py-2 text-sm font-extrabold text-navy hover:bg-gold-300 disabled:opacity-60"
              >
                {addRowSaving ? 'Adding…' : 'Add product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Per-row Edit modal — full-screen on mobile, centered dialog on desktop */}
      {editProductId && editForm && (() => {
        const editingRow = rows.find((r) => r.id === editProductId);
        const setF = (patch: Partial<EditForm>) => setEditForm((f) => f ? { ...f, ...patch } : f);
        return (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
            onClick={() => !editSaving && (setEditProductId(null), setEditForm(null))}
          >
            <div
              className="flex h-[100dvh] w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 border-b border-slate-200 px-5 py-3">
                <h2 className="text-base font-extrabold text-navy">✏️ Edit product</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  <span className="font-mono">{editingRow?.sku}</span> · changes save instantly and cascade to POS, /market & receipts.
                </p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {/* Photo */}
                <div className="flex items-center gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    {editingRow?.image_url
                      ? <img src={editingRow.image_url} alt="" className="h-full w-full object-cover" />
                      : <span className="text-xl text-slate-300">📷</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() => openPhotoPicker(editProductId)}
                    disabled={uploadingId === editProductId}
                    className="rounded-lg border-2 border-navy px-3 py-1.5 text-xs font-extrabold text-navy hover:bg-navy-50/40 disabled:opacity-50"
                  >
                    {uploadingId === editProductId ? 'Uploading…' : '📷 Change photo'}
                  </button>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Name *</label>
                  <input type="text" value={editForm.name}
                    onChange={(e) => setF({ name: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-600">Category</label>
                    <select value={editForm.category} onChange={(e) => setF({ category: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                      {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-600">UoM</label>
                    <select value={editForm.unit_of_measure} onChange={(e) => setF({ unit_of_measure: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                      {UOM_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-600">Pack size</label>
                    <input type="text" value={editForm.pack_size}
                      onChange={(e) => setF({ pack_size: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-600">Cost (per unit)</label>
                    <input type="number" step="0.01" min="0" inputMode="decimal" value={editForm.cost_per_unit}
                      onChange={(e) => setF({ cost_per_unit: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                    <p className="mt-0.5 text-[10px] text-slate-400">Changing cost re-prices every channel via your margins.</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-600">Quantity in stock</label>
                    <input type="number" step="1" min="0" inputMode="numeric" value={editForm.stock_count}
                      onChange={(e) => setF({ stock_count: e.target.value })}
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs font-bold text-slate-600">Show on channels:</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {(['sell_nassau', 'sell_andros', 'sell_online', 'sell_wholesale'] as const).map((k) => (
                      <label key={k} className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1">
                        <input type="checkbox" checked={editForm[k]} onChange={(e) => setF({ [k]: e.target.checked } as Partial<EditForm>)} />
                        {k.replace('sell_', '')}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Status</label>
                  <select value={editForm.status} onChange={(e) => setF({ status: e.target.value })}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                    {['active', 'archived', 'discontinued', 'draft', 'pending_approval'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
                <button onClick={() => { setEditProductId(null); setEditForm(null); }} disabled={editSaving}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white">Cancel</button>
                <button onClick={saveEdit} disabled={editSaving}
                  className="rounded-lg bg-gold px-5 py-2 text-sm font-extrabold text-navy hover:bg-gold-300 disabled:opacity-60">
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Phase 2 — save toast (top-right corner, auto-dismiss) */}
      {toast && (
        <div
          className={`fixed right-4 top-20 z-50 max-w-sm rounded-xl border-2 px-4 py-3 text-sm font-bold shadow-xl transition ${
            toast.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-red-300 bg-red-50 text-red-900'
          }`}
        >
          {toast.ok ? '✅ ' : '⚠ '}{toast.msg}
        </div>
      )}

      <main className="mx-auto max-w-screen-2xl px-3 py-4 sm:px-6">
        {loading ? (
          <p className="py-12 text-center text-sm text-slate-500">Loading inventory…</p>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">No products match the current filter.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-xs">
              <thead className="bg-navy text-white sticky top-0">
                <tr>
                  <Th align="center">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id))}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(new Set(filtered.map((r) => r.id)));
                        else clearSelection();
                      }}
                      aria-label="Select all visible"
                    />
                  </Th>
                  <ThSort field="sku"            sortField={sortField} sortDir={sortDir} onClick={toggleSort}>SKU</ThSort>
                  <Th>Photo</Th>
                  <ThSort field="name"           sortField={sortField} sortDir={sortDir} onClick={toggleSort} sticky>Name</ThSort>
                  <ThSort field="supplier_name"  sortField={sortField} sortDir={sortDir} onClick={toggleSort}>Supplier <span className="text-[9px] opacity-60">(internal)</span></ThSort>
                  <Th>Category</Th>
                  <Th>UoM</Th>
                  <Th>Size</Th>
                  <ThSort field="stock_count"    sortField={sortField} sortDir={sortDir} onClick={toggleSort} align="right">Stock</ThSort>
                  <Th>VAT</Th>
                  <ThSort field="cost_per_unit"  sortField={sortField} sortDir={sortDir} onClick={toggleSort} align="right">Cost</ThSort>
                  <Th align="right">Nassau POS</Th>
                  <Th align="right">Andros POS</Th>
                  <ThSort field="online_price"   sortField={sortField} sortDir={sortDir} onClick={toggleSort} align="right">Online</ThSort>
                  <Th align="right">Wholesale</Th>
                  <Th align="center">Channels</Th>
                  <Th>Status</Th>
                  <Th align="center">Edit</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => {
                  const isCellEditing = (f: string) => editingCell?.id === r.id && editingCell?.field === f;
                  const startEdit = (f: string, currentVal: string | number | null | undefined) => {
                    setEditingValue(currentVal != null ? String(currentVal) : '');
                    setEditingCell({ id: r.id, field: f });
                  };
                  const lowStock =
                    r.stock_count != null && r.stock_count >= 0 &&
                    (r.stock_count === 0 || (r.low_stock_threshold != null && r.stock_count <= r.low_stock_threshold));
                  return (
                  <tr key={r.id} className={`hover:bg-slate-50 ${selectedIds.has(r.id) ? 'bg-navy-50/30' : ''}`}>
                    <Td align="center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        aria-label={`Select ${r.sku}`}
                      />
                    </Td>
                    <Td><span className="font-mono">{r.sku}</span></Td>
                    <Td>
                      <button
                        type="button"
                        onClick={() => openPhotoPicker(r.id)}
                        disabled={uploadingId === r.id}
                        title={r.image_url ? 'Click to replace photo' : 'Click to add photo (camera / gallery / file)'}
                        className="group relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded bg-slate-100 transition hover:ring-2 hover:ring-amber-300 disabled:opacity-60"
                      >
                        {uploadingId === r.id ? (
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-navy" />
                        ) : r.image_url ? (
                          <>
                            <img src={r.image_url} alt="" width={36} height={36} loading="lazy" decoding="async" className="h-9 w-9 object-cover" />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[9px] font-bold text-white opacity-0 group-hover:opacity-100 transition">
                              📷 EDIT
                            </span>
                          </>
                        ) : (
                          <span className="text-sm">📦＋</span>
                        )}
                      </button>
                    </Td>
                    <Td sticky>
                      {isCellEditing('name') ? (
                        <input
                          autoFocus
                          type="text"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => saveCell(r, 'name', editingValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')  saveCell(r, 'name', editingValue);
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          className="w-48 rounded border border-navy bg-yellow-50 px-1 py-0.5 text-xs font-semibold"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit('name', r.name)}
                          disabled={savingId === r.id}
                          className="text-left rounded px-1 font-semibold text-navy hover:bg-amber-100 hover:ring-1 hover:ring-amber-300 disabled:opacity-50"
                          title="Click to edit name"
                        >
                          {r.name}
                        </button>
                      )}
                      {r.description && <div className="text-[10px] text-slate-500">{r.description}</div>}
                    </Td>
                    <Td>
                      {isCellEditing('primary_supplier_id') ? (
                        <select
                          autoFocus
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => saveCell(r, 'primary_supplier_id', editingValue)}
                          className="rounded border border-navy bg-yellow-50 px-1 py-0.5 text-xs font-bold"
                        >
                          {allSuppliers.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit('primary_supplier_id', r.primary_supplier_id)}
                          disabled={savingId === r.id}
                          className="rounded px-1 hover:bg-amber-100 hover:ring-1 hover:ring-amber-300 cursor-pointer disabled:opacity-50 text-left"
                          title="Click to reassign supplier"
                        >
                          {r.supplier_name ?? <span className="text-red-600">— none —</span>}
                        </button>
                      )}
                    </Td>
                    <Td>
                      {isCellEditing('category') ? (
                        <select
                          autoFocus
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => saveCell(r, 'category', editingValue)}
                          className="rounded border border-navy bg-yellow-50 px-1 py-0.5 text-xs font-bold"
                        >
                          {CATEGORY_OPTIONS.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit('category', r.category)}
                          disabled={savingId === r.id}
                          className="rounded px-1 hover:bg-amber-100 hover:ring-1 hover:ring-amber-300 cursor-pointer disabled:opacity-50"
                          title="Click to change category"
                        >
                          {r.category}
                        </button>
                      )}
                    </Td>
                    <Td>{r.unit_of_measure}</Td>
                    <Td>{r.pack_size ?? '—'}</Td>
                    <Td align="right">
                      {isCellEditing('stock_count') ? (
                        <input
                          autoFocus
                          type="number"
                          step="1"
                          min="0"
                          inputMode="numeric"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => saveCell(r, 'stock_count', editingValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')  saveCell(r, 'stock_count', editingValue);
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          className="w-16 rounded border border-navy bg-yellow-50 px-1 py-0.5 text-right text-xs font-bold"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit('stock_count', r.stock_count)}
                          disabled={savingId === r.id}
                          className={`rounded px-1 font-bold hover:bg-amber-100 hover:ring-1 hover:ring-amber-300 disabled:opacity-50 ${
                            r.stock_count == null ? 'text-slate-400 italic font-normal' :
                            r.stock_count === 0   ? 'text-red-600' :
                            lowStock              ? 'text-amber-600' :
                                                    'text-emerald-700'
                          }`}
                          title={
                            r.stock_count == null ? 'Not tracked. Click to set.' :
                            r.stock_count === 0   ? 'OUT OF STOCK. Click to update.' :
                            lowStock              ? 'LOW STOCK. Click to update.' :
                                                    'Click to update stock count'
                          }
                        >
                          {r.stock_count == null ? '—' : r.stock_count}
                        </button>
                      )}
                    </Td>
                    <Td>{r.vat_category === 'uncooked_food' ? '0%' : r.vat_category === 'cooked_prepared' ? '10%' : '—'}</Td>
                    <Td align="right">
                      {isCellEditing('cost_per_unit') ? (
                        <input
                          autoFocus
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => saveCell(r, 'cost_per_unit', editingValue)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')  saveCell(r, 'cost_per_unit', editingValue);
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          className="w-20 rounded border border-navy bg-yellow-50 px-1 py-0.5 text-right text-xs font-bold"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => startEdit('cost_per_unit', r.cost_per_unit)}
                          disabled={savingId === r.id}
                          className="rounded px-1 hover:bg-amber-100 hover:ring-1 hover:ring-amber-300 cursor-pointer disabled:opacity-50"
                          title="Click to edit cost — channel prices auto-update"
                        >
                          {fmtPrice(r.cost_per_unit)}
                        </button>
                      )}
                    </Td>
                    <Td align="right">{fmtPrice(r.nassau_price)}</Td>
                    <Td align="right">{fmtPrice(r.andros_price)}</Td>
                    <Td align="right">{fmtPrice(r.online_price)}</Td>
                    <Td align="right">{fmtPrice(r.wholesale_price)}</Td>
                    <Td align="center">
                      <ChannelToggle row={r} channel="nassau"    label="N" onToggle={toggleChannel} saving={savingId === r.id} />
                      <ChannelToggle row={r} channel="andros"    label="A" onToggle={toggleChannel} saving={savingId === r.id} />
                      <ChannelToggle row={r} channel="online"    label="O" onToggle={toggleChannel} saving={savingId === r.id} />
                      <ChannelToggle row={r} channel="wholesale" label="W" onToggle={toggleChannel} saving={savingId === r.id} />
                    </Td>
                    <Td>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        r.status === 'active'   ? 'bg-emerald-100 text-emerald-700' :
                        r.status === 'archived' ? 'bg-slate-200 text-slate-700'    :
                                                   'bg-amber-100 text-amber-700'
                      }`}>{r.status}</span>
                    </Td>
                    <Td align="center">
                      <button
                        onClick={() => openEdit(r)}
                        className="rounded-lg border border-navy/30 px-2.5 py-1 text-[11px] font-bold text-navy hover:bg-navy hover:text-gold transition"
                      >
                        ✏️ Edit
                      </button>
                    </Td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

/* ─────────────── UI primitives ─────────────── */

function Th({ children, sticky, align = 'left' }: { children: React.ReactNode; sticky?: boolean; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className={`px-3 py-2 text-${align} text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
        sticky ? 'sticky left-0 bg-navy z-10' : ''
      }`}
    >
      {children}
    </th>
  );
}
function ThSort({
  field, sortField, sortDir, onClick, children, sticky, align = 'left',
}: {
  field:     SortField;
  sortField: SortField;
  sortDir:   SortDir;
  onClick:   (f: SortField) => void;
  children:  React.ReactNode;
  sticky?:   boolean;
  align?:    'left' | 'right' | 'center';
}) {
  const active = sortField === field;
  return (
    <th
      className={`px-3 py-2 text-${align} text-[10px] font-bold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:bg-navy-700 ${
        sticky ? 'sticky left-0 bg-navy z-10' : ''
      }`}
      onClick={() => onClick(field)}
    >
      {children}
      <span className="ml-1 inline-block w-3 text-[9px] opacity-80">
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    </th>
  );
}
function Td({ children, sticky, align = 'left' }: { children: React.ReactNode; sticky?: boolean; align?: 'left' | 'right' | 'center' }) {
  return (
    <td
      className={`px-3 py-2 text-${align} whitespace-nowrap ${
        sticky ? 'sticky left-0 bg-white z-10' : ''
      }`}
    >
      {children}
    </td>
  );
}
function ChannelDot({ on, label }: { on: boolean; label: string }) {
  // Read-only legacy. Kept for any non-editable callers.
  return (
    <span
      title={label === 'N' ? 'Nassau POS' : label === 'A' ? 'Andros POS' : label === 'O' ? 'Online' : 'Wholesale'}
      className={`mx-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
        on ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
      }`}
    >
      {label}
    </span>
  );
}

function ChannelToggle({
  row, channel, label, onToggle, saving,
}: {
  row:      ProductRow;
  channel:  ChannelKey;
  label:    string;
  onToggle: (r: ProductRow, c: ChannelKey) => void;
  saving:   boolean;
}) {
  const on =
    channel === 'nassau'    ? row.sell_nassau    :
    channel === 'andros'    ? row.sell_andros    :
    channel === 'online'    ? row.sell_online    :
                              row.sell_wholesale;
  const title =
    channel === 'nassau'    ? 'Nassau POS' :
    channel === 'andros'    ? 'Andros POS' :
    channel === 'online'    ? 'Online'     :
                              'Wholesale';
  return (
    <button
      type="button"
      onClick={() => onToggle(row, channel)}
      disabled={saving}
      title={`${title} — click to ${on ? 'disable' : 'enable'}`}
      className={`mx-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition hover:scale-110 disabled:opacity-50 ${
        on ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-slate-200 text-slate-400 hover:bg-slate-300'
      }`}
    >
      {label}
    </button>
  );
}
function Pill({ label, value, tone = 'slate' }: { label: string; value: number; tone?: 'slate' | 'green' | 'amber' | 'red' }) {
  const palette =
    tone === 'green' ? 'bg-emerald-100 text-emerald-800' :
    tone === 'amber' ? 'bg-amber-100  text-amber-800'   :
    tone === 'red'   ? 'bg-red-100    text-red-800'     :
                       'bg-slate-100  text-slate-700';
  return (
    <span className={`rounded-full px-2.5 py-0.5 ${palette}`}>
      {label}: <span className="font-extrabold">{value}</span>
    </span>
  );
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null) return '—';
  return `$${n.toFixed(2)}`;
}
