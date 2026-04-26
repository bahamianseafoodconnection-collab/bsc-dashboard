// File: app/legal/page.tsx
'use client';

import { useRouter } from 'next/navigation';

export default function LegalPage() {
const router = useRouter();

const pg: React.CSSProperties = { backgroundColor: '#060d1f', minHeight: '100vh', color: '#fff', fontFamily: "'Inter', sans-serif", paddingBottom: 60 };
const card: React.CSSProperties = { backgroundColor: '#0d1f3c', borderRadius: 16, padding: '18px 20px', border: '1px solid #1e3a5f', marginBottom: 16 };
const section = (title: string, color = '#f5c518') => ({ margin: '0 0 12px', color, fontWeight: 'bold' as const, fontSize: 15 });

return (
<div style={pg}>
{/* HEADER */}
<div style={{ background: 'linear-gradient(135deg, #070e1d, #0d1f3c)', borderBottom: '1px solid #1e3a5f', padding: '14px 18px', position: 'sticky' as const, top: 0, zIndex: 50 }}>
<div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
<button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: '#f5c518', fontSize: 22, cursor: 'pointer', padding: 0 }}>←</button>
<div>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>⚖️ Legal & Ownership</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 11 }}>BSC Marketplace — Copyright & Terms</p>
</div>
</div>
</div>

<div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 18px' }}>

{/* COPYRIGHT BADGE */}
<div style={{ background: 'linear-gradient(135deg, #1a1200, #2a1e00)', border: '2px solid #f5c518', borderRadius: 18, padding: '24px 20px', marginBottom: 20, textAlign: 'center' as const }}>
<p style={{ margin: '0 0 8px', fontSize: 40 }}>⚖️</p>
<p style={{ margin: '0 0 6px', color: '#f5c518', fontWeight: 'bold', fontSize: 20 }}>BSC MARKETPLACE</p>
<p style={{ margin: '0 0 4px', color: '#fff', fontSize: 14 }}>Bahamian Seafood Connection</p>
<p style={{ margin: '0 0 16px', color: '#6b7280', fontSize: 12 }}>Nassau & Andros, Commonwealth of the Bahamas</p>
<div style={{ backgroundColor: 'rgba(245,197,24,0.1)', borderRadius: 12, padding: '12px 16px', border: '1px solid rgba(245,197,24,0.3)' }}>
<p style={{ margin: 0, color: '#f5c518', fontWeight: 'bold', fontSize: 14 }}>© 2024–2025 All Rights Reserved</p>
<p style={{ margin: '4px 0 0', color: '#aaa', fontSize: 12 }}>This software, brand, and all intellectual property is protected under the laws of the Commonwealth of the Bahamas and international copyright conventions.</p>
</div>
</div>

{/* OWNERSHIP */}
<div style={card}>
<p style={section('👑 Ownership Structure')}>👑 Ownership Structure</p>
<p style={{ margin: '0 0 14px', color: '#4a5568', fontSize: 13 }}>BSC Marketplace and all associated intellectual property, software, brand, domain, and business systems are solely owned by:</p>

