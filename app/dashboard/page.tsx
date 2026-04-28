'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { fetchFinancialsFromDB, getFinancialSummary } from '../../lib/finance';
import { fetchInvoicesFromDB, type Invoice } from '../../lib/invoices';
import { products } from '../../lib/store';

const supabase = createBrowserClient(
  'https://auqjjrisivhfmpleusyt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg'
);

const MONTHLY_EXPENSES = [
  { category: 'Nassau',  label: 'Store Rent — Nassau',            amount: 4150  },
  { category: 'Nassau',  label: 'BPL — Nassau',                   amount: 2300  },
  { category: 'Nassau',  label: 'Staff Salaries Cap — Nassau',    amount: 10000 },
  { category: 'Nassau',  label: 'Water & Sewage',                 amount: 400   },
  { category: 'Nassau',  label: 'Phone & Internet',               amount: 120   },
  { category: 'Nassau',  label: 'Garbage Collection',             amount: 70    },
  { category: 'Nassau',  label: 'Maintenance — All Locations',    amount: 150   },
  { category: 'Andros',  label: 'BPL — Andros',                   amount: 400   },
  { category: 'Andros',  label: "Ceta's Store Manager Salary",    amount: 1000  },
  { category: 'Andros',  label: 'Andros Staff Salaries',          amount: 2000  },
  { category: 'Partner', label: 'Bill Casale — 5% Profit Share',  amount: 0     },
];
const TOTAL_FIXED_EXPENSES = MONTHLY_EXPENSES.reduce((s, e) => s + e.amount, 0);

const NASSAU_MARGIN      = 0.38;
const ANDROS_MARGIN      = 0.43;
const MARKET_MARGIN      = 0.25;
const CAR_SALE_MARKUP    = 650;
const RENTAL_DAY_MARKUP  = 10;

type AIMessage = { role: 'user' | 'ai'; text: string };
type Supplier = {
  id: string; full_name: string; company_name: string;
  email: string; whatsapp: string; category: string; status: string;
};
type SupplierProduct = {
  id: string; name: string; category: string; sku: string;
  retail_price: number; wholesale_price: number; unit_cost: number;
  duty_rate: number; supplier_id: string; supplier_name: string;
  supplier_whatsapp: string; photo_url: string; status: string;
  case_cost: number; pieces_per_case: number; stock_qty: number;
};
type LotRecord = {
  id: string; lot_number: string; captain_name: string; boat_reg: string;
  product_type: string; whole_weight_lb: number; clean_weight_lb: number;
  yield_pct: number; cost_paid: number; true_cost_per_lb: number;
  nassau_price: number; andros_price: number; online_price: number;
  wholesale_price: number; processed_by: string; created_at: string;
  supplier_id?: string;
};
type Section = 'overview' | 'pos' | 'profit' | 'suppliers' | 'inventory' | 'market'
             | 'report' | 'ai' | 'yield' | 'freezer' | 'purchase' | 'orders'
             | 'expenses' | 'staff' | 'supplier_history' | 'password';

const SPINY_TAILS_INVENTORY = [
  { name: 'Bahamian Conch',               lbs: 5000, category: 'seafood', icon: '🐚' },
  { name: 'Nassau Grouper (Whole)',        lbs: 300,  category: 'seafood', icon: '🐟' },
  { name: 'Lane Snapper',                 lbs: 740,  category: 'seafood', icon: '🐠' },
  { name: 'Salmon 6oz',                   lbs: 680,  category: 'seafood', icon: '🐟' },
  { name: 'Salmon 8oz',                   lbs: 170,  category: 'seafood', icon: '🐟' },
  { name: 'Salmon 4oz',                   lbs: 130,  category: 'seafood', icon: '🐟' },
  { name: 'Yellowfin Tuna',               lbs: 300,  category: 'seafood', icon: '🐟' },
  { name: 'Snow Crab (4x1.5lb packs)',    lbs: 90,   category: 'seafood', icon: '🦀' },
  { name: 'Grouper Fillet 6/8oz',         lbs: 160,  category: 'seafood', icon: '🐟' },
  { name: 'Chicken Leg Quarters',         lbs: 396,  category: 'poultry', icon: '🍗' },
  { name: 'Chicken Wings',                lbs: 462,  category: 'poultry', icon: '🍗' },
  { name: 'Snapper Fillet 6/8oz',         lbs: 60,   category: 'seafood', icon: '🐠' },
  { name: 'Snapper Fingers',              lbs: 100,  category: 'seafood', icon: '🐠' },
  { name: 'Whole Chicken Grillers',       lbs: 176,  category: 'poultry', icon: '🍗' },
  { name: 'Pork Spareribs',               lbs: 356,  category: 'meat',    icon: '🥩' },
  { name: 'Ribeye Steak',                 lbs: 20,   category: 'meat',    icon: '🥩' },
  { name: 'Black Mussel',                 lbs: 70,   category: 'seafood', icon: '🐚' },
  { name: 'Swai Fillet',                  lbs: 60,   category: 'seafood', icon: '🐟' },
];
const TOTAL_LBS       = SPINY_TAILS_INVENTORY.reduce((s, i) => s + i.lbs, 0);
const FREEZER_CAPACITY = 30000;

const BOTTOM_NAV = [
  { s: 'overview'         as Section, icon: '📊', label: 'Overview'  },
  { s: 'pos'              as Section, icon: '🛒', label: 'POS'        },
  { s: 'purchase'         as Section, icon: '📦', label: 'Orders'     },
  { s: 'suppliers'        as Section, icon: '🚢', label: 'Suppliers'  },
  { s: 'expenses'         as Section, icon: '💸', label: 'Expenses'   },
  { s: 'ai'               as Section, icon: '🤖', label: 'AI'         },
];

