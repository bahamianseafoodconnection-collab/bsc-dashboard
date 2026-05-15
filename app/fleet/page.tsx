'use client';

// app/fleet/page.tsx
//
// Internal fleet management — BSC's own delivery vehicles, mailboats,
// pickup trucks. Distinct from /vehicles (which is customer-facing
// sales/rentals). Three sections:
//   1. Vehicle list (status, last service, next service due)
//   2. Maintenance log (with mark-paid → expenses mirror)
//   3. Fuel log
//
// Detail view per vehicle shows its full maintenance history + fuel log
// + lifetime cost. Add buttons: + Vehicle, + Service, + Fuel.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { plainError } from '@/lib/plain-error';

export const dynamic = 'force-dynamic';

const VEHICLE_TYPES = [
  'delivery_van','pickup_truck','car','suv','mailboat','trailer','other',
] as const;
const MAINT_TYPES = [
  'oil_change','tire','brakes','engine','transmission',
  'inspection','registration','insurance','repair','other',
] as const;

type Vehicle = {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  registration: string | null;
  vehicle_type: string;
  status: string;
  purchase_date: string | null;
  purchase_cost_bsd: number | null;
  current_mileage: number | null;
  notes: string | null;
};

type Maintenance = {
  id: string;
  vehicle_id: string;
  maintenance_type: string;
  description: string;
  cost_bsd: number;
  performed_at: string;
  mileage: number | null;
  next_due_date: string | null;
  next_due_mileage: number | null;
  notes: string | null;
};

type Fuel = {
  id: string;
  vehicle_id: string;
  gallons: number;
  cost_bsd: number;
  mileage: number | null;
  fueled_at: string;
  station: string | null;
  notes: string | null;
};

