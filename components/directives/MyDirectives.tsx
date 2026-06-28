'use client';

// components/directives/MyDirectives.tsx
//
// Staff "My Tasks" feed — drop into any landing page (<MyDirectives />). Shows
// the signed-in user's open directives (tasks + current-cycle duties) targeting
// them, already in their language (server picks body/body_cr/body_es). Mark done
// with an optional note. Renders NOTHING when there's nothing assigned (and
// fails silent if the directives tables aren't there yet), so it's safe to embed
// everywhere.

import { useCallback, useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type Item = { instance_id: string; title: string; body: string; priority: string; kind: string; due_date: string | null; done: boolean; done_note: string | null };

let _sb: ReturnType<typeof createBrowserClient> | null = null;
function sb() { if (!_sb) _sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!); return _sb; }

const PRIO: Record<string, string> = { urgent: '#dc2626', high: '#d97706', normal: '#64748b', low: '#94a3b8' };

export default function MyDirectives({ compact = false }: { compact?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await sb().auth.getSession();
      if (!session?.access_token) { setLoaded(true); return; }
      const res = await fetch('/api/directives/feed', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) setItems(j.items as Item[]);
    } catch { /* fail silent */ }
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function mark(it: Item) {
    setBusy(it.instance_id);
    const note = it.done ? undefined : (window.prompt('Mark done — note (optional):') ?? undefined);
    const { data: { session } } = await sb().auth.getSession();
    await fetch('/api/directives/feed', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ instance_id: it.instance_id, action: it.done ? 'undone' : 'done', done_note: note }),
    });
    setBusy(null);
    load();
  }

  if (!loaded || items.length === 0) return null;   // nothing to show → render nothing

  const open = items.filter((i) => !i.done).length;
  return (
    <div style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 12, padding: 12, margin: compact ? '8px 0' : '12px 0', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ fontSize: 13, fontWeight: 900, color: '#f5c518', marginBottom: 8 }}>📋 My Tasks {open > 0 && <span style={{ background: '#dc2626', borderRadius: 10, padding: '1px 7px', fontSize: 11, marginLeft: 4 }}>{open}</span>}</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {items.map((it) => (
          <div key={it.instance_id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 0', borderTop: '1px solid #16243f', opacity: it.done ? 0.5 : 1 }}>
            <button onClick={() => mark(it)} disabled={busy === it.instance_id}
              style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: `2px solid ${it.done ? '#22c55e' : '#475569'}`, background: it.done ? '#22c55e' : 'transparent', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: '18px' }}>
              {it.done ? '✓' : ''}
            </button>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, textDecoration: it.done ? 'line-through' : 'none' }}>
                {it.kind === 'duty' ? '🔁 ' : ''}{it.title}
                <span style={{ color: PRIO[it.priority] ?? '#64748b', fontSize: 10, fontWeight: 800, marginLeft: 6 }}>{it.priority !== 'normal' ? it.priority.toUpperCase() : ''}</span>
              </div>
              {it.body && <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 2, whiteSpace: 'pre-wrap' }}>{it.body}</div>}
              {it.due_date && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>due {it.due_date}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
