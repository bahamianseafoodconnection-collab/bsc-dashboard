'use client';

// /dashboard/sql-editor
//
// Founder-only SQL editor — runs queries against the live BSC database
// via the bsc_admin_exec_sql() SECURITY DEFINER RPC. Role check happens
// in Postgres (founder / co_founder / control_admin). Every query is
// logged to sql_query_audit regardless of outcome.
//
// Layout:
//   • LEFT pane — schema overview: every public table with row estimate
//     and RLS status. Click a table to insert `SELECT * FROM <t> LIMIT 100`.
//   • CENTER pane — query editor + run controls + results.
//   • RIGHT pane — recent query history (last 20 from this founder),
//     pulled from sql_query_audit.
//
// Read-only by default. Write/DDL queries are blocked unless the founder
// flips the "Allow writes" toggle (which also requires a click-through
// confirm before sending).

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const FOUNDER_ROLES = new Set(['founder','co_founder','control_admin']);

interface TableRow {
  table_name:       string;
  row_estimate:     number;
  live_rows:        number;
  rls_enabled:      boolean;
  last_analyzed:    string | null;
  last_autovacuum:  string | null;
}
interface RunResult {
  rows:       Array<Record<string, unknown>>;
  rowcount:   number;
  elapsed_ms: number;
  statement:  string;
}
interface HistoryRow {
  id:           string;
  sql_text:     string;
  allow_write:  boolean;
  rowcount:     number | null;
  elapsed_ms:   number | null;
  error:        string | null;
  ran_at:       string;
}
interface SavedQuery {
  id:         string;
  label:      string;
  sql_text:   string;
  created_at: string;
}

const PRESETS: Array<{ label: string; sql: string }> = [
  { label: 'Schema integrity — all tables', sql: "SELECT * FROM bsc_admin_schema_overview() ORDER BY row_estimate DESC;" },
  { label: 'Today\'s orders',               sql: "SELECT id, created_at, customer_name, customer_phone, order_type, total, net_profit FROM orders WHERE created_at >= now()::date ORDER BY created_at DESC;" },
  { label: 'Top 20 spenders (lifetime)',    sql: "SELECT id, full_name, phone_e164, total_orders, total_spent FROM customers WHERE id <> '00000000-0000-0000-0000-000000000001' ORDER BY total_spent DESC NULLS LAST LIMIT 20;" },
  { label: 'Pending products (AI)',         sql: "SELECT sku, name, category, created_at FROM products WHERE parent_product_id IS NOT NULL AND sell_nassau=false AND sell_andros=false AND sell_online=false AND sell_wholesale=false ORDER BY created_at DESC;" },
  { label: 'Active specials',               sql: "SELECT sku, name, special_price, special_starts_at, special_ends_at, special_label FROM products WHERE special_price IS NOT NULL AND (special_starts_at IS NULL OR special_starts_at <= now()) AND (special_ends_at IS NULL OR special_ends_at >= now()) ORDER BY special_ends_at NULLS LAST;" },
  { label: 'Today\'s lot consumption',      sql: "SELECT l.lot_code, o.customer_name, o.total, olc.quantity_lbs, olc.recorded_at FROM order_lot_consumption olc JOIN spinytails_lots l ON l.id = olc.lot_id JOIN orders o ON o.id = olc.order_id WHERE olc.recorded_at >= now()::date ORDER BY olc.recorded_at DESC;" },
  { label: 'AR > 60 days unpaid',           sql: "SELECT id, created_at, customer_name, customer_phone, total, (now()::date - created_at::date) AS age_days FROM orders WHERE payment_status = 'unpaid' AND created_at < now() - interval '60 days' ORDER BY created_at;" },
  { label: 'My recent SQL history',         sql: "SELECT ran_at, allow_write, rowcount, elapsed_ms, error, left(sql_text, 80) AS sql_preview FROM sql_query_audit WHERE caller_id = auth.uid() ORDER BY ran_at DESC LIMIT 50;" },
];

