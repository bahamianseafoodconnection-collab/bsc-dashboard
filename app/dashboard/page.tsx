'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import InvoiceScanner from '@/components/InvoiceScanner';
import DashboardSnapshot from './snapshot';
import { fetchOverheadMetrics, type OverheadMetrics } from '@/lib/profit';
import { useUserRole, canLock } from '@/lib/role';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const NAV_GROUPS = [
  {
    label: 'Operations',
    items: [
      { icon: '🏠', label: 'Overview',         href: '/dashboard' },
      { icon: '🟡', label: 'Nassau POS',        href: '/pos' },
      { icon: '🟣', label: 'Andros POS',        href: '/pos-andros' },
      { icon: '📦', label: 'Orders',            href: '/orders' },
      { icon: '🚚', label: 'Pickup Queue',      href: '/pickup-queue' },
      { icon: '🫀', label: 'Pulse (live)',      href: '/pulse' },
      { icon: '🇧🇸', label: 'Wholesale Orders', href: '/wholesale-orders' },
      { icon: '🏭', label: 'Processor',         href: '/processor' },
    ],
  },
  {
    label: 'Inventory & Supply',
    items: [
      { icon: '📦', label: 'Inventory',         href: '/inventory' },
      { icon: '🚢', label: 'Suppliers',         href: '/supplier' },
      { icon: '🧮', label: 'Landed-cost calc',  href: '/landed-cost' },
      { icon: '🧾', label: 'Purchase Orders',   href: '/purchase-orders' },
      { icon: '📥', label: 'Buy Next (auto)',    href: '/supplier-purchases' },
      { icon: '⚖️', label: 'Yield Calculator',  href: '/yield' },
      { icon: '🏷️', label: 'Print Labels',      href: '/labels' },
      { icon: '🎣', label: 'Captains',           href: '/captains' },
      { icon: '🦞', label: 'Lobster Intake',     href: '/lobster-intake' },
      { icon: '🏭', label: 'Spiny Tails (HACCP)', href: '/spinytails' },
      { icon: '📥', label: 'Spiny Tails intake',  href: '/spinytails/intake' },
      { icon: '🛥', label: 'Spiny Tails vessels', href: '/spinytails/vessels' },
      { icon: '📚', label: 'Spiny Tails SOPs',    href: '/spinytails/steps' },
      { icon: '📜', label: 'Spiny Tails docs',    href: '/spinytails/documents' },
      { icon: '🔐', label: 'ST Inspector audits', href: '/spinytails/audits' },
      { icon: '🎣', label: 'Fishermen (logins)', href: '/dashboard/fishermen' },
      { icon: '💵', label: 'Cashier drawers',    href: '/dashboard/cashiers' },
      { icon: '📈', label: 'Cashier trends',     href: '/dashboard/cashiers/trends' },
      { icon: '⚖️', label: 'Yield Measurement',  href: '/yield-measure' },
      { icon: '🏷️', label: 'Lobster Labels',     href: '/lobster-labels' },
      { icon: '🧊', label: 'Igloo Integration',  href: '/igloo' },
    ],
  },
  {
    label: 'Money',
    items: [
      { icon: '💸', label: 'Expenses',          href: '/expenses' },
      { icon: '📋', label: 'Accounts Payable',  href: '/accounts-payable' },
      { icon: '🧮', label: 'Pricing rules',     href: '/dashboard/pricing-rules' },
      { icon: '🧾', label: 'AR Aging (wholesale)', href: '/dashboard/ar-aging' },
      { icon: '📈', label: 'AR payment behavior',  href: '/dashboard/ar-aging/trends' },
      { icon: '💼', label: 'Payroll',           href: '/payroll' },
      { icon: '👥', label: 'Customers',         href: '/customers' },
      { icon: '🪪', label: 'Staff',             href: '/staff' },
      { icon: '🔗', label: 'Partner Links',     href: '/partner-tokens' },
      { icon: '🎟️', label: 'Promo Codes',       href: '/promos' },
      { icon: '⭐', label: 'Reviews',            href: '/reviews-admin' },
      { icon: '📈', label: 'Reports + CSV',     href: '/reports' },
      { icon: '🔔', label: 'Notifications',     href: '/notifications' },
    ],
  },
  {
    label: 'Services & Fleet',
    items: [
      { icon: '🚛', label: 'Fleet (internal)',  href: '/fleet' },
      { icon: '🚗', label: 'Vehicles & Parts',  href: '/vehicles' },
      { icon: '⚡', label: 'Bill Payments',     href: '/utilities' },
      { icon: '🛒', label: 'Public Market',     href: '/market' },
      { icon: '🖼️', label: 'Product Images',   href: '/admin/images' },
      { icon: '🏷️', label: 'Products',         href: '/products' },
      { icon: '📷', label: 'New product intake',    href: '/founder-ai/products/intake' },
      { icon: '🧪', label: 'Pending products (AI)', href: '/founder-ai/products/pending' },
      { icon: '🔥', label: 'Specials (closed dates)', href: '/dashboard/specials' },
    ],
  },
  {
    label: 'AI & Insights',
    items: [
      { icon: '🤖', label: 'Founder AI',        href: '#ai' },
      { icon: '👥', label: 'Customer pulse (founder)',  href: '/dashboard/customer-pulse' },
      { icon: '📷', label: 'New product intake',     href: '/founder-ai/products/intake' },
      { icon: '🧪', label: 'Pending products review', href: '/founder-ai/products/pending' },
      { icon: '🩺', label: 'Operational health',     href: '/dashboard/health' },
      { icon: '📚', label: 'Dashboard Guide',   href: '/dashboard-guide' },
    ],
  },
];

// Revenue streams. The first four map to orders.order_type values and
// pull live month-to-date totals from Supabase. The last five reference
// services/products that don't live in the orders table (yet) — they
// render as "—" with a "Not yet tracked" caption so staff aren't shown
// fake $0.00 numbers.
const REVENUE_STREAMS: { label: string; icon: string; profit: string; color: string; orderType: string | null }[] = [
  { label: 'Nassau POS Sales', icon: '🟡', profit: '38%',      color: '#fef9e7', orderType: 'pos_sale_nassau' },
  { label: 'Andros POS Sales', icon: '🟣', profit: '43%',      color: '#f5f0ff', orderType: 'pos_sale_andros' },
  { label: 'Online Market',    icon: '🛒', profit: '25%',      color: '#e8f4fd', orderType: 'online_market'   },
  { label: 'Wholesale',        icon: '📦', profit: '15%',      color: '#f0fde8', orderType: 'wholesale'       },
  { label: 'Vehicle Sales',    icon: '🚗', profit: '$650/car', color: '#fff3e8', orderType: null },
  { label: 'Vehicle Rentals',  icon: '🔑', profit: '$10/day',  color: '#fff3e8', orderType: null },
  { label: 'Auto Parts',       icon: '🔧', profit: '10%',      color: '#fde8e8', orderType: null },
  { label: 'Bill Payments',    icon: '⚡', profit: '4.5%',     color: '#e8f8fd', orderType: null },
  { label: 'Supplier Fees',    icon: '🚢', profit: 'Varies',   color: '#f0fde8', orderType: null },
];

