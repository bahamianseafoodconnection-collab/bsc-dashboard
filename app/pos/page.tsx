// File: app/pos/page.tsx
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import {
  products, completeSale, saveCustomer, searchCustomers,
  type Product, type Customer,
} from '../../lib/store';
import { recordSaleFinancials } from '../../lib/finance';
import { createInvoice } from '../../lib/invoices';

const supabase = createClient(
  'https://auqjjrisivhfmpleusyt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1cWpqcmlzaXZoZm1wbGV1c3l0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MTk4NDcsImV4cCI6MjA5MTM5NTg0N30.gukwxBD4tFRVWMiA8_fauiV2JdEyvXMYJjzLcZiZpCg'
);

type CartItem = Product & { qty: number };
type PaymentMethod = 'cash' | 'card' | null;
type Screen = 'shop' | 'cart' | 'payment' | 'complete';

const BSC_WHATSAPP = '12423613474';
const BSC_WHATSAPP_DISPLAY = '+1 (242) 361-3474';

const pg: React.CSSProperties = {
  padding: 16, backgroundColor: '#060d1f', minHeight: '100vh',
  color: '#fff', fontFamily: 'sans-serif', paddingBottom: 90,
  maxWidth: 560, margin: '0 auto', width: '100%',
};
const card: React.CSSProperties = {
  backgroundColor: '#0d1f3c', borderRadius: 14, padding: '14px 16px',
  border: '1px solid #1e3a5f', marginBottom: 12,
};
const inp: React.CSSProperties = {
  display: 'block', width: '100%', padding: '12px 13px',
  borderRadius: 10, backgroundColor: '#111c33', color: '#fff',
  border: '1px solid #1e2d4a', fontSize: 16, marginBottom: 10,
  boxSizing: 'border-box' as const, outline: 'none',
  WebkitAppearance: 'none' as const,
};
const primaryBtn: React.CSSProperties = {
  width: '100%', padding: '14px', borderRadius: 12,
  backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold',
  border: 'none', fontSize: 15, cursor: 'pointer', marginBottom: 10,
};
const secondaryBtn: React.CSSProperties = {
  width: '100%', padding: '12px', borderRadius: 12,
  backgroundColor: 'transparent', color: '#6b7280',
  border: '1px solid #1e3a5f', fontSize: 14, cursor: 'pointer', marginBottom: 10,
};
const qtyBtnStyle = (bg: string, color = '#fff'): React.CSSProperties => ({
  width: 36, height: 36, borderRadius: 8, backgroundColor: bg,
  color, border: 'none', fontSize: 20, cursor: 'pointer', fontWeight: 'bold',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
});

// ── ALL SUB-COMPONENTS DEFINED OUTSIDE POSPage ──

function BSCControlBack({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <button onClick={() => router.push('/')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg, #1a1200, #2a1e00)', border: '1px solid #f5c518', borderRadius: 10, color: '#f5c518', fontWeight: 'bold', fontSize: 12, cursor: 'pointer', padding: '7px 14px', marginBottom: 14 }}>
      ← BSC Control
    </button>
  );
}

function WhatsAppPanel({ side }: { side: 'top' | 'right' }) {
  const [waTab, setWaTab] = useState<'web' | 'qr'>('web');
  const isRight = side === 'right';
  return (
    <div style={{ backgroundColor: '#070e1d', border: '1px solid #25d366', borderRadius: isRight ? 16 : 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: isRight ? '100vh' : 'auto', position: isRight ? 'sticky' : 'relative', top: isRight ? 0 : undefined }}>
      <div style={{ backgroundColor: '#075e54', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>💬</span>
          <div>
            <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: 14 }}>BSC WhatsApp</p>
            <p style={{ margin: 0, color: '#25d36699', fontSize: 11 }}>{BSC_WHATSAPP_DISPLAY}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setWaTab('web')} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: waTab === 'web' ? '#25d366' :
