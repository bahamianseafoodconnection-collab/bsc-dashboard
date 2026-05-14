'use client';

import { useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import JSZip from 'jszip';

let _supabase: ReturnType<typeof createBrowserClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _supabase;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  image_url: string | null;
}

interface MatchedImage {
  filename: string;
  blob: Blob;
  previewUrl: string;
  matchedProducts: Product[];
  status: 'pending' | 'uploading' | 'done' | 'error';
  uploadedUrl?: string;
  error?: string;
}

// Smart filename → product name matcher
function matchProductsToFilename(filename: string, products: Product[]): Product[] {
  // Strip number prefix, extension, and convert hyphens to spaces
  const clean = filename
    .replace(/^\d+-/, '')           // remove "01-"
    .replace(/\.(jpg|jpeg|png|webp)$/i, '')
    .replace(/-/g, ' ')
    .toLowerCase()
    .trim();

  // Keyword extraction from filename
  const keywords = clean.split(' ').filter(w => w.length > 2);

  const scored = products.map(p => {
    const pname = p.name.toLowerCase();
    let score = 0;

    // Exact substring match — highest score
    if (pname.includes(clean)) score += 100;

    // Keyword matches
    for (const kw of keywords) {
      if (pname.includes(kw)) score += 10;
    }

    // Special rules for groups
    if (clean.includes('conch') && pname.includes('conch')) score += 20;
    if (clean.includes('tuna') && pname.includes('tuna')) score += 20;
    if (clean.includes('snapper finger') && pname.includes('snapper finger')) score += 50;
    if (clean.includes('lane snapper') && pname.includes('lane snapper')) score += 50;
    if (clean.includes('snapper fillet') && pname.includes('snapper fillet')) score += 50;
    if (clean.includes('shrimp') && pname.includes('shrimp')) score += 20;
    if (clean.includes('mahi') && pname.includes('mahi')) score += 30;
    if (clean.includes('hog') && pname.includes('hog')) score += 30;
    if (clean.includes('snow crab') && pname.includes('snow crab')) score += 50;
    if (clean.includes('green lip') && pname.includes('green lip')) score += 50;
    if (clean.includes('black mussel') && pname.includes('black mussel')) score += 50;
    if (clean.includes('grouper') && pname.includes('grouper')) score += 20;
    if (clean.includes('spareribs') && pname.includes('spareribs')) score += 50;
    if (clean.includes('chicken wings') && pname.includes('wing')) score += 50;
    if (clean.includes('chicken leg') && pname.includes('leg')) score += 50;
    if (clean.includes('pork chop') && pname.includes('pork chop')) score += 50;
    if (clean.includes('tomahawk') && pname.includes('tomahawk')) score += 50;
    if (clean.includes('chicken griller') && pname.includes('griller')) score += 50;
    if (clean.includes('blue crab') && pname.includes('blue crab')) score += 50;
    if (clean.includes('ribeye') && pname.includes('ribeye')) score += 50;
    if (clean.includes('new york') && pname.includes('new york')) score += 50;
    if (clean.includes('new york') && pname.includes('ny strip')) score += 40;
    if (clean.includes('tenderloin') && pname.includes('tenderloin')) score += 50;

    return { product: p, score };
  });

  return scored
    .filter(s => s.score >= 10)
    .sort((a, b) => b.score - a.score)
    .map(s => s.product);
}