export default function DashboardPage() {
  const router = useRouter();

  // ── Finance state ──
  const [finance, setFinance]           = useState({ revenue: 0, profit: 0, supplierOwed: 0, transactions: 0 });
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]           = useState(true);
  const [section, setSection]           = useState<Section>('overview');
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [isMobile, setIsMobile]         = useState(false);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
  const [allProducts, setAllProducts]   = useState<SupplierProduct[]>([]);
  const [supplierTab, setSupplierTab]   = useState<'applications' | 'products'>('applications');
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [staffRoster, setStaffRoster]   = useState<any[]>([]);

  const [vehicleSalesCount, setVehicleSalesCount]   = useState(0);
  const [vehicleRentalDays, setVehicleRentalDays]   = useState(0);
  const [autoPartsRevenue, setAutoPartsRevenue]     = useState(0);
  const [autoPartsProfit, setAutoPartsProfit]       = useState(0);
  const [utilityPayments, setUtilityPayments]       = useState({ count: 0, fees: 0 });
  const [supplierPayoutMap, setSupplierPayoutMap]   = useState<Record<string, { name: string; owed: number; paid: number }>>({});
  const [totalCOGS, setTotalCOGS]                   = useState(0);
  const [totalSupplierOwed, setTotalSupplierOwed]   = useState(0);
  const [lowStockProducts, setLowStockProducts]     = useState<SupplierProduct[]>([]);
  const [adminPhotoUploading, setAdminPhotoUploading] = useState<string | null>(null);

  const [aiMessages, setAiMessages] = useState<AIMessage[]>([
    { role: 'ai', text: 'Hi Dedrick! Full system control. All 9 revenue streams, COGS, staff, expenses. Ask me anything.' }
  ]);
  const [aiInput, setAiInput]   = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // ── Supplier history state ──
  const [selectedSupplier, setSelectedSupplier]         = useState<Supplier | null>(null);
  const [supplierLots, setSupplierLots]                 = useState<LotRecord[]>([]);
  const [supplierProducts, setSupplierProducts]         = useState<SupplierProduct[]>([]);
  const [historyLoading, setHistoryLoading]             = useState(false);
  const [histTab, setHistTab]                           = useState<'info' | 'products' | 'lots'>('info');
  const [allLots, setAllLots]                           = useState<LotRecord[]>([]);

  // ── Password change state ──
  const [pwCurrent, setPwCurrent]     = useState('');
  const [pwNew, setPwNew]             = useState('');
  const [pwConfirm, setPwConfirm]     = useState('');
  const [pwLoading, setPwLoading]     = useState(false);
  const [pwSuccess, setPwSuccess]     = useState('');
  const [pwError, setPwError]         = useState('');
  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [showPwNew, setShowPwNew]         = useState(false);
  const [showPwConfirm, setShowPwConfirm] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check(); window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    checkAuth();
    async function load() {
      try {
        await Promise.race([
          (async () => {
            await fetchFinancialsFromDB();
            setFinance(getFinancialSummary());
            const inv = await fetchInvoicesFromDB();
            setRecentInvoices(inv.slice(0, 20));
          })(),
          new Promise((_, r) => setTimeout(r, 6000)),
        ]);
      } catch (e) {}
      setLoading(false);
    }
    load();
    loadVehicleIncome(); loadUtilityIncome(); loadCOGSData(); loadStaffRoster();
  }, []);

  useEffect(() => { if (section === 'suppliers' || section === 'supplier_history') loadSupplierData(); }, [section]);

  // ── Auth — control_admin only ──
  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) { router.push('/login'); return; }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'control_admin') { router.push('/login'); }
  }

  async function loadCOGSData() {
    try {
      const { data: payouts } = await supabase.from('supplier_payouts').select('*').order('created_at', { ascending: false });
      if (payouts) {
        const map: Record<string, { name: string; owed: number; paid: number }> = {};
        payouts.forEach((p: any) => {
          if (!map[p.supplier_id]) map[p.supplier_id] = { name: p.supplier_name, owed: 0, paid: 0 };
          if (p.paid) map[p.supplier_id].paid += parseFloat(p.cogs_total) || 0;
          else        map[p.supplier_id].owed += parseFloat(p.cogs_total) || 0;
        });
        setSupplierPayoutMap(map);
        setTotalCOGS(parseFloat(payouts.reduce((s: number, p: any) => s + (parseFloat(p.cogs_total) || 0), 0).toFixed(2)));
        setTotalSupplierOwed(parseFloat(Object.values(map).reduce((s, v) => s + v.owed, 0).toFixed(2)));
      }
      const { data: stockData } = await supabase.from('supplier_products').select('*').eq('status', 'approved').lte('stock_qty', 5).gt('stock_qty', 0).order('stock_qty', { ascending: true });
      if (stockData) setLowStockProducts(stockData);
    } catch (e) {}
  }

  async function loadStaffRoster() {
    try {
      const { data } = await supabase.from('staff_roster').select('*').order('full_name');
      if (data) setStaffRoster(data);
    } catch (e) {}
  }

  async function markSupplierPaid(supplierId: string) {
    await supabase.from('supplier_payouts').update({ paid: true }).eq('supplier_id', supplierId).eq('paid', false);
    await loadCOGSData();
  }

  async function loadVehicleIncome() {
    try {
      const { data: sold } = await supabase.from('vehicles').select('id').eq('listing_type', 'sale').eq('status', 'inactive');
      if (sold) setVehicleSalesCount(sold.length);
      const { data: parts } = await supabase.from('auto_parts').select('price, bsc_markup').eq('status', 'inactive');
      if (parts) { setAutoPartsRevenue(parts.reduce((s, p) => s + (p.price || 0), 0)); setAutoPartsProfit(parts.reduce((s, p) => s + (p.bsc_markup || 0), 0)); }
    } catch (e) {}
  }

  async function loadUtilityIncome() {
    try {
      const { data } = await supabase.from('utility_payments').select('service_fee').eq('payment_status', 'completed');
      if (data) setUtilityPayments({ count: data.length, fees: parseFloat(data.reduce((s, p) => s + (p.service_fee || 0), 0).toFixed(2)) });
    } catch (e) {}
  }

  async function loadSupplierData() {
    setSupplierLoading(true);
    try {
      const { data: s } = await supabase.from('suppliers').select('*').order('created_at', { ascending: false });
      if (s) setAllSuppliers(s);
      const { data: p } = await supabase.from('supplier_products').select('*').order('created_at', { ascending: false });
      if (p) setAllProducts(p);
      const { data: lots } = await supabase.from('yield_lots').select('*').order('created_at', { ascending: false });
      if (lots) setAllLots(lots);
    } catch (e) {}
    setSupplierLoading(false);
  }

  async function openSupplierHistory(sup: Supplier) {
    setSelectedSupplier(sup);
    setHistTab('info');
    setHistoryLoading(true);
    setSection('supplier_history');
    try {
      const { data: prods } = await supabase.from('supplier_products').select('*').eq('supplier_id', sup.id).order('created_at', { ascending: false });
      setSupplierProducts(prods || []);
      const { data: lots } = await supabase.from('yield_lots').select('*').order('created_at', { ascending: false }).limit(200);
      const filtered = (lots || []).filter((l: LotRecord) =>
        l.processed_by && sup.email && l.processed_by === sup.email.split('@')[0]
      );
      setSupplierLots(filtered);
    } catch (e) {}
    setHistoryLoading(false);
  }

  // ── Password change ──
  async function handlePasswordChange() {
    setPwError(''); setPwSuccess('');
    if (!pwCurrent || !pwNew || !pwConfirm) { setPwError('All fields are required.'); return; }
    if (pwNew.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    if (pwNew !== pwConfirm) { setPwError('New passwords do not match.'); return; }
    if (pwNew === pwCurrent) { setPwError('New password must be different from current.'); return; }
    setPwLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) { setPwError('Session expired. Please log in again.'); setPwLoading(false); return; }
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: pwCurrent,
      });
      if (signInErr) { setPwError('Current password is incorrect.'); setPwLoading(false); return; }
      const { error: updateErr } = await supabase.auth.updateUser({ password: pwNew });
      if (updateErr) { setPwError('Failed to update: ' + updateErr.message); setPwLoading(false); return; }
      setPwSuccess('Password updated successfully.');
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
    } catch (e: any) {
      setPwError('Unexpected error: ' + e.message);
    }
    setPwLoading(false);
  }

  const approveSupplier = async (id: string) => { await supabase.from('suppliers').update({ status: 'approved' }).eq('id', id); setAllSuppliers(prev => prev.map(s => s.id === id ? { ...s, status: 'approved' } : s)); };
  const rejectSupplier  = async (id: string) => { await supabase.from('suppliers').update({ status: 'rejected' }).eq('id', id); setAllSuppliers(prev => prev.map(s => s.id === id ? { ...s, status: 'rejected' } : s)); };
  const approveProduct  = async (id: string) => { await supabase.from('supplier_products').update({ status: 'approved' }).eq('id', id); setAllProducts(prev => prev.map(p => p.id === id ? { ...p, status: 'approved' } : p)); };
  const rejectProduct   = async (id: string) => { await supabase.from('supplier_products').update({ status: 'rejected' }).eq('id', id); setAllProducts(prev => prev.map(p => p.id === id ? { ...p, status: 'rejected' } : p)); };

  // ── Admin photo override ──
  async function uploadAdminPhoto(productId: string, file: File) {
    setAdminPhotoUploading(productId);
    try {
      const fileName = "admin-" + productId + "-" + Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9.]/g, "_");
      const { error: uploadErr } = await supabase.storage.from("product-images").upload(fileName, file, { upsert: true });
      if (uploadErr) { alert("Upload failed: " + uploadErr.message); setAdminPhotoUploading(null); return; }
      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(fileName);
      const { error: updateErr } = await supabase.from("supplier_products").update({ admin_photo_url: urlData.publicUrl }).eq("id", productId);
      if (updateErr) { alert("Save failed: " + updateErr.message); setAdminPhotoUploading(null); return; }
      setAllProducts(prev => prev.map(p => p.id === productId ? { ...p, admin_photo_url: urlData.publicUrl } as any : p));
      setSupplierProducts(prev => prev.map(p => p.id === productId ? { ...p, admin_photo_url: urlData.publicUrl } as any : p));
      alert("Photo updated. Marketplace now shows your BSC photo.");
    } catch (e: any) { alert("Error: " + e.message); }
    setAdminPhotoUploading(null);
  }

  // ── Computed values ──
  const nassauInvoices  = recentInvoices.filter(i => !i.customerName.includes('DELIVERY') && !i.customerName.includes('PICKUP') && !i.customerName.includes('ANDROS'));
  const androsInvoices  = recentInvoices.filter(i => i.customerName.includes('ANDROS'));
  const marketInvoices  = recentInvoices.filter(i => i.customerName.includes('DELIVERY') || i.customerName.includes('PICKUP'));
  const nassauRevenue   = nassauInvoices.reduce((s, i) => s + i.total, 0);
  const androsRevenue   = androsInvoices.reduce((s, i) => s + i.total, 0);
  const marketRevenue   = marketInvoices.reduce((s, i) => s + i.total, 0);
  const nassauProfit    = nassauRevenue * NASSAU_MARGIN;
  const androsProfit    = androsRevenue * ANDROS_MARGIN;
  const marketProfit    = marketRevenue * MARKET_MARGIN;
  const carSalesProfit  = vehicleSalesCount * CAR_SALE_MARKUP;
  const utilityProfit   = utilityPayments.fees;
  const totalRevenue    = nassauRevenue + androsRevenue + marketRevenue + autoPartsRevenue;
  const totalProfit     = nassauProfit + androsProfit + marketProfit + carSalesProfit + autoPartsProfit + utilityProfit;
  const billShare       = totalProfit * 0.05;
  const netProfit       = totalProfit - TOTAL_FIXED_EXPENSES - billShare;
  const pendingCount    = allSuppliers.filter(s => s.status === 'pending').length;
  const today           = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // ── AI send ──
  const handleAiSend = async () => {
    if (!aiInput.trim()) return;
    const userMsg = aiInput.trim(); setAiInput('');
    setAiMessages(prev => [...prev, { role: 'user', text: userMsg }]); setAiLoading(true);
    try {
      const ctx = 'BSC Control — Dedrick Storr. Revenue: $' + totalRevenue.toFixed(2) + ' | Profit: $' + totalProfit.toFixed(2) + ' | Net: $' + netProfit.toFixed(2) + ' | Fixed expenses: $' + TOTAL_FIXED_EXPENSES + '/month | Bill Casale 5%: $' + billShare.toFixed(2) + ' | Supplier owed: $' + totalSupplierOwed.toFixed(2) + ' | Staff: ' + staffRoster.length + ' | Pending suppliers: ' + pendingCount;
      const res  = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system: ctx, messages: [...aiMessages.filter((_, i) => i > 0).map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })), { role: 'user', content: userMsg }] }) });
      const data = await res.json();
      setAiMessages(prev => [...prev, { role: 'ai', text: data.content?.[0]?.text || 'Error.' }]);
    } catch { setAiMessages(prev => [...prev, { role: 'ai', text: 'Connection error.' }]); }
    setAiLoading(false);
  };

  const navTo = (s: Section) => { setSection(s); setSidebarOpen(false); };

  // ── Styles ──
  const card: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 16, padding: 18, border: '1px solid #1e3a5f', marginBottom: 14 };
  const inp: React.CSSProperties  = { display: 'block', width: '100%', padding: '11px 14px', borderRadius: 10, backgroundColor: '#060d1f', color: '#fff', border: '1px solid #1e3a5f', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' as const, outline: 'none' };
  const statusBadge = (status: string): React.CSSProperties => ({
    padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 'bold',
    backgroundColor: status === 'approved' ? '#0a1f0a' : status === 'rejected' ? '#2d0000' : '#1a1400',
    color:           status === 'approved' ? '#4ade80' : status === 'rejected' ? '#f87171' : '#f5c518',
    border: '1px solid ' + (status === 'approved' ? '#4ade80' : status === 'rejected' ? '#f87171' : '#f5c518'),
  });

  // ── Admin photo button component ──
  const AdminPhotoBtn = ({ prod }: { prod: any }) => {
    const isUploading = adminPhotoUploading === prod.id;
    const hasOverride = !!(prod as any).admin_photo_url;
    return (
      <div style={{ marginTop: 8 }}>
        <input
          id={"admin-photo-" + prod.id}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadAdminPhoto(prod.id, file);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => document.getElementById("admin-photo-" + prod.id)?.click()}
          disabled={isUploading}
          style={{ width: "100%", padding: "8px", borderRadius: 8, backgroundColor: hasOverride ? "#0a1f0a" : "#1a1200", border: "1px solid " + (hasOverride ? "#4ade80" : "#f5c518"), color: hasOverride ? "#4ade80" : "#f5c518", fontWeight: "bold", fontSize: 12, cursor: isUploading ? "not-allowed" : "pointer", opacity: isUploading ? 0.6 : 1 }}
        >
          {isUploading ? "Uploading..." : hasOverride ? "BSC Photo Set — Tap to Change" : "Set BSC Market Photo"}
        </button>
        {hasOverride && (
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <img src={(prod as any).admin_photo_url} alt="BSC override" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", border: "2px solid #4ade80" }} />
            <div>
              <p style={{ margin: 0, color: "#4ade80", fontSize: 10, fontWeight: "bold" }}>BSC MARKET PHOTO ACTIVE</p>
              <p style={{ margin: "2px 0 0", color: "#4a5568", fontSize: 10 }}>Marketplace shows this photo</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#060d1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' as const }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🐟</div>
        <p style={{ color: '#4a5568', fontSize: 14 }}>Loading BSC Control...</p>
      </div>
    </div>
  );

  const NAV_GROUPS = [
    { label: 'OVERVIEW', items: [
      { section: 'overview'  as Section, label: 'Full Picture',       icon: '📊' },
      { section: 'freezer'   as Section, label: 'Freezer Inventory',  icon: '🧊' },
      { section: 'purchase'  as Section, label: 'Purchase Orders',    icon: '📦' },
      { section: 'expenses'  as Section, label: 'Expenses',           icon: '💸' },
    ]},
    { label: 'OPERATIONS', items: [
      { section: 'pos'       as Section, label: 'POS Locations',      icon: '🛒', badge: 'LIVE' },
      { section: 'orders'    as Section, label: 'Order Management',   icon: '📋' },
      { section: 'report'    as Section, label: 'Daily Report',       icon: '📄' },
      { section: 'yield'     as Section, label: 'Yield Processing',   icon: '🧮' },
    ]},
    { label: 'MONEY', items: [
      { section: 'profit'    as Section, label: 'Profit Report',      icon: '📈' },
      { section: 'suppliers' as Section, label: 'Supplier Admin',     icon: '🚢' },
      { section: 'supplier_history' as Section, label: 'Supplier History', icon: '📋' },
    ]},
    { label: 'TEAM', items: [
      { section: 'staff'     as Section, label: 'Staff Roster',       icon: '👥' },
    ]},
    { label: 'MARKET', items: [
      { section: 'market'    as Section, label: 'Online Market',      icon: '🏪' },
      { section: 'inventory' as Section, label: 'Stock Alerts',       icon: '⚠️' },
    ]},
    { label: 'TOOLS', items: [
      { section: 'ai'        as Section, label: 'BSC AI Assistant',   icon: '🤖' },
    ]},
    { label: 'ACCOUNT', items: [
      { section: 'password'  as Section, label: 'Change Password',    icon: '🔐' },
    ]},
  ];

  const SidebarContent = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #1a2a3a', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg, #f5c518, #e6a800)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🦀</div>
          <div>
            <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: 15 }}>BSC Control</p>
            <p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>Dedrick Storr Snr · Owner</p>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
        {NAV_GROUPS.map(group => (
          <div key={group.label} style={{ marginBottom: 20 }}>
            <p style={{ margin: '0 0 4px', padding: '0 20px', color: '#2a3a5a', fontSize: 9, letterSpacing: 2, fontWeight: 'bold' }}>{group.label}</p>
            {group.items.map((item, idx) => {
              const isActive = section === item.section;
              return (
                <button key={idx} onClick={() => navTo(item.section)} style={{ width: '100%', textAlign: 'left', padding: '10px 20px', backgroundColor: isActive ? 'rgba(245,197,24,0.12)' : 'transparent', color: isActive ? '#f5c518' : '#9ca3af', border: 'none', cursor: 'pointer', fontSize: 13, borderLeft: isActive ? '3px solid #f5c518' : '3px solid transparent', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {'badge' in item && (item as any).badge && <span style={{ backgroundColor: '#4ade80', color: '#000', borderRadius: 6, padding: '1px 6px', fontSize: 8, fontWeight: 'bold' }}>{(item as any).badge}</span>}
                  {item.section === 'suppliers' && pendingCount > 0 && <span style={{ backgroundColor: '#f87171', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{pendingCount}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid #1a2a3a', flexShrink: 0 }}>
        <div style={{ backgroundColor: 'rgba(30,58,120,0.3)', border: '1px solid #1e3a7f', borderRadius: 12, padding: '10px 14px', marginBottom: 10 }}>
          <p style={{ margin: 0, color: '#60a5fa', fontSize: 10, fontWeight: 'bold' }}>MARKET URL</p>
          <p style={{ margin: '4px 0 0', color: '#fff', fontSize: 11 }}>bscbahamas.com</p>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }} style={{ width: '100%', padding: '9px', borderRadius: 10, backgroundColor: 'transparent', color: '#4a5568', border: '1px solid #1e3a5f', fontSize: 12, cursor: 'pointer' }}>Sign Out</button>
      </div>
    </div>
  );

  const MainContent = () => (
    <>
      {section === 'overview' && (
        <>
          {pendingCount > 0 && (
            <div onClick={() => setSection('suppliers')} style={{ background: 'linear-gradient(135deg, #1a1200, #2a1e00)', border: '1px solid #f5c518', borderRadius: 16, padding: '14px 18px', marginBottom: 20, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>🚢 {pendingCount} Supplier Application{pendingCount > 1 ? 's' : ''} Pending</p>
                <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 12 }}>Tap to review and approve</p>
              </div>
              <span style={{ color: '#f5c518', fontSize: 22 }}>›</span>
            </div>
          )}
          {lowStockProducts.length > 0 && (
            <div style={{ background: 'linear-gradient(135deg, #2d0000, #3b0000)', border: '1px solid #f87171', borderRadius: 16, padding: '14px 18px', marginBottom: 20 }}>
              <p style={{ margin: '0 0 10px', color: '#f87171', fontWeight: 'bold', fontSize: 14 }}>⚠️ {lowStockProducts.length} Low Stock</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {lowStockProducts.slice(0, 4).map(p => (
                  <div key={p.id} style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ margin: 0, color: '#fff', fontSize: 12, fontWeight: 'bold' }}>{p.name}</p>
                    <span style={{ backgroundColor: '#7f1d1d', color: '#f87171', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 'bold' }}>{p.stock_qty} left</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ background: 'linear-gradient(135deg, #0a1f0a, #0d2b14)', border: '1px solid #4ade80', borderRadius: 20, padding: 20, marginBottom: 20 }}>
            <p style={{ margin: '0 0 14px', color: '#4ade80', fontWeight: 'bold', fontSize: 14 }}>Real Net Profit After All Expenses</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: 'GROSS PROFIT',   value: '$' + totalProfit.toFixed(2),          color: '#f5c518' },
                { label: 'FIXED EXPENSES', value: '-$' + TOTAL_FIXED_EXPENSES.toFixed(0), color: '#f87171' },
                { label: 'NET PROFIT',     value: '$' + netProfit.toFixed(2),             color: '#4ade80' },
              ].map(s => (
                <div key={s.label} style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14, textAlign: 'center' as const }}>
                  <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>{s.label}</p>
                  <p style={{ margin: '6px 0 0', color: s.color, fontWeight: 'bold', fontSize: isMobile ? 15 : 20 }}>{s.value}</p>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between' }}>
              <p style={{ margin: 0, color: '#aaa', fontSize: 12 }}>Bill Casale 5% share</p>
              <p style={{ margin: 0, color: '#a78bfa', fontWeight: 'bold', fontSize: 13 }}>-${billShare.toFixed(2)}</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div style={{ background: 'linear-gradient(135deg, #001a3a, #002a5a)', border: '1px solid #1e5a9f', borderRadius: 18, padding: 20 }}>
              <p style={{ margin: '0 0 4px', color: '#60a5fa', fontSize: 10, letterSpacing: 1, fontWeight: 'bold' }}>NASSAU · 38% MARGIN</p>
              <p style={{ margin: '4px 0 2px', color: '#fff', fontWeight: 'bold', fontSize: 16 }}>BSC Marketplace</p>
              <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 11 }}>Firetrial Road, Nassau</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}><p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>REVENUE</p><p style={{ margin: '4px 0 0', color: '#4ade80', fontWeight: 'bold', fontSize: 16 }}>${nassauRevenue.toFixed(2)}</p></div>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}><p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>PROFIT</p><p style={{ margin: '4px 0 0', color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>${nassauProfit.toFixed(2)}</p></div>
              </div>
              <Link href='/pos' style={{ display: 'block', padding: '10px', borderRadius: 10, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', fontSize: 13, textAlign: 'center', textDecoration: 'none' }}>Nassau POS</Link>
            </div>
            <div style={{ background: 'linear-gradient(135deg, #1a0a2a, #2a1040)', border: '1px solid #7c3aed', borderRadius: 18, padding: 20 }}>
              <p style={{ margin: '0 0 4px', color: '#a78bfa', fontSize: 10, letterSpacing: 1, fontWeight: 'bold' }}>ANDROS · 43% MARGIN</p>
              <p style={{ margin: '4px 0 2px', color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Ceta's Variety Store</p>
              <p style={{ margin: '0 0 12px', color: '#6b7280', fontSize: 11 }}>Mastic Point, North Andros</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}><p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>REVENUE</p><p style={{ margin: '4px 0 0', color: '#4ade80', fontWeight: 'bold', fontSize: 16 }}>${androsRevenue.toFixed(2)}</p></div>
                <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}><p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>PROFIT</p><p style={{ margin: '4px 0 0', color: '#a78bfa', fontWeight: 'bold', fontSize: 16 }}>${androsProfit.toFixed(2)}</p></div>
              </div>
              <Link href='/pos-andros' style={{ display: 'block', padding: '10px', borderRadius: 10, backgroundColor: '#7c3aed', color: '#fff', fontWeight: 'bold', fontSize: 13, textAlign: 'center', textDecoration: 'none' }}>Andros POS</Link>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'TOTAL REVENUE',  value: '$' + totalRevenue.toFixed(2),      color: '#4ade80', bg: 'linear-gradient(135deg, #0a1f0a, #0d2b14)' },
              { label: 'BSC PROFIT',     value: '$' + totalProfit.toFixed(2),       color: '#f5c518', bg: 'linear-gradient(135deg, #1a1200, #2a1e00)' },
              { label: 'SUPPLIER OWED',  value: '$' + totalSupplierOwed.toFixed(2), color: '#60a5fa', bg: 'linear-gradient(135deg, #001a2a, #002a3a)' },
            ].map(kpi => (
              <div key={kpi.label} style={{ background: kpi.bg, borderRadius: 16, padding: 18, border: '1px solid #1e3a5f' }}>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 2 }}>{kpi.label}</p>
                <p style={{ margin: '6px 0 0', color: kpi.color, fontWeight: 'bold', fontSize: isMobile ? 16 : 22 }}>{kpi.value}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <Link href='/pos'      style={{ background: 'linear-gradient(135deg, #f5c518, #e6b800)', color: '#000', fontWeight: 'bold', fontSize: 13, padding: '14px', borderRadius: 14, textAlign: 'center', textDecoration: 'none', display: 'block' }}>Nassau POS</Link>
            <Link href='/pos-andros' style={{ background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', color: '#fff', fontWeight: 'bold', fontSize: 13, padding: '14px', borderRadius: 14, textAlign: 'center', textDecoration: 'none', display: 'block' }}>Andros POS</Link>
            <Link href='/vehicles' style={{ background: 'linear-gradient(135deg, #001a2a, #002a3a)', color: '#60a5fa', fontWeight: 'bold', fontSize: 13, padding: '14px', borderRadius: 14, textAlign: 'center', textDecoration: 'none', display: 'block', border: '1px solid #60a5fa66' }}>Vehicles and Parts</Link>
            <Link href='/utilities' style={{ background: 'linear-gradient(135deg, #1a1200, #2a1e00)', color: '#f5c518', fontWeight: 'bold', fontSize: 13, padding: '14px', borderRadius: 14, textAlign: 'center', textDecoration: 'none', display: 'block', border: '1px solid #f5c51866' }}>Pay Bills</Link>
            <Link href='/orders'  style={{ background: 'linear-gradient(135deg, #0a1f0a, #0d2b14)', color: '#4ade80', fontWeight: 'bold', fontSize: 13, padding: '14px', borderRadius: 14, textAlign: 'center', textDecoration: 'none', display: 'block', border: '1px solid #4ade80' }}>Order Management</Link>
            <Link href='/yield'   style={{ background: 'linear-gradient(135deg, #1a1200, #2a1e00)', color: '#f5c518', fontWeight: 'bold', fontSize: 13, padding: '14px', borderRadius: 14, textAlign: 'center', textDecoration: 'none', display: 'block', border: '1px solid #f5c51866' }}>Yield Processing</Link>
          </div>
        </>
      )}

      {/* ── PASSWORD CHANGE ── */}
      {section === 'password' && (
        <>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 20, marginBottom: 4 }}>🔐 Change Password</p>
          <p style={{ color: '#4a5568', fontSize: 13, marginBottom: 24 }}>Dedrick Tamico Storr Snr · Control Admin</p>
          {pwSuccess && (
            <div style={{ backgroundColor: '#0a1f0a', border: '1px solid #4ade80', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
              <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 14 }}>Password updated successfully.</p>
            </div>
          )}
          {pwError && (
            <div style={{ backgroundColor: '#2d0000', border: '1px solid #f87171', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
              <p style={{ margin: 0, color: '#f87171', fontSize: 14 }}>{pwError}</p>
            </div>
          )}
          <div style={card}>
            <label style={{ display: 'block', color: '#6b7280', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 6 }}>Current Password</label>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <input type={showPwCurrent ? 'text' : 'password'} placeholder='Enter current password' value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} style={{ ...inp, marginBottom: 0, paddingRight: 50 }} />
              <button onClick={() => setShowPwCurrent(!showPwCurrent)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16 }}>{showPwCurrent ? 'Hide' : 'Show'}</button>
            </div>
            <label style={{ display: 'block', color: '#6b7280', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 6 }}>New Password</label>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <input type={showPwNew ? 'text' : 'password'} placeholder='At least 8 characters' value={pwNew} onChange={e => setPwNew(e.target.value)} style={{ ...inp, marginBottom: 0, paddingRight: 50 }} />
              <button onClick={() => setShowPwNew(!showPwNew)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16 }}>{showPwNew ? 'Hide' : 'Show'}</button>
            </div>
            <label style={{ display: 'block', color: '#6b7280', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 6 }}>Confirm New Password</label>
            <div style={{ position: 'relative', marginBottom: 20 }}>
              <input type={showPwConfirm ? 'text' : 'password'} placeholder='Re-enter new password' value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} style={{ ...inp, marginBottom: 0, paddingRight: 50 }} />
              <button onClick={() => setShowPwConfirm(!showPwConfirm)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16 }}>{showPwConfirm ? 'Hide' : 'Show'}</button>
            </div>
            {pwNew.length > 0 && pwConfirm.length > 0 && (
              <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                <p style={{ margin: 0, fontSize: 12, color: pwNew.length >= 8 ? '#4ade80' : '#f87171' }}>
                  {pwNew.length >= 8 ? 'Length OK' : 'Too short — minimum 8 characters'}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: pwNew === pwConfirm ? '#4ade80' : '#f87171' }}>
                  {pwNew === pwConfirm ? 'Passwords match' : 'Passwords do not match'}
                </p>
              </div>
            )}
            <button
              onClick={handlePasswordChange}
              disabled={pwLoading}
              style={{ width: '100%', padding: '14px', borderRadius: 12, backgroundColor: pwLoading ? '#333' : '#f5c518', color: pwLoading ? '#666' : '#000', fontWeight: 'bold', border: 'none', fontSize: 15, cursor: pwLoading ? 'not-allowed' : 'pointer' }}
            >
              {pwLoading ? 'Updating...' : 'Update Password'}
            </button>
          </div>
          <div style={{ ...card, borderColor: '#1e3a5f', backgroundColor: '#060d1f' }}>
            <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 11, letterSpacing: 1 }}>SECURITY REMINDER</p>
            <p style={{ margin: '0 0 4px', color: '#aaa', fontSize: 13 }}>This password change applies to your Control Admin account only.</p>
            <p style={{ margin: 0, color: '#4a5568', fontSize: 12 }}>To change staff passwords, go to Supabase Auth dashboard.</p>
          </div>
        </>
      )}

      {/* ── SUPPLIER HISTORY ── */}
      {section === 'supplier_history' && !selectedSupplier && (
        <>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 20, marginBottom: 4 }}>📋 Supplier History</p>
          <p style={{ color: '#4a5568', fontSize: 13, marginBottom: 20 }}>Select a supplier to view full profile, products, and yield lot history.</p>
          {supplierLoading && <p style={{ color: '#4a5568', textAlign: 'center', padding: 20 }}>Loading...</p>}
          {!supplierLoading && allSuppliers.map(sup => {
            const prodCount = allProducts.filter(p => p.supplier_id === sup.id).length;
            const lotCount  = allLots.filter(l => l.processed_by === sup.email?.split('@')[0]).length;
            return (
              <div key={sup.id} style={{ ...card, cursor: 'pointer' }} onClick={() => openSupplierHistory(sup)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 'bold', fontSize: 15 }}>{sup.full_name}</p>
                    <p style={{ margin: '2px 0', color: '#aaa', fontSize: 13 }}>{sup.company_name}</p>
                    <p style={{ margin: '2px 0', color: '#60a5fa', fontSize: 12 }}>{sup.email}</p>
                    <p style={{ margin: '2px 0', color: sup.whatsapp ? '#4ade80' : '#4a5568', fontSize: 12 }}>{sup.whatsapp || 'No WhatsApp'}</p>
                  </div>
                  <span style={statusBadge(sup.status)}>{sup.status.toUpperCase()}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                  <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 10px', textAlign: 'center' as const }}>
                    <p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>CATEGORY</p>
                    <p style={{ margin: '3px 0 0', color: '#a78bfa', fontWeight: 'bold', fontSize: 12 }}>{sup.category}</p>
                  </div>
                  <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 10px', textAlign: 'center' as const }}>
                    <p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>PRODUCTS</p>
                    <p style={{ margin: '3px 0 0', color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>{prodCount}</p>
                  </div>
                  <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 10px', textAlign: 'center' as const }}>
                    <p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>YIELD LOTS</p>
                    <p style={{ margin: '3px 0 0', color: '#4ade80', fontWeight: 'bold', fontSize: 16 }}>{lotCount}</p>
                  </div>
                </div>
                <p style={{ margin: '10px 0 0', color: '#f5c518', fontSize: 12, textAlign: 'right' as const }}>View Full History →</p>
              </div>
            );
          })}
        </>
      )}

      {section === 'supplier_history' && selectedSupplier && (
        <>
          <button onClick={() => { setSelectedSupplier(null); setSupplierProducts([]); setSupplierLots([]); }} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 14, cursor: 'pointer', padding: 0, marginBottom: 16 }}>Back to All Suppliers</button>
          <div style={{ ...card, borderColor: '#f5c518', background: 'linear-gradient(135deg, #1a1200, #0d1f3c)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 18 }}>{selectedSupplier.full_name}</p>
                <p style={{ margin: '3px 0', color: '#aaa', fontSize: 14 }}>{selectedSupplier.company_name}</p>
              </div>
              <span style={statusBadge(selectedSupplier.status)}>{selectedSupplier.status.toUpperCase()}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 12px' }}>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>EMAIL</p>
                <p style={{ margin: '3px 0 0', color: '#60a5fa', fontSize: 13 }}>{selectedSupplier.email}</p>
              </div>
              <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 12px' }}>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>WHATSAPP</p>
                <p style={{ margin: '3px 0 0', color: '#4ade80', fontSize: 13 }}>{selectedSupplier.whatsapp || 'Not provided'}</p>
              </div>
              <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 12px' }}>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>CATEGORY</p>
                <p style={{ margin: '3px 0 0', color: '#a78bfa', fontSize: 13 }}>{selectedSupplier.category}</p>
              </div>
              <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 12px' }}>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>LOCATION</p>
                <p style={{ margin: '3px 0 0', color: '#f5c518', fontSize: 13 }}>{(selectedSupplier as any).location || 'Bahamas'}</p>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {(['info','products','lots'] as const).map(t => (
              <button key={t} onClick={() => setHistTab(t)} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: histTab === t ? '#f5c518' : '#0d1f3c', color: histTab === t ? '#000' : '#6b7280', border: '1px solid #1e3a5f', fontWeight: 'bold', cursor: 'pointer', fontSize: 12 }}>
                {t === 'info' ? 'Info' : t === 'products' ? 'Products (' + supplierProducts.length + ')' : 'Yield Lots (' + supplierLots.length + ')'}
              </button>
            ))}
          </div>
          {historyLoading && <p style={{ color: '#4a5568', textAlign: 'center', padding: 20 }}>Loading history...</p>}
          {!historyLoading && histTab === 'info' && (
            <div style={card}>
              <p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Summary</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                {[
                  { label: 'Total Products',   value: supplierProducts.length,                                                   color: '#f5c518' },
                  { label: 'Approved',          value: supplierProducts.filter(p => p.status === 'approved').length,              color: '#4ade80' },
                  { label: 'Pending',           value: supplierProducts.filter(p => p.status === 'pending').length,               color: '#f87171' },
                  { label: 'Yield Lots',        value: supplierLots.length,                                                       color: '#60a5fa' },
                  { label: 'Total Clean Wt',    value: supplierLots.reduce((s,l) => s + l.clean_weight_lb, 0).toFixed(1) + ' lbs', color: '#4ade80' },
                  { label: 'Total Cost Paid',   value: '$' + supplierLots.reduce((s,l) => s + l.cost_paid, 0).toFixed(2),         color: '#a78bfa' },
                ].map(x => (
                  <div key={x.label} style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '10px 12px', textAlign: 'center' as const }}>
                    <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>{x.label}</p>
                    <p style={{ margin: '4px 0 0', color: x.color, fontWeight: 'bold', fontSize: 15 }}>{x.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!historyLoading && histTab === 'products' && (
            <>
              {supplierProducts.length === 0 && <div style={{ ...card, textAlign: 'center' as const, padding: 28 }}><p style={{ color: '#4a5568', margin: 0 }}>No products submitted yet.</p></div>}
              {supplierProducts.map(prod => (
                <div key={prod.id} style={card}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                    {prod.photo_url && <img src={prod.photo_url} alt={prod.name} style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{prod.name}</p>
                        <span style={statusBadge(prod.status)}>{prod.status.toUpperCase()}</span>
                      </div>
                      <p style={{ margin: '2px 0', color: '#4a5568', fontSize: 12 }}>{prod.category}{prod.sku ? ' · SKU: ' + prod.sku : ''}</p>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '7px 10px' }}><p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>COST</p><p style={{ margin: '2px 0 0', color: '#60a5fa', fontWeight: 'bold', fontSize: 13 }}>${prod.case_cost?.toFixed(2) || '0.00'}</p></div>
                    <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '7px 10px' }}><p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>ONLINE</p><p style={{ margin: '2px 0 0', color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>${prod.retail_price?.toFixed(2) || '0.00'}</p></div>
                    <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '7px 10px' }}><p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>WHOLESALE</p><p style={{ margin: '2px 0 0', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>${prod.wholesale_price?.toFixed(2) || '0.00'}</p></div>
                  </div>
                  <AdminPhotoBtn prod={prod} />
                </div>
              ))}
            </>
          )}
          {!historyLoading && histTab === 'lots' && (
            <>
              {supplierLots.length === 0 && <div style={{ ...card, textAlign: 'center' as const, padding: 28 }}><p style={{ color: '#4a5568', margin: 0 }}>No yield lots recorded yet.</p></div>}
              {supplierLots.map(lot => (
                <div key={lot.lot_number} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <p style={{ margin: 0, fontFamily: 'monospace', fontWeight: 'bold', fontSize: 15, color: '#f5c518' }}>{lot.lot_number}</p>
                      <p style={{ margin: '2px 0', color: '#aaa', fontSize: 13 }}>{lot.product_type}</p>
                      <p style={{ margin: '2px 0', color: '#4a5568', fontSize: 12 }}>Captain: {lot.captain_name} · Boat: {lot.boat_reg}</p>
                    </div>
                    <div style={{ textAlign: 'right' as const }}>
                      <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 16 }}>{lot.yield_pct}%</p>
                      <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>{new Date(lot.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '7px 10px' }}><p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>CLEAN WT</p><p style={{ margin: '2px 0 0', color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>{lot.clean_weight_lb} lbs</p></div>
                    <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '7px 10px' }}><p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>COST PAID</p><p style={{ margin: '2px 0 0', color: '#f87171', fontWeight: 'bold', fontSize: 13 }}>${Number(lot.cost_paid).toFixed(2)}</p></div>
                    <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '7px 10px' }}><p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>TRUE COST/LB</p><p style={{ margin: '2px 0 0', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>${Number(lot.true_cost_per_lb).toFixed(2)}</p></div>
                    <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '7px 10px' }}><p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>NASSAU</p><p style={{ margin: '2px 0 0', color: '#60a5fa', fontWeight: 'bold', fontSize: 13 }}>${lot.nassau_price}/lb</p></div>
                    <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '7px 10px' }}><p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>ANDROS</p><p style={{ margin: '2px 0 0', color: '#a78bfa', fontWeight: 'bold', fontSize: 13 }}>${lot.andros_price}/lb</p></div>
                    <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '7px 10px' }}><p style={{ margin: 0, color: '#4a5568', fontSize: 9 }}>ONLINE</p><p style={{ margin: '2px 0 0', color: '#4ade80', fontWeight: 'bold', fontSize: 13 }}>${lot.online_price}/lb</p></div>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {section === 'expenses' && (
        <>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 20, marginBottom: 6 }}>Monthly Expenses</p>
          <p style={{ color: '#4a5568', fontSize: 13, marginBottom: 20 }}>Fixed costs across all BSC locations</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'NASSAU TOTAL',  value: '$' + MONTHLY_EXPENSES.filter(e => e.category === 'Nassau').reduce((s, e) => s + e.amount, 0).toLocaleString(), color: '#60a5fa' },
              { label: 'ANDROS TOTAL',  value: '$' + MONTHLY_EXPENSES.filter(e => e.category === 'Andros').reduce((s, e) => s + e.amount, 0).toLocaleString(), color: '#a78bfa' },
              { label: 'TOTAL FIXED',   value: '$' + TOTAL_FIXED_EXPENSES.toLocaleString(),                                                                     color: '#f87171' },
            ].map(s => (
              <div key={s.label} style={{ ...card, textAlign: 'center' as const, marginBottom: 0 }}>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>{s.label}</p>
                <p style={{ margin: '6px 0 0', color: s.color, fontWeight: 'bold', fontSize: 20 }}>{s.value}</p>
              </div>
            ))}
          </div>
          {['Nassau','Andros','Partner'].map(cat => (
            <div key={cat} style={{ ...card, marginBottom: 14 }}>
              <p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>
                {cat === 'Nassau' ? 'Nassau Location' : cat === 'Andros' ? 'Andros Location' : 'Partnership'}
              </p>
              {MONTHLY_EXPENSES.filter(e => e.category === cat).map(exp => (
                <div key={exp.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1e3a5f' }}>
                  <p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{exp.label}</p>
                  <p style={{ margin: 0, color: exp.amount === 0 ? '#6b7280' : '#f87171', fontWeight: 'bold', fontSize: 14 }}>
                    {exp.amount === 0 ? '$' + billShare.toFixed(2) + ' (5% of $' + totalProfit.toFixed(0) + ')' : '$' + exp.amount.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          ))}
          <div style={{ background: 'linear-gradient(135deg, #2d0000, #3b0000)', border: '1px solid #f87171', borderRadius: 16, padding: 18 }}>
            {[
              { label: 'Gross Profit',    value: '$' + totalProfit.toFixed(2),            color: '#4ade80' },
              { label: 'Fixed Expenses',  value: '-$' + TOTAL_FIXED_EXPENSES.toLocaleString(), color: '#f87171' },
              { label: 'Bill Casale 5%',  value: '-$' + billShare.toFixed(2),             color: '#a78bfa' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ margin: 0, color: '#aaa', fontSize: 14 }}>{r.label}</p>
                <p style={{ margin: 0, color: r.color, fontWeight: 'bold', fontSize: 16 }}>{r.value}</p>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid #7f1d1d' }}>
              <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Net Profit</p>
              <p style={{ margin: 0, color: netProfit >= 0 ? '#4ade80' : '#f87171', fontWeight: 'bold', fontSize: 22 }}>${netProfit.toFixed(2)}</p>
            </div>
          </div>
        </>
      )}

      {section === 'staff' && (
        <>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 20, marginBottom: 6 }}>Staff Roster</p>
          <p style={{ color: '#4a5568', fontSize: 13, marginBottom: 20 }}>{staffRoster.length} team members across all locations</p>
          {staffRoster.map(s => (
            <div key={s.id} style={{ ...card, borderColor: s.role === 'control_admin' ? '#f5c518' : '#1e3a5f' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: 15 }}>{s.full_name}</p>
                  <p style={{ margin: '2px 0', color: '#60a5fa', fontSize: 12 }}>{s.position}</p>
                  <p style={{ margin: '2px 0', color: '#4a5568', fontSize: 11 }}>{s.email}</p>
                </div>
                <span style={{ backgroundColor: s.location === 'Andros' ? '#1a0a2a' : '#001a2a', color: s.location === 'Andros' ? '#a78bfa' : '#60a5fa', border: '1px solid ' + (s.location === 'Andros' ? '#a78bfa' : '#60a5fa'), borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 'bold' }}>{s.location || 'Nassau'}</span>
              </div>
              {s.strengths && <div style={{ backgroundColor: '#060d1f', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}><p style={{ margin: '0 0 2px', color: '#4ade80', fontSize: 10 }}>STRENGTHS</p><p style={{ margin: 0, color: '#aaa', fontSize: 12 }}>{s.strengths}</p></div>}
              {s.watch_points && s.watch_points !== 'None' && <div style={{ backgroundColor: '#1a0808', borderRadius: 8, padding: '8px 12px' }}><p style={{ margin: '0 0 2px', color: '#f87171', fontSize: 10 }}>WATCH</p><p style={{ margin: 0, color: '#aaa', fontSize: 12 }}>{s.watch_points}</p></div>}
            </div>
          ))}
        </>
      )}

      {section === 'freezer' && (
        <>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 20, marginBottom: 20 }}>Freezer Inventory</p>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>Spiny Tails · Firetrial Road</p>
              <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold' }}>{((TOTAL_LBS / FREEZER_CAPACITY) * 100).toFixed(1)}% full</p>
            </div>
            <div style={{ backgroundColor: '#060d1f', borderRadius: 8, height: 12, overflow: 'hidden' }}>
              <div style={{ width: ((TOTAL_LBS / FREEZER_CAPACITY) * 100) + '%', height: '100%', background: 'linear-gradient(90deg, #4ade80, #60a5fa)', borderRadius: 8 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              <p style={{ margin: 0, color: '#4ade80', fontSize: 11 }}>{TOTAL_LBS.toLocaleString()} lbs stored</p>
              <p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{(FREEZER_CAPACITY - TOTAL_LBS).toLocaleString()} lbs available</p>
            </div>
          </div>
          {(['seafood','poultry','meat'] as const).map(cat => {
            const items = SPINY_TAILS_INVENTORY.filter(i => i.category === cat && i.lbs > 0);
            if (!items.length) return null;
            return (
              <div key={cat} style={{ marginBottom: 14 }}>
                <p style={{ margin: '0 0 8px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>{cat === 'seafood' ? 'Seafood' : cat === 'poultry' ? 'Poultry' : 'Meats'}</p>
                {items.map(item => (
                  <div key={item.name} style={{ ...card, padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 20 }}>{item.icon}</span><p style={{ margin: 0, fontSize: 13, fontWeight: 'bold' }}>{item.name}</p></div>
                    <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 14 }}>{item.lbs.toLocaleString()} lbs</p>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}

      {section === 'purchase' && (
        <>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 20, marginBottom: 6 }}>Purchase Orders</p>
          <Link href='/purchase-orders' style={{ display: 'block', background: 'linear-gradient(135deg, #f5c518, #e6b800)', color: '#000', fontWeight: 'bold', padding: '16px', borderRadius: 14, textDecoration: 'none', fontSize: 16, textAlign: 'center', marginBottom: 14 }}>Open Purchase Orders</Link>
        </>
      )}

      {section === 'pos' && (
        <div style={{ paddingTop: 20 }}>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 20, marginBottom: 20 }}>POS Locations</p>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
            <div style={{ background: 'linear-gradient(135deg, #1a0a00, #2a1200)', border: '1px solid rgba(245,197,24,0.4)', borderRadius: 18, padding: 24 }}>
              <p style={{ margin: '0 0 4px', color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>BSC Marketplace</p>
              <p style={{ margin: '0 0 16px', color: '#4ade80', fontSize: 12, fontWeight: 'bold' }}>38% BSC Margin</p>
              <Link href='/pos' style={{ display: 'block', background: 'linear-gradient(135deg, #f5c518, #e6b800)', color: '#000', fontWeight: 'bold', padding: '13px', borderRadius: 12, textDecoration: 'none', fontSize: 15, textAlign: 'center' }}>Open Nassau POS</Link>
            </div>
            <div style={{ background: 'linear-gradient(135deg, #1a0a2a, #2a1040)', border: '1px solid rgba(124,58,237,0.5)', borderRadius: 18, padding: 24 }}>
              <p style={{ margin: '0 0 4px', color: '#a78bfa', fontWeight: 'bold', fontSize: 16 }}>Ceta's Variety Store</p>
              <p style={{ margin: '0 0 16px', color: '#a78bfa', fontSize: 12, fontWeight: 'bold' }}>43% BSC Margin</p>
              <Link href='/pos-andros' style={{ display: 'block', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)', color: '#fff', fontWeight: 'bold', padding: '13px', borderRadius: 12, textDecoration: 'none', fontSize: 15, textAlign: 'center' }}>Open Andros POS</Link>
            </div>
          </div>
        </div>
      )}

      {section === 'orders' && (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 22, marginBottom: 8 }}>Order Management</p>
          <Link href='/orders' style={{ display: 'inline-block', background: 'linear-gradient(135deg, #f5c518, #e6b800)', color: '#000', fontWeight: 'bold', padding: '16px 40px', borderRadius: 14, textDecoration: 'none', fontSize: 17 }}>Open Order Management</Link>
        </div>
      )}

      {section === 'yield' && (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 22, marginBottom: 8 }}>Yield Processing</p>
          <Link href='/yield' style={{ display: 'inline-block', background: 'linear-gradient(135deg, #f5c518, #e6b800)', color: '#000', fontWeight: 'bold', padding: '16px 40px', borderRadius: 14, textDecoration: 'none', fontSize: 17 }}>Open Yield System</Link>
        </div>
      )}

      {section === 'profit' && (
        <>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 20, marginBottom: 20 }}>Profit Report</p>
          <div style={card}>
            {[
              { label: 'Nassau Revenue',     value: '$' + nassauRevenue.toFixed(2),       color: '#4ade80' },
              { label: 'Andros Revenue',     value: '$' + androsRevenue.toFixed(2),       color: '#a78bfa' },
              { label: 'Online Revenue',     value: '$' + marketRevenue.toFixed(2),       color: '#60a5fa' },
              { label: 'Auto Parts Revenue', value: '$' + autoPartsRevenue.toFixed(2),    color: '#a78bfa' },
              { label: 'Car Sales Profit',   value: '$' + carSalesProfit.toFixed(2),      color: '#f5c518' },
              { label: 'Auto Parts Profit',  value: '$' + autoPartsProfit.toFixed(2),     color: '#a78bfa' },
              { label: 'Utility Fee Income', value: '$' + utilityProfit.toFixed(2),       color: '#4ade80' },
              { label: 'Total COGS',         value: '-$' + totalCOGS.toFixed(2),          color: '#f87171' },
              { label: 'Supplier Owed',      value: '$' + totalSupplierOwed.toFixed(2),   color: '#60a5fa' },
              { label: 'Gross Profit',       value: '$' + totalProfit.toFixed(2),         color: '#f5c518' },
              { label: 'Fixed Expenses',     value: '-$' + TOTAL_FIXED_EXPENSES.toLocaleString(), color: '#f87171' },
              { label: 'Bill Casale 5%',     value: '-$' + billShare.toFixed(2),          color: '#a78bfa' },
              { label: 'NET PROFIT',         value: '$' + netProfit.toFixed(2),           color: netProfit >= 0 ? '#4ade80' : '#f87171' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #1e3a5f' }}>
                <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>{row.label}</p>
                <p style={{ margin: 0, color: row.color, fontWeight: 'bold', fontSize: 13 }}>{row.value}</p>
              </div>
            ))}
          </div>
          <div style={{ ...card, borderColor: '#60a5fa44' }}>
            <p style={{ margin: '0 0 14px', color: '#60a5fa', fontWeight: 'bold', fontSize: 14 }}>Supplier Payout Ledger</p>
            {Object.entries(supplierPayoutMap).map(([supplierId, data]) => (
              <div key={supplierId} style={{ backgroundColor: '#060d1f', borderRadius: 10, padding: '12px 14px', marginBottom: 10, border: data.owed > 0 ? '1px solid #f5c51866' : '1px solid #1e3a5f' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{data.name}</p>
                  <div style={{ textAlign: 'right' as const }}>
                    {data.owed > 0 && <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold' }}>${data.owed.toFixed(2)} owed</p>}
                    {data.paid > 0 && <p style={{ margin: 0, color: '#4ade80', fontSize: 12 }}>${data.paid.toFixed(2)} paid</p>}
                  </div>
                </div>
                {data.owed > 0 && (
                  <button onClick={() => markSupplierPaid(supplierId)} style={{ width: '100%', padding: '9px', borderRadius: 10, backgroundColor: '#0a1f0a', color: '#4ade80', border: '1px solid #4ade80', fontWeight: 'bold', fontSize: 13, cursor: 'pointer' }}>
                    Mark ${data.owed.toFixed(2)} as Paid
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {section === 'suppliers' && (
        <>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 20, marginBottom: 14 }}>Supplier Admin</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'PENDING',  value: allSuppliers.filter(s => s.status === 'pending').length,  color: '#f5c518' },
              { label: 'APPROVED', value: allSuppliers.filter(s => s.status === 'approved').length, color: '#4ade80' },
              { label: 'AWAITING', value: allProducts.filter(p => p.status === 'pending').length,   color: '#60a5fa' },
            ].map(stat => (
              <div key={stat.label} style={{ ...card, textAlign: 'center' as const, padding: 14, marginBottom: 0 }}>
                <p style={{ margin: 0, color: stat.color, fontSize: 22, fontWeight: 'bold' }}>{stat.value}</p>
                <p style={{ margin: '4px 0 0', color: '#4a5568', fontSize: 10 }}>{stat.label}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {(['applications','products'] as const).map(tab => (
              <button key={tab} onClick={() => setSupplierTab(tab)} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: supplierTab === tab ? '#f5c518' : '#0d1f3c', color: supplierTab === tab ? '#000' : '#6b7280', border: '1px solid #1e3a5f', fontWeight: 'bold', cursor: 'pointer', fontSize: 12 }}>
                {tab === 'applications' ? 'Applications (' + allSuppliers.length + ')' : 'Products (' + allProducts.filter(p => p.status === 'pending').length + ' pending)'}
              </button>
            ))}
          </div>
          {supplierLoading && <p style={{ color: '#4a5568', textAlign: 'center', padding: 20 }}>Loading...</p>}
          {!supplierLoading && supplierTab === 'applications' && allSuppliers.map(sup => (
            <div key={sup.id} style={{ ...card, borderColor: sup.status === 'pending' ? '#f5c518' : '#1e3a5f' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: 15 }}>{sup.full_name}</p>
                  <p style={{ margin: '2px 0', color: '#aaa', fontSize: 13 }}>{sup.company_name}</p>
                  <p style={{ margin: '2px 0', color: '#60a5fa', fontSize: 12 }}>{sup.email}</p>
                </div>
                <span style={statusBadge(sup.status)}>{sup.status.toUpperCase()}</span>
              </div>
              {sup.status === 'pending' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => approveSupplier(sup.id)} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 13 }}>Approve</button>
                  <button onClick={() => rejectSupplier(sup.id)}  style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: '#3b0000', color: '#f87171', border: '1px solid #7f1d1d', cursor: 'pointer', fontSize: 13 }}>Reject</button>
                </div>
              )}
            </div>
          ))}
          {!supplierLoading && supplierTab === 'products' && allProducts.map(prod => (
            <div key={prod.id} style={card}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                {prod.photo_url && <img src={prod.photo_url} alt={prod.name} style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>{prod.name}</p>
                    <span style={statusBadge(prod.status)}>{prod.status.toUpperCase()}</span>
                  </div>
                  <p style={{ margin: '2px 0', color: '#4a5568', fontSize: 12 }}>By {prod.supplier_name}</p>
                </div>
              </div>
              {prod.status === 'pending' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => approveProduct(prod.id)} style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 13 }}>Approve and Go Live</button>
                  <button onClick={() => rejectProduct(prod.id)}  style={{ flex: 1, padding: '10px', borderRadius: 10, backgroundColor: '#3b0000', color: '#f87171', border: '1px solid #7f1d1d', cursor: 'pointer', fontSize: 13 }}>Reject</button>
                </div>
              )}
              {prod.status === 'approved' && <AdminPhotoBtn prod={prod} />}
            </div>
          ))}
          <Link href='/supplier' style={{ textDecoration: 'none' }}>
            <div style={{ ...card, textAlign: 'center' as const, background: 'linear-gradient(135deg, #0d1f3c, #132a4a)' }}>
              <p style={{ margin: 0, color: '#a78bfa', fontWeight: 'bold', fontSize: 14 }}>Open Full Supplier Portal</p>
            </div>
          </Link>
        </>
      )}

      {section === 'inventory' && (
        <>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 20, marginBottom: 20 }}>Stock Alerts</p>
          {lowStockProducts.length === 0 && products.filter(p => p.stock <= p.minStock + 2).length === 0 && (
            <div style={{ ...card, textAlign: 'center' as const, padding: 28 }}><p style={{ color: '#4ade80', margin: 0 }}>All stock levels healthy</p></div>
          )}
          {lowStockProducts.length > 0 && (
            <div style={{ ...card, borderColor: '#7f1d1d', backgroundColor: '#1a0808' }}>
              <p style={{ margin: '0 0 12px', color: '#f87171', fontWeight: 'bold', fontSize: 14 }}>Live Low Stock</p>
              {lowStockProducts.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div><p style={{ margin: 0, color: '#aaa', fontSize: 13 }}>{p.name}</p><p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>{p.supplier_name}</p></div>
                  <p style={{ margin: 0, color: '#f87171', fontWeight: 'bold', fontSize: 13 }}>{p.stock_qty} left</p>
                </div>
              ))}
            </div>
          )}
          <Link href='/inventory' style={{ display: 'block', background: 'linear-gradient(135deg, #f5c518, #e6b800)', color: '#000', fontWeight: 'bold', padding: '14px', borderRadius: 12, textDecoration: 'none', fontSize: 15, textAlign: 'center' }}>Open Full Inventory</Link>
        </>
      )}

      {section === 'market' && (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 22, marginBottom: 8 }}>BSC Online Marketplace</p>
          <p style={{ color: '#4a5568', fontSize: 14, marginBottom: 24 }}>bscbahamas.com</p>
          <Link href='/' target='_blank' style={{ display: 'inline-block', background: 'linear-gradient(135deg, #f5c518, #e6b800)', color: '#000', fontWeight: 'bold', padding: '16px 40px', borderRadius: 14, textDecoration: 'none', fontSize: 17 }}>Open Marketplace</Link>
        </div>
      )}

      {section === 'report' && (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <p style={{ color: '#f5c518', fontWeight: 'bold', fontSize: 22, marginBottom: 32 }}>Daily Reports</p>
          <Link href='/report' style={{ display: 'inline-block', background: 'linear-gradient(135deg, #f5c518, #e6b800)', color: '#000', fontWeight: 'bold', padding: '16px 40px', borderRadius: 14, textDecoration: 'none', fontSize: 17 }}>Open Reports</Link>
        </div>
      )}

      {section === 'ai' && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e3a5f', background: 'linear-gradient(135deg, #0d1f3c, #132a4a)' }}>
            <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>BSC AI Assistant</p>
            <p style={{ margin: '3px 0 0', color: '#4a5568', fontSize: 12 }}>Full system · Revenue · Expenses · Staff · COGS</p>
          </div>
          <div style={{ height: 420, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {aiMessages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '80%', padding: '12px 16px', fontSize: 14, lineHeight: 1.6, borderRadius: msg.role === 'user' ? '16px 16px 2px 16px' : '16px 16px 16px 2px', backgroundColor: msg.role === 'user' ? '#f5c518' : '#0d1f3c', color: msg.role === 'user' ? '#000' : '#fff', border: msg.role === 'ai' ? '1px solid #1e3a5f' : 'none' }}>
                  {msg.text}
                </div>
              </div>
            ))}
            {aiLoading && <div style={{ display: 'flex', justifyContent: 'flex-start' }}><div style={{ padding: '12px 16px', borderRadius: '16px 16px 16px 2px', backgroundColor: '#0d1f3c', border: '1px solid #1e3a5f', color: '#4a5568', fontSize: 14 }}>Thinking...</div></div>}
          </div>
          <div style={{ padding: '14px 18px', borderTop: '1px solid #1e3a5f', display: 'flex', gap: 10 }}>
            <input placeholder='Ask about profits, staff, expenses, suppliers...' value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAiSend()} style={{ flex: 1, padding: '12px 16px', borderRadius: 12, backgroundColor: '#060d1f', color: '#fff', border: '1px solid #1e3a5f', fontSize: 14, outline: 'none' }} />
            <button onClick={handleAiSend} disabled={aiLoading} style={{ padding: '12px 20px', borderRadius: 12, backgroundColor: aiLoading ? '#555' : '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: aiLoading ? 'not-allowed' : 'pointer', fontSize: 14 }}>Send</button>
          </div>
        </div>
      )}
    </>
  );

  const BottomNav = () => (
    <div style={{ position: 'fixed', bottom: 0, left: isMobile ? 0 : 260, right: 0, zIndex: 100, background: 'rgba(6,10,25,0.97)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderTop: '1px solid rgba(245,197,24,0.12)', padding: '8px 12px 12px' }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, maxWidth: 620, margin: '0 auto' }}>
        {BOTTOM_NAV.map(item => {
          const isActive = section === item.s;
          return (
            <button key={item.s} onClick={() => navTo(item.s)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: '8px 4px 6px', borderRadius: 14, border: 'none', cursor: 'pointer', background: isActive ? 'linear-gradient(135deg, rgba(245,197,24,0.22), rgba(245,197,24,0.10))' : 'rgba(13,31,60,0.6)', outline: isActive ? '1px solid rgba(245,197,24,0.3)' : '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: isMobile ? 20 : 18 }}>{item.icon}</span>
              <span style={{ fontSize: 8, fontWeight: isActive ? 'bold' : '500', color: isActive ? '#f5c518' : 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' as const }}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#060d1f', color: '#fff', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {!isMobile && (
        <div style={{ width: 260, backgroundColor: '#070e1d', borderRight: '1px solid #1a2a3a', position: 'sticky' as const, top: 0, height: '100vh', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <SidebarContent />
        </div>
      )}
      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
          <div onClick={() => setSidebarOpen(false)} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)' }} />
          <div style={{ position: 'relative', zIndex: 1, width: 280, backgroundColor: '#070e1d', display: 'flex', flexDirection: 'column', height: '100vh', borderRight: '1px solid #1a2a3a' }}>
            <SidebarContent />
          </div>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ background: 'linear-gradient(135deg, #070e1d, #0d1f3c)', borderBottom: '1px solid #1a2a3a', padding: '14px 20px', position: 'sticky' as const, top: 0, zIndex: 50 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 22, cursor: 'pointer', padding: 0 }}>☰</button>
              <div>
                <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 18 }}>BSC Control</p>
                <p style={{ margin: 0, color: '#4a5568', fontSize: 10 }}>{today}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: isMobile ? 12 : 20, alignItems: 'center' }}>
              <div style={{ textAlign: 'right' as const }}><p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: isMobile ? 14 : 18 }}>${totalRevenue.toFixed(2)}</p><p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>REVENUE</p></div>
              <div style={{ textAlign: 'right' as const }}><p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: isMobile ? 14 : 18 }}>${totalProfit.toFixed(2)}</p><p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>PROFIT</p></div>
              <div style={{ textAlign: 'right' as const }}><p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: isMobile ? 14 : 18 }}>${netProfit.toFixed(2)}</p><p style={{ margin: 0, color: '#4a5568', fontSize: 9, letterSpacing: 1 }}>NET</p></div>
              <div style={{ backgroundColor: '#0a2010', color: '#4ade80', borderRadius: 20, padding: '5px 14px', fontSize: 11, fontWeight: 'bold', border: '1px solid #4ade80' }}>LIVE</div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, padding: '24px 20px', overflowY: 'auto', paddingBottom: 100, maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' as const }}>
          <MainContent />
        </div>
        <BottomNav />
      </div>
    </div>
  );
}