<div style={{ backgroundColor: '#060d1f', borderRadius: 12, padding: '16px', border: '1px solid #f5c51844', marginBottom: 14 }}>
<p style={{ margin: '0 0 12px', color: '#f5c518', fontWeight: 'bold', fontSize: 13, letterSpacing: 1 }}>PRIMARY OWNERS</p>
{[
{ name: 'Dedrick Tamico Storr Snr', role: 'Founder & Primary Owner', color: '#f5c518' },
{ name: 'Jaquel Rolle-Storr', role: 'Co-Founder & Co-Owner', color: '#f5c518' },
].map(owner => (
<div key={owner.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1e3a5f' }}>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 14, color: owner.color }}>{owner.name}</p>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 12 }}>{owner.role}</p>
</div>
<span style={{ backgroundColor: '#1a1200', color: '#f5c518', border: '1px solid #f5c51866', borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 'bold' }}>OWNER</span>
</div>
))}
</div>

<div style={{ backgroundColor: '#060d1f', borderRadius: 12, padding: '16px', border: '1px solid #4ade8033', marginBottom: 14 }}>
<p style={{ margin: '0 0 12px', color: '#4ade80', fontWeight: 'bold', fontSize: 13, letterSpacing: 1 }}>FAMILY LINEAGE — DIRECT HEIRS</p>
<p style={{ margin: '0 0 10px', color: '#4a5568', fontSize: 12 }}>All ownership rights extend to and are protected for the direct family lineage of Dedrick Tamico Storr and Jaquel Rolle-Storr, including:</p>
{[
'Dedrick Storr Jr',
'Demir Storr',
'Jaquel Storr',
'Demi Storr',
].map(name => (
<div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #1e3a5f' }}>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 13 }}>{name}</p>
<span style={{ backgroundColor: '#0a1f0a', color: '#4ade80', border: '1px solid #4ade8066', borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 'bold' }}>HEIR</span>
</div>
))}
<p style={{ margin: '10px 0 0', color: '#4a5568', fontSize: 11, lineHeight: 1.6 }}>
This ownership protection extends to all future direct descendants of Dedrick Tamico Storr and Jaquel Rolle-Storr as recognized under Bahamian family and inheritance law.
</p>
</div>

<div style={{ backgroundColor: '#060d1f', borderRadius: 12, padding: '16px', border: '1px solid #60a5fa33' }}>
<p style={{ margin: '0 0 12px', color: '#60a5fa', fontWeight: 'bold', fontSize: 13, letterSpacing: 1 }}>BUSINESS PARTNERSHIP</p>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
<div>
<p style={{ margin: 0, fontWeight: 'bold', fontSize: 14 }}>Bill Casale</p>
<p style={{ margin: '2px 0 0', color: '#4a5568', fontSize: 12 }}>Business Partner</p>
</div>
<span style={{ backgroundColor: '#001a2a', color: '#60a5fa', border: '1px solid #60a5fa66', borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 'bold' }}>5% Partnership Interest</span>
</div>
</div>
</div>

{/* COPYRIGHT NOTICE */}
<div style={card}>
<p style={section('📋 Copyright Notice')}>📋 Copyright Notice</p>
<p style={{ margin: '0 0 12px', color: '#aaa', fontSize: 13, lineHeight: 1.7 }}>
All content, software code, design, user interface, business logic, database structures, brand assets, logos, marketing materials, and business processes contained within BSC Marketplace are copyright protected.
</p>
<div style={{ backgroundColor: '#2d0000', border: '1px solid #f87171', borderRadius: 12, padding: '14px 16px' }}>
<p style={{ margin: '0 0 8px', color: '#f87171', fontWeight: 'bold', fontSize: 13 }}>⛔ Strictly Prohibited</p>
{[
'Copying, reproducing, or distributing any part of this system',
'Reselling or sublicensing this software or brand',
'Using the BSC name, logo, or branding without written permission',
'Reverse engineering or creating derivative works',
'Unauthorized access to BSC systems or databases',
].map(item => (
<p key={item} style={{ margin: '4px 0', color: '#aaa', fontSize: 12 }}>• {item}</p>
))}
</div>
</div>

{/* TERMS OF USE */}
<div style={card}>
<p style={section('📜 Terms of Use')}>📜 Terms of Use</p>
{[
{ title: 'For Customers', body: 'By using BSC Marketplace you agree to provide accurate information, use the platform for lawful purchases only, and not attempt to circumvent any payment or security systems.' },
{ title: 'For Suppliers', body: 'Approved suppliers agree to provide accurate product information, maintain honest pricing, and honor all orders processed through the BSC platform.' },
{ title: 'Bill Payment Service', body: 'BSC acts as a payment agent only. The 4.5% service fee covers banking costs. Annual subscribers are exempt. Payments are forwarded to utility companies within 1 business day. BSC is not liable for utility company errors or processing delays beyond BSC\'s control.' },
{ title: 'Vehicle Listings', body: 'All vehicle information is provided in good faith. Buyers are responsible for independent verification of vehicle condition, VIN, and title. BSC facilitates contact only and is not responsible for private sale transactions.' },
].map(term => (
<div key={term.title} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid #1e3a5f' }}>
<p style={{ margin: '0 0 6px', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>{term.title}</p>
<p style={{ margin: 0, color: '#aaa', fontSize: 13, lineHeight: 1.6 }}>{term.body}</p>
</div>
))}
</div>

{/* PRIVACY */}
<div style={card}>
<p style={section('🔒 Privacy Policy')}>🔒 Privacy Policy</p>
<p style={{ margin: '0 0 12px', color: '#aaa', fontSize: 13, lineHeight: 1.7 }}>BSC Marketplace collects only the information necessary to process orders and provide services. We do not sell customer data to third parties.</p>
{[
'Customer names and phone numbers are used for order processing and WhatsApp receipts only',
'Payment information is processed securely and not stored on BSC servers',
'Account numbers for bill payments are used solely to process utility payments',
'Order history is retained for customer service and dispute resolution',
].map(item => (
<p key={item} style={{ margin: '4px 0', color: '#4a5568', fontSize: 12 }}>🔒 {item}</p>
))}
</div>

{/* JURISDICTION */}
<div style={card}>
<p style={section('🇧🇸 Jurisdiction')}>🇧🇸 Jurisdiction & Governing Law</p>
<p style={{ margin: 0, color: '#aaa', fontSize: 13, lineHeight: 1.7 }}>
BSC Marketplace is a registered business operating under the laws of the Commonwealth of the Bahamas. All disputes arising from the use of this platform shall be governed by Bahamian law and subject to the jurisdiction of the courts of the Commonwealth of the Bahamas. International copyright protections apply under the Berne Convention and WIPO treaties.
</p>
</div>

{/* CONTACT */}
<div style={{ background: 'linear-gradient(135deg, #001a2a, #002a3a)', border: '1px solid #1e5a9f', borderRadius: 16, padding: '18px 20px', marginBottom: 20 }}>
<p style={{ margin: '0 0 12px', color: '#60a5fa', fontWeight: 'bold', fontSize: 14 }}>📬 Legal Contact</p>
<p style={{ margin: '0 0 6px', color: '#fff', fontWeight: 'bold', fontSize: 15 }}>Bahamian Seafood Connection</p>
<p style={{ margin: '0 0 4px', color: '#4a5568', fontSize: 13 }}>📍 Firetrial Road, Nassau, Bahamas</p>
<p style={{ margin: '0 0 4px', color: '#4a5568', fontSize: 13 }}>📧 bahamianseafoodconnection@gmail.com</p>
<p style={{ margin: 0, color: '#4a5568', fontSize: 13 }}>📱 +1 (242) 361-3474</p>
</div>

{/* FINAL COPYRIGHT SEAL */}
<div style={{ textAlign: 'center' as const, padding: '20px', background: 'linear-gradient(135deg, #0a0f1e, #070e1d)', borderRadius: 16, border: '1px solid #1e3a5f' }}>
<p style={{ margin: '0 0 6px', color: '#f5c518', fontWeight: 'bold', fontSize: 16 }}>🐟 BSC MARKETPLACE</p>
<p style={{ margin: '0 0 4px', color: '#fff', fontSize: 13 }}>Bahamian Seafood Connection</p>
<p style={{ margin: '0 0 12px', color: '#4a5568', fontSize: 11 }}>Nassau & Andros, Commonwealth of the Bahamas</p>
<p style={{ margin: '0 0 4px', color: '#f5c518', fontWeight: 'bold', fontSize: 13 }}>© 2024–2025 All Rights Reserved</p>
<p style={{ margin: '0 0 4px', color: '#4a5568', fontSize: 11 }}>Owned by Dedrick Tamico Storr Snr, Jaquel Rolle-Storr & Family</p>
<p style={{ margin: '0 0 4px', color: '#4a5568', fontSize: 11 }}>Bill Casale — 5% Partnership Interest</p>
<p style={{ margin: '8px 0 0', color: '#2a3a5a', fontSize: 10 }}>Protected under Bahamian Law · Berne Convention · WIPO Treaties</p>
</div>
</div>
</div>
);
}
