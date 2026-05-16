'use client';

// BSC Flyer Maker
// ─────────────
// Two-panel UI for composing ChatGPT prompts that produce BSC-branded
// marketing flyers, then optionally blasting an email announcement to
// every opted-in customer.
//
// LEFT  — Brand reference: standards / two flyer styles / approved taglines
//         / interactive quality checklist.
// RIGHT — Builder: pick style → pick products from Supabase → generate
//         prompt + image URL list → copy → (later) paste your ChatGPT
//         flyer image URL → email blast.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface ProductRow {
  id:                 string;
  sku:                string;
  name:               string;
  category:           string | null;
  pack_size:          string | null;
  image_url:          string | null;
  nassau_price:       number | null;
  online_price:       number | null;
}

type Style = 'A' | 'B';

const COLOR_SWATCHES = [
  { name: 'Navy',          hex: '#060d1f' },
  { name: 'Gold',          hex: '#f5c518' },
  { name: 'Red',           hex: '#cc0000' },
  { name: 'WhatsApp Green',hex: '#25d366' },
  { name: 'Black',         hex: '#111111' },
];

const TAGLINES_A = [
  'Fresh Quality You Can Trust!',
  'Bulk Prices. Big Value.',
  'Serving Businesses. Building Partnerships.',
  'Quality Products • Great Prices • Wholesale Values',
];
const TAGLINES_B = [
  "Nassau's #1 Meat & Seafood Hub",
  'Fresh. Quality. Savings.',
  'Only the Best, Only at BSC!',
  'Hot Prices! Big Savings! Frozen Freshness!',
];

const CHECKLIST_BASE = [
  'BSC logo correct for style chosen (fish = Style A, Viking = Style B)',
  'Phone number 361-3474 visible',
  'Firetrial Road, Nassau, Bahamas shown',
  'WhatsApp green icon present',
  'Urgency line included (11AM/5PM for Style A)',
  'We Deliver + Family Island Delivery shown (Style B)',
  'Food photography is high quality and appetizing',
  'All prices are correct before posting',
  'No spelling errors on product names',
  'Bottom strip badges included',
  'Correct colors for the style',
];

const CATEGORIES = ['all', 'meat', 'fresh_seafood', 'frozen_seafood', 'processed_seafood', 'poultry', 'produce', 'grocery', 'beverage', 'other'];