const WHOLESALERS = [
  { key: 'asa-h-pritchard',            name: 'Asa H Pritchard',            color: '#1B4F72', logo: '🏪' },
  { key: 'bahamas-international-food', name: 'Bahamas International Food', color: '#1E5C2E', logo: '🍱' },
  { key: 'dalbenas',                   name: "D'Albenas",                  color: '#784212', logo: '🏭' },
  { key: 'bahamas-wholesale-agencies', name: 'Bahamas Wholesale Agencies', color: '#1A5276', logo: '📦' },
  { key: 'tpg',                        name: 'TPG',                        color: '#2C3E50', logo: '🛒' },
  { key: 'thompson-trading',           name: 'Thompson Trading',           color: '#922B21', logo: '🤝' },
  { key: 'island-wholesale',           name: 'Island Wholesale',           color: '#196F3D', logo: '🌴' },
];

type Message = { role: 'user' | 'assistant'; content: string };

type SaleRecord = {
  id: string;
  created_at: string;
  total: number;
  status: string;
  payment_method: string;
  channel?: string;
};

type WholesaleOrder = {
  id: string;
  created_at: string;
  total: number;
  wholesaler: string;
  customer_name?: string;
  wholesale_cost_total: number;
  wholesale_items: { name: string; quantity: number; unit: string; price: number }[];
  payment_status: string;
  admin_purchased: boolean;
};

const MARGIN: Record<string, number> = {
  nassau: 0.38, andros: 0.43, online: 0.25, wholesale: 0.15,
};

function calcSplit(sale: SaleRecord) {
  const margin = MARGIN[sale.channel || 'nassau'] ?? 0.38;
  return { bscProfit: sale.total * margin, supplierCOGS: sale.total * (1 - margin), margin };
}

