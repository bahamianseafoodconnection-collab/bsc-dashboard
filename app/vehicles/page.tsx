'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const VAT       = 0.10;
const CAR_MARKUP = 650;
const RENT_MARKUP = 10;
const PART_MARKUP = 0.10;

type Tab    = 'browse' | 'add-vehicle' | 'add-part';
type Filter = 'All' | 'For Sale' | 'For Rent' | 'Parts';

type Vehicle = {
  id: string;
  type: 'sale' | 'rent';
  make: string;
  model: string;
  year: string;
  supplier_cost: number;
  customer_price: number;
  daily_rate?: number;
  description: string;
  emoji: string;
  vat_included: boolean;
};

type Part = {
  id: string;
  name: string;
  supplier_cost: number;
  customer_price: number;
  description: string;
  emoji: string;
};

const MOCK_VEHICLES: Vehicle[] = [
  { id: 'V001', type: 'sale', make: 'Toyota', model: 'Corolla', year: '2020', supplier_cost: 12000, customer_price: 13915, description: 'Clean title, low mileage, well maintained.', emoji: '🚗', vat_included: true },
  { id: 'V002', type: 'sale', make: 'Honda', model: 'Civic', year: '2019', supplier_cost: 10000, customer_price: 11605, description: 'One owner, automatic, air conditioned.', emoji: '🚙', vat_included: true },
  { id: 'V003', type: 'rent', make: 'Hyundai', model: 'Tucson', year: '2021', supplier_cost: 50, customer_price: 66, daily_rate: 66, description: 'SUV rental, full tank provided.', emoji: '🚐', vat_included: true },
  { id: 'V004', type: 'rent', make: 'Kia', model: 'Sportage', year: '2022', supplier_cost: 60, customer_price: 77, daily_rate: 77, description: 'Spacious SUV, perfect for island travel.', emoji: '🛻', vat_included: true },
];

const MOCK_PARTS: Part[] = [
  { id: 'P001', name: 'Brake Pads (Set)', supplier_cost: 80, customer_price: 96.80, description: 'Universal fit, ceramic compound.', emoji: '⚙️' },
  { id: 'P002', name: 'Oil Filter', supplier_cost: 15, customer_price: 18.15, description: 'Standard oil filter, multi-brand compatible.', emoji: '🔧' },
  { id: 'P003', name: 'Car Battery 12V', supplier_cost: 120, customer_price: 145.20, description: 'High performance, maintenance-free.', emoji: '🔋' },
];

