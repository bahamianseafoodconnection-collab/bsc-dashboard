'use client';

import { useState } from 'react';
import Link from 'next/link';

const DELIVERY_THRESHOLD = 1000;

function generatePickNumber(): string {
const now = new Date();
const date = now.toISOString().slice(2,10).replace(/-/g,'');
const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
return `PICK-${date}-${seq}`;
}

function generateLotNumber(): string {
const now = new Date();
const yyyy = now.getFullYear();
const mm = String(now.getMonth() + 1).padStart(2, '0');
const dd = String(now.getDate()).padStart(2, '0');
const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
return `BSC-${yyyy}${mm}${dd}-${seq}`;
}

type OrderItem = {
name: string;
qty: number;
price: number;
unit: string;
emoji: string;
lotNumber: string;
batchNumber: string;
};

type Order = {
id: string;
pickNumber: string;
customer: {
name: string;
phone: string;
address: string;
email?: string;
};
supplier: string;
items: OrderItem[];
total: number;
paidAt: string;
deliveryType: 'delivery' | 'pickup';
status: 'paid' | 'packing' | 'ready' | 'delivered';
};

// Demo order
const DEMO_ORDER: Order = {
id: 'ORD-' + Date.now().toString().slice(-6),
pickNumber: generatePickNumber(),
customer: {
name: 'Maria Johnson',
phone: '+1 (242) 424-5678',
address: '12 Bay Street, Nassau, Bahamas',
email: 'maria@example.com',
},
supplier: 'BSC Marketplace — Firetrial Road',
items: [
{ name: 'Fresh Grouper', qty: 5, price: 14.99, unit: 'lbs', emoji: '🐟', lotNumber: generateLotNumber(), batchNumber: 'BCH-' + Date.now().toString().slice(-4) },
{ name: 'Spiny Lobster Tails', qty: 3, price: 28.00, unit: 'lbs', emoji: '🦞', lotNumber: generateLotNumber(), batchNumber: 'BCH-' + Date.now().toString().slice(-4) },
{ name: 'Conch Meat', qty: 2, price: 12.50, unit: 'lbs', emoji: '🐚', lotNumber: generateLotNumber(), batchNumber: 'BCH-' + Date.now().toString().slice(-4) },
],
total: 0,
paidAt: new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' }),
deliveryType: 'delivery',
status: 'paid',
};
DEMO_ORDER.total = DEMO_ORDER.items.reduce((s, i) => s + i.price * i.qty, 0);