export default function FlyerMakerPage() {
  // ── PRODUCTS ────────────────────────────────────────────────
  const [products, setProducts]   = useState<ProductRow[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingProducts(true);
      const { data: prods, error: pErr } = await supabase
        .from('products')
        .select('id, sku, name, category, pack_size, image_url')
        .eq('status', 'active')
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      if (pErr) {
        setProductError(pErr.message);
        setLoadingProducts(false);
        return;
      }
      const rows = (prods ?? []) as Array<Omit<ProductRow, 'nassau_price' | 'online_price'>>;
      const ids = rows.map(r => r.id);

      const nassauMap: Record<string, number> = {};
      const onlineMap: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: prices } = await supabase
          .from('product_pricing')
          .select('product_id, channel, manual_unit_price')
          .in('product_id', ids)
          .in('channel', ['nassau_pos', 'online_market'])
          .eq('is_current', true);
        for (const p of (prices ?? []) as { product_id: string; channel: string; manual_unit_price: number | null }[]) {
          if (p.manual_unit_price === null) continue;
          if (p.channel === 'nassau_pos')    nassauMap[p.product_id] = Number(p.manual_unit_price);
          if (p.channel === 'online_market') onlineMap[p.product_id] = Number(p.manual_unit_price);
        }
      }
      const merged: ProductRow[] = rows.map(r => ({
        ...r,
        nassau_price: nassauMap[r.id] ?? null,
        online_price: onlineMap[r.id] ?? null,
      }));
      setProducts(merged);
      setLoadingProducts(false);
    })();
  }, []);

  // ── BUILDER STATE ───────────────────────────────────────────
  const [style, setStyle] = useState<Style>('B');
  const [dealName, setDealName] = useState('Today\'s Hot Specials!');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [imageOverrides, setImageOverrides] = useState<Record<string, string>>({});
  const [checklist, setChecklist] = useState<Record<number, boolean>>({});
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  // Email blast state
  const [flyerImageUrl, setFlyerImageUrl] = useState('');
  const [blasting, setBlasting] = useState(false);
  const [blastResult, setBlastResult] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      if (catFilter !== 'all' && p.category !== catFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.pack_size ?? '').toLowerCase().includes(q)
      );
    });
  }, [products, search, catFilter]);

  const selectedProducts = useMemo(
    () => products.filter(p => selectedIds[p.id]),
    [products, selectedIds],
  );

  function toggleSelected(id: string) {
    setSelectedIds(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function buildPrompt(): string {
    const lines: string[] = [];
    if (style === 'A') {
      lines.push('Create a BSC Market Place PRICE LIST flyer.');
      lines.push('');
      lines.push('Logo: BSC in large bold white distressed text, Market Place in gold italic script below, with a jumping fish icon. Deep navy ocean background with seafood/meat photography.');
      lines.push('');
      lines.push('Include these products in a clean table (PRODUCT | CATEGORY | SKU | SELLING PRICE):');
      for (const p of selectedProducts) {
        const price = p.nassau_price ?? p.online_price;
        lines.push(`  ${p.name} | ${p.category ?? '—'} | ${p.sku} | ${price !== null ? `$${price.toFixed(2)}` : 'TBD'}`);
      }
      lines.push('');
      lines.push('Navy/gold table header. Gold ribbon banner across middle: PRICE LIST - WHOLESALE.');
      lines.push('Subheader: Quality Products • Great Prices • Wholesale Values');
      lines.push('Badge top right circle: Fresh Quality You Can Trust with gold stars.');
      lines.push('Bottom strip: 📍 Fire Trial Road Nassau Bahamas | WhatsApp 361-3474 | WHATSAPP OR CALL US');
      lines.push('Urgency bar: Call and place your order BEFORE 11AM → And get your order BEFORE 5PM!');
      lines.push('Bottom tagline: 🛒 Bulk Prices. Big Value. | Serving Businesses. Building Partnerships.');
      lines.push('Size: 1080x1350px');
    } else {
      lines.push('Create a BSC Marketplace HOT DEALS flyer — dark black background style.');
      lines.push('');
      lines.push('Logo top left: Viking warrior with gold helmet, BSC in gold bold, MARKETPLACE below in white. Nassau\'s #1 Meat & Seafood Hub below logo.');
      lines.push(`Headline top right: ${dealName.trim() || 'Hot Specials'} — large white and gold text with red paint brushstroke behind it. Badge: Fresh. Quality. Savings.`);
      lines.push('');
      lines.push('Products to feature in a grid layout (each with its real photo, product name bold white/gold, price on gold or red paint-brush stroke background):');
      for (const p of selectedProducts) {
        const price = p.nassau_price ?? p.online_price;
        lines.push(`  ${p.name} — ${price !== null ? `$${price.toFixed(2)}` : 'TBD'}`);
      }
      lines.push('');
      lines.push('I am uploading the real product photos — use them exactly as provided for each product.');
      lines.push('');
      lines.push('Bottom contact bar (navy): WhatsApp green icon + WHATSAPP OR CALL US 361-3474 | 📍 Firetrial Road Nassau Bahamas | 🚚 WE DELIVER! Family Island Delivery Available');
      lines.push('Bottom strip 4 icon badges: ❄️ Frozen Freshness Locked In | 🛡️ Quality You Can Trust | 🔪 Tenderized For Your Convenience | 🛒 Wholesale & Retail Welcome');
      lines.push('Size: 1080x1350px');
    }
    return lines.join('\n');
  }

  function handleGenerate() {
    if (selectedProducts.length === 0) {
      alert('Pick at least one product first.');
      return;
    }
    setGeneratedPrompt(buildPrompt());
    setCopyState('idle');
  }

  function handleCopy() {
    if (!generatedPrompt) return;
    navigator.clipboard.writeText(generatedPrompt).then(
      () => { setCopyState('copied'); setTimeout(() => setCopyState('idle'), 2000); },
      () => { alert('Copy failed — manually select the text.'); },
    );
  }

  async function handleSendBlast() {
    if (selectedProducts.length === 0) { alert('Pick products first.'); return; }
    const subject  = style === 'B' ? (dealName.trim() || 'New BSC Specials') : 'This Week\'s BSC Price List';
    const headline = style === 'B' ? (dealName.trim() || 'New Specials') : 'New Price List';
    setBlasting(true);
    setBlastResult(null);
    try {
      const res = await fetch('/api/flyer-blast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject, headline, style,
          flyer_image_url: flyerImageUrl.trim() || null,
          products: selectedProducts.map(p => ({
            name: p.name,
            price: p.nassau_price ?? p.online_price,
            image_url: imageOverrides[p.id] || p.image_url || null,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setBlastResult(`✓ Sent to ${data.sent} of ${data.attempted} opted-in customers.${data.errors?.length ? ` Errors: ${data.errors.join('; ')}` : ''}`);
    } catch (e) {
      setBlastResult(`✗ ${e instanceof Error ? e.message : 'Send failed'}`);
    } finally {
      setBlasting(false);
    }
  }

  // ── RENDER ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: '#060d1f', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b px-4 py-3" style={{ backgroundColor: '#0b1628', borderColor: 'rgba(245,197,24,0.2)' }}>
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/founder-ai" className="text-xs" style={{ color: '#f5c518' }}>← Founder AI</Link>
            <h1 className="text-lg font-bold" style={{ color: '#f5c518', fontFamily: "'Playfair Display', serif" }}>BSC Flyer Maker</h1>
          </div>
          <span className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.5)' }}>Skill</span>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 p-4">

        {/* ════════════════════════ LEFT SIDEBAR ════════════════════════ */}
        <aside className="space-y-3">
          <SidebarSection title="Brand Standard" defaultOpen>
            <p className="text-xs leading-relaxed text-white/80">
              <strong className="text-yellow-400">BSC Market Place</strong><br />
              📞 361-3474 (WhatsApp & Call)<br />
              📍 Firetrial Road, Nassau, Bahamas<br />
              🚚 Family Island Delivery Available
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {COLOR_SWATCHES.map(c => (
                <div key={c.hex} className="flex items-center gap-1.5 px-2 py-1 rounded" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  <span className="inline-block w-4 h-4 rounded border border-white/20" style={{ backgroundColor: c.hex }} />
                  <span className="text-[10px] font-mono text-white/70">{c.hex}</span>
                </div>
              ))}
            </div>
          </SidebarSection>

          <SidebarSection title="Style A — Price List / Wholesale">
            <ul className="text-[11px] space-y-1.5 text-white/75 leading-relaxed">
              <li><strong className="text-yellow-400">BG:</strong> Deep navy ocean texture</li>
              <li><strong className="text-yellow-400">Logo:</strong> BSC bold white + fish + Market Place gold italic</li>
              <li><strong className="text-yellow-400">Layout:</strong> Product table (Product | Category | SKU | Price)</li>
              <li><strong className="text-yellow-400">Banner:</strong> Gold ribbon "PRICE LIST - WHOLESALE"</li>
              <li><strong className="text-yellow-400">Badge:</strong> "Fresh Quality You Can Trust" circle TR</li>
              <li><strong className="text-yellow-400">Bottom:</strong> Order before 11AM → before 5PM</li>
              <li><strong className="text-yellow-400">Size:</strong> 1080×1350</li>
            </ul>
          </SidebarSection>

          <SidebarSection title="Style B — Hot Deals / Specials">
            <ul className="text-[11px] space-y-1.5 text-white/75 leading-relaxed">
              <li><strong className="text-yellow-400">BG:</strong> Deep black/charcoal</li>
              <li><strong className="text-yellow-400">Logo:</strong> Viking gold helmet + BSC gold + MARKETPLACE white</li>
              <li><strong className="text-yellow-400">Headline:</strong> White/gold + red brushstroke behind deal name</li>
              <li><strong className="text-yellow-400">Layout:</strong> Product photo grid w/ paint-brush price badges</li>
              <li><strong className="text-yellow-400">Bottom strip:</strong> ❄️🛡️🔪🛒 badges</li>
              <li><strong className="text-yellow-400">Bottom:</strong> We Deliver! Family Island Delivery</li>
              <li><strong className="text-yellow-400">Size:</strong> 1080×1350</li>
            </ul>
          </SidebarSection>

          <SidebarSection title="Approved Taglines">
            <p className="text-[11px] font-bold text-yellow-400 mt-1">Style A</p>
            <ul className="text-[11px] text-white/75 space-y-0.5 mb-2">{TAGLINES_A.map(t => <li key={t}>• {t}</li>)}</ul>
            <p className="text-[11px] font-bold text-yellow-400">Style B</p>
            <ul className="text-[11px] text-white/75 space-y-0.5">{TAGLINES_B.map(t => <li key={t}>• {t}</li>)}</ul>
          </SidebarSection>

          <SidebarSection title="Quality Checklist" defaultOpen>
            <ul className="space-y-1.5">
              {CHECKLIST_BASE.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <input type="checkbox" id={`chk${i}`} checked={!!checklist[i]}
                    onChange={e => setChecklist(prev => ({ ...prev, [i]: e.target.checked }))}
                    className="mt-0.5 accent-yellow-400 flex-shrink-0" />
                  <label htmlFor={`chk${i}`} className={`text-[11px] leading-snug cursor-pointer ${checklist[i] ? 'line-through text-white/40' : 'text-white/85'}`}>
                    {item}
                  </label>
                </li>
              ))}
            </ul>
          </SidebarSection>
        </aside>

        {/* ════════════════════════ RIGHT PANEL ════════════════════════ */}
        <main className="space-y-4">

          {/* Step 1 — Style */}
          <Card title="Step 1 · Style">
            <div className="grid grid-cols-2 gap-3">
              {(['A','B'] as Style[]).map(s => (
                <button key={s} onClick={() => setStyle(s)}
                  className="rounded-xl p-4 text-left transition-all"
                  style={{
                    backgroundColor: style === s ? '#1a2e5a' : 'rgba(255,255,255,0.04)',
                    border: style === s ? '2px solid #f5c518' : '2px solid rgba(255,255,255,0.08)',
                  }}>
                  <p className="text-xs uppercase tracking-wider" style={{ color: style === s ? '#f5c518' : 'rgba(255,255,255,0.5)' }}>Style {s}</p>
                  <p className="font-bold text-sm mt-1">{s === 'A' ? 'Price List / Wholesale' : 'Hot Deals / Specials'}</p>
                  <p className="text-[11px] mt-1 text-white/60">{s === 'A' ? 'Navy + gold table' : 'Black + brush strokes'}</p>
                </button>
              ))}
            </div>
          </Card>

          {/* Step 2 — Deal name (Style B only) */}
          {style === 'B' && (
            <Card title="Step 2 · Deal Name">
              <input type="text" value={dealName} onChange={e => setDealName(e.target.value)}
                placeholder="e.g. Today's Hot Specials!"
                className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none"
                style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.3)' }} />
            </Card>
          )}

          {/* Step 3 — Product picker */}
          <Card title={`Step ${style === 'B' ? '3' : '2'} · Products  (${selectedProducts.length} selected)`}>
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <input type="text" placeholder="Search by name, SKU, pack…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: '#1a2e5a', color: '#fff', border: '1px solid rgba(245,197,24,0.2)' }} />
              <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: '#1a2e5a', color: '#fff', border: '1px solid rgba(245,197,24,0.2)' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>)}
              </select>
            </div>

            {productError && <p className="text-xs text-red-400 mb-2">Couldn't load products: {productError}</p>}
            {loadingProducts && <p className="text-xs text-white/50">Loading products…</p>}

            <div className="max-h-[400px] overflow-y-auto rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              {filtered.length === 0 && !loadingProducts && (
                <p className="text-xs text-center py-8 text-white/40">No products match.</p>
              )}
              {filtered.map(p => {
                const sel = !!selectedIds[p.id];
                return (
                  <label key={p.id}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer border-b transition-colors"
                    style={{ borderColor: 'rgba(255,255,255,0.05)', backgroundColor: sel ? 'rgba(245,197,24,0.08)' : 'transparent' }}>
                    <input type="checkbox" checked={sel} onChange={() => toggleSelected(p.id)} className="accent-yellow-400" />
                    {p.image_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.image_url} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
                      : <div className="w-9 h-9 rounded flex-shrink-0 flex items-center justify-center text-sm" style={{ backgroundColor: '#1a2e5a' }}>📦</div>}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">{p.name}</p>
                      <p className="text-[10px] text-white/50 font-mono truncate">{p.sku}{p.pack_size ? ` · ${p.pack_size}` : ''} · {p.category ?? '—'}</p>
                    </div>
                    <span className="text-xs font-bold flex-shrink-0" style={{ color: '#f5c518' }}>
                      {p.nassau_price !== null ? `$${p.nassau_price.toFixed(2)}` : (p.online_price !== null ? `$${p.online_price.toFixed(2)}` : '—')}
                    </span>
                  </label>
                );
              })}
            </div>
          </Card>

          {/* Step 4 — Image overrides for selected products without image_url */}
          {selectedProducts.some(p => !p.image_url) && (
            <Card title={`Step ${style === 'B' ? '4' : '3'} · Missing Photos`}>
              <p className="text-[11px] text-white/60 mb-3">Paste image URLs for selected products that don't have one in Supabase. (Optional — ChatGPT can generate placeholder photography if blank.)</p>
              {selectedProducts.filter(p => !p.image_url).map(p => (
                <div key={p.id} className="mb-2">
                  <p className="text-[11px] text-white/70 mb-1">{p.name}</p>
                  <input type="text" placeholder="https://…"
                    value={imageOverrides[p.id] ?? ''}
                    onChange={e => setImageOverrides(prev => ({ ...prev, [p.id]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-xs text-white outline-none font-mono"
                    style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.2)' }} />
                </div>
              ))}
            </Card>
          )}

          {/* Step 5 — Generate prompt */}
          <Card title={`Step ${style === 'B' ? '5' : '4'} · Generate ChatGPT Prompt`}>
            <button onClick={handleGenerate}
              className="w-full py-3 rounded-xl font-bold text-base"
              style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
              🎨 Generate Flyer Prompt
            </button>

            {generatedPrompt && (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg p-3 overflow-x-auto" style={{ backgroundColor: '#0b1628', border: '1px solid rgba(245,197,24,0.2)' }}>
                  <pre className="text-[11px] whitespace-pre-wrap text-white/90 font-mono leading-relaxed">{generatedPrompt}</pre>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button onClick={handleCopy} className="text-xs px-4 py-2 rounded-lg font-bold"
                    style={{ backgroundColor: copyState === 'copied' ? '#16a34a' : '#f5c518', color: '#060d1f' }}>
                    {copyState === 'copied' ? '✓ Copied' : '📋 Copy Prompt'}
                  </button>
                  <a href="https://chat.openai.com/" target="_blank" rel="noopener noreferrer"
                    className="text-xs px-4 py-2 rounded-lg font-bold"
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: '#fff' }}>
                    Open ChatGPT ↗
                  </a>
                </div>

                {/* Image URLs for upload */}
                <details className="mt-3">
                  <summary className="text-xs cursor-pointer text-white/70 hover:text-yellow-400">
                    Product photos to upload to ChatGPT ({selectedProducts.filter(p => imageOverrides[p.id] || p.image_url).length})
                  </summary>
                  <ul className="mt-2 space-y-1 pl-3">
                    {selectedProducts.map(p => {
                      const url = imageOverrides[p.id] || p.image_url;
                      if (!url) return null;
                      return (
                        <li key={p.id} className="text-[10px] font-mono break-all">
                          <span className="text-white/50">{p.name}:</span>{' '}
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-yellow-400 underline">{url}</a>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </div>
            )}
          </Card>

          {/* Step 6 — Email blast */}
          <Card title={`Step ${style === 'B' ? '6' : '5'} · Email Broadcast`}>
            <p className="text-[11px] text-white/60 mb-3">
              Once your flyer image is ready from ChatGPT (optional), paste its public URL — then blast to every opted-in customer. The email lists the selected products + prices + a CTA to /market.
            </p>
            <input type="text" placeholder="https://…flyer.jpg (optional)"
              value={flyerImageUrl} onChange={e => setFlyerImageUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-xs text-white outline-none font-mono mb-3"
              style={{ backgroundColor: '#1a2e5a', border: '1px solid rgba(245,197,24,0.2)' }} />
            <button onClick={handleSendBlast} disabled={blasting || selectedProducts.length === 0}
              className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-40"
              style={{ backgroundColor: '#25d366', color: '#fff' }}>
              {blasting ? 'Sending…' : '📧 Send to All Opted-In Customers'}
            </button>
            {blastResult && (
              <p className={`mt-3 text-xs ${blastResult.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{blastResult}</p>
            )}
          </Card>
        </main>
      </div>
    </div>
  );
}

// ── Small UI helpers ─────────────────────────────────────────

function SidebarSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <button onClick={() => setOpen(o => !o)} className="w-full px-4 py-2.5 flex items-center justify-between text-left">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: '#f5c518' }}>{title}</span>
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <h2 className="text-sm font-bold mb-3" style={{ color: '#f5c518' }}>{title}</h2>
      {children}
    </section>
  );
}