export default function FleetPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [maintByVehicle, setMaintByVehicle] = useState<Record<string, Maintenance[]>>({});
  const [fuelByVehicle, setFuelByVehicle] = useState<Record<string, Fuel[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Vehicle | null>(null);

  // Form state
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [showMaintForm, setShowMaintForm] = useState<Vehicle | null>(null);
  const [showFuelForm, setShowFuelForm] = useState<Vehicle | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const [vRes, mRes, fRes] = await Promise.all([
      supabase.from('fleet_vehicles').select('*').order('name').limit(200),
      supabase.from('fleet_maintenance').select('*').order('performed_at', { ascending: false }).limit(2000),
      supabase.from('fleet_fuel_logs').select('*').order('fueled_at', { ascending: false }).limit(2000),
    ]);

    if (vRes.error) {
      setError(plainError(vRes.error));
      setVehicles([]);
    } else {
      setVehicles((vRes.data || []) as Vehicle[]);
    }

    if (!mRes.error) {
      const grouped: Record<string, Maintenance[]> = {};
      for (const r of (mRes.data || []) as Maintenance[]) {
        (grouped[r.vehicle_id] ??= []).push(r);
      }
      setMaintByVehicle(grouped);
    }
    if (!fRes.error) {
      const grouped: Record<string, Fuel[]> = {};
      for (const r of (fRes.data || []) as Fuel[]) {
        (grouped[r.vehicle_id] ??= []).push(r);
      }
      setFuelByVehicle(grouped);
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const todayIso = new Date().toISOString().slice(0, 10);

  const vehicleStats = (v: Vehicle) => {
    const maints = maintByVehicle[v.id] || [];
    const fuels = fuelByVehicle[v.id] || [];
    const lastMaint = maints[0];
    const nextDue = maints.find((m) => m.next_due_date && m.next_due_date >= todayIso);
    const overdue = maints.find((m) => m.next_due_date && m.next_due_date < todayIso);
    const lifetimeMaint = maints.reduce((s, m) => s + Number(m.cost_bsd), 0);
    const lifetimeFuel = fuels.reduce((s, f) => s + Number(f.cost_bsd), 0);
    return { lastMaint, nextDue, overdue, lifetimeMaint, lifetimeFuel, maints, fuels };
  };

  if (selected) {
    return (
      <VehicleDetail
        vehicle={selected}
        maint={maintByVehicle[selected.id] || []}
        fuel={fuelByVehicle[selected.id] || []}
        onBack={() => setSelected(null)}
        onAddMaint={() => setShowMaintForm(selected)}
        onAddFuel={() => setShowFuelForm(selected)}
        onChanged={load}
      />
    );
  }

  return (
    <div style={pgStyle}>
      <Link href="/dashboard" style={backStyle}>← BSC Control</Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#f5c518', margin: 0 }}>Fleet</h1>
        <button onClick={() => setShowVehicleForm(true)} style={primaryBtnStyle}>+ Vehicle</button>
      </div>
      <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>
        BSC&apos;s own delivery vehicles, mailboats, and pickups. Maintenance schedules
        and fuel logs per vehicle.
      </p>

      {loading && <p style={{ color: '#94a3b8' }}>Loading…</p>}

      {!loading && error && (
        <ErrorBox text={`fleet_vehicles: ${error}`} migration="sql/2026-05-09-fleet.sql" />
      )}

      {!loading && !error && vehicles.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>
          No vehicles yet. Hit &ldquo;+ Vehicle&rdquo; to add the first.
        </div>
      )}

      {vehicles.map((v) => {
        const s = vehicleStats(v);
        return (
          <button
            key={v.id}
            onClick={() => setSelected(v)}
            style={{
              ...cardStyle,
              width: '100%',
              textAlign: 'left',
              border: '1px solid #1e3a5f',
              cursor: 'pointer',
              fontFamily: 'inherit',
              borderLeft: `4px solid ${
                v.status === 'retired' ? '#94a3b8' :
                s.overdue ? '#f87171' :
                v.status === 'maintenance' ? '#f5c518' : '#22c55e'
              }`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>
                  🚗 {v.name}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {[v.year, v.make, v.model].filter(Boolean).join(' ') || '—'}
                  {v.registration && ` · ${v.registration}`}
                  {' · '}{v.vehicle_type.replace('_', ' ')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>lifetime</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#f5c518' }}>
                  ${(s.lifetimeMaint + s.lifetimeFuel).toFixed(2)}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {s.lastMaint && (
                <span>
                  last: {s.lastMaint.maintenance_type.replace('_', ' ')} ·{' '}
                  {s.lastMaint.performed_at.slice(0, 10)}
                </span>
              )}
              {s.overdue && (
                <span style={{ color: '#f87171', fontWeight: 700 }}>
                  ⚠ overdue: {s.overdue.maintenance_type.replace('_', ' ')} ·{' '}
                  {s.overdue.next_due_date}
                </span>
              )}
              {s.nextDue && !s.overdue && (
                <span style={{ color: '#f5c518', fontWeight: 700 }}>
                  next: {s.nextDue.maintenance_type.replace('_', ' ')} ·{' '}
                  {s.nextDue.next_due_date}
                </span>
              )}
            </div>
          </button>
        );
      })}

      {showVehicleForm && (
        <VehicleForm
          onClose={() => setShowVehicleForm(false)}
          onSaved={async () => { setShowVehicleForm(false); await load(); }}
        />
      )}
      {showMaintForm && (
        <MaintForm
          vehicle={showMaintForm}
          onClose={() => setShowMaintForm(null)}
          onSaved={async () => { setShowMaintForm(null); await load(); }}
        />
      )}
      {showFuelForm && (
        <FuelForm
          vehicle={showFuelForm}
          onClose={() => setShowFuelForm(null)}
          onSaved={async () => { setShowFuelForm(null); await load(); }}
        />
      )}
    </div>
  );
}

/* ─── Vehicle detail view ─── */

function VehicleDetail({
  vehicle, maint, fuel, onBack, onAddMaint, onAddFuel, onChanged,
}: {
  vehicle: Vehicle;
  maint: Maintenance[];
  fuel: Fuel[];
  onBack: () => void;
  onAddMaint: () => void;
  onAddFuel: () => void;
  onChanged: () => Promise<void>;
}) {
  const lifetimeMaint = maint.reduce((s, m) => s + Number(m.cost_bsd), 0);
  const lifetimeFuel = fuel.reduce((s, f) => s + Number(f.cost_bsd), 0);
  const totalGallons = fuel.reduce((s, f) => s + Number(f.gallons), 0);
  void onChanged;

  return (
    <div style={pgStyle}>
      <button onClick={onBack} style={backStyle}>← All vehicles</button>

      <div style={{ ...cardStyle, background: 'linear-gradient(135deg,#0d1f3c,#1a2e5a)', border: '1px solid #f5c518' }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>🚗 {vehicle.name}</div>
        <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
          {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')}
          {vehicle.registration && ` · ${vehicle.registration}`}
          {' · '}{vehicle.vehicle_type.replace('_', ' ')}
          {' · '}<span style={{ color: vehicle.status === 'active' ? '#22c55e' : vehicle.status === 'retired' ? '#94a3b8' : '#f5c518', fontWeight: 700 }}>{vehicle.status}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginTop: 14 }}>
          <Stat label="Lifetime maint" value={`$${lifetimeMaint.toFixed(2)}`} />
          <Stat label="Lifetime fuel" value={`$${lifetimeFuel.toFixed(2)}`} />
          <Stat label="Gallons" value={totalGallons.toFixed(0)} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 18, marginBottom: 8 }}>
        <h3 style={{ color: '#f5c518', fontSize: 14, margin: 0 }}>Maintenance log</h3>
        <button onClick={onAddMaint} style={primaryBtnStyle}>+ Service</button>
      </div>
      {maint.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>No maintenance recorded.</div>
      ) : (
        maint.map((m) => (
          <div key={m.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                  {m.maintenance_type.replace('_', ' ')}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {m.performed_at.slice(0, 10)}
                  {m.mileage != null && ` · ${m.mileage.toLocaleString()} mi`}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#f5c518' }}>
                ${Number(m.cost_bsd).toFixed(2)}
              </div>
            </div>
            {m.description && <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>{m.description}</div>}
            {m.next_due_date && (
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Next due: {m.next_due_date}</div>
            )}
          </div>
        ))
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 18, marginBottom: 8 }}>
        <h3 style={{ color: '#f5c518', fontSize: 14, margin: 0 }}>Fuel log</h3>
        <button onClick={onAddFuel} style={primaryBtnStyle}>+ Fuel</button>
      </div>
      {fuel.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: 'center', color: '#94a3b8' }}>No fuel logged.</div>
      ) : (
        fuel.map((f) => (
          <div key={f.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>
                  {Number(f.gallons).toFixed(2)} gal
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {f.fueled_at.slice(0, 10)}
                  {f.station && ` · ${f.station}`}
                  {f.mileage != null && ` · ${f.mileage.toLocaleString()} mi`}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#f5c518' }}>
                ${Number(f.cost_bsd).toFixed(2)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ─── Add forms ─── */

function VehicleForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<typeof VEHICLE_TYPES[number]>('delivery_van');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [reg, setReg] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [mileage, setMileage] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('fleet_vehicles').insert({
      name: name.trim(),
      vehicle_type: type,
      make: make.trim() || null,
      model: model.trim() || null,
      year: year ? parseInt(year, 10) : null,
      registration: reg.trim() || null,
      purchase_date: purchaseDate || null,
      purchase_cost_bsd: purchaseCost ? parseFloat(purchaseCost) : null,
      current_mileage: mileage ? parseInt(mileage, 10) : null,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await onSaved();
  }

  return (
    <Modal title="New vehicle" onClose={onClose}>
      <form onSubmit={submit}>
        <FieldLabel>Name *</FieldLabel>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Delivery Van #1" style={inputStyle} required />

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel>Type</FieldLabel>
            <select value={type} onChange={(e) => setType(e.target.value as typeof VEHICLE_TYPES[number])} style={{ ...inputStyle, appearance: 'none' }}>
              {VEHICLE_TYPES.map((t) => <option key={t} value={t} style={{ background: '#0d1f3c' }}>{t.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <FieldLabel>Year</FieldLabel>
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2022" style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel>Make</FieldLabel>
            <input type="text" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Toyota" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <FieldLabel>Model</FieldLabel>
            <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="HiAce" style={inputStyle} />
          </div>
        </div>

        <FieldLabel>Registration</FieldLabel>
        <input type="text" value={reg} onChange={(e) => setReg(e.target.value)} placeholder="e.g. BS-1234" style={inputStyle} />

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel>Purchase date</FieldLabel>
            <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <FieldLabel>Purchase cost</FieldLabel>
            <input type="number" inputMode="decimal" step="0.01" value={purchaseCost} onChange={(e) => setPurchaseCost(e.target.value)} placeholder="0.00" style={inputStyle} />
          </div>
        </div>

        <FieldLabel>Current mileage</FieldLabel>
        <input type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} style={inputStyle} />

        <FieldLabel>Notes</FieldLabel>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }} />

        {err && <ErrorBox text={err} />}
        <SubmitBtn busy={busy} label="Save vehicle" />
      </form>
    </Modal>
  );
}

function MaintForm({ vehicle, onClose, onSaved }: { vehicle: Vehicle; onClose: () => void; onSaved: () => Promise<void> }) {
  const [type, setType] = useState<typeof MAINT_TYPES[number]>('oil_change');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [performed, setPerformed] = useState(new Date().toISOString().slice(0, 10));
  const [mileage, setMileage] = useState(vehicle.current_mileage ? String(vehicle.current_mileage) : '');
  const [nextDue, setNextDue] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!description.trim() || !(parseFloat(cost) >= 0)) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('fleet_maintenance').insert({
      vehicle_id: vehicle.id,
      maintenance_type: type,
      description: description.trim(),
      cost_bsd: parseFloat(cost) || 0,
      performed_at: performed ? `${performed}T00:00:00Z` : new Date().toISOString(),
      mileage: mileage ? parseInt(mileage, 10) : null,
      next_due_date: nextDue || null,
      recorded_by: user?.id ?? null,
      notes: notes.trim() || null,
    });
    if (error) { setErr(error.message); setBusy(false); return; }

    // Mirror as expense in maintenance category. Fails-soft.
    supabase.from('expenses').insert({
      description: `Maintenance · ${vehicle.name} · ${type.replace('_', ' ')}`,
      category: 'maintenance',
      vendor: vehicle.name,
      amount_bsd: parseFloat(cost) || 0,
      due_date: performed,
      paid_at: new Date().toISOString(),
      payment_method: 'cash',
      recorded_by: user?.id ?? null,
      notes: `Auto from fleet maintenance · ${description.trim()}`,
    }).then((r) => { if (r.error) console.warn('Expense mirror failed:', r.error); });

    // Update vehicle current_mileage if higher
    if (mileage && (!vehicle.current_mileage || parseInt(mileage, 10) > vehicle.current_mileage)) {
      await supabase.from('fleet_vehicles').update({ current_mileage: parseInt(mileage, 10), updated_at: new Date().toISOString() }).eq('id', vehicle.id);
    }

    setBusy(false);
    await onSaved();
  }

  return (
    <Modal title={`Service · ${vehicle.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <FieldLabel>Type</FieldLabel>
        <select value={type} onChange={(e) => setType(e.target.value as typeof MAINT_TYPES[number])} style={{ ...inputStyle, appearance: 'none' }}>
          {MAINT_TYPES.map((t) => <option key={t} value={t} style={{ background: '#0d1f3c' }}>{t.replace('_', ' ')}</option>)}
        </select>

        <FieldLabel>Description *</FieldLabel>
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. 5W-30 oil + filter" style={inputStyle} required />

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel>Cost (BSD) *</FieldLabel>
            <input type="number" inputMode="decimal" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" style={inputStyle} required />
          </div>
          <div style={{ flex: 1 }}>
            <FieldLabel>Performed</FieldLabel>
            <input type="date" value={performed} onChange={(e) => setPerformed(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel>Mileage</FieldLabel>
            <input type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <FieldLabel>Next due</FieldLabel>
            <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <FieldLabel>Notes</FieldLabel>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }} />

        {err && <ErrorBox text={err} />}
        <SubmitBtn busy={busy} label="Save service" />
      </form>
    </Modal>
  );
}

function FuelForm({ vehicle, onClose, onSaved }: { vehicle: Vehicle; onClose: () => void; onSaved: () => Promise<void> }) {
  const [gallons, setGallons] = useState('');
  const [cost, setCost] = useState('');
  const [mileage, setMileage] = useState(vehicle.current_mileage ? String(vehicle.current_mileage) : '');
  const [station, setStation] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!(parseFloat(gallons) > 0) || !(parseFloat(cost) >= 0)) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('fleet_fuel_logs').insert({
      vehicle_id: vehicle.id,
      gallons: parseFloat(gallons),
      cost_bsd: parseFloat(cost),
      mileage: mileage ? parseInt(mileage, 10) : null,
      station: station.trim() || null,
      recorded_by: user?.id ?? null,
    });
    if (error) { setErr(error.message); setBusy(false); return; }

    // Mirror as transport expense. Fails-soft.
    supabase.from('expenses').insert({
      description: `Fuel · ${vehicle.name} · ${gallons} gal`,
      category: 'transport',
      vendor: station.trim() || vehicle.name,
      amount_bsd: parseFloat(cost),
      due_date: new Date().toISOString().slice(0, 10),
      paid_at: new Date().toISOString(),
      payment_method: 'cash',
      recorded_by: user?.id ?? null,
    }).then((r) => { if (r.error) console.warn('Expense mirror failed:', r.error); });

    if (mileage && (!vehicle.current_mileage || parseInt(mileage, 10) > vehicle.current_mileage)) {
      await supabase.from('fleet_vehicles').update({ current_mileage: parseInt(mileage, 10), updated_at: new Date().toISOString() }).eq('id', vehicle.id);
    }

    setBusy(false);
    await onSaved();
  }

  return (
    <Modal title={`Fuel · ${vehicle.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel>Gallons *</FieldLabel>
            <input type="number" inputMode="decimal" step="0.01" min="0" value={gallons} onChange={(e) => setGallons(e.target.value)} placeholder="15.0" style={inputStyle} required />
          </div>
          <div style={{ flex: 1 }}>
            <FieldLabel>Cost (BSD) *</FieldLabel>
            <input type="number" inputMode="decimal" step="0.01" min="0" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="80.00" style={inputStyle} required />
          </div>
        </div>

        <FieldLabel>Mileage</FieldLabel>
        <input type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} style={inputStyle} />

        <FieldLabel>Station</FieldLabel>
        <input type="text" value={station} onChange={(e) => setStation(e.target.value)} placeholder="e.g. Esso Carmichael" style={inputStyle} />

        {err && <ErrorBox text={err} />}
        <SubmitBtn busy={busy} label="Save fuel entry" />
      </form>
    </Modal>
  );
}

/* ─── primitives ─── */

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, color: '#f5c518', fontWeight: 900, margin: 0 }}>{title}</h2>
          <button type="button" onClick={onClose} style={ghostBtnStyle}>Cancel</button>
        </div>
        {children}
      </div>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 900, color: '#f5c518', marginTop: 2 }}>{value}</div>
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

function SubmitBtn({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      style={{
        marginTop: 14,
        width: '100%',
        padding: 12,
        borderRadius: 10,
        border: 'none',
        background: busy ? '#4b5563' : '#f5c518',
        color: '#060d1f',
        fontWeight: 900,
        fontSize: 14,
        cursor: busy ? 'not-allowed' : 'pointer',
      }}
    >
      {busy ? 'Saving…' : label}
    </button>
  );
}

const pgStyle: React.CSSProperties = { padding: 16, backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: 80, maxWidth: 640, margin: '0 auto' };
const cardStyle: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 12, padding: '14px 16px', border: '1px solid #1e3a5f', marginBottom: 10 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, background: '#111c33', border: '1px solid #1e2d4a', color: '#fff', fontSize: 14, marginBottom: 8, boxSizing: 'border-box', outline: 'none' };
const backStyle: React.CSSProperties = { display: 'inline-block', background: 'rgba(245,197,24,0.1)', border: '1px solid #f5c518', borderRadius: 8, color: '#f5c518', fontWeight: 700, fontSize: 12, padding: '6px 12px', marginBottom: 14, textDecoration: 'none', cursor: 'pointer' };
const primaryBtnStyle: React.CSSProperties = { background: '#f5c518', color: '#060d1f', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 900, fontSize: 13, cursor: 'pointer' };
const ghostBtnStyle: React.CSSProperties = { background: 'transparent', color: '#94a3b8', border: '1px solid #1e3a5f', borderRadius: 8, padding: '4px 10px', fontSize: 11, cursor: 'pointer' };
const overlayStyle: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', zIndex: 200, padding: 20, overflowY: 'auto' };
const modalStyle: React.CSSProperties = { background: '#0d1f3c', border: '1px solid #1e3a5f', borderRadius: 14, padding: 18, width: '100%', maxWidth: 480, marginTop: 20, marginBottom: 40 };
