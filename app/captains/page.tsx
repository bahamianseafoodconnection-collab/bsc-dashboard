'use client';

// app/captains/page.tsx
//
// Fishing captain registry. Every captain BSC sources from + their vessels.
// Aggregates total deliveries / lbs / paid (kept current by app code on
// each yield_lots / processing_batches insert).

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type Captain = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  whatsapp_number: string | null;
  notes: string | null;
  total_deliveries: number;
  total_lbs: number;
  total_paid_bsd: number;
  last_delivery_at: string | null;
};

type Vessel = {
  id: string;
  captain_id: string | null;
  name: string;
  registration: string | null;
  notes: string | null;
};

export default function CaptainsPage() {
  const [captains, setCaptains] = useState<Captain[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCaptainForm, setShowCaptainForm] = useState(false);
  const [showVesselForm, setShowVesselForm] = useState<string | null>(null);
  const [editing, setEditing] = useState<Captain | null>(null);

  // Captain form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Vessel form state
  const [vesselName, setVesselName] = useState('');
  const [vesselReg, setVesselReg] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    const [cap, ves] = await Promise.all([
      supabase.from('captains').select('*').order('last_delivery_at', { ascending: false, nullsFirst: false }).limit(500),
      supabase.from('vessels').select('*').order('name').limit(500),
    ]);
    if (cap.error) {
      setError(cap.error.message);
    } else {
      setCaptains((cap.data || []) as Captain[]);
    }
    if (!ves.error) setVessels((ves.data || []) as Vessel[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function resetCaptainForm() {
    setName(''); setPhone(''); setEmail(''); setWhatsapp(''); setNotes('');
    setEditing(null);
  }

  async function submitCaptain(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    const payload = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      whatsapp_number: whatsapp.trim() || null,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error: err } = editing
      ? await supabase.from('captains').update(payload).eq('id', editing.id)
      : await supabase.from('captains').insert(payload);
    setSubmitting(false);
    if (err) {
      alert(`Save failed: ${err.message}`);
      return;
    }
    setShowCaptainForm(false);
    resetCaptainForm();
    await load();
  }

  async function submitVessel(captainId: string, e: React.FormEvent) {
    e.preventDefault();
    if (!vesselName.trim()) return;
    const { error: err } = await supabase.from('vessels').insert({
      captain_id: captainId,
      name: vesselName.trim(),
      registration: vesselReg.trim() || null,
    });
    if (err) {
      alert(`Vessel save failed: ${err.message}`);
      return;
    }
    setVesselName(''); setVesselReg(''); setShowVesselForm(null);
    await load();
  }

  function startEdit(c: Captain) {
    setEditing(c);
    setName(c.name);
    setPhone(c.phone || '');
    setEmail(c.email || '');
    setWhatsapp(c.whatsapp_number || '');
    setNotes(c.notes || '');
    setShowCaptainForm(true);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return captains;
    return captains.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '')))
    );
  }, [captains, search]);

  const totalCaptains = captains.length;
  const totalLbs = captains.reduce((s, c) => s + Number(c.total_lbs || 0), 0);
  const totalPaid = captains.reduce((s, c) => s + Number(c.total_paid_bsd || 0), 0);

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0 }}>Captains & vessels</h1>
        <button
          onClick={() => { resetCaptainForm(); setShowCaptainForm(true); }}
          style={primaryBtnStyle}
        >+ New captain</button>
      </div>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>
        Every fisherman BSC sources from. Powers traceability from boat → batch → label.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
        <Stat label="Captains" value={String(totalCaptains)} />
        <Stat label="Lbs delivered" value={totalLbs.toFixed(0)} />
        <Stat label="Total paid" value={`$${totalPaid.toFixed(2)}`} />
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search captain by name or phone…"
        style={inputStyle}
      />

      {loading && <p style={{ color: '#94a3b8' }}>Loading…</p>}

      {!loading && error && (
        <div style={errorBoxStyle}>
          ⚠️ {error}
          {error.toLowerCase().includes('relation') && (
            <div style={{ marginTop: 6 }}>
              Run sql/2026-05-09-traceability.sql in the Supabase SQL editor.
            </div>
          )}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>
          No captains yet. Hit “+ New captain” to add the first.
        </div>
      )}

      {filtered.map((c) => {
        const captainVessels = vessels.filter((v) => v.captain_id === c.id);
        return (
          <div key={c.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {[c.phone, c.email].filter(Boolean).join(' · ') || 'no contact'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#f5c518' }}>
                  {Number(c.total_lbs).toFixed(0)} lb
                </div>
                <div style={{ fontSize: 11, color: '#16a34a' }}>
                  ${Number(c.total_paid_bsd).toFixed(2)} paid
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                  {c.total_deliveries} delivery{c.total_deliveries === 1 ? '' : 's'}
                </div>
              </div>
            </div>

            {captainVessels.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: 1, marginBottom: 4 }}>
                  Vessels
                </div>
                {captainVessels.map((v) => (
                  <div
                    key={v.id}
                    style={{
                      fontSize: 12,
                      color: '#cbd5e1',
                      padding: '4px 0',
                    }}
                  >
                    🚤 {v.name}
                    {v.registration && (
                      <span style={{ color: '#94a3b8', fontFamily: 'monospace', marginLeft: 8 }}>
                        {v.registration}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={() => startEdit(c)}
                style={ghostBtnStyle}
              >Edit</button>
              {showVesselForm === c.id ? (
                <form
                  onSubmit={(e) => submitVessel(c.id, e)}
                  style={{ display: 'flex', gap: 6, flex: 1 }}
                >
                  <input
                    type="text"
                    value={vesselName}
                    onChange={(e) => setVesselName(e.target.value)}
                    placeholder="Vessel name"
                    style={{ ...inputStyle, marginBottom: 0, flex: 2 }}
                    required
                  />
                  <input
                    type="text"
                    value={vesselReg}
                    onChange={(e) => setVesselReg(e.target.value)}
                    placeholder="Reg #"
                    style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                  />
                  <button type="submit" style={primaryBtnStyle}>Add</button>
                  <button
                    type="button"
                    onClick={() => { setShowVesselForm(null); setVesselName(''); setVesselReg(''); }}
                    style={ghostBtnStyle}
                  >×</button>
                </form>
              ) : (
                <button
                  onClick={() => setShowVesselForm(c.id)}
                  style={ghostBtnStyle}
                >+ Vessel</button>
              )}
            </div>

            {c.notes && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, whiteSpace: 'pre-wrap' }}>
                {c.notes}
              </div>
            )}
          </div>
        );
      })}

      {/* Captain form modal */}
      {showCaptainForm && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) { setShowCaptainForm(false); resetCaptainForm(); } }}
          style={overlayStyle}
        >
          <form onSubmit={submitCaptain} style={modalStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <h2 style={{ fontSize: 16, color: '#f5c518', fontWeight: 900, margin: 0 }}>
                {editing ? 'Edit captain' : 'New captain'}
              </h2>
              <button
                type="button"
                onClick={() => { setShowCaptainForm(false); resetCaptainForm(); }}
                style={ghostBtnStyle}
              >Cancel</button>
            </div>

            <FieldLabel>Name *</FieldLabel>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Anthony Taylor"
              style={inputStyle}
              required
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <FieldLabel>Phone</FieldLabel>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <FieldLabel>WhatsApp</FieldLabel>
                <input type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <FieldLabel>Email</FieldLabel>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />

            <FieldLabel>Notes</FieldLabel>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything worth remembering — preferred catches, payment terms, etc."
              style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }}
            />

            <button
              type="submit"
              disabled={submitting}
              style={{
                marginTop: 14,
                width: '100%',
                padding: 12,
                borderRadius: 10,
                border: 'none',
                background: submitting ? '#4b5563' : '#f5c518',
                color: '#060d1f',
                fontWeight: 900,
                fontSize: 14,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Saving…' : editing ? 'Update captain' : 'Save captain'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* primitives */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: '#f5c518', marginTop: 2 }}>{value}</div>
    </div>
  );
}
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 11, letterSpacing: 1, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', margin: '12px 0 5px' }}>
      {children}
    </label>
  );
}

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 640, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: '14px 16px', border: '1px solid #1e3a5f', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 8, boxSizing: 'border-box', outline: 'none' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none' };
const primaryBtnStyle: React.CSSProperties = { background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 900, fontSize: 13, cursor: 'pointer' };
const ghostBtnStyle: React.CSSProperties = { background: 'transparent', color: '#94a3b8', border: '1px solid #1e3a5f', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer' };
const errorBoxStyle: React.CSSProperties = { background: 'rgba(248,113,113,0.1)', border: '1px solid #f87171', borderRadius: 10, padding: 12, color: '#f87171', fontSize: 12, fontWeight: 600, marginBottom: 8 };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', zIndex: 200, padding: 20, overflowY: 'auto' };
const modalStyle: React.CSSProperties = { background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 14, padding: 18, width: '100%', maxWidth: 480, marginTop: 20, marginBottom: 40 };