function fmtBSD(n: number) { return `BSD $${Number(n || 0).toFixed(2)}`; }

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function DashboardPage() {
  const [sidebarOpen, setSidebarOpen]         = useState(false);
  const [activeTab, setActiveTab]             = useState('overview');
  const [authChecked, setAuthChecked]         = useState(false);
  const [aiMessages, setAiMessages]           = useState<Message[]>([
    { role: 'assistant', content: "Good morning. I'm Founder AI — I see your live BSC database, know your principles, and apply your sacred pricing rules. Ask anything: today's numbers, a margin call, a strategy question, a pricing decision." },
  ]);
  const [aiInput, setAiInput]                 = useState('');
  const [aiLoading, setAiLoading]             = useState(false);
  const [spinyTailsStock]                     = useState(9310);
  const messagesEndRef                        = useRef<HTMLDivElement>(null);
  const [todaySales, setTodaySales]           = useState<SaleRecord[]>([]);
  const [salesLoading, setSalesLoading]       = useState(true);
  const [wholesaleOrders, setWholesaleOrders] = useState<WholesaleOrder[]>([]);
  const [wholesaleLoading, setWholesaleLoading] = useState(true);
  const [weeklyCatchLb, setWeeklyCatchLb]         = useState<number | null>(null);
  const [weeklyProcessedLb, setWeeklyProcessedLb] = useState<number | null>(null);
  const [weeklyYieldPct, setWeeklyYieldPct]       = useState<number | null>(null);
  const [overdueCreditCount, setOverdueCreditCount] = useState<number | null>(null);
  const [overhead, setOverhead] = useState<OverheadMetrics | null>(null);
  const [mtdNetProfit, setMtdNetProfit] = useState<number | null>(null);
  const [todayNetProfit, setTodayNetProfit] = useState<number | null>(null);
  const [revenueByType, setRevenueByType] = useState<Record<string, number> | null>(null);
  const [recentBatches, setRecentBatches] = useState<{
    species: string | null;
    yield_pct: number | null;
    finished_weight_lb: number | null;
    raw_weight_lb: number | null;
    created_at: string;
  }[] | null>(null);
  const [freezerStockLb, setFreezerStockLb] = useState<number | null>(null);
  const [showStockEdit, setShowStockEdit] = useState(false);
  const [stockProducts, setStockProducts] = useState<{ id: string; sku: string; name: string; stock_lbs: number }[] | null>(null);
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({});
  const [stockSaving, setStockSaving] = useState(false);
  const [stockSaveMsg, setStockSaveMsg] = useState<string | null>(null);
  const { role: userRole } = useUserRole();
  const canEditStock = canLock(userRole); // founder + co_founder only

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { window.location.href = '/staff-login'; return; }

      // Dashboard is locked to founder + co_founder (Dedrick + Jaquel).
      // Every other role gets bounced — basic_admin → /jaquel,
      // everyone else → /market. Profile.role is the source of truth.
      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();
      const role = (prof?.role as string | null) ?? null;
      if (role !== 'founder' && role !== 'co_founder') {
        if (role === 'basic_admin')     window.location.href = '/jaquel';
        else if (role === 'manager')    window.location.href = '/jaquel';
        else if (role === 'cashier')    window.location.href = '/pos';
        else if (role === 'receiver')   window.location.href = '/intake/scan-invoice';
        else if (role === 'processor')  window.location.href = '/processor';
        else if (role === 'supplier')   window.location.href = '/supplier';
        else                            window.location.href = '/market';
        return;
      }
      setAuthChecked(true);
    }
    checkAuth();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages]);

  // Auto-refresh: while the Overview tab is open, re-fetch every 60s.
  // Pauses when the user switches tabs or backgrounds the browser tab,
  // so we're not pinging Supabase in hidden windows.
  useEffect(() => {
    if (activeTab !== 'overview') return;

    let cancelled = false;
    const refresh = () => {
      if (cancelled) return;
      loadTodaySales();
      loadWholesaleOrders();
      loadLogWidgets();
    };
    refresh(); // initial load on mount / tab change

    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      refresh();
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeTab]);

  async function loadLogWidgets() {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoIso = weekAgo.toISOString();

    // Each query is wrapped so one missing table (e.g. before migration runs)
    // doesn't blank out the other widgets. Staff see "—" instead of an error.
    const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await fn(); } catch { return fallback; }
    };

    const catchLb = await safe(async () => {
      const { data } = await supabase
        .from('catch_logs')
        .select('raw_weight_lb')
        .gte('created_at', weekAgoIso);
      return (data ?? []).reduce((s: number, r: { raw_weight_lb: number | null }) => s + Number(r.raw_weight_lb ?? 0), 0);
    }, null as number | null);
    setWeeklyCatchLb(catchLb);

    const procRows = await safe(async () => {
      const { data } = await supabase
        .from('processing_logs')
        .select('finished_weight_lb, yield_pct')
        .gte('created_at', weekAgoIso);
      return (data ?? []) as { finished_weight_lb: number | null; yield_pct: number | null }[];
    }, [] as { finished_weight_lb: number | null; yield_pct: number | null }[]);
    const processedLb = procRows.reduce((s, r) => s + Number(r.finished_weight_lb ?? 0), 0);
    setWeeklyProcessedLb(procRows.length ? processedLb : null);
    const yieldValues = procRows.map((r) => Number(r.yield_pct ?? 0)).filter((v) => v > 0);
    setWeeklyYieldPct(yieldValues.length ? yieldValues.reduce((a, b) => a + b, 0) / yieldValues.length : null);

    // Counts customers with an open credit balance. Without per-customer
    // overdue logic (would need to parse credit_terms vs last-invoice date)
    // this is a strict "owes BSC money on credit" count, which matches the
    // schema: customers.is_credit_customer + current_balance > 0.
    const overdue = await safe(async () => {
      const { count } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('is_credit_customer', true)
        .gt('current_balance', 0);
      return count ?? 0;
    }, null as number | null);
    setOverdueCreditCount(overdue);

    // Live monthly fixed overhead from the expenses table (replaces the
    // old hardcoded $20,590 placeholder).
    const oh = await safe(() => fetchOverheadMetrics(), null as OverheadMetrics | null);
    setOverhead(oh);

    // Today's net profit (sum of orders.net_profit since midnight).
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayNet = await safe(async () => {
      const { data } = await supabase
        .from('orders')
        .select('net_profit')
        .gte('created_at', today.toISOString());
      return (data ?? []).reduce(
        (s: number, r: { net_profit: number | null }) => s + Number(r.net_profit ?? 0),
        0,
      );
    }, null as number | null);
    setTodayNetProfit(todayNet);

    // Month-to-date aggregates: net profit AND per-channel revenue.
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const mtdRows = await safe(async () => {
      const { data } = await supabase
        .from('orders')
        .select('order_type, total, net_profit')
        .gte('created_at', monthStart.toISOString());
      return (data ?? []) as { order_type: string | null; total: number | null; net_profit: number | null }[];
    }, [] as { order_type: string | null; total: number | null; net_profit: number | null }[]);

    setMtdNetProfit(mtdRows.length ? mtdRows.reduce((s, r) => s + Number(r.net_profit ?? 0), 0) : null);

    const byType: Record<string, number> = {};
    for (const r of mtdRows) {
      if (!r.order_type) continue;
      byType[r.order_type] = (byType[r.order_type] ?? 0) + Number(r.total ?? 0);
    }
    setRevenueByType(byType);

    // Five most recent processing batches — drives the Yield tab list.
    const recent = await safe(async () => {
      const { data } = await supabase
        .from('processing_logs')
        .select('species, yield_pct, finished_weight_lb, raw_weight_lb, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      return (data ?? []) as {
        species: string | null;
        yield_pct: number | null;
        finished_weight_lb: number | null;
        raw_weight_lb: number | null;
        created_at: string;
      }[];
    }, [] as {
      species: string | null;
      yield_pct: number | null;
      finished_weight_lb: number | null;
      raw_weight_lb: number | null;
      created_at: string;
    }[]);
    setRecentBatches(recent);

    // Live freezer stock = SUM(products.stock_lbs) for active products.
    // Manual per-product edits happen via the modal below; the dashboard
    // total stays a derived value, never stored separately, so it can
    // never disagree with the products table.
    const stockTotal = await safe(async () => {
      const { data } = await supabase
        .from('products')
        .select('stock_lbs')
        .eq('status', 'active');
      return (data ?? []).reduce(
        (s: number, r: { stock_lbs: number | null }) => s + Number(r.stock_lbs ?? 0),
        0,
      );
    }, null as number | null);
    setFreezerStockLb(stockTotal);
  }

  // ── Per-product stock edit modal (founder / co_founder only) ──────────
  async function openStockEdit() {
    setShowStockEdit(true);
    setStockSaveMsg(null);
    setStockEdits({});
    const { data, error } = await supabase
      .from('products')
      .select('id, sku, name, stock_lbs')
      .eq('status', 'active')
      .order('name');
    if (error) {
      setStockProducts([]);
      setStockSaveMsg('Could not load products. Please close and try again.');
      return;
    }
    setStockProducts(((data ?? []) as { id: string; sku: string; name: string; stock_lbs: number | null }[]).map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      stock_lbs: Number(p.stock_lbs ?? 0),
    })));
  }

  async function saveStockEdits() {
    if (!stockProducts) return;
    const dirtyIds = Object.keys(stockEdits).filter((id) => {
      const orig = stockProducts.find((p) => p.id === id)?.stock_lbs ?? 0;
      const next = Number(stockEdits[id]);
      return !Number.isNaN(next) && next !== orig;
    });
    if (dirtyIds.length === 0) {
      setStockSaveMsg('Nothing changed.');
      return;
    }
    setStockSaving(true);
    setStockSaveMsg(null);
    let okCount = 0;
    let failCount = 0;
    for (const id of dirtyIds) {
      const next = Number(stockEdits[id]);
      const { error } = await supabase
        .from('products')
        .update({ stock_lbs: next })
        .eq('id', id);
      if (error) failCount++; else okCount++;
    }
    setStockSaving(false);
    setStockSaveMsg(failCount === 0
      ? `Updated ${okCount} product${okCount === 1 ? '' : 's'}.`
      : `Updated ${okCount}, ${failCount} failed. Please check those rows.`);
    if (okCount > 0) {
      // Refresh dashboard total + the modal list.
      loadLogWidgets();
      const { data } = await supabase
        .from('products')
        .select('id, sku, name, stock_lbs')
        .eq('status', 'active')
        .order('name');
      setStockProducts(((data ?? []) as { id: string; sku: string; name: string; stock_lbs: number | null }[]).map((p) => ({
        id: p.id, sku: p.sku, name: p.name, stock_lbs: Number(p.stock_lbs ?? 0),
      })));
      setStockEdits({});
    }
  }

  async function loadTodaySales() {
    setSalesLoading(true);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
      .limit(20);
    setTodaySales(data || []);
    setSalesLoading(false);
  }

  async function loadWholesaleOrders() {
    setWholesaleLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('order_type', 'wholesale')
      .eq('admin_purchased', false)
      .order('created_at', { ascending: false })
      .limit(10);
    setWholesaleOrders(data || []);
    setWholesaleLoading(false);
  }

  const todayRevenue     = todaySales.reduce((s, o) => s + (o.total || 0), 0);
  const todayProfit      = todaySales.reduce((s, o) => s + calcSplit(o).bscProfit, 0);
  const todaySupplier    = todaySales.reduce((s, o) => s + calcSplit(o).supplierCOGS, 0);
  const pendingWholesale = wholesaleOrders.length;

  const QUICK_ACTIONS = [
    { icon: '📦', label: 'Orders',          href: '/orders',             color: '#e8f4fd', badge: 0 },
    { icon: '🚢', label: 'Suppliers',       href: '/supplier',           color: '#f0fde8', badge: 3 },
    { icon: '🇧🇸', label: 'Wholesale',     href: '/wholesale-orders',   color: '#f0fde8', badge: pendingWholesale },
    { icon: '⚖️', label: 'Yield Calc',     href: '/yield',              color: '#fef9e7', badge: 0 },
    { icon: '🧾', label: 'Purchase Orders', href: '/purchase-orders',   color: '#fef9e7', badge: 0 },
    { icon: '🚗', label: 'Vehicles',        href: '/vehicles',           color: '#fff3e8', badge: 0 },
    { icon: '🖼️', label: 'Product Images', href: '/admin/images',       color: '#fef9e7', badge: 0 },
    { icon: '🏷️', label: 'Products',       href: '/products',           color: '#fef9e7', badge: 0 },
    { icon: '🇺🇸', label: 'US Products',  href: '/us-products',        color: '#e8f4fd', badge: 0 },
    { icon: '🏭', label: 'Wholesale Prod', href: '/wholesale-products', color: '#f0fde8', badge: 0 },
    { icon: '⚡', label: 'Pay Bills',       href: '/utilities',          color: '#e8f8fd', badge: 0 },
    { icon: '📊', label: 'Reports',         href: '/report',             color: '#fde8f0', badge: 0 },
    { icon: '📦', label: 'Inventory',       href: '/inventory',          color: '#f0fde8', badge: 0 },
  ];

  async function sendAiMessage() {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg = aiInput.trim();
    setAiInput('');
    setAiLoading(true);
    const history = aiMessages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    setAiMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      const res = await fetch('/api/founder-ai', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: userMsg, history }),
      });
      const data = await res.json();
      const reply = data.reply || data.error || (res.status === 401 ? 'Session expired — please sign in again.' : res.status === 403 ? 'Founder AI is private. Only Dedrick or Jaquel can use it.' : 'Sorry, I could not get a response.');
      setAiMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setAiMessages((prev) => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    }
    setAiLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/staff-login';
  }

  if (!authChecked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#060d1f', color: '#f4c842', fontFamily: 'system-ui', fontSize: '14px' }}>
        Loading BSC Control...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40 }} />
      )}

      <aside style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: '240px', backgroundColor: '#1a2e5a', zIndex: 50, display: 'flex', flexDirection: 'column', transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.25s ease', boxShadow: '4px 0 24px rgba(0,0,0,0.15)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🐟</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>BSC Control</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>Dedrick Storr Snr</div>
            </div>
          </div>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          {NAV_GROUPS.map((group) => (
            <div key={group.label} style={{ marginBottom: '8px' }}>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', padding: '6px 20px 4px' }}>
                {group.label}
              </div>
              {group.items.map((item) => (
                <Link key={item.label} href={item.href} onClick={() => { setSidebarOpen(false); if (item.href === '#ai') setActiveTab('ai'); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 20px', color: 'rgba(255,255,255,0.75)', fontSize: '14px', fontWeight: 500, textDecoration: 'none' }}>
                  <span style={{ fontSize: '16px' }}>{item.icon}</span>
                  {item.label}
                  {item.label === 'Suppliers' && <span style={{ marginLeft: 'auto', backgroundColor: '#f4c842', color: '#1a2e5a', fontSize: '10px', fontWeight: 900, padding: '2px 7px', borderRadius: '20px' }}>3</span>}
                  {item.label === 'Wholesale Orders' && pendingWholesale > 0 && <span style={{ marginLeft: 'auto', backgroundColor: '#ef4444', color: '#fff', fontSize: '10px', fontWeight: 900, padding: '2px 7px', borderRadius: '20px' }}>{pendingWholesale}</span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <button onClick={handleSignOut} style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '10px', padding: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Sign Out
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        <header style={{ backgroundColor: '#fff', borderBottom: '1px solid #ebebeb', padding: '0 16px', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button onClick={() => setSidebarOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '8px' }}>
                <svg width="22" height="22" fill="none" stroke="#1a2e5a" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <h1 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '17px', margin: 0 }}>BSC Control</h1>
                <p style={{ color: '#999', fontSize: '10px', margin: 0 }}>Live · Nassau & Andros</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {pendingWholesale > 0 && <Link href="/wholesale-orders" style={{ backgroundColor: '#fde8e8', color: '#dc2626', fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px', textDecoration: 'none' }}>🇧🇸 {pendingWholesale} wholesale pending</Link>}
              <span style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px' }}>● System Live</span>
              <Link href="/market" style={{ fontSize: '12px', color: '#1a2e5a', fontWeight: 700, textDecoration: 'none', backgroundColor: '#f0f4ff', padding: '6px 12px', borderRadius: '8px' }}>Market →</Link>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '2px', overflowX: 'auto' }}>
            {[
              { key: 'overview',  label: '📊 Overview' },
              { key: 'revenue',   label: '💰 Revenue' },
              { key: 'yield',     label: '⚖️ Yield' },
              { key: 'inventory', label: '🧊 Freezer' },
              { key: 'ai',        label: '🤖 Founder AI' },
            ].map((tab) => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ padding: '10px 14px', border: 'none', borderBottom: activeTab === tab.key ? '3px solid #f4c842' : '3px solid transparent', backgroundColor: 'transparent', color: activeTab === tab.key ? '#1a2e5a' : '#888', fontWeight: activeTab === tab.key ? 800 : 500, fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        <main style={{ flex: 1, padding: '20px 16px', overflowY: 'auto' }}>

          {activeTab === 'overview' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                <div style={{ backgroundColor: '#1a2e5a', borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px', marginBottom: '4px' }}>Gross Revenue</div>
                  <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '18px' }}>{fmtBSD(todayRevenue)}</div>
                </div>
                <div style={{ backgroundColor: '#e8f5e9', borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ color: '#666', fontSize: '10px', marginBottom: '4px' }}>BSC Keeps (after COGS)</div>
                  <div style={{ color: '#2e7d32', fontWeight: 900, fontSize: '18px' }}>{fmtBSD(todayProfit)}</div>
                </div>
                <div style={{ backgroundColor: '#fff8e7', borderRadius: '14px', padding: '14px', textAlign: 'center', borderTop: '3px solid #f5c518' }}>
                  <div style={{ color: '#666', fontSize: '10px', marginBottom: '4px' }}>Net Profit (after expenses + Bill 5%)</div>
                  <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px' }}>
                    {todayNetProfit === null ? '—' : fmtBSD(todayNetProfit)}
                  </div>
                </div>
                <div style={{ backgroundColor: '#fde8e8', borderRadius: '14px', padding: '14px', textAlign: 'center' }}>
                  <div style={{ color: '#666', fontSize: '10px', marginBottom: '4px' }}>Supplier Owed</div>
                  <div style={{ color: '#dc2626', fontWeight: 900, fontSize: '18px' }}>{fmtBSD(todaySupplier)}</div>
                </div>
              </div>

              {/* Expense coverage progress — month-to-date net profit vs monthly fixed overhead. */}
              {overhead !== null && overhead.monthly_overhead > 0 && (() => {
                const mtd = mtdNetProfit ?? 0;
                const target = overhead.monthly_overhead;
                const ratio = Math.max(0, Math.min(1, mtd / target));
                const fullyCovered = mtd >= target;
                const barColor = fullyCovered ? '#f5c518' : '#22c55e';
                return (
                  <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                      <div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '13px' }}>
                        Expense coverage this month
                        {fullyCovered && <span style={{ marginLeft: 8, color: '#f5c518', fontWeight: 900 }}>✓ FULLY COVERED</span>}
                      </div>
                      <div style={{ color: '#666', fontSize: '12px' }}>
                        {fmtBSD(mtd)} of {fmtBSD(target)}
                      </div>
                    </div>
                    <div style={{ height: '10px', backgroundColor: '#f0f0f0', borderRadius: '20px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${(ratio * 100).toFixed(1)}%`,
                        backgroundColor: barColor,
                        borderRadius: '20px',
                        transition: 'width 0.4s ease, background-color 0.4s ease',
                      }} />
                    </div>
                    <div style={{ color: '#999', fontSize: '11px', marginTop: '4px' }}>
                      {(ratio * 100).toFixed(1)}% of monthly overhead covered by net profit so far
                    </div>
                  </div>
                );
              })()}

              <DashboardSnapshot />

              {/* Log widgets — catch / processing / yield / overdue credit */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                <Link href="/logs/catch" style={{ textDecoration: 'none' }}>
                  <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #f5c518' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Catch this week</div>
                    <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '22px', marginTop: 4, fontFamily: "'Playfair Display', serif" }}>
                      {weeklyCatchLb === null ? '—' : `${Number(weeklyCatchLb).toFixed(0)} lb`}
                    </div>
                    <div style={{ fontSize: '11px', color: '#666', marginTop: 4 }}>Log a new catch →</div>
                  </div>
                </Link>
                <Link href="/logs/processing" style={{ textDecoration: 'none' }}>
                  <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #1a2e5a' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Processed this week</div>
                    <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '22px', marginTop: 4, fontFamily: "'Playfair Display', serif" }}>
                      {weeklyProcessedLb === null ? '—' : `${Number(weeklyProcessedLb).toFixed(0)} lb`}
                    </div>
                    <div style={{ fontSize: '11px', color: '#666', marginTop: 4 }}>Log a batch →</div>
                  </div>
                </Link>
                <Link href="/logs/traceability" style={{ textDecoration: 'none' }}>
                  <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #16a34a' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Avg yield this week</div>
                    <div style={{ color: '#16a34a', fontWeight: 900, fontSize: '22px', marginTop: 4, fontFamily: "'Playfair Display', serif" }}>
                      {weeklyYieldPct === null ? '—' : `${weeklyYieldPct.toFixed(1)}%`}
                    </div>
                    <div style={{ fontSize: '11px', color: '#666', marginTop: 4 }}>Traceability →</div>
                  </div>
                </Link>
                <Link href="/customers?credit=open" style={{ textDecoration: 'none' }}>
                  <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '4px solid #dc2626' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>Overdue credit</div>
                    <div style={{ color: '#dc2626', fontWeight: 900, fontSize: '22px', marginTop: 4, fontFamily: "'Playfair Display', serif" }}>
                      {overdueCreditCount === null ? '—' : overdueCreditCount}
                    </div>
                    <div style={{ fontSize: '11px', color: '#666', marginTop: 4 }}>Open accounts →</div>
                  </div>
                </Link>
              </div>

              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '20px', borderLeft: pendingWholesale > 0 ? '5px solid #ef4444' : '5px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '15px', margin: 0 }}>🇧🇸 Wholesale Orders — Action Required</h2>
                    {pendingWholesale > 0 && <span style={{ backgroundColor: '#ef4444', color: '#fff', fontSize: '11px', fontWeight: 900, padding: '3px 8px', borderRadius: '20px' }}>{pendingWholesale} pending</span>}
                  </div>
                  <Link href="/wholesale-orders" style={{ color: '#1a2e5a', fontSize: '12px', fontWeight: 700, textDecoration: 'none', backgroundColor: '#f0f4ff', padding: '6px 12px', borderRadius: '8px' }}>View All →</Link>
                </div>
                {wholesaleLoading ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#999', fontSize: '13px' }}>Loading...</div>
                ) : wholesaleOrders.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#999', fontSize: '13px' }}>✅ No pending wholesale orders. All caught up!</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {wholesaleOrders.map((order) => {
                      const wInfo = WHOLESALERS.find(w => w.key === order.wholesaler) || { name: order.wholesaler || 'Unknown', color: '#1a2e5a', logo: '🏪' };
                      const items = order.wholesale_items || [];
                      const bscProfit = (order.total || 0) - (order.wholesale_cost_total || 0);
                      return (
                        <div key={order.id} style={{ backgroundColor: '#f8f9fa', borderRadius: '12px', padding: '14px', borderLeft: `4px solid ${wInfo.color}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 22 }}>{wInfo.logo}</span>
                              <div>
                                <div style={{ fontWeight: 800, color: '#1a2e5a', fontSize: '14px' }}>{wInfo.name}</div>
                                <div style={{ color: '#999', fontSize: '11px' }}>{order.customer_name || 'Customer'} · {timeAgo(order.created_at)}</div>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ color: '#2e7d32', fontWeight: 800, fontSize: '13px' }}>+{fmtBSD(bscProfit)} profit</div>
                              <div style={{ color: '#dc2626', fontSize: '11px' }}>{fmtBSD(order.wholesale_cost_total)} to buy</div>
                            </div>
                          </div>
                          {items.length > 0 && (
                            <div style={{ backgroundColor: '#fff', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                              <div style={{ color: '#666', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Buy from {wInfo.name}:</div>
                              {items.map((item, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#1a2e5a', padding: '3px 0', borderBottom: i < items.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                                  <span style={{ fontWeight: 600 }}>{item.name}</span>
                                  <span style={{ color: '#666' }}>{item.quantity} {item.unit}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <Link href="/wholesale-orders" style={{ display: 'block', backgroundColor: wInfo.color, color: '#fff', textDecoration: 'none', borderRadius: 8, padding: '8px 14px', fontSize: '12px', fontWeight: 700, textAlign: 'center' }}>
                            View Full Order & Mark Purchased →
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '15px', margin: 0 }}>📈 Live Sales Today</h2>
                  <button onClick={loadTodaySales} style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '4px 10px', fontSize: '11px', color: '#1a2e5a', fontWeight: 700, cursor: 'pointer' }}>Refresh</button>
                </div>
                {salesLoading ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: '#999', fontSize: '13px' }}>Loading sales...</div>
                ) : todaySales.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: '#999', fontSize: '13px' }}>No sales yet today. Go make money Dedrick! 💪</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {todaySales.map((sale) => {
                      const { bscProfit, supplierCOGS, margin } = calcSplit(sale);
                      const channel = sale.channel || 'nassau';
                      return (
                        <div key={sale.id} style={{ backgroundColor: '#f8f9fa', borderRadius: '12px', padding: '12px 14px', borderLeft: '4px solid #1a2e5a' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div>
                              <div style={{ fontWeight: 800, color: '#1a2e5a', fontSize: '14px' }}>
                                {fmtBSD(sale.total || 0)}
                                <span style={{ marginLeft: '8px', backgroundColor: '#e8f4fd', color: '#1a2e5a', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', textTransform: 'capitalize' }}>{channel}</span>
                              </div>
                              <div style={{ color: '#999', fontSize: '11px', marginTop: '2px' }}>{timeAgo(sale.created_at)} · {sale.payment_method || 'cash'}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ color: '#2e7d32', fontWeight: 800, fontSize: '13px' }}>+{fmtBSD(bscProfit)}</div>
                              <div style={{ color: '#dc2626', fontSize: '11px' }}>-{fmtBSD(supplierCOGS)} supplier</div>
                            </div>
                          </div>
                          <div style={{ height: '6px', backgroundColor: '#e5e7eb', borderRadius: '20px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${margin * 100}%`, backgroundColor: '#2e7d32', borderRadius: '20px' }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                            <span style={{ color: '#999', fontSize: '10px' }}>BSC {(margin * 100).toFixed(0)}% margin</span>
                            <span style={{ color: '#999', fontSize: '10px' }}>Supplier {((1 - margin) * 100).toFixed(0)}% COGS</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <InvoiceScanner />

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '5px solid #f4c842' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div>
                      <div style={{ color: '#999', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Nassau</div>
                      <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '15px' }}>Firetrial Road</div>
                    </div>
                    <span style={{ fontSize: '26px' }}>🟡</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ backgroundColor: '#fef9e7', borderRadius: '10px', padding: '10px' }}>
                      <div style={{ color: '#999', fontSize: '10px', marginBottom: '3px' }}>Today Revenue</div>
                      <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px' }}>{fmtBSD(todaySales.filter(s => (s.channel || 'nassau') === 'nassau').reduce((a, s) => a + s.total, 0))}</div>
                    </div>
                    <div style={{ backgroundColor: '#e8f5e9', borderRadius: '10px', padding: '10px' }}>
                      <div style={{ color: '#999', fontSize: '10px', marginBottom: '3px' }}>BSC Profit 38%</div>
                      <div style={{ color: '#2e7d32', fontWeight: 900, fontSize: '18px' }}>{fmtBSD(todaySales.filter(s => (s.channel || 'nassau') === 'nassau').reduce((a, s) => a + s.total * 0.38, 0))}</div>
                    </div>
                  </div>
                  <Link href="/pos" style={{ display: 'block', backgroundColor: '#1a2e5a', color: '#f4c842', textDecoration: 'none', borderRadius: '10px', padding: '10px', textAlign: 'center', fontWeight: 800, fontSize: '13px' }}>Open Nassau POS →</Link>
                </div>

                <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: '5px solid #7c3aed' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div>
                      <div style={{ color: '#999', fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>Andros</div>
                      <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '15px' }}>{"Ceta's Variety Store"}</div>
                    </div>
                    <span style={{ fontSize: '26px' }}>🟣</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ backgroundColor: '#f5f0ff', borderRadius: '10px', padding: '10px' }}>
                      <div style={{ color: '#999', fontSize: '10px', marginBottom: '3px' }}>Today Revenue</div>
                      <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px' }}>{fmtBSD(todaySales.filter(s => s.channel === 'andros').reduce((a, s) => a + s.total, 0))}</div>
                    </div>
                    <div style={{ backgroundColor: '#e8f5e9', borderRadius: '10px', padding: '10px' }}>
                      <div style={{ color: '#999', fontSize: '10px', marginBottom: '3px' }}>BSC Profit 43%</div>
                      <div style={{ color: '#2e7d32', fontWeight: 900, fontSize: '18px' }}>{fmtBSD(todaySales.filter(s => s.channel === 'andros').reduce((a, s) => a + s.total * 0.43, 0))}</div>
                    </div>
                  </div>
                  <Link href="/pos-andros" style={{ display: 'block', backgroundColor: '#7c3aed', color: '#fff', textDecoration: 'none', borderRadius: '10px', padding: '10px', textAlign: 'center', fontWeight: 800, fontSize: '13px' }}>Open Andros POS →</Link>
                </div>
              </div>

              <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '15px', marginBottom: '12px' }}>Quick Actions</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '24px' }}>
                {QUICK_ACTIONS.map((action) => (
                  <Link key={action.label} href={action.href} style={{ backgroundColor: '#fff', border: '1px solid #ebebeb', borderRadius: '14px', padding: '14px 8px', textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(0,0,0,0.04)', position: 'relative' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: action.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>{action.icon}</div>
                    <span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '11px', lineHeight: 1.3 }}>{action.label}</span>
                    {action.badge > 0 && <span style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: '#ef4444', color: '#fff', fontSize: '9px', fontWeight: 900, padding: '2px 5px', borderRadius: '20px' }}>{action.badge}</span>}
                  </Link>
                ))}
              </div>

              {(() => {
                const FREEZER_CAPACITY_LB = 30000;
                const stock = freezerStockLb ?? 0;
                const usedPct = freezerStockLb === null ? 0 : Math.min(100, (stock / FREEZER_CAPACITY_LB) * 100);
                return (
                  <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '15px', margin: 0 }}>🧊 Spiny Tails Freezer</h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {canEditStock && (
                          <button onClick={openStockEdit} style={{ color: '#1a2e5a', fontSize: '12px', fontWeight: 700, backgroundColor: '#fff8e7', border: '1px solid #f5c518', padding: '5px 10px', borderRadius: '8px', cursor: 'pointer' }}>
                            ✎ Edit stock
                          </button>
                        )}
                        <Link href="/inventory" style={{ color: '#1a2e5a', fontSize: '12px', fontWeight: 700, textDecoration: 'none' }}>View All →</Link>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                      {[
                        { label: 'In Stock', value: freezerStockLb === null ? '—' : `${Math.round(stock).toLocaleString()} lbs`, bg: '#e8f4fd', text: '#1a2e5a' },
                        { label: 'Capacity', value: `${FREEZER_CAPACITY_LB.toLocaleString()} lbs`,                                bg: '#e8f5e9', text: '#2e7d32' },
                        { label: 'Used',     value: freezerStockLb === null ? '—' : `${usedPct.toFixed(1)}%`,                     bg: '#fef9e7', text: '#d97706' },
                      ].map((s) => (
                        <div key={s.label} style={{ backgroundColor: s.bg, borderRadius: '10px', padding: '12px', textAlign: 'center' }}>
                          <div style={{ color: '#999', fontSize: '10px', marginBottom: '4px' }}>{s.label}</div>
                          <div style={{ color: s.text, fontWeight: 900, fontSize: '15px' }}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ height: '8px', backgroundColor: '#f0f0f0', borderRadius: '20px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${usedPct.toFixed(1)}%`, backgroundColor: '#1a2e5a', borderRadius: '20px', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {activeTab === 'revenue' && (
            <div>
              <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '17px', marginBottom: '6px' }}>All 9 Revenue Streams</h2>
              <p style={{ color: '#999', fontSize: '12px', marginBottom: '18px' }}>
                Live month-to-date totals from the orders table. Streams that don't yet flow through orders are marked "Not yet tracked".
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                {REVENUE_STREAMS.map((stream) => {
                  const hasData    = stream.orderType !== null;
                  const liveAmount = hasData ? (revenueByType?.[stream.orderType!] ?? 0) : null;
                  const valueText  = !hasData
                    ? '—'
                    : revenueByType === null
                      ? 'Loading…'
                      : fmtBSD(liveAmount ?? 0);
                  return (
                    <div key={stream.label} style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: stream.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>{stream.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#666', fontSize: '12px', marginBottom: '2px' }}>{stream.label}</div>
                        <div style={{ color: hasData ? '#1a2e5a' : '#94a3b8', fontWeight: 900, fontSize: '18px' }}>{valueText}</div>
                        {!hasData && (
                          <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '2px', fontStyle: 'italic' }}>Not yet tracked in orders</div>
                        )}
                      </div>
                      <div style={{ backgroundColor: '#e8f5e9', borderRadius: '8px', padding: '4px 10px' }}>
                        <span style={{ color: '#2e7d32', fontWeight: 800, fontSize: '13px' }}>{stream.profit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ backgroundColor: '#1a2e5a', borderRadius: '16px', padding: '18px' }}>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginBottom: '6px' }}>Monthly Fixed Expenses</div>
                <div style={{ color: '#f4c842', fontWeight: 900, fontSize: '28px' }}>
                  {overhead === null ? '—' : `$${Number(overhead.monthly_overhead).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', marginTop: '4px' }}>
                  Live from expenses · salaries + utilities + rent + operations + maintenance
                </div>
              </div>
            </div>
          )}

          {activeTab === 'yield' && (
            <div>
              <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '17px', marginBottom: '6px' }}>⚖️ Yield</h2>
              <p style={{ color: '#999', fontSize: '12px', marginBottom: '20px' }}>Live yield from processing_logs — last 7 days + most recent batches.</p>

              <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '14px' }}>⚖️</div>
                <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '18px', marginBottom: '8px' }}>Full Yield Calculator</div>
                <div style={{ color: '#666', fontSize: '13px', marginBottom: '20px', lineHeight: 1.6 }}>Generate lot batch numbers · Track weight in/out · Calculate Nassau, Andros, Online and Wholesale prices automatically</div>
                <Link href="/yield" style={{ display: 'inline-block', backgroundColor: '#1a2e5a', color: '#f4c842', textDecoration: 'none', borderRadius: '12px', padding: '14px 32px', fontWeight: 900, fontSize: '15px' }}>Open Yield Calculator →</Link>
              </div>

              {/* Live week summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '14px' }}>
                <div style={{ backgroundColor: '#e8f5e9', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ color: '#666', fontSize: '11px', marginBottom: '4px' }}>Avg yield this week</div>
                  <div style={{ color: '#16a34a', fontWeight: 900, fontSize: '20px' }}>
                    {weeklyYieldPct === null ? '—' : `${weeklyYieldPct.toFixed(1)}%`}
                  </div>
                </div>
                <div style={{ backgroundColor: '#fef9e7', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ color: '#666', fontSize: '11px', marginBottom: '4px' }}>Processed this week</div>
                  <div style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '20px' }}>
                    {weeklyProcessedLb === null ? '—' : `${Number(weeklyProcessedLb).toFixed(0)} lb`}
                  </div>
                </div>
              </div>

              {/* Recent batches */}
              <div style={{ backgroundColor: '#fff', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '14px', margin: 0 }}>Recent processing batches</h3>
                  <Link href="/logs/processing" style={{ color: '#1a2e5a', fontSize: '12px', fontWeight: 700, textDecoration: 'none', backgroundColor: '#f0f4ff', padding: '5px 10px', borderRadius: '8px' }}>Log batch →</Link>
                </div>
                {recentBatches === null ? (
                  <div style={{ color: '#999', fontSize: '13px', textAlign: 'center', padding: '14px' }}>Loading…</div>
                ) : recentBatches.length === 0 ? (
                  <div style={{ color: '#999', fontSize: '13px', textAlign: 'center', padding: '14px' }}>No processing batches logged yet. Log one at /logs/processing.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {recentBatches.map((b, i) => {
                      const yp = b.yield_pct === null ? null : Number(b.yield_pct);
                      const yieldColor = yp === null ? '#999' : yp >= 80 ? '#16a34a' : yp >= 60 ? '#d97706' : '#dc2626';
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#f8f9fa', borderRadius: '10px' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '13px' }}>{b.species || 'Unknown species'}</div>
                            <div style={{ color: '#999', fontSize: '11px', marginTop: '2px' }}>
                              {b.raw_weight_lb ? `${Number(b.raw_weight_lb).toFixed(2)} lb in` : '—'}
                              {' · '}
                              {b.finished_weight_lb ? `${Number(b.finished_weight_lb).toFixed(2)} lb out` : '—'}
                              {' · '}
                              {timeAgo(b.created_at)}
                            </div>
                          </div>
                          <div style={{ color: yieldColor, fontWeight: 900, fontSize: '15px', flexShrink: 0, marginLeft: '10px' }}>
                            {yp === null ? '—' : `${yp.toFixed(1)}%`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'inventory' && (() => {
            const FREEZER_CAPACITY_LB = 30000;
            const stock = freezerStockLb ?? 0;
            const usedPct = freezerStockLb === null ? 0 : Math.min(100, (stock / FREEZER_CAPACITY_LB) * 100);
            const available = Math.max(0, FREEZER_CAPACITY_LB - stock);
            return (
              <div>
                <h2 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '17px', marginBottom: '20px' }}>🧊 Freezer Inventory</h2>
                <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px', margin: 0 }}>Spiny Tails Cold Storage — Mastic Point</h3>
                    {canEditStock && (
                      <button onClick={openStockEdit} style={{ color: '#1a2e5a', fontSize: '12px', fontWeight: 700, backgroundColor: '#fff8e7', border: '1px solid #f5c518', padding: '5px 10px', borderRadius: '8px', cursor: 'pointer' }}>
                        ✎ Edit stock
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px' }}>
                    {[
                      { label: 'Current Stock',   value: freezerStockLb === null ? '—' : `${Math.round(stock).toLocaleString()} lbs`,    color: '#e8f4fd', text: '#1a2e5a' },
                      { label: 'Total Capacity',  value: `${FREEZER_CAPACITY_LB.toLocaleString()} lbs`,                                   color: '#f0fde8', text: '#2e7d32' },
                      { label: 'Available Space', value: freezerStockLb === null ? '—' : `${Math.round(available).toLocaleString()} lbs`,  color: '#fef9e7', text: '#d97706' },
                      { label: 'Capacity Used',   value: freezerStockLb === null ? '—' : `${usedPct.toFixed(1)}%`,                         color: '#fde8e8', text: '#dc2626' },
                    ].map((s) => (
                      <div key={s.label} style={{ backgroundColor: s.color, borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                        <div style={{ color: '#666', fontSize: '10px', marginBottom: '4px' }}>{s.label}</div>
                        <div style={{ color: s.text, fontWeight: 900, fontSize: '16px' }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ height: '10px', backgroundColor: '#f0f0f0', borderRadius: '20px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${usedPct.toFixed(1)}%`, backgroundColor: '#1a2e5a', borderRadius: '20px', transition: 'width 0.4s ease' }} />
                  </div>
                </div>
                <Link href="/purchase-orders" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#1a2e5a', color: '#f4c842', textDecoration: 'none', borderRadius: '12px', padding: '12px 20px', fontWeight: 800, fontSize: '14px' }}>
                  + New Purchase Order
                </Link>
              </div>
            );
          })()}

          {activeTab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}>
              <div style={{ backgroundColor: '#1a2e5a', borderRadius: '16px 16px 0 0', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: '#f4c842', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🤖</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: '14px' }}>Founder AI</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>Live database · sacred rules · founder principles</div>
                </div>
                <button onClick={() => { window.location.href = '/founder-ai'; }}
                  style={{ color: '#f4c842', fontSize: '11px', fontWeight: 700, backgroundColor: 'rgba(244,200,66,0.15)', padding: '5px 10px', borderRadius: '8px', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Open full ↗
                </button>
              </div>
              <div style={{ flex: 1, backgroundColor: '#fff', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {aiMessages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', backgroundColor: msg.role === 'user' ? '#1a2e5a' : '#f8f9fa', color: msg.role === 'user' ? '#fff' : '#1a2e5a', fontSize: '14px', lineHeight: 1.5 }}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ backgroundColor: '#f8f9fa', borderRadius: '16px 16px 16px 4px', padding: '10px 14px', color: '#999', fontSize: '14px' }}>Thinking...</div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <div style={{ backgroundColor: '#f8f9fa', padding: '8px 14px', display: 'flex', gap: '6px', overflowX: 'auto' }}>
                {['Nassau profit today', 'Andros 43% margin', 'Spiny Tails stock', 'Monthly expenses', 'Yield formula'].map((prompt) => (
                  <button key={prompt} onClick={() => setAiInput(prompt)} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '20px', padding: '5px 12px', fontSize: '11px', color: '#1a2e5a', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{prompt}</button>
                ))}
              </div>
              <div style={{ backgroundColor: '#fff', borderRadius: '0 0 16px 16px', padding: '12px 14px', borderTop: '1px solid #ebebeb', display: 'flex', gap: '8px' }}>
                <input type="text" value={aiInput} onChange={(e) => setAiInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendAiMessage()} placeholder="Ask about your business..." style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', border: '1.5px solid #e5e7eb', fontSize: '14px', outline: 'none' }} />
                <button onClick={sendAiMessage} disabled={aiLoading || !aiInput.trim()} style={{ backgroundColor: aiLoading || !aiInput.trim() ? '#94a3b8' : '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: '10px', padding: '10px 16px', fontWeight: 800, fontSize: '13px', cursor: aiLoading ? 'not-allowed' : 'pointer' }}>Send</button>
              </div>
            </div>
          )}
        </main>

        <nav style={{ backgroundColor: '#fff', borderTop: '1px solid #ebebeb', display: 'flex', position: 'sticky', bottom: 0, zIndex: 30 }}>
          {[
            { icon: '🏠', label: 'Overview',   tab: 'overview' },
            { icon: '🟡', label: 'Nassau',     href: '/pos' },
            { icon: '💰', label: 'Revenue',    tab: 'revenue' },
            { icon: '⚖️', label: 'Yield',      tab: 'yield' },
            { icon: '🤖', label: 'Founder AI', tab: 'ai' },
          ].map((item) => (
            'href' in item ? (
              <Link key={item.label} href={item.href!} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px', textDecoration: 'none', gap: '2px' }}>
                <span style={{ fontSize: '20px' }}>{item.icon}</span>
                <span style={{ color: '#999', fontSize: '10px', fontWeight: 600 }}>{item.label}</span>
              </Link>
            ) : (
              <button key={item.label} onClick={() => setActiveTab(item.tab!)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px', background: 'none', border: 'none', cursor: 'pointer', gap: '2px', borderTop: activeTab === item.tab ? '3px solid #f4c842' : '3px solid transparent' }}>
                <span style={{ fontSize: '20px' }}>{item.icon}</span>
                <span style={{ color: activeTab === item.tab ? '#1a2e5a' : '#999', fontSize: '10px', fontWeight: activeTab === item.tab ? 800 : 600 }}>{item.label}</span>
              </button>
            )
          ))}
        </nav>
      </div>

      {/* ── Edit-stock modal (founder / co_founder only) ───────────────── */}
      {showStockEdit && canEditStock && (
        <div
          onClick={() => !stockSaving && setShowStockEdit(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 14, padding: 18, width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ color: '#1a2e5a', fontWeight: 900, fontSize: 16, margin: 0 }}>Edit product stock (lbs)</h3>
              <button onClick={() => !stockSaving && setShowStockEdit(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: stockSaving ? 'not-allowed' : 'pointer', color: '#999' }}>×</button>
            </div>
            <p style={{ color: '#666', fontSize: 12, margin: '0 0 12px' }}>
              Founder + co_founder only. Updates products.stock_lbs and refreshes the dashboard total.
            </p>
            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #ebebeb', borderRadius: 10 }}>
              {stockProducts === null ? (
                <div style={{ padding: 20, color: '#999', textAlign: 'center', fontSize: 13 }}>Loading…</div>
              ) : stockProducts.length === 0 ? (
                <div style={{ padding: 20, color: '#999', textAlign: 'center', fontSize: 13 }}>No active products to edit.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f8f9fa' }}>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 10px', color: '#666', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>SKU</th>
                      <th style={{ textAlign: 'left', padding: '8px 10px', color: '#666', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Name</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', color: '#666', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Stock (lb)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockProducts.map((p) => {
                      const dirty = stockEdits[p.id] !== undefined;
                      const current = dirty ? stockEdits[p.id] : String(p.stock_lbs);
                      return (
                        <tr key={p.id} style={{ borderTop: '1px solid #ebebeb', background: dirty ? '#fff8e7' : '#fff' }}>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: '#666' }}>{p.sku}</td>
                          <td style={{ padding: '8px 10px', color: '#1a2e5a', fontWeight: 600 }}>{p.name}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                            <input
                              type="number" step="0.01" min="0"
                              value={current}
                              onChange={(e) => setStockEdits((prev) => ({ ...prev, [p.id]: e.target.value }))}
                              style={{ width: 90, padding: '4px 8px', textAlign: 'right', borderRadius: 6, border: '1px solid #ccc', fontSize: 13 }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {stockSaveMsg && (
              <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: stockSaveMsg.includes('failed') ? '#fde8e8' : '#e8f5e9', color: stockSaveMsg.includes('failed') ? '#dc2626' : '#2e7d32', fontSize: 12, fontWeight: 700 }}>
                {stockSaveMsg}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => !stockSaving && setShowStockEdit(false)}
                disabled={stockSaving}
                style={{ background: '#f0f0f0', color: '#666', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: stockSaving ? 'not-allowed' : 'pointer' }}
              >
                Close
              </button>
              <button
                onClick={saveStockEdits}
                disabled={stockSaving || stockProducts === null}
                style={{ background: stockSaving ? '#94a3b8' : '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 800, fontSize: 13, cursor: stockSaving ? 'not-allowed' : 'pointer' }}
              >
                {stockSaving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