export default function VehiclesPage() {
  const [tab, setTab]         = useState<Tab>('browse');
  const [filter, setFilter]   = useState<Filter>('All');
  const [vehicles, setVehicles] = useState<Vehicle[]>(MOCK_VEHICLES);
  const [parts, setParts]     = useState<Part[]>(MOCK_PARTS);
  const [selected, setSelected] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(false);

  // Add vehicle form
  const [vMake, setVMake]         = useState('');
  const [vModel, setVModel]       = useState('');
  const [vYear, setVYear]         = useState('');
  const [vType, setVType]         = useState<'sale' | 'rent'>('sale');
  const [vCost, setVCost]         = useState('');
  const [vDesc, setVDesc]         = useState('');

  // Add part form
  const [pName, setPName]         = useState('');
  const [pCost, setPCost]         = useState('');
  const [pDesc, setPDesc]         = useState('');

  const cost         = parseFloat(vCost) || 0;
  const partCost     = parseFloat(pCost) || 0;
  const salePrice    = Math.round(((cost + CAR_MARKUP) * (1 + VAT)) * 100) / 100;
  const rentPrice    = Math.round(((cost + RENT_MARKUP) * (1 + VAT)) * 100) / 100;
  const partPrice    = Math.round((partCost * (1 + PART_MARKUP) * (1 + VAT)) * 100) / 100;

  const filteredVehicles = vehicles.filter((v) => {
    if (filter === 'For Sale') return v.type === 'sale';
    if (filter === 'For Rent') return v.type === 'rent';
    if (filter === 'Parts')    return false;
    return true;
  });

  const showParts = filter === 'All' || filter === 'Parts';

  async function addVehicle(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const id           = 'V' + Date.now().toString().slice(-4);
    const customerPrice = vType === 'sale' ? salePrice : rentPrice;
    const vehicle: Vehicle = {
      id, type: vType, make: vMake, model: vModel, year: vYear,
      supplier_cost: cost, customer_price: customerPrice,
      daily_rate: vType === 'rent' ? rentPrice : undefined,
      description: vDesc, emoji: '🚗', vat_included: true,
    };
    try {
      await supabase.from('vehicles').insert([{ ...vehicle, status: 'active' }]);
    } catch { /* continue */ }
    setVehicles((prev) => [vehicle, ...prev]);
    setVMake(''); setVModel(''); setVYear(''); setVCost(''); setVDesc('');
    setTab('browse');
    setLoading(false);
  }

  async function addPart(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const id   = 'P' + Date.now().toString().slice(-4);
    const part: Part = { id, name: pName, supplier_cost: partCost, customer_price: partPrice, description: pDesc, emoji: '⚙️' };
    try {
      await supabase.from('auto_parts').insert([{ ...part, status: 'active' }]);
    } catch { /* continue */ }
    setParts((prev) => [part, ...prev]);
    setPName(''); setPCost(''); setPDesc('');
    setTab('browse');
    setLoading(false);
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* HEADER */}
      <header style={{ backgroundColor: '#1a2e5a', padding: '0 16px', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/dashboard" style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, textDecoration: 'none', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: '8px' }}>
              ← BSC Control
            </Link>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>Vehicles & Auto Parts</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>$650 markup + 10% VAT · Parts 10% + VAT</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setTab('add-vehicle')} style={{ backgroundColor: '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: '8px', padding: '7px 12px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}>
              + Vehicle
            </button>
            <button onClick={() => setTab('add-part')} style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
              + Part
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['All', 'For Sale', 'For Rent', 'Parts'] as Filter[]).map((f) => (
            <button key={f} onClick={() => { setFilter(f); setTab('browse'); }} style={{ padding: '10px 16px', border: 'none', borderBottom: filter === f && tab === 'browse' ? '3px solid #f4c842' : '3px solid transparent', backgroundColor: 'transparent', color: filter === f && tab === 'browse' ? '#f4c842' : 'rgba(255,255,255,0.55)', fontWeight: filter === f ? 800 : 500, fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {f}
            </button>
          ))}
        </div>
      </header>

      {/* ── BROWSE ── */}
      {tab === 'browse' && (
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px 16px' }}>

          {/* Vehicles */}
          {filter !== 'Parts' && (
            <>
              <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '16px', marginBottom: '14px' }}>
                {filter === 'For Sale' ? '🚗 For Sale' : filter === 'For Rent' ? '🔑 For Rent' : '🚗 Vehicles'}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px', marginBottom: '32px' }}>
                {filteredVehicles.map((v) => (
                  <div key={v.id} onClick={() => setSelected(v)} style={{ backgroundColor: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: selected?.id === v.id ? '2px solid #1a2e5a' : '2px solid transparent', cursor: 'pointer' }}>
                    <div style={{ backgroundColor: v.type === 'rent' ? '#e8f4fd' : '#fef9e7', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '52px', position: 'relative' }}>
                      {v.emoji}
                      <span style={{ position: 'absolute', top: '10px', left: '10px', backgroundColor: v.type === 'sale' ? '#1a2e5a' : '#0891b2', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px' }}>
                        {v.type === 'sale' ? 'FOR SALE' : 'FOR RENT'}
                      </span>
                      <span style={{ position: 'absolute', top: '10px', right: '10px', backgroundColor: '#e8f5e9', color: '#2e7d32', fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '6px' }}>
                        VAT INCL.
                      </span>
                    </div>
                    <div style={{ padding: '14px' }}>
                      <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '16px' }}>{v.year} {v.make} {v.model}</div>
                      <div style={{ color: '#666', fontSize: '12px', marginBottom: '12px' }}>{v.description}</div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '20px' }}>
                            ${v.customer_price.toLocaleString()}{v.type === 'rent' ? '/day' : ''}
                          </div>
                          <div style={{ color: '#999', fontSize: '11px' }}>VAT included</div>
                        </div>
                        <a
                          href={`https://wa.me/12424777506?text=I'm interested in the ${v.year} ${v.make} ${v.model} — Ref: ${v.id}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ backgroundColor: '#25D366', color: '#fff', textDecoration: 'none', borderRadius: '10px', padding: '8px 14px', fontSize: '12px', fontWeight: 800 }}
                        >
                          💬 Inquire
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Parts */}
          {showParts && (
            <>
              <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '16px', marginBottom: '14px' }}>🔧 Auto Parts</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                {parts.map((p) => (
                  <div key={p.id} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '10px' }}>{p.emoji}</div>
                    <div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px', marginBottom: '4px' }}>{p.name}</div>
                    <div style={{ color: '#666', fontSize: '12px', marginBottom: '12px' }}>{p.description}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px' }}>${p.customer_price.toFixed(2)}</div>
                        <div style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', fontSize: '10px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', display: 'inline-block', marginTop: '2px' }}>VAT INCL.</div>
                      </div>
                      <a
                        href={`https://wa.me/12424777506?text=I need a ${p.name} — Ref: ${p.id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ backgroundColor: '#25D366', color: '#fff', textDecoration: 'none', borderRadius: '10px', padding: '8px 12px', fontSize: '12px', fontWeight: 800 }}
                      >
                        💬 Order
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ADD VEHICLE FORM ── */}
      {tab === 'add-vehicle' && (
        <div style={{ maxWidth: '500px', margin: '0 auto', padding: '24px 16px' }}>
          <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px', marginBottom: '20px' }}>Add Vehicle Listing</h2>
          <form onSubmit={addVehicle}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <button type="button" onClick={() => setVType('sale')} style={{ padding: '12px', borderRadius: '10px', border: '2px solid', borderColor: vType === 'sale' ? '#1a2e5a' : '#e5e7eb', backgroundColor: vType === 'sale' ? '#1a2e5a' : '#fff', color: vType === 'sale' ? '#f4c842' : '#666', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}>
                  🚗 For Sale
                </button>
                <button type="button" onClick={() => setVType('rent')} style={{ padding: '12px', borderRadius: '10px', border: '2px solid', borderColor: vType === 'rent' ? '#1a2e5a' : '#e5e7eb', backgroundColor: vType === 'rent' ? '#1a2e5a' : '#fff', color: vType === 'rent' ? '#f4c842' : '#666', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}>
                  🔑 For Rent
                </button>
              </div>

              {[
                { label: 'Make', value: vMake, setter: setVMake, placeholder: 'e.g. Toyota' },
                { label: 'Model', value: vModel, setter: setVModel, placeholder: 'e.g. Corolla' },
                { label: 'Year', value: vYear, setter: setVYear, placeholder: 'e.g. 2020' },
              ].map((f) => (
                <div key={f.label} style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>{f.label}</label>
                  <input type="text" value={f.value} onChange={(e) => f.setter(e.target.value)} placeholder={f.placeholder} required style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                  {vType === 'sale' ? 'Supplier Cost ($)' : 'Supplier Daily Rate ($/day)'}
                </label>
                <input type="number" value={vCost} onChange={(e) => setVCost(e.target.value)} placeholder="0.00" min="1" step="0.01" required style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '20px', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Description</label>
                <textarea value={vDesc} onChange={(e) => setVDesc(e.target.value)} placeholder="Vehicle condition, features..." rows={3} style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>

              {cost > 0 && (
                <div style={{ backgroundColor: '#fef9e7', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
                  <div style={{ color: '#999', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>Price Breakdown</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: '#666', fontSize: '13px' }}>Supplier Cost</span>
                    <span style={{ color: '#1a2e5a', fontWeight: 700 }}>${cost.toFixed(2)}{vType === 'rent' ? '/day' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: '#666', fontSize: '13px' }}>BSC Markup</span>
                    <span style={{ color: '#1a2e5a', fontWeight: 700 }}>{vType === 'sale' ? `+$${CAR_MARKUP}` : `+$${RENT_MARKUP}/day`}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: '#666', fontSize: '13px' }}>10% VAT</span>
                    <span style={{ color: '#1a2e5a', fontWeight: 700 }}>included</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #e5e7eb' }}>
                    <span style={{ color: '#1a2e5a', fontSize: '14px', fontWeight: 800 }}>Customer Price</span>
                    <span style={{ color: '#1a2e5a', fontSize: '18px', fontWeight: 900 }}>
                      ${vType === 'sale' ? salePrice.toLocaleString() : rentPrice.toFixed(2)}{vType === 'rent' ? '/day' : ''}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <button type="submit" disabled={loading} style={{ width: '100%', backgroundColor: loading ? '#e5e7eb' : '#1a2e5a', color: loading ? '#999' : '#f4c842', border: 'none', borderRadius: '14px', padding: '16px', fontWeight: 900, fontSize: '16px', cursor: loading ? 'not-allowed' : 'pointer', marginBottom: '10px' }}>
              {loading ? 'Adding...' : 'Add Vehicle Listing'}
            </button>
            <button type="button" onClick={() => setTab('browse')} style={{ width: '100%', backgroundColor: 'transparent', color: '#666', border: 'none', fontSize: '14px', cursor: 'pointer', padding: '8px' }}>
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* ── ADD PART FORM ── */}
      {tab === 'add-part' && (
        <div style={{ maxWidth: '500px', margin: '0 auto', padding: '24px 16px' }}>
          <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px', marginBottom: '20px' }}>Add Auto Part</h2>
          <form onSubmit={addPart}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Part Name</label>
                <input type="text" value={pName} onChange={(e) => setPName(e.target.value)} placeholder="e.g. Brake Pads" required style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Supplier Cost ($)</label>
                <input type="number" value={pCost} onChange={(e) => setPCost(e.target.value)} placeholder="0.00" min="1" step="0.01" required style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '20px', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#374151', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>Description</label>
                <textarea value={pDesc} onChange={(e) => setPDesc(e.target.value)} placeholder="Part details..." rows={3} style={{ width: '100%', padding: '11px 14px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
              {partCost > 0 && (
                <div style={{ backgroundColor: '#fef9e7', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: '#666', fontSize: '13px' }}>Supplier Cost</span>
                    <span style={{ color: '#1a2e5a', fontWeight: 700 }}>${partCost.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: '#666', fontSize: '13px' }}>BSC Markup (10%)</span>
                    <span style={{ color: '#1a2e5a', fontWeight: 700 }}>+${(partCost * PART_MARKUP).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: '#666', fontSize: '13px' }}>10% VAT</span>
                    <span style={{ color: '#1a2e5a', fontWeight: 700 }}>included</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #e5e7eb' }}>
                    <span style={{ color: '#1a2e5a', fontSize: '14px', fontWeight: 800 }}>Customer Price</span>
                    <span style={{ color: '#1a2e5a', fontSize: '18px', fontWeight: 900 }}>${partPrice.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', backgroundColor: loading ? '#e5e7eb' : '#1a2e5a', color: loading ? '#999' : '#f4c842', border: 'none', borderRadius: '14px', padding: '16px', fontWeight: 900, fontSize: '16px', cursor: loading ? 'not-allowed' : 'pointer', marginBottom: '10px' }}>
              {loading ? 'Adding...' : 'Add Auto Part'}
            </button>
            <button type="button" onClick={() => setTab('browse')} style={{ width: '100%', backgroundColor: 'transparent', color: '#666', border: 'none', fontSize: '14px', cursor: 'pointer', padding: '8px' }}>
              Cancel
            </button>
          </form>
        </div>
      )}
    </div>
  );
}