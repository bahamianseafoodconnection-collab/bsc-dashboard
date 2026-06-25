'use client';

// /founder/channels — Channel Margins panel.
// The 6-channel matrix (Nassau/Andros/Online × Retail/Wholesale), each with its
// own markup from supplier cost. Editing a margin updates channel_markups (the
// default that prices new products); "Apply to all" re-prices every product on
// that channel from its current cost. Does not change tax math.

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const GOLD = '#f5c518';
const INK = '#060d1f';
const CARD = '#0f1a2e';
const BORDER = 'rgba(255,255,255,0.08)';

type Ch = { channel: string; location: string; tier: string; sell_flag: string; margin_pct: number; configured: boolean };

export default function ChannelMarginsPanel() {
  const router = useRouter();
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const [channels, setChannels] = useState<Ch[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };
  const tok = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null, [supabase]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const t = await tok();
      if (!t) { router.push('/staff-login?next=/founder/channels'); return; }
      const res = await fetch('/api/founder/channels', { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' });
      const j = await res.json();
      if (!res.ok || !j.ok) { setErr(j.error || `HTTP ${res.status}`); return; }
      setChannels(j.channels as Ch[]);
      setEdits(Object.fromEntries((j.channels as Ch[]).map(c => [c.channel, String(c.margin_pct)])));
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [tok, router]);
  useEffect(() => { load(); }, [load]);

  async function save(c: Ch, applyAll: boolean) {
    const pct = Number(edits[c.channel]);
    if (!Number.isFinite(pct) || pct < 0) { flash('Enter a valid %'); return; }
    if (applyAll && !confirm(`Re-price EVERY product on "${c.location} ${c.tier}" to ${pct}% from its cost? This updates live prices on that channel.`)) return;
    setBusy(c.channel);
    try {
      const t = await tok();
      const res = await fetch('/api/founder/channels', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: JSON.stringify({ channel: c.channel, margin_pct: pct, apply_to_all: applyAll }) });
      const j = await res.json();
      if (!res.ok || !j.ok) { flash(j.error || 'Save failed'); return; }
      flash(applyAll ? `✓ ${c.location} ${c.tier} = ${pct}% · re-priced ${j.repriced} products` : `✓ ${c.location} ${c.tier} margin saved (${pct}%)`);
      await load();
    } finally { setBusy(null); }
  }

  const grouped = ['Nassau POS', 'Andros POS', 'Online'].map(loc => ({ loc, items: channels.filter(c => c.location === loc) }));

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header style={{ backgroundColor: INK, padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/founder')} style={{ background: 'transparent', color: GOLD, border: `1px solid rgba(245,197,24,0.3)`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: GOLD, fontWeight: 900, fontSize: 19 }}>📊 Channel Margins</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>6 channels · each its own markup from supplier cost</div>
          </div>
          <button onClick={load} disabled={loading} style={{ background: 'transparent', color: 'rgba(255,255,255,0.7)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{loading ? '…' : '↻'}</button>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {err && <div style={{ padding: 14, borderRadius: 10, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>⚠️ {err}{/channel_markups|andros_wholesale|relation|enum/i.test(err) ? ' — run the andros_wholesale ALTER first.' : ''}</div>}

        {grouped.map(g => (
          <section key={g.loc} style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', color: '#fff', fontWeight: 900, fontSize: 14 }}>{g.loc}</div>
            {g.items.map(c => (
              <div key={c.channel} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: `1px solid ${BORDER}`, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 110 }}>
                  <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 13 }}>{c.tier}{c.tier === 'Retail' ? ' · per item' : ' · by case'}</div>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontFamily: 'monospace' }}>{c.channel}{!c.configured ? ' · default' : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" inputMode="decimal" step="0.5" value={edits[c.channel] ?? ''} onChange={e => setEdits(p => ({ ...p, [c.channel]: e.target.value }))}
                    style={{ width: 70, textAlign: 'right', background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '8px 10px', fontSize: 14, fontWeight: 800 }} />
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>%</span>
                </div>
                <button onClick={() => save(c, false)} disabled={busy === c.channel} style={{ background: 'transparent', color: '#93c5fd', border: '1px solid rgba(147,197,253,0.4)', borderRadius: 8, padding: '7px 11px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>Save</button>
                <button onClick={() => save(c, true)} disabled={busy === c.channel} style={{ background: GOLD, color: INK, border: 'none', borderRadius: 8, padding: '7px 11px', fontSize: 11.5, fontWeight: 900, cursor: busy === c.channel ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>{busy === c.channel ? '…' : 'Apply to all'}</button>
              </div>
            ))}
          </section>
        ))}
        <p style={{ color: '#94a3b8', fontSize: 11, textAlign: 'center' }}>“Save” sets the channel’s default margin (prices new products). “Apply to all” re-prices every existing product on that channel from its current supplier cost. Wholesale sells by the case, retail per item — same base cost, each its own markup. Tax math unchanged.</p>
      </main>
      {toast && <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#0f1a2e', color: '#fff', borderRadius: 10, padding: '10px 16px', fontSize: 12.5, fontWeight: 700, zIndex: 80, border: `1px solid ${GOLD}` }}>{toast}</div>}
    </div>
  );
}
