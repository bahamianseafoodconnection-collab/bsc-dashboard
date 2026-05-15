'use client';

// app/notifications/page.tsx
//
// Staff view of the outbound notification queue. Filter by status,
// search by recipient/body. "Process queue" button calls
// /api/notifications/send to fire any queued items.
//
// Until Twilio/SendGrid creds are wired, sent notifications land as
// 'stub_sent' — the row stays as a record of what would have gone out.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { plainError } from '@/lib/plain-error';

export const dynamic = 'force-dynamic';

type Notification = {
  id: string;
  created_at: string;
  channel: 'sms' | 'whatsapp' | 'email';
  recipient_phone: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  template_key: string | null;
  subject: string | null;
  body: string;
  status: 'queued' | 'stub_sent' | 'sent' | 'failed' | 'skipped';
  attempts: number;
  error: string | null;
  sent_at: string | null;
  provider_message_id: string | null;
};

type Filter = 'all' | 'queued' | 'stub_sent' | 'sent' | 'failed';

export default function NotificationsPage() {
  const [rows, setRows] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (err) {
      setError(plainError(err));
      setRows([]);
    } else {
      setRows((data || []) as Notification[]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function processQueue() {
    setProcessing(true);
    setProcessResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/notifications/send', { method: 'POST', headers });
      const json = await res.json();
      if (json.ok) {
        setProcessResult(`Processed ${json.processed} notification(s).`);
      } else {
        setProcessResult(`Error: ${json.error || 'unknown'}`);
      }
    } catch (e) {
      setProcessResult(`Network error: ${e instanceof Error ? e.message : 'unknown'}`);
    }
    setProcessing(false);
    await load();
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = [
          r.recipient_phone, r.recipient_email, r.recipient_name,
          r.body, r.template_key, r.subject,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { queued: 0, stub_sent: 0, sent: 0, failed: 0 };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0 }}>Notifications</h1>
        <button
          onClick={processQueue}
          disabled={processing || counts.queued === 0}
          style={{
            background: counts.queued > 0 ? '#f5c518' : '#4b5563',
            color: counts.queued > 0 ? '#060d1f' : '#94a3b8',
            border: 'none',
            borderRadius: 8,
            padding: '8px 14px',
            fontWeight: 900,
            fontSize: 13,
            cursor: counts.queued > 0 && !processing ? 'pointer' : 'not-allowed',
          }}
        >
          {processing ? 'Sending…' : `Process queue${counts.queued > 0 ? ` (${counts.queued})` : ''}`}
        </button>
      </div>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>
        Outbound SMS · WhatsApp · email queue. Provider creds unset → rows
        mark as <em>stub_sent</em> instead of actually sending.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        <Stat label="Queued" value={counts.queued} accent={counts.queued > 0 ? '#f5c518' : '#94a3b8'} />
        <Stat label="Stub sent" value={counts.stub_sent} accent="#a78bfa" />
        <Stat label="Sent" value={counts.sent} accent="#22c55e" />
        <Stat label="Failed" value={counts.failed} accent={counts.failed > 0 ? '#f87171' : '#94a3b8'} />
      </div>

      {processResult && (
        <div
          style={{
            background: 'rgba(74,222,128,0.08)',
            border: '1px solid #4ade8033',
            borderRadius: 10,
            padding: '10px 12px',
            color: '#4ade80',
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 12,
          }}
        >
          {processResult}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 10, overflowX: 'auto' }}>
        {(
          [
            ['all', 'All'],
            ['queued', 'Queued'],
            ['stub_sent', 'Stub sent'],
            ['sent', 'Sent'],
            ['failed', 'Failed'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            style={{
              ...filterPillStyle,
              background: filter === k ? '#f5c518' : '#1e2d4a',
              color: filter === k ? '#060d1f' : '#cbd5e1',
            }}
          >{label}</button>
        ))}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by recipient, body, template…"
        style={inputStyle}
      />

      {loading && <p style={{ color: '#94a3b8' }}>Loading notifications…</p>}

      {!loading && error && (
        <ErrorBox text={error} migration="sql/2026-05-09-notifications.sql" />
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>
          No notifications match. POS sales auto-queue customer order
          confirmations when phone is captured.
        </div>
      )}

      {filtered.map((n) => {
        const tone =
          n.status === 'sent'      ? '#22c55e' :
          n.status === 'stub_sent' ? '#a78bfa' :
          n.status === 'failed'    ? '#f87171' :
          n.status === 'queued'    ? '#f5c518' :
          '#94a3b8';
        return (
          <div
            key={n.id}
            style={{ ...cardStyle, borderLeft: `4px solid ${tone}` }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                  {channelEmoji(n.channel)} {n.recipient_name || n.recipient_phone || n.recipient_email || '—'}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {n.template_key || 'manual'} · {n.created_at.slice(0, 16).replace('T', ' ')}
                  {n.attempts > 0 && ` · ${n.attempts} attempt(s)`}
                </div>
              </div>
              <span
                style={{
                  fontSize: 9,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  fontWeight: 800,
                  padding: '4px 8px',
                  borderRadius: 999,
                  color: '#060d1f',
                  background: tone,
                }}
              >{n.status}</span>
            </div>
            {n.subject && (
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4, fontWeight: 700 }}>
                {n.subject}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4, whiteSpace: 'pre-wrap' }}>
              {n.body}
            </div>
            {n.error && (
              <div style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>
                ⚠ {n.error}
              </div>
            )}
            {n.sent_at && (
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6 }}>
                {n.status === 'stub_sent' ? 'Would have sent' : 'Sent'} at {n.sent_at.slice(0, 16).replace('T', ' ')}
                {n.provider_message_id && ` · ${n.provider_message_id.slice(0, 16)}`}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function channelEmoji(c: string) {
  return c === 'sms' ? '📱' : c === 'whatsapp' ? '💬' : c === 'email' ? '✉️' : '🔔';
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{ background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: accent || '#f5c518', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ErrorBox({ text, migration }: { text: string; migration?: string }) {
  return (
    <div style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
      ⚠️ {text}
      {migration && text.toLowerCase().includes('relation') && (
        <div style={{ marginTop: 6 }}>Run {migration} in the Supabase SQL editor.</div>
      )}
    </div>
  );
}

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 720, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: '12px 14px', border: '1px solid #1e3a5f', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' };
const filterPillStyle: React.CSSProperties = { padding: '6px 12px', borderRadius: 999, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