export default function SqlEditorPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const [sql,       setSql]       = useState<string>(PRESETS[0].sql);
  const [allowWrite,setAllowWrite]= useState(false);
  const [running,   setRunning]   = useState(false);
  const [result,    setResult]    = useState<RunResult | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  const [tables,  setTables]  = useState<TableRow[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaErr, setSchemaErr] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [saved,   setSaved]   = useState<SavedQuery[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login?next=/dashboard/sql-editor'; return; }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (!prof || !FOUNDER_ROLES.has(prof.role as string)) { window.location.href = '/dashboard'; return; }
      setAuthed(true);
    })();
  }, []);

  const loadSchema = useCallback(async () => {
    setSchemaLoading(true); setSchemaErr(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/sql-editor/schema', {
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    });
    const json = await res.json();
    setSchemaLoading(false);
    if (json.ok) setTables(json.tables as TableRow[]);
    else setSchemaErr(json.error ?? 'Schema load failed');
  }, []);

  const loadHistory = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase
      .from('sql_query_audit')
      .select('id, sql_text, allow_write, rowcount, elapsed_ms, error, ran_at')
      .eq('caller_id', session.user.id)
      .order('ran_at', { ascending: false })
      .limit(20);
    setHistory((data ?? []) as HistoryRow[]);
  }, []);

  const loadSaved = useCallback(async () => {
    const { data } = await supabase
      .from('sql_query_saved')
      .select('id, label, sql_text, created_at')
      .order('created_at', { ascending: false });
    setSaved((data ?? []) as SavedQuery[]);
  }, []);

  async function saveCurrent() {
    if (!sql.trim()) return;
    const label = prompt('Label for this query?');
    if (!label || !label.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { error } = await supabase.from('sql_query_saved').insert({
      owner_id: session.user.id, label: label.trim(), sql_text: sql,
    });
    if (error) { alert('Save failed: ' + error.message); return; }
    loadSaved();
  }
  async function deleteSaved(id: string) {
    if (!confirm('Delete this saved query?')) return;
    await supabase.from('sql_query_saved').delete().eq('id', id);
    loadSaved();
  }

  useEffect(() => { if (authed) { loadSchema(); loadHistory(); loadSaved(); } }, [authed, loadSchema, loadHistory, loadSaved]);

  async function run() {
    if (!sql.trim()) return;
    if (allowWrite) {
      if (!confirm('⚠ Allow writes is ON. This will execute INSERT/UPDATE/DELETE/DDL against the live database. Continue?')) return;
    }
    setRunning(true); setError(null); setResult(null);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/sql-editor/run', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ sql, allow_write: allowWrite }),
    });
    const json = await res.json();
    setRunning(false);
    if (json.ok) {
      setResult(json.result as RunResult);
    } else {
      setError(json.error ?? 'Query failed');
    }
    loadHistory();
    // Re-fresh schema if a write/DDL just ran (row counts may have changed)
    if (allowWrite && json.ok) loadSchema();
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); }
  }

  function copyCsv() {
    if (!result || result.rows.length === 0) return;
    const cols = Object.keys(result.rows[0]);
    const lines = [
      cols.join(','),
      ...result.rows.map(r => cols.map(c => {
        const v = r[c];
        if (v === null || v === undefined) return '';
        const s = typeof v === 'string' ? v : JSON.stringify(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')),
    ];
    const csv = lines.join('\n');
    navigator.clipboard.writeText(csv);
  }

  if (authed === null) return <div style={pg}>Loading…</div>;

  const tablesMissingRls = tables.filter(t => !t.rls_enabled);

  return (
    <div style={pg}>
      <header style={hdr}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <Link href="/dashboard" style={back}>← Dashboard</Link>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
              {tables.length > 0 && <>📊 {tables.length} tables · </>}
              {tablesMissingRls.length > 0 && <span style={{ color: '#fbbf24' }}>⚠ {tablesMissingRls.length} without RLS</span>}
            </div>
          </div>
          <h1 style={h1}>⚡ SQL editor — founder-only</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            Live queries against the BSC database. Read-only by default; flip <strong style={{ color: '#fbbf24' }}>Allow writes</strong> to enable mutations. Every call is logged to <code style={{ background: '#0b1628', padding: '0 4px', borderRadius: 3 }}>sql_query_audit</code>. Caller must be founder / co_founder / control_admin — verified inside the Postgres function.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: 16, display: 'grid', gridTemplateColumns: '240px 1fr 280px', gap: 12 }}>
        {/* LEFT — Schema overview */}
        <aside style={sidePane}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div style={paneTitle}>Schema</div>
            <button onClick={loadSchema} disabled={schemaLoading}
              style={{ background: 'transparent', color: '#f5c518', border: 'none', fontSize: 10, cursor: 'pointer', opacity: schemaLoading ? 0.5 : 1 }}>
              {schemaLoading ? '…' : '↻'}
            </button>
          </div>
          {schemaErr && <div style={errInline}>{schemaErr}</div>}
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {tables.map(t => (
              <button key={t.table_name}
                onClick={() => setSql(`SELECT * FROM ${t.table_name} LIMIT 100;`)}
                style={tableBtn}
                title={`row estimate ${t.row_estimate.toLocaleString()} · RLS ${t.rls_enabled ? 'on' : 'OFF'}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.table_name}</span>
                  <span style={{ fontSize: 9, color: t.rls_enabled ? '#4ade80' : '#fbbf24', flexShrink: 0 }}>{t.rls_enabled ? '🔒' : '⚠'}</span>
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)' }}>~{t.row_estimate.toLocaleString()} rows</div>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={paneTitle}>Presets (built-in)</div>
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => setSql(p.sql)}
                style={{ ...tableBtn, display: 'block', textAlign: 'left' }}>
                <span style={{ fontSize: 11, color: '#f5c518' }}>{p.label}</span>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <div style={paneTitle}>My saved ({saved.length})</div>
              <button onClick={saveCurrent} disabled={!sql.trim()}
                style={{ background: 'transparent', color: '#4ade80', border: 'none', fontSize: 10, cursor: 'pointer', opacity: sql.trim() ? 1 : 0.4 }}
                title="Save current SQL with a label">+ Save current</button>
            </div>
            {saved.length === 0 && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>None yet. Write a query, click + Save current.</div>}
            {saved.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => setSql(s.sql_text)} style={{ ...tableBtn, flex: 1, display: 'block', textAlign: 'left' }}>
                  <span style={{ fontSize: 11, color: '#4ade80' }}>{s.label}</span>
                </button>
                <button onClick={() => deleteSaved(s.id)}
                  style={{ background: 'transparent', color: '#f87171', border: 'none', cursor: 'pointer', fontSize: 10, padding: '2px 4px' }}
                  title="Delete">🗑</button>
              </div>
            ))}
          </div>
        </aside>

        {/* CENTER — Editor + result */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <div style={editorPane}>
            <textarea
              ref={editorRef}
              value={sql}
              onChange={e => setSql(e.target.value)}
              onKeyDown={onKey}
              spellCheck={false}
              style={editorTextarea}
              placeholder="-- SELECT * FROM orders ORDER BY created_at DESC LIMIT 50; (Cmd/Ctrl+Enter to run)"
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
              <button onClick={run} disabled={running || !sql.trim()}
                style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: (running || !sql.trim()) ? 0.5 : 1 }}>
                {running ? 'Running…' : '▶ Run (⌘↵)'}
              </button>
              <label style={{ fontSize: 11, color: allowWrite ? '#fbbf24' : 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={allowWrite} onChange={e => setAllowWrite(e.target.checked)} style={{ accentColor: '#fbbf24' }} />
                {allowWrite ? '⚠ Allow writes ON' : 'Allow writes (off)'}
              </label>
              {result && (
                <>
                  <span style={{ fontSize: 11, color: '#4ade80' }}>✓ {result.rowcount.toLocaleString()} rows · {result.elapsed_ms} ms · {result.statement}</span>
                  <button onClick={copyCsv} style={{ background: 'rgba(245,197,24,0.12)', color: '#f5c518', border: '1px solid #f5c518', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', marginLeft: 'auto' }}>
                    ⎘ Copy CSV
                  </button>
                </>
              )}
            </div>
          </div>

          {error && <div style={errBox}>⚠ {error}</div>}

          {result && (
            <div style={resultPane}>
              {result.rows.length === 0 ? (
                <div style={{ padding: 18, fontSize: 12, color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
                  Query returned no rows.
                </div>
              ) : (
                <ResultTable rows={result.rows} />
              )}
            </div>
          )}
        </section>

        {/* RIGHT — History */}
        <aside style={sidePane}>
          <div style={paneTitle}>Recent queries (last 20)</div>
          <div style={{ maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.length === 0 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>No history yet.</div>}
            {history.map(h => (
              <button key={h.id} onClick={() => setSql(h.sql_text)} style={historyBtn}
                title={h.error ?? `${h.rowcount} rows · ${h.elapsed_ms} ms`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 9, color: h.error ? '#f87171' : '#4ade80' }}>
                    {h.error ? '⚠' : '✓'} {h.rowcount ?? 0} · {h.elapsed_ms ?? 0}ms
                  </span>
                  {h.allow_write && <span style={{ fontSize: 9, color: '#fbbf24' }}>WRITE</span>}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {h.sql_text}
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{new Date(h.ran_at).toLocaleString()}</div>
              </button>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}

function ResultTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  const cols = Object.keys(rows[0]);
  return (
    <div style={{ overflow: 'auto', maxHeight: '60vh' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, fontFamily: 'monospace' }}>
        <thead style={{ position: 'sticky', top: 0, background: '#0b1628', zIndex: 1 }}>
          <tr>
            {cols.map(c => (
              <th key={c} style={{ textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid rgba(245,197,24,0.25)', color: '#f5c518', fontWeight: 700, whiteSpace: 'nowrap' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 500).map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#060d1f' : '#0a1628' }}>
              {cols.map(c => {
                const v = r[c];
                const str = v === null || v === undefined ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v);
                return (
                  <td key={c} style={{ padding: '4px 10px', borderTop: '1px solid rgba(255,255,255,0.04)', color: v === null ? 'rgba(255,255,255,0.35)' : '#fff', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={str}>
                    {str.length > 80 ? str.slice(0, 80) + '…' : str}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 500 && (
        <div style={{ padding: 8, fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
          Showing first 500 of {rows.length.toLocaleString()} rows. Use Copy CSV for the full set.
        </div>
      )}
    </div>
  );
}

const pg: React.CSSProperties = { minHeight: '100vh', background: '#060d1f', color: '#fff', fontFamily: "'DM Sans', sans-serif", paddingBottom: 80 };
const hdr: React.CSSProperties = { background: '#0b1628', padding: '14px 16px', borderBottom: '1px solid rgba(245,197,24,0.2)' };
const back: React.CSSProperties = { color: '#f5c518', fontSize: 12, textDecoration: 'none' };
const h1: React.CSSProperties = { fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: '#f5c518', margin: '4px 0 2px' };
const sidePane: React.CSSProperties = { background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 10, padding: 10 };
const paneTitle: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 };
const tableBtn: React.CSSProperties = { background: 'transparent', border: 'none', textAlign: 'left', padding: '4px 6px', borderRadius: 4, cursor: 'pointer', width: '100%', display: 'block' };
const editorPane: React.CSSProperties = { background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 10, overflow: 'hidden' };
const editorTextarea: React.CSSProperties = { width: '100%', minHeight: 160, background: '#060d1f', color: '#fff', border: 'none', padding: 12, fontFamily: 'Menlo, "Courier New", monospace', fontSize: 13, lineHeight: 1.5, outline: 'none', resize: 'vertical', boxSizing: 'border-box' };
const resultPane: React.CSSProperties = { background: '#0f1f3d', border: '1px solid rgba(245,197,24,0.15)', borderRadius: 10, overflow: 'hidden' };
const errBox: React.CSSProperties = { padding: 12, background: 'rgba(248,113,113,0.15)', border: '1px solid #f87171', color: '#f87171', borderRadius: 8, fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap' };
const errInline: React.CSSProperties = { padding: '6px 8px', background: 'rgba(248,113,113,0.1)', color: '#f87171', borderRadius: 4, fontSize: 10, marginBottom: 6 };
const historyBtn: React.CSSProperties = { background: '#060d1f', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', textAlign: 'left' };
