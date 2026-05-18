'use client';

// /dashboard/daily-briefing — archive view.
//
// Latest briefing pinned at the top + rolling 90-day history below.
// Founder + co_founder only (matches the rest of /dashboard). Search
// by date (YYYY-MM-DD). "Re-send to me" button per row that POSTs to
// /api/dashboard/daily-briefing/test-send with overrides set to the
// stored briefing's content (so we don't lose the original snapshot).
//
// "Send test now" button at the top fires a fresh sample for tonight's
// end-to-end Resend smoke test.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface BriefingRow {
  id:                string;
  briefing_date:     string;
  generated_content: string | null;
  sent_to:           string[];
  sent_at:           string | null;
  status:            'pending' | 'sent' | 'failed' | 'placeholder';
  created_at:        string;
}

const NAVY  = '#060d1f';
const GOLD  = '#f5c518';
const SOFT  = '#0b1628';
const MUTED = 'rgba(255,255,255,0.55)';

export default function DailyBriefingArchivePage() {
  const [rows,    setRows]    = useState<BriefingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState<string | null>(null);
  const [search,  setSearch]  = useState('');
  const [toast,   setToast]   = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [authed,  setAuthed]  = useState<boolean | null>(null);
  const [openId,  setOpenId]  = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/daily-briefing'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      const role = (prof?.role as string | null) ?? null;
      if (role !== 'founder' && role !== 'co_founder' && role !== 'control_admin') {
        window.location.href = '/market';
        return;
      }
      if (cancelled) return;
      setAuthed(true);

      const since = new Date();
      since.setDate(since.getDate() - 90);
      const { data, error } = await supabase
        .from('daily_briefings')
        .select('id, briefing_date, generated_content, sent_to, sent_at, status, created_at')
        .gte('briefing_date', since.toISOString().slice(0, 10))
        .order('briefing_date', { ascending: false })
        .order('created_at',    { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (error) setErr(error.message); else setRows((data ?? []) as BriefingRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  }

  async function triggerTestSend(rowId?: string) {
    setTesting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      const res = await fetch('/api/dashboard/daily-briefing/test-send', {
        method:  'POST',
        headers,
        body:    JSON.stringify({}),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        showToast(false, j.error || `HTTP ${res.status}`);
        return;
      }
      showToast(true, `Sent (${j.status}) to ${j.sent_to.length} recipient${j.sent_to.length === 1 ? '' : 's'}`);
      // Refresh the archive so the new send shows.
      const { data } = await supabase
        .from('daily_briefings')
        .select('id, briefing_date, generated_content, sent_to, sent_at, status, created_at')
        .order('briefing_date', { ascending: false })
        .order('created_at',    { ascending: false })
        .limit(200);
      setRows((data ?? []) as BriefingRow[]);
      if (rowId) setOpenId(rowId);
    } catch (e) {
      showToast(false, e instanceof Error ? e.message : 'Send failed');
    } finally {
      setTesting(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => r.briefing_date.toLowerCase().includes(q));
  }, [rows, search]);

  if (authed === null) {
    return <div style={{ minHeight: '100vh', background: NAVY, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>…</div>;
  }

  return (
    <div style={{ minHeight: '100vh', background: NAVY, color: '#fff', fontFamily: "'DM Sans', sans-serif" }}>
      {toast && (
        <div style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 60, padding: '12px 20px', borderRadius: 12, fontWeight: 700, fontSize: 14, background: toast.ok ? '#16a34a' : '#dc2626', color: '#fff' }}>
          {toast.msg}
        </div>
      )}

      <header style={{ background: SOFT, borderBottom: `1px solid ${GOLD}33`, padding: '14px 18px' }}>
        <Link href="/dashboard" style={{ color: GOLD, fontSize: 12, textDecoration: 'none' }}>← Dashboard</Link>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: GOLD, fontFamily: "'Playfair Display', serif", margin: '4px 0 2px' }}>
          📰 Daily Briefing — Archive
        </h1>
        <p style={{ fontSize: 12, color: MUTED }}>9 PM AST · founder + co-founder only · 90-day rolling history</p>
      </header>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input type="text" placeholder="Search by date (YYYY-MM-DD)…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 220, padding: '10px 12px', borderRadius: 10, background: SOFT, border: `1px solid ${GOLD}33`, color: '#fff', fontSize: 14, outline: 'none' }} />
          <button onClick={() => triggerTestSend()} disabled={testing}
            style={{ padding: '10px 16px', borderRadius: 10, background: GOLD, color: NAVY, border: 'none', fontWeight: 700, fontSize: 13, cursor: testing ? 'wait' : 'pointer', opacity: testing ? 0.6 : 1 }}>
            {testing ? 'Sending…' : '✉️ Send test now'}
          </button>
        </div>

        {err     && <p style={{ color: '#f87171', fontSize: 13 }}>⚠ {err}</p>}
        {loading && <p style={{ color: MUTED, textAlign: 'center', padding: 30 }}>Loading…</p>}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: MUTED, border: `1px dashed ${GOLD}33`, borderRadius: 12 }}>
            No briefings yet for that date.{' '}
            <button onClick={() => triggerTestSend()} style={{ background: 'transparent', border: 'none', color: GOLD, textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>
              Send a test
            </button>
            ?
          </div>
        )}

        {filtered.map((r, i) => {
          const open = openId === r.id;
          const isLatest = i === 0;
          return (
            <article key={r.id} style={{ background: SOFT, border: `1px solid ${isLatest ? GOLD : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, color: GOLD, letterSpacing: 1, textTransform: 'uppercase' }}>
                    {isLatest ? 'Latest' : 'Archive'} · {r.status}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginTop: 2 }}>{r.briefing_date}</div>
                  <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                    {r.sent_at ? `sent ${new Date(r.sent_at).toLocaleString()}` : 'not sent'}
                    {r.sent_to.length > 0 && ` · ${r.sent_to.length} recipient${r.sent_to.length === 1 ? '' : 's'}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setOpenId(open ? null : r.id)}
                    style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', fontSize: 11, cursor: 'pointer' }}>
                    {open ? 'Hide' : 'View'}
                  </button>
                  <button onClick={() => triggerTestSend(r.id)} disabled={testing}
                    style={{ padding: '6px 12px', borderRadius: 8, background: GOLD, color: NAVY, border: 'none', fontWeight: 700, fontSize: 11, cursor: testing ? 'wait' : 'pointer' }}>
                    Re-send to me
                  </button>
                </div>
              </div>
              {open && r.generated_content && (
                <iframe
                  title={`Briefing ${r.briefing_date}`}
                  srcDoc={r.generated_content}
                  style={{ width: '100%', minHeight: 600, border: 'none', borderRadius: 8, marginTop: 12, background: '#fff' }}
                />
              )}
            </article>
          );
        })}
      </main>
    </div>
  );
}