export default function AdminImagesPage() {
  const supabase = getSupabase();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<MatchedImage[]>([]);
  const [zipProcessing, setZipProcessing] = useState(false);
  const [uploadingAll, setUploadingAll] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [mode, setMode] = useState<'zip' | 'single'>('zip');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'missing' | 'done'>('missing');
  const [saved, setSaved] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function loadProducts() {
    setLoading(true);
    const { data } = await supabase
      .from('products')
      .select('id, sku, name, category, image_url')
      .eq('sell_online', true)
      .eq('status', 'active')
      .order('name');
    if (data) setProducts(data);
    setLoading(false);
  }

  useEffect(() => { loadProducts(); }, []);

  async function handleZipUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith('.zip')) { alert('Please select a .zip file'); return; }
    if (products.length === 0) { alert('Products still loading — try again'); return; }

    setZipProcessing(true);
    setMatches([]);

    try {
      const zip = new JSZip();
      const loaded = await zip.loadAsync(file);
      const imageFiles = Object.entries(loaded.files).filter(([name]) =>
        /\.(jpg|jpeg|png|webp)$/i.test(name) && !name.startsWith('__MACOSX')
      );

      const newMatches: MatchedImage[] = [];

      for (const [name, zipEntry] of imageFiles) {
        const blob = await zipEntry.async('blob');
        const previewUrl = URL.createObjectURL(blob);
        const filename = name.split('/').pop() ?? name;
        const matchedProducts = matchProductsToFilename(filename, products);

        newMatches.push({
          filename,
          blob,
          previewUrl,
          matchedProducts,
          status: 'pending',
        });
      }

      // Sort by filename
      newMatches.sort((a, b) => a.filename.localeCompare(b.filename));
      setMatches(newMatches);
    } catch (err: any) {
      alert('Zip processing failed: ' + err.message);
    } finally {
      setZipProcessing(false);
    }
  }

  async function uploadOne(index: number): Promise<void> {
    const match = matches[index];
    if (!match || match.matchedProducts.length === 0) return;

    setMatches(prev => prev.map((m, i) => i === index ? { ...m, status: 'uploading' } : m));

    try {
      const ext = match.filename.split('.').pop() ?? 'jpg';
      const slug = match.filename.replace(/^\d+-/, '').replace(/\.[^.]+$/, '').toLowerCase();
      const path = `products/${slug}-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('site-images')
        .upload(path, match.blob, { upsert: true, contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('site-images').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      // Update all matched products
      for (const product of match.matchedProducts) {
        await supabase.from('products').update({ image_url: publicUrl }).eq('id', product.id);
      }

      setMatches(prev => prev.map((m, i) =>
        i === index ? { ...m, status: 'done', uploadedUrl: publicUrl } : m
      ));
      setDoneCount(c => c + 1);

      // Update local products list
      setProducts(prev => prev.map(p =>
        match.matchedProducts.find(mp => mp.id === p.id) ? { ...p, image_url: publicUrl } : p
      ));
    } catch (err: any) {
      setMatches(prev => prev.map((m, i) =>
        i === index ? { ...m, status: 'error', error: err.message } : m
      ));
    }
  }

  async function uploadAll() {
    setUploadingAll(true);
    setDoneCount(0);
    for (let i = 0; i < matches.length; i++) {
      if (matches[i].status === 'pending' && matches[i].matchedProducts.length > 0) {
        await uploadOne(i);
      }
    }
    setUploadingAll(false);
  }

  async function handleSingleUpload(productId: string, sku: string, file: File) {
    setUploading(productId);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `products/${sku}-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('site-images')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from('site-images').getPublicUrl(path);
      await supabase.from('products').update({ image_url: urlData.publicUrl }).eq('id', productId);
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, image_url: urlData.publicUrl } : p));
      setSaved(productId);
      setTimeout(() => setSaved(null), 3000);
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(null);
    }
  }

  const doneProductsCount = products.filter(p => p.image_url).length;
  const missingProductsCount = products.filter(p => !p.image_url).length;
  const pendingMatches = matches.filter(m => m.status === 'pending' && m.matchedProducts.length > 0).length;
  const totalMatches = matches.length;

  const filteredProducts = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || (filter === 'missing' && !p.image_url) || (filter === 'done' && !!p.image_url);
    return matchSearch && matchFilter;
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="font-bold text-lg" style={{ color: '#f5c518', fontFamily: "'Playfair Display', serif" }}>
              Product Images
            </h1>
            <p className="text-xs text-gray-400">
              {doneProductsCount} done · {missingProductsCount} missing · {products.length} total
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setMode('zip')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold"
              style={mode === 'zip' ? { backgroundColor: '#f5c518', color: '#060d1f' } : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
              📦 Zip Upload
            </button>
            <button onClick={() => setMode('single')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold"
              style={mode === 'single' ? { backgroundColor: '#f5c518', color: '#060d1f' } : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
              📷 One by One
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-gray-800">
          <div className="h-1.5 rounded-full transition-all"
            style={{ width: `${(doneProductsCount / Math.max(products.length, 1)) * 100}%`, backgroundColor: '#f5c518' }} />
        </div>
      </header>

      <div className="p-4">

        {/* ── ZIP UPLOAD MODE ── */}
        {mode === 'zip' && (
          <div className="space-y-4">

            {/* Drop zone */}
            {matches.length === 0 && (
              <div>
                <input ref={zipRef} type="file" accept=".zip" className="hidden"
                  onChange={handleZipUpload} />
                <button
                  onClick={() => zipRef.current?.click()}
                  disabled={zipProcessing || loading}
                  className="w-full rounded-2xl border-2 border-dashed border-gray-600 py-12 text-center disabled:opacity-50 transition hover:border-yellow-400"
                >
                  {zipProcessing ? (
                    <div>
                      <div className="text-4xl mb-3 animate-pulse">⏳</div>
                      <p className="text-gray-300 font-bold">Processing zip…</p>
                      <p className="text-gray-500 text-sm mt-1">Matching images to products</p>
                    </div>
                  ) : loading ? (
                    <div>
                      <div className="text-4xl mb-3 animate-pulse">📦</div>
                      <p className="text-gray-400 text-sm">Loading products…</p>
                    </div>
                  ) : (
                    <div>
                      <div className="text-5xl mb-3">📦</div>
                      <p className="text-white font-bold text-lg">Upload BSC-Product-Images.zip</p>
                      <p className="text-gray-400 text-sm mt-2">Images auto-matched to products by filename</p>
                      <div className="mt-4 inline-block px-5 py-2 rounded-xl font-bold text-sm"
                        style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                        Choose Zip File
                      </div>
                    </div>
                  )}
                </button>
              </div>
            )}

            {/* Matched results */}
            {matches.length > 0 && (
              <div className="space-y-3">
                {/* Summary + Upload All button */}
                <div className="bg-gray-900 rounded-xl p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-bold text-white">{totalMatches} images found</p>
                      <p className="text-xs text-gray-400">
                        {pendingMatches} ready to upload · {doneCount} done
                        {matches.filter(m => m.matchedProducts.length === 0).length > 0 &&
                          ` · ${matches.filter(m => m.matchedProducts.length === 0).length} unmatched`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setMatches([]); if (zipRef.current) zipRef.current.value = ''; }}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-gray-800 text-gray-400">
                        ✕ Clear
                      </button>
                      <button
                        onClick={uploadAll}
                        disabled={uploadingAll || pendingMatches === 0}
                        className="px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40"
                        style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                        {uploadingAll ? `Uploading ${doneCount}/${pendingMatches}…` : `⬆ Upload All ${pendingMatches}`}
                      </button>
                    </div>
                  </div>

                  {/* Progress */}
                  {uploadingAll && (
                    <div className="h-2 w-full rounded-full bg-gray-800">
                      <div className="h-2 rounded-full transition-all"
                        style={{ width: `${(doneCount / pendingMatches) * 100}%`, backgroundColor: '#f5c518' }} />
                    </div>
                  )}
                </div>

                {/* Image cards */}
                {matches.map((match, index) => (
                  <div key={match.filename}
                    className="bg-gray-900 rounded-xl border overflow-hidden"
                    style={{ borderColor: match.status === 'done' ? '#16a34a' : match.status === 'error' ? '#ef4444' : '#374151' }}>

                    <div className="flex gap-3 p-3">
                      {/* Image preview */}
                      <div className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-gray-800">
                        <img src={match.previewUrl} alt={match.filename}
                          className="w-full h-full object-cover" />
                        {match.status === 'done' && (
                          <div className="absolute inset-0 bg-green-600/80 flex items-center justify-center text-white text-2xl">✓</div>
                        )}
                        {match.status === 'uploading' && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white animate-pulse">⏳</div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-gray-400 truncate">{match.filename}</p>

                        {match.matchedProducts.length > 0 ? (
                          <div className="mt-1 space-y-1">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                              Matches {match.matchedProducts.length} product{match.matchedProducts.length > 1 ? 's' : ''}:
                            </p>
                            {match.matchedProducts.slice(0, 4).map(p => (
                              <div key={p.id} className="text-xs font-semibold text-white truncate">
                                · {p.name}
                              </div>
                            ))}
                            {match.matchedProducts.length > 4 && (
                              <p className="text-[10px] text-gray-500">+{match.matchedProducts.length - 4} more</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-yellow-500 mt-1">⚠ No product match found</p>
                        )}

                        {match.status === 'error' && (
                          <p className="text-xs text-red-400 mt-1">✕ {match.error}</p>
                        )}
                      </div>

                      {/* Upload button */}
                      <div className="shrink-0 flex items-center">
                        {match.status === 'pending' && match.matchedProducts.length > 0 && (
                          <button onClick={() => uploadOne(index)}
                            disabled={uploadingAll}
                            className="px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
                            style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                            ⬆
                          </button>
                        )}
                        {match.status === 'done' && (
                          <span className="text-green-400 text-xs font-bold">Done ✓</span>
                        )}
                        {match.status === 'uploading' && (
                          <span className="text-yellow-400 text-xs animate-pulse">Uploading…</span>
                        )}
                        {match.matchedProducts.length === 0 && (
                          <span className="text-gray-600 text-xs">Skip</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* All done message */}
                {matches.every(m => m.status === 'done' || m.matchedProducts.length === 0) && doneCount > 0 && (
                  <div className="rounded-xl p-6 text-center bg-green-900/30 border border-green-700">
                    <div className="text-4xl mb-2">🎉</div>
                    <p className="font-bold text-green-400 text-lg">{doneCount} images uploaded!</p>
                    <p className="text-green-600 text-sm mt-1">Market is now showing product photos</p>
                    <a href="/market" target="_blank"
                      className="mt-4 inline-block px-5 py-2 rounded-xl font-bold text-sm"
                      style={{ backgroundColor: '#f5c518', color: '#060d1f' }}>
                      View Market →
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── SINGLE UPLOAD MODE ── */}
        {mode === 'single' && (
          <div className="space-y-3">
            <input type="search" placeholder="Search products…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm text-white border border-gray-700 outline-none focus:border-yellow-400 placeholder:text-gray-500" />

            <div className="flex gap-2">
              {(['all', 'missing', 'done'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className="flex-1 rounded-xl py-2 text-xs font-bold capitalize"
                  style={filter === f ? { backgroundColor: '#f5c518', color: '#060d1f' } : { backgroundColor: '#1f2937', color: '#9ca3af' }}>
                  {f === 'all' ? `All (${products.length})` : f === 'missing' ? `Missing (${missingProductsCount})` : `Done (${doneProductsCount})`}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center text-gray-400 text-sm py-12 animate-pulse">Loading products…</div>
            ) : (
              <div className="space-y-3">
                {filteredProducts.map(product => (
                  <div key={product.id}
                    className="flex items-center gap-3 rounded-xl bg-gray-900 border border-gray-800 p-3">
                    <div className="relative shrink-0 h-16 w-16 rounded-xl overflow-hidden bg-gray-800">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl">📦</div>
                      )}
                      {saved === product.id && (
                        <div className="absolute inset-0 flex items-center justify-center bg-green-600/80 text-white text-lg font-bold rounded-xl">✓</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{product.name}</p>
                      <p className="text-xs text-gray-400">{product.sku}</p>
                      {product.image_url
                        ? <p className="text-[10px] text-green-400 mt-0.5">✓ Image uploaded</p>
                        : <p className="text-[10px] text-yellow-400 mt-0.5">⚠ No image</p>}
                    </div>
                    <div className="shrink-0">
                      <input
                        ref={el => { fileRefs.current[product.id] = el; }}
                        type="file" accept="image/*" capture="environment" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleSingleUpload(product.id, product.sku, f); }}
                      />
                      <button
                        onClick={() => fileRefs.current[product.id]?.click()}
                        disabled={uploading === product.id}
                        className="rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50"
                        style={product.image_url
                          ? { backgroundColor: '#1f2937', color: '#9ca3af' }
                          : { backgroundColor: '#f5c518', color: '#060d1f' }}>
                        {uploading === product.id ? '⏳' : product.image_url ? '↺ Replace' : '📷 Upload'}
                      </button>
                    </div>
                  </div>
                ))}
                {filteredProducts.length === 0 && (
                  <div className="text-center text-gray-500 text-sm py-12">No products found</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
