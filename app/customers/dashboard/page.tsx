'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Order = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
  delivery_type: string;
};

const STATUS_COLOR: Record<string, string> = {
  pending:          '#f5c518',
  confirmed:        '#60a5fa',
  packing:          '#a78bfa',
  out_for_delivery: '#4ade80',
  delivered:        '#4ade80',
  ready_pickup:     '#4ade80',
  cancelled:        '#f87171',
};

const STATUS_LABEL: Record<string, string> = {
  pending:          'Order Received',
  confirmed:        'Confirmed',
  packing:          'Packing',
  out_for_delivery: 'Out for Delivery',
  delivered:        'Delivered',
  ready_pickup:     'Ready for Pickup',
  cancelled:        'Cancelled',
};

export default function CustomerDashboard() {
  const router = useRouter();

  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId]     = useState('');
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading]           = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);

  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace('/');
        return;
      }
      const user = session.user;
      const meta = user.user_metadata;
      const name = meta?.name || user.email || 'Customer';
      setCustomerName(name);
      setCustomerId(user.id);
      setLoading(false);
      loadRecentOrders(user.id);
    } catch (e) {
      router.replace('/');
    }
  }

  async function loadRecentOrders(uid: string) {
    setOrdersLoading(true);
    try {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, status, total, created_at, delivery_type')
        .eq('customer_id', uid)
        .order('created_at', { ascending: false })
        .limit(3);
      if (data) setRecentOrders(data);
    } catch (e) {}
    setOrdersLoading(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  const firstName = customerName.split(' ')[0];

  const pg: React.CSSProperties = {
    backgroundColor: '#060d1f',
    minHeight: '100vh',
    color: '#fff',
    fontFamily: "'Inter', -apple-system, sans-serif",
    paddingBottom: 40,
  };

  const serviceCard = (
    label: string,
    description: string,
    color: string,
    bg: string,
    border: string,
    href: string,
    icon: string,
  ) => (
    <button
      key={label}
      onClick={() => router.push(href)}
      style={{
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'flex-start',
        padding: '20px 18px',
        borderRadius: 16,
        background: bg,
        border: '1px solid ' + border,
        cursor: 'pointer',
        textAlign: 'left' as const,
        width: '100%',
      }}
    >
      <span style={{ fontSize: 28, marginBottom: 10 }}>{icon}</span>
      <p style={{ margin: '0 0 4px', color, fontWeight: 'bold', fontSize: 15 }}>{label}</p>
      <p style={{ margin: 0, color: '#6b7280', fontSize: 12, lineHeight: 1.4 }}>{description}</p>
    </button>
  );

  if (loading) {
    return (
      <div style={{ ...pg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' as const }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🐟</div>
          <p style={{ color: '#4a5568' }}>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={pg}>

      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg, #060d1f, #0d1f3c)', borderBottom: '1px solid #1e3a5f', padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 640, margin: '0 auto' }}>
          <div>
            <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 18 }}>BSC Marketplace</p>
            <p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 11 }}>Bahamian Seafood Connection</p>
          </div>
          <button
            onClick={handleSignOut}
            style={{ background: 'none', border: '1px solid #1e3a5f', color: '#6b7280', fontSize: 12, cursor: 'pointer', padding: '7px 14px', borderRadius: 8 }}
          >
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px' }}>

        {/* ── Welcome ── */}
        <div style={{ background: 'linear-gradient(135deg, #0a1f0a, #0d2b14)', border: '1px solid #4ade80', borderRadius: 16, padding: '20px 20px', marginBottom: 28 }}>
          <p style={{ margin: '0 0 4px', color: '#4ade80', fontSize: 12, letterSpacing: 1, fontWeight: 'bold' }}>WELCOME BACK</p>
          <p style={{ margin: '0 0 6px', color: '#fff', fontWeight: 'bold', fontSize: 22 }}>{firstName}</p>
          <p style={{ margin: 0, color: '#4a5568', fontSize: 13 }}>What would you like to do today?</p>
        </div>

        {/* ── Main Services ── */}
        <p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14, letterSpacing: 1 }}>OUR SERVICES</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
          {serviceCard(
            'Shop Marketplace',
            'Fresh seafood, poultry and meats delivered to your door',
            '#f5c518',
            'linear-gradient(135deg, #1a1200, #2a1e00)',
            '#f5c51844',
            '/',
            '🛒',
          )}
          {serviceCard(
            'Pay Utility Bills',
            'BEC, Water, Cable, Aliv, BTC, Flow — fast and easy',
            '#60a5fa',
            'linear-gradient(135deg, #001a2a, #002a3a)',
            '#60a5fa44',
            '/utilities',
            '⚡',
          )}
          {serviceCard(
            'My Orders',
            'Track deliveries and view your full order history',
            '#4ade80',
            'linear-gradient(135deg, #0a1f0a, #0d2b14)',
            '#4ade8044',
            '/?view=orders',
            '📦',
          )}
          {serviceCard(
            'Wholesale & Bulk',
            'Large orders for businesses and restaurants',
            '#a78bfa',
            'linear-gradient(135deg, #1a0a2a, #2a1040)',
            '#a78bfa44',
            '/?view=shop',
            '🏭',
          )}
        </div>

        {/* ── Contact ── */}
        <div style={{ backgroundColor: '#0d1f3c', borderRadius: 16, padding: '16px 18px', marginBottom: 28, border: '1px solid #1e3a5f' }}>
          <p style={{ margin: '0 0 12px', color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>Need Help?</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <a
              href="https://api.whatsapp.com/send?phone=12423613474&text=Hi%20BSC!%20I%20need%20help%20with%20my%20order."
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', padding: '12px 14px', borderRadius: 10, backgroundColor: '#0a2010', border: '1px solid #4ade80', color: '#4ade80', fontWeight: 'bold', fontSize: 13, textDecoration: 'none', textAlign: 'center' as const }}
            >
              WhatsApp Us
            </a>
            <a
              href="tel:+12423613474"
              style={{ display: 'block', padding: '12px 14px', borderRadius: 10, backgroundColor: '#001a2a', border: '1px solid #60a5fa', color: '#60a5fa', fontWeight: 'bold', fontSize: 13, textDecoration: 'none', textAlign: 'center' as const }}
            >
              Call Us
            </a>
          </div>
          <p style={{ margin: '10px 0 0', color: '#4a5568', fontSize: 11, textAlign: 'center' as const }}>
            Firetrial Road, Nassau · +1 (242) 361-3474
          </p>
        </div>

        {/* ── Recent Orders ── */}
        <p style={{ margin: '0 0 14px', color: '#f5c518', fontWeight: 'bold', fontSize: 14, letterSpacing: 1 }}>RECENT ORDERS</p>
        {ordersLoading ? (
          <div style={{ backgroundColor: '#0d1f3c', borderRadius: 12, padding: '24px', textAlign: 'center' as const, border: '1px solid #1e3a5f' }}>
            <p style={{ color: '#4a5568', margin: 0, fontSize: 13 }}>Loading orders...</p>
          </div>
        ) : recentOrders.length === 0 ? (
          <div style={{ backgroundColor: '#0d1f3c', borderRadius: 12, padding: '24px', textAlign: 'center' as const, border: '1px solid #1e3a5f', marginBottom: 16 }}>
            <p style={{ color: '#4a5568', margin: '0 0 12px', fontSize: 13 }}>No orders yet</p>
            <button
              onClick={() => router.push('/')}
              style={{ padding: '10px 24px', borderRadius: 10, backgroundColor: '#f5c518', color: '#000', fontWeight: 'bold', border: 'none', cursor: 'pointer', fontSize: 13 }}
            >
              Start Shopping
            </button>
          </div>
        ) : (
          <>
            {recentOrders.map(order => (
              <div key={order.id} style={{ backgroundColor: '#0d1f3c', borderRadius: 12, padding: '14px 16px', marginBottom: 10, border: '1px solid #1e3a5f' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 13, fontFamily: 'monospace' }}>{order.order_number}</p>
                  <span style={{ backgroundColor: '#060d1f', border: '1px solid ' + (STATUS_COLOR[order.status] || '#f5c518'), color: STATUS_COLOR[order.status] || '#f5c518', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 'bold' }}>
                    {STATUS_LABEL[order.status] || order.status}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ margin: 0, color: '#4a5568', fontSize: 12 }}>
                    {order.delivery_type === 'delivery' ? 'Delivery' : 'Pickup'} · {new Date(order.created_at).toLocaleDateString()}
                  </p>
                  <p style={{ margin: 0, color: '#4ade80', fontWeight: 'bold', fontSize: 15 }}>${Number(order.total).toFixed(2)}</p>
                </div>
              </div>
            ))}
            <button
              onClick={() => router.push('/?view=orders')}
              style={{ width: '100%', padding: '12px', borderRadius: 10, backgroundColor: 'transparent', color: '#60a5fa', border: '1px solid #1e3a5f', fontWeight: 'bold', fontSize: 13, cursor: 'pointer' }}
            >
              View All Orders
            </button>
          </>
        )}
      </div>
    </div>
  );
}