function printCustomerInvoice(order: Order) {
const isDelivery = order.deliveryType === 'delivery' && order.total >= DELIVERY_THRESHOLD;
const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>BSC Invoice ${order.id}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, sans-serif; padding: 32px; color: #1a2e5a; }
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a2e5a; padding-bottom: 16px; margin-bottom: 20px; }
.logo { font-size: 22px; font-weight: 900; color: #1a2e5a; }
.logo-sub { font-size: 10px; color: #666; letter-spacing: 2px; text-transform: uppercase; }
.inv-title { text-align: right; }
.inv-title h1 { font-size: 28px; font-weight: 900; color: #f4c842; -webkit-text-stroke: 1px #1a2e5a; }
.inv-title p { font-size: 12px; color: #666; margin-top: 2px; }
.paid-badge { background: #e8f5e9; color: #2e7d32; font-weight: 900; font-size: 13px; padding: 4px 14px; border-radius: 20px; display: inline-block; margin-top: 6px; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
.info-box { background: #f8f9fa; border-radius: 10px; padding: 14px; }
.info-box h3 { font-size: 10px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
.info-box p { font-size: 13px; color: #1a2e5a; font-weight: 600; margin-bottom: 3px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
thead tr { background: #1a2e5a; color: #fff; }
thead th { padding: 10px 12px; font-size: 12px; text-align: left; }
tbody tr { border-bottom: 1px solid #f0f0f0; }
tbody tr:nth-child(even) { background: #fafafa; }
tbody td { padding: 10px 12px; font-size: 13px; }
.lot-tag { background: #1a2e5a; color: #f4c842; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; font-family: monospace; display: block; margin-top: 2px; }
.batch-tag { background: #f4c842; color: #1a2e5a; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; font-family: monospace; display: block; margin-top: 2px; }
.totals { margin-left: auto; width: 280px; }
.totals table { margin: 0; }
.totals td { padding: 6px 10px; font-size: 13px; }
.totals .grand { background: #1a2e5a; color: #fff; font-weight: 900; font-size: 16px; }
.delivery-notice { background: #e8f5e9; border: 2px solid #2e7d32; border-radius: 10px; padding: 12px 16px; margin-bottom: 16px; }
.delivery-notice strong { color: #2e7d32; font-size: 14px; }
.footer { border-top: 2px solid #1a2e5a; padding-top: 14px; margin-top: 20px; display: flex; justify-content: space-between; font-size: 11px; color: #666; }
@media print { body { padding: 20px; } }
</style>
</head>
<body>
<div class="header">
<div>
<div class="logo">🐟 BSC Marketplace</div>
<div class="logo-sub">Bahamian Seafood Connection</div>
<div class="logo-sub">Firetrial Road, Nassau, Bahamas</div>
<div class="logo-sub">💬 +1 (242) 558-4495 · 📞 +1 (242) 361-3474</div>
</div>
<div class="inv-title">
<h1>INVOICE</h1>
<p>Order #: <strong>${order.id}</strong></p>
<p>Pick #: <strong>${order.pickNumber}</strong></p>
<p>Date: ${order.paidAt}</p>
<span class="paid-badge">✅ PAID & APPROVED</span>
</div>
</div>

<div class="two-col">
<div class="info-box">
<h3>📦 Bill To / Ship To</h3>
<p><strong>${order.customer.name}</strong></p>
<p>📱 ${order.customer.phone}</p>
${order.customer.address ? `<p>📍 ${order.customer.address}</p>` : ''}
${order.customer.email ? `<p>✉️ ${order.customer.email}</p>` : ''}
</div>
<div class="info-box">
<h3>🚢 Supplied By</h3>
<p><strong>${order.supplier}</strong></p>
<p>Firetrial Road, Nassau</p>
<p>bscbahamas.com</p>
<p style="margin-top:8px; font-weight:800; color:${isDelivery ? '#2e7d32' : '#1a2e5a'}">
${isDelivery ? '🚚 DELIVERY — Order over $' + DELIVERY_THRESHOLD : '🏪 PICKUP — Customer collects'}
</p>
</div>
</div>

${isDelivery ? `<div class="delivery-notice"><strong>🚚 DELIVERY — Order value $${order.total.toFixed(2)} exceeds $${DELIVERY_THRESHOLD.toLocaleString()}. Supplier delivers to BSC · BSC delivers to you at: ${order.customer.address}</strong></div>` : ''}

<table>
<thead>
<tr>
<th>#</th>
<th>Product</th>
<th>Lot / Batch</th>
<th>Qty</th>
<th>Unit Price</th>
<th>Total</th>
</tr>
</thead>
<tbody>
${order.items.map((item, i) => `
<tr>
<td>${i + 1}</td>
<td><strong>${item.emoji} ${item.name}</strong></td>
<td>
<span class="lot-tag">${item.lotNumber}</span>
<span class="batch-tag">${item.batchNumber}</span>
</td>
<td>${item.qty} ${item.unit}</td>
<td>$${item.price.toFixed(2)}</td>
<td><strong>$${(item.price * item.qty).toFixed(2)}</strong></td>
</tr>`).join('')}
</tbody>
</table>

<div class="totals">
<table>
<tr><td>Subtotal</td><td align="right">$${order.total.toFixed(2)}</td></tr>
<tr><td>Delivery</td><td align="right">${isDelivery ? 'Included' : 'N/A'}</td></tr>
<tr class="grand"><td><strong>TOTAL PAID</strong></td><td align="right"><strong>$${order.total.toFixed(2)}</strong></td></tr>
</table>
</div>

<div class="footer">
<span>Invoice: ${order.id} · Pick: ${order.pickNumber}</span>
<span>Thank you for your order — BSC Marketplace 🇧🇸</span>
<span>bscbahamas.com · +1 (242) 558-4495</span>
</div>
</body>
</html>`;
const w = window.open('', '_blank');
if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 500); }
}

function printPackageLabel(order: Order, item: OrderItem, pkgNum: number, totalPkgs: number) {
const isDelivery = order.deliveryType === 'delivery' && order.total >= DELIVERY_THRESHOLD;
const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>BSC Package Label</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, sans-serif; }
.label { width: 4in; min-height: 3in; border: 3px solid #1a2e5a; border-radius: 10px; padding: 16px; page-break-after: always; }
.label-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a2e5a; padding-bottom: 10px; margin-bottom: 12px; }
.brand { font-size: 15px; font-weight: 900; color: #1a2e5a; }
.brand-sub { font-size: 8px; color: #999; letter-spacing: 1px; }
.tags { text-align: right; }
.lot-tag { background: #1a2e5a; color: #f4c842; font-size: 9px; font-weight: 900; padding: 3px 7px; border-radius: 4px; font-family: monospace; display: block; margin-bottom: 3px; }
.batch-tag { background: #f4c842; color: #1a2e5a; font-size: 9px; font-weight: 900; padding: 3px 7px; border-radius: 4px; font-family: monospace; display: block; }
.product { font-size: 20px; font-weight: 900; color: #1a2e5a; margin-bottom: 10px; }
.to-from { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.addr-box { background: #f8f9fa; border-radius: 6px; padding: 8px; }
.addr-label { font-size: 8px; color: #999; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
.addr-name { font-size: 12px; font-weight: 900; color: #1a2e5a; }
.addr-detail { font-size: 10px; color: #666; margin-top: 2px; }
.pkg-info { display: flex; justify-content: space-between; align-items: center; background: #f0f4ff; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; }
.pkg-num { font-size: 14px; font-weight: 900; color: #1a2e5a; }
.delivery-tag { background: ${isDelivery ? '#2e7d32' : '#1a2e5a'}; color: #fff; font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 6px; }
.barcode-area { text-align: center; font-family: monospace; font-size: 16px; letter-spacing: 3px; color: #1a2e5a; padding: 6px; border-top: 1px dashed #ccc; margin-top: 8px; }
.footer-label { text-align: center; font-size: 8px; color: #999; margin-top: 4px; }
@media print { body { margin: 0; } }
</style>
</head>
<body>
<div class="label">
<div class="label-header">
<div>
<div class="brand">🐟 BSC Marketplace</div>
<div class="brand-sub">Bahamian Seafood Connection</div>
<div class="brand-sub">Firetrial Road, Nassau 🇧🇸</div>
</div>
<div class="tags">
<span class="lot-tag">LOT: ${item.lotNumber}</span>
<span class="batch-tag">BCH: ${item.batchNumber}</span>
</div>
</div>

<div class="product">${item.emoji} ${item.name} — ${item.qty} ${item.unit}</div>

<div class="to-from">
<div class="addr-box">
<div class="addr-label">📦 Ship To</div>
<div class="addr-name">${order.customer.name}</div>
<div class="addr-detail">${order.customer.phone}</div>
<div class="addr-detail">${order.customer.address || 'Pickup at store'}</div>
</div>
<div class="addr-box">
<div class="addr-label">🚢 From</div>
<div class="addr-name">BSC Marketplace</div>
<div class="addr-detail">Firetrial Road, Nassau</div>
<div class="addr-detail">Order: ${order.id}</div>
</div>
</div>

<div class="pkg-info">
<span class="pkg-num">Package ${pkgNum} of ${totalPkgs}</span>
<span class="delivery-tag">${isDelivery ? '🚚 DELIVERY' : '🏪 PICKUP'}</span>
</div>

<div class="barcode-area">||| ${item.lotNumber} |||</div>
<div class="footer-label">Pick #: ${order.pickNumber} · Scan to verify · bscbahamas.com</div>
</div>
</body>
</html>`;
const w = window.open('', '_blank');
if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 500); }
}

function printPickTicket(order: Order) {
const isDelivery = order.deliveryType === 'delivery' && order.total >= DELIVERY_THRESHOLD;
const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>BSC Pick Ticket ${order.pickNumber}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, sans-serif; padding: 24px; }
.header { background: #1a2e5a; color: #fff; padding: 16px 20px; border-radius: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
.pick-num { font-size: 24px; font-weight: 900; color: #f4c842; }
.pick-sub { font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 2px; }
.brand-right { text-align: right; }
.brand-right .name { font-size: 16px; font-weight: 900; color: #fff; }
.brand-right .sub { font-size: 10px; color: rgba(255,255,255,0.5); }
.alert { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-weight: 800; font-size: 14px; }
.alert-delivery { background: #e8f5e9; color: #2e7d32; border: 2px solid #2e7d32; }
.alert-pickup { background: #e8f4fd; color: #1a6fb5; border: 2px solid #1a6fb5; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.info-box { background: #f8f9fa; border-radius: 8px; padding: 12px; }
.info-box h3 { font-size: 10px; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
.info-box p { font-size: 13px; color: #1a2e5a; font-weight: 600; margin-bottom: 3px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
thead tr { background: #1a2e5a; }
thead th { padding: 10px 12px; font-size: 12px; color: #fff; text-align: left; }
tbody tr { border-bottom: 1px solid #f0f0f0; }
tbody td { padding: 12px; font-size: 13px; vertical-align: top; }
.check-box { width: 22px; height: 22px; border: 2px solid #1a2e5a; border-radius: 4px; display: inline-block; }
.lot-tag { background: #1a2e5a; color: #f4c842; font-size: 9px; font-weight: 900; padding: 2px 7px; border-radius: 4px; font-family: monospace; display: block; margin-top: 3px; }
.batch-tag { background: #f4c842; color: #1a2e5a; font-size: 9px; font-weight: 900; padding: 2px 7px; border-radius: 4px; font-family: monospace; display: block; margin-top: 3px; }
.sign-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 16px; }
.sign-box { border-top: 2px solid #1a2e5a; padding-top: 8px; }
.sign-label { font-size: 10px; color: #999; font-weight: 700; text-transform: uppercase; }
.footer-bar { background: #f8f9fa; border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; font-size: 11px; color: #666; margin-top: 12px; }
@media print { body { padding: 16px; } }
</style>
</head>
<body>
<div class="header">
<div>
<div class="pick-num">PICK TICKET</div>
<div class="pick-num" style="font-size:18px;">${order.pickNumber}</div>
<div class="pick-sub">Invoice: ${order.id} · ${order.paidAt}</div>
</div>
<div class="brand-right">
<div class="name">🐟 BSC Marketplace</div>
<div class="sub">Firetrial Road, Nassau 🇧🇸</div>
<div class="sub" style="margin-top:4px; color:#f4c842; font-weight:800;">SUPPLIER COPY</div>
</div>
</div>

<div class="alert ${isDelivery ? 'alert-delivery' : 'alert-pickup'}">
${isDelivery
? `🚚 DELIVERY ORDER — Value $${order.total.toFixed(2)} exceeds $${DELIVERY_THRESHOLD.toLocaleString()} — DELIVER TO BSC MARKETPLACE · Firetrial Road, Nassau · BSC will deliver to customer`
: `🏪 PICKUP ORDER — Pack and hold at BSC Marketplace Firetrial Road for customer collection`}
</div>

<div class="two-col">
<div class="info-box">
<h3>👤 Customer</h3>
<p><strong>${order.customer.name}</strong></p>
<p>📱 ${order.customer.phone}</p>
${order.customer.address ? `<p>📍 ${order.customer.address}</p>` : ''}
</div>
<div class="info-box">
<h3>🚢 Deliver To</h3>
<p><strong>BSC Marketplace</strong></p>
<p>Firetrial Road, Nassau ⚡</p>
<p style="font-size:10px; color:#666; margin-top:3px;">BSC will then deliver to customer</p>
<p style="margin-top:6px; font-weight:800; color:#1a2e5a;">Pick #: ${order.pickNumber}</p>
</div>
</div>

<table>
<thead>
<tr>
<th>✓</th>
<th>#</th>
<th>Product</th>
<th>Qty to Pick</th>
<th>Lot / Batch</th>
<th>Location</th>
</tr>
</thead>
<tbody>
${order.items.map((item, i) => `
<tr>
<td><span class="check-box"></span></td>
<td>${i + 1}</td>
<td><strong>${item.emoji} ${item.name}</strong></td>
<td><strong style="font-size:16px;">${item.qty} ${item.unit}</strong></td>
<td>
<span class="lot-tag">${item.lotNumber}</span>
<span class="batch-tag">${item.batchNumber}</span>
</td>
<td style="color:#999; font-size:11px;">Freezer / Shelf<br>Check stock</td>
</tr>`).join('')}
</tbody>
</table>

<div class="sign-row">
<div class="sign-box">
<div class="sign-label">Picked By</div>
<div style="height:32px;"></div>
<div style="font-size:10px; color:#999;">Name & Signature</div>
</div>
<div class="sign-box">
<div class="sign-label">Packed By</div>
<div style="height:32px;"></div>
<div style="font-size:10px; color:#999;">Name & Signature</div>
</div>
<div class="sign-box">
<div class="sign-label">Verified By</div>
<div style="height:32px;"></div>
<div style="font-size:10px; color:#999;">Name & Signature</div>
</div>
</div>

<div class="footer-bar">
<span>Pick: ${order.pickNumber} · Invoice: ${order.id}</span>
<span>Total: $${order.total.toFixed(2)} · ${order.items.length} item(s)</span>
<span>BSC Marketplace · bscbahamas.com · +1 (242) 558-4495</span>
</div>
</body>
</html>`;
const w = window.open('', '_blank');
if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 500); }
}

export default function OrderFulfillmentPage() {
const [order] = useState<Order>(DEMO_ORDER);
const isDelivery = order.deliveryType === 'delivery' && order.total >= DELIVERY_THRESHOLD;

return (
<div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

{/* HEADER */}
<header style={{ backgroundColor: '#1a2e5a', padding: '0 16px', position: 'sticky', top: 0, zIndex: 40 }}>
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '56px' }}>
<div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
<Link href="/orders" style={{ color: '#f4c842', fontSize: '13px', fontWeight: 700, textDecoration: 'none', backgroundColor: 'rgba(244,200,66,0.15)', padding: '6px 12px', borderRadius: '8px' }}>
← Orders
</Link>
<div>
<div style={{ color: '#fff', fontWeight: 900, fontSize: '15px' }}>Order Fulfillment</div>
<div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>Invoice · Labels · Pick Ticket</div>
</div>
</div>
<span style={{ backgroundColor: '#e8f5e9', color: '#2e7d32', fontSize: '11px', fontWeight: 800, padding: '4px 12px', borderRadius: '20px' }}>
✅ PAID
</span>
</div>
</header>

<div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px 16px' }}>

{/* Order Summary */}
<div style={{ backgroundColor: '#1a2e5a', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
<div>
<div style={{ color: '#f4c842', fontWeight: 900, fontSize: '18px' }}>{order.id}</div>
<div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginTop: '2px' }}>Pick: {order.pickNumber}</div>
<div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>{order.paidAt}</div>
</div>
<div style={{ textAlign: 'right' }}>
<div style={{ color: '#fff', fontWeight: 900, fontSize: '22px' }}>${order.total.toFixed(2)}</div>
<div style={{ backgroundColor: isDelivery ? '#2e7d32' : '#1a6fb5', color: '#fff', fontSize: '11px', fontWeight: 800, padding: '3px 10px', borderRadius: '20px', marginTop: '4px' }}>
{isDelivery ? '🚚 DELIVERY' : '🏪 PICKUP'}
</div>
</div>
</div>
{isDelivery && (
<div style={{ backgroundColor: 'rgba(46,125,50,0.2)', borderRadius: '10px', padding: '10px 14px', border: '1px solid rgba(46,125,50,0.4)' }}>
<div style={{ color: '#4ade80', fontWeight: 800, fontSize: '13px' }}>🚚 Delivery — Supplier → BSC Firetrial Rd → Customer</div>
<div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', marginTop: '3px' }}>Customer address: {order.customer.address}</div>
</div>
)}
</div>

{/* Customer Info */}
<div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', marginBottom: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
<h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px', marginBottom: '12px' }}>👤 Customer</h3>
{[
{ label: 'Name', value: order.customer.name },
{ label: 'Phone', value: order.customer.phone },
{ label: 'Address', value: order.customer.address || 'Pickup at store' },
].map((row) => (
<div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
<span style={{ color: '#999', fontSize: '12px' }}>{row.label}</span>
<span style={{ color: '#1a2e5a', fontWeight: 700, fontSize: '13px' }}>{row.value}</span>
</div>
))}
</div>

{/* Items */}
<div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', marginBottom: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
<h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px', marginBottom: '12px' }}>📦 Order Items</h3>
{order.items.map((item, i) => (
<div key={i} style={{ padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
<span style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px' }}>{item.emoji} {item.name}</span>
<span style={{ color: '#1a2e5a', fontWeight: 900, fontSize: '14px' }}>${(item.price * item.qty).toFixed(2)}</span>
</div>
<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
<span style={{ color: '#999', fontSize: '11px' }}>{item.qty} {item.unit} @ ${item.price.toFixed(2)}</span>
<span style={{ backgroundColor: '#1a2e5a', color: '#f4c842', fontSize: '9px', fontWeight: 800, padding: '2px 7px', borderRadius: '4px', fontFamily: 'monospace' }}>{item.lotNumber}</span>
<span style={{ backgroundColor: '#f4c842', color: '#1a2e5a', fontSize: '9px', fontWeight: 800, padding: '2px 7px', borderRadius: '4px', fontFamily: 'monospace' }}>{item.batchNumber}</span>
</div>
</div>
))}
</div>

{/* Print Actions */}
<div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
<h3 style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px', marginBottom: '16px' }}>🖨️ Print Documents</h3>

<div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

{/* Invoice */}
<button
onClick={() => printCustomerInvoice(order)}
style={{ backgroundColor: '#1a2e5a', color: '#f4c842', border: 'none', borderRadius: '12px', padding: '14px 18px', fontWeight: 900, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
>
<div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
<span style={{ fontSize: '22px' }}>🧾</span>
<div style={{ textAlign: 'left' }}>
<div>Customer Invoice</div>
<div style={{ color: 'rgba(244,200,66,0.6)', fontSize: '11px', fontWeight: 600 }}>With lot numbers · paid stamp · delivery info</div>
</div>
</div>
<span>Print →</span>
</button>

{/* Pick Ticket */}
<button
onClick={() => printPickTicket(order)}
style={{ backgroundColor: '#7c3aed', color: '#fff', border: 'none', borderRadius: '12px', padding: '14px 18px', fontWeight: 900, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
>
<div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
<span style={{ fontSize: '22px' }}>📋</span>
<div style={{ textAlign: 'left' }}>
<div>Pick Ticket — {order.pickNumber}</div>
<div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontWeight: 600 }}>Supplier copy · checklist · sign-off boxes</div>
</div>
</div>
<span>Print →</span>
</button>

{/* Package Labels */}
<div style={{ backgroundColor: '#f8f9fa', borderRadius: '12px', padding: '14px' }}>
<div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
<span style={{ fontSize: '22px' }}>🏷️</span>
<div>
<div style={{ color: '#1a2e5a', fontWeight: 800, fontSize: '14px' }}>Package Labels</div>
<div style={{ color: '#999', fontSize: '11px' }}>One label per item — attach to each package</div>
</div>
</div>
<div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
{order.items.map((item, i) => (
<button
key={i}
onClick={() => printPackageLabel(order, item, i + 1, order.items.length)}
style={{ backgroundColor: '#fff', color: '#1a2e5a', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
>
<span>{item.emoji} {item.name} — {item.qty} {item.unit}</span>
<span style={{ fontSize: '11px', color: '#999' }}>Label {i + 1}/{order.items.length} →</span>
</button>
))}
</div>
</div>

{/* Print All */}
<button
onClick={() => {
printCustomerInvoice(order);
setTimeout(() => printPickTicket(order), 800);
order.items.forEach((item, i) => {
setTimeout(() => printPackageLabel(order, item, i + 1, order.items.length), 1600 + i * 400);
});
}}
style={{ backgroundColor: '#f4c842', color: '#1a2e5a', border: 'none', borderRadius: '12px', padding: '14px', fontWeight: 900, fontSize: '15px', cursor: 'pointer' }}
>
🖨️ Print All Documents at Once
</button>
</div>
</div>

</div>
</div>
);
}
