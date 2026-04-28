"use client";

import { useState } from "react";

type Action = {
label: string;
icon: string;
};

type Service = {
id: string;
icon: string;
title: string;
tagline: string;
color: string;
bg: string;
description: string;
actions: Action[];
};

const services: Service[] = [
{
id: "marketplace",
icon: "🛍️",
title: "Online Marketplace",
tagline: "Shop millions of products",
color: "#FF6B35",
bg: "#FFF4F0",
description:
"Browse and buy from our vast catalog — electronics, fashion, home goods, groceries, and more. Fast delivery, secure payments, easy returns.",
actions: [
{ label: "Browse Categories", icon: "🗂️" },
{ label: "Today's Deals", icon: "🔥" },
{ label: "My Wishlist", icon: "💛" },
{ label: "Track Orders", icon: "📦" },
],
},
{
id: "bills",
icon: "⚡",
title: "Pay Utility Bills",
tagline: "Electricity, water, gas & more",
color: "#2EC4B6",
bg: "#F0FFFE",
description:
"Pay all your utility bills in one place — electricity, water, gas, internet, and subscriptions. Schedule payments or pay instantly, with history and reminders.",
actions: [
{ label: "Pay Electricity", icon: "💡" },
{ label: "Pay Water Bill", icon: "💧" },
{ label: "Pay Internet", icon: "📡" },
{ label: "Set Auto-Pay", icon: "🔄" },
],
},
{
id: "shopping",
icon: "🛒",
title: "Ways to Shop",
tagline: "Choose how you shop with us",
color: "#7B5EA7",
bg: "#F7F4FF",
description:
"Shop your way — in-store pickup, curbside delivery, scheduled home delivery, or instant express shipping. Flexible options designed around your lifestyle.",
actions: [
{ label: "In-Store Pickup", icon: "🏪" },
{ label: "Home Delivery", icon: "🏠" },
{ label: "Express Shipping", icon: "🚀" },
{ label: "Curbside", icon: "🚗" },
],
},
{
id: "vehicle",
icon: "🚘",
title: "Buy or Rent a Vehicle",
tagline: "Cars, trucks, SUVs & more",
color: "#E63946",
bg: "#FFF0F1",
description:
"Find your next vehicle — browse new and used cars, trucks, and SUVs for purchase or short/long-term rental. Financing options and trade-in valuations available.",
actions: [
{ label: "Buy a Car", icon: "🔑" },
{ label: "Rent a Vehicle", icon: "📅" },
{ label: "Get Financing", icon: "💳" },
{ label: "Trade-In Value", icon: "🔁" },
],
},
];

export default function CustomerDashboardPage() {
const [selectedId, setSelectedId] = useState<string | null>(null);
const [animating, setAnimating] = useState(false);

const handleSelect = (id: string) => {
setAnimating(true);
setTimeout(() => {
setSelectedId(id);
setAnimating(false);
}, 180);
};

const handleBack = () => {
setAnimating(true);
setTimeout(() => {
setSelectedId(null);
setAnimating(false);
}, 180);
};

const active = selectedId
? services.find((s) => s.id === selectedId) ?? null
: null;

return (
<div className="cd-root">
{/* Ambient background blobs */}
<div className="cd-blob cd-blob-1" />
<div className="cd-blob cd-blob-2" />

{/* Header */}
<header className="cd-header">
<div className="cd-logo">
<span className="cd-logo-mark">◆</span>
<span className="cd-logo-text">MyStore</span>
</div>
<div className="cd-user-chip">
<span className="cd-avatar">JD</span>
<span className="cd-username">Welcome, Jane!</span>
</div>
</header>

{/* Main */}
<main
className="cd-main"
style={{
opacity: animating ? 0 : 1,
transform: animating ? "translateY(12px)" : "translateY(0)",
transition: "opacity 0.18s ease, transform 0.18s ease",
}}
>
{!active ? (
<>
<div className="cd-hero-text">
<h1 className="cd-heading">What would you like to do today?</h1>
<p className="cd-sub">
Choose a service below to get started — everything you need, all in one place.
</p>
</div>

<div className="cd-grid">
{services.map((svc) => (
<button
key={svc.id}
className="cd-card"
onClick={() => handleSelect(svc.id)}
onMouseEnter={(e) => {
const el = e.currentTarget;
el.style.transform = "translateY(-6px) scale(1.02)";
el.style.boxShadow = `0 20px 50px ${svc.color}30`;
const accent = el.querySelector<HTMLElement>(".cd-card-accent");
if (accent) accent.style.width = "100%";
}}
onMouseLeave={(e) => {
const el = e.currentTarget;
el.style.transform = "translateY(0) scale(1)";
el.style.boxShadow = "0 4px 24px rgba(0,0,0,0.07)";
const accent = el.querySelector<HTMLElement>(".cd-card-accent");
if (accent) accent.style.width = "48px";
}}
>
<div
className="cd-card-accent"
style={{ background: svc.color }}
/>
<div
className="cd-icon-wrap"
style={{ background: svc.bg }}
>
<span className="cd-icon">{svc.icon}</span>
</div>
<h2 className="cd-card-title">{svc.title}</h2>
<p className="cd-card-tagline">{svc.tagline}</p>
<span className="cd-card-arrow" style={{ color: svc.color }}>
Explore →
</span>
</button>
))}
</div>
</>
) : (
<div className="cd-detail-wrap">
<button className="cd-back-btn" onClick={handleBack}>
← Back to all services
</button>

<div
className="cd-detail-hero"
style={{
background: `linear-gradient(135deg, ${active.color}18, ${active.bg})`,
borderLeft: `5px solid ${active.color}`,
}}
>
<span className="cd-detail-icon">{active.icon}</span>
<div>
<h1
className="cd-detail-title"
style={{ color: active.color }}
>
{active.title}
</h1>
<p className="cd-detail-desc">{active.description}</p>
</div>
</div>

<h2 className="cd-actions-heading">Choose your next step</h2>

<div className="cd-actions-grid">
{active.actions.map((action, i) => (
<button
key={i}
className="cd-action-card"
onMouseEnter={(e) => {
const el = e.currentTarget;
el.style.background = active.color;
el.style.color = "#fff";
el.style.transform = "translateY(-4px)";
el.style.boxShadow = `0 12px 32px ${active.color}40`;
}}
onMouseLeave={(e) => {
const el = e.currentTarget;
el.style.background = "#fff";
el.style.color = "#1a1a2e";
el.style.transform = "translateY(0)";
el.style.boxShadow = "0 2px 16px rgba(0,0,0,0.06)";
}}
>
<span className="cd-action-icon">{action.icon}</span>
<span className="cd-action-label">{action.label}</span>
</button>
))}
</div>

<div className="cd-other-strip">
<p className="cd-other-label">Or explore another service:</p>
<div className="cd-other-pills">
{services
.filter((s) => s.id !== active.id)
.map((s) => (
<button
key={s.id}
className="cd-pill"
style={{ background: s.bg, borderColor: "#ddd" }}
onMouseEnter={(e) => {
const el = e.currentTarget;
el.style.background = s.color;
el.style.color = "#fff";
}}
onMouseLeave={(e) => {
const el = e.currentTarget;
el.style.background = s.bg;
el.style.color = "#1a1a2e";
}}
onClick={() => handleSelect(s.id)}
>
{s.icon} {s.title}
</button>
))}
</div>
</div>
</div>
)}
</main>

<style>{`
.cd-root {
min-height: 100vh;
background: #f9f8ff;
font-family: Georgia, 'Times New Roman', serif;
position: relative;
overflow-x: hidden;
}
.cd-blob {
position: fixed;
border-radius: 50%;
pointer-events: none;
z-index: 0;
}
.cd-blob-1 {
top: -120px; right: -120px;
width: 500px; height: 500px;
background: radial-gradient(circle, #FF6B3520 0%, transparent 70%);
}
.cd-blob-2 {
bottom: -80px; left: -80px;
width: 400px; height: 400px;
background: radial-gradient(circle, #7B5EA720 0%, transparent 70%);
}
.cd-header {
display: flex;
align-items: center;
justify-content: space-between;
padding: 20px 40px;
border-bottom: 1px solid #ebe9f5;
background: rgba(255,255,255,0.88);
backdrop-filter: blur(10px);
position: sticky;
top: 0;
z-index: 100;
}
.cd-logo {
display: flex;
align-items: center;
gap: 10px;
}
.cd-logo-mark {
font-size: 22px;
color: #7B5EA7;
}
.cd-logo-text {
font-size: 22px;
font-weight: 700;
color: #1a1a2e;
letter-spacing: -0.5px;
}
.cd-user-chip {
display: flex;
align-items: center;
gap: 10px;
background: #fff;
border: 1px solid #ebe9f5;
padding: 6px 16px 6px 8px;
border-radius: 999px;
box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}
.cd-avatar {
width: 32px;
height: 32px;
border-radius: 50%;
background: linear-gradient(135deg, #7B5EA7, #2EC4B6);
color: #fff;
display: inline-flex;
align-items: center;
justify-content: center;
font-size: 12px;
font-weight: 700;
font-family: sans-serif;
}
.cd-username {
font-size: 14px;
font-weight: 600;
color: #1a1a2e;
}
.cd-main {
max-width: 1100px;
margin: 0 auto;
padding: 48px 32px 80px;
position: relative;
z-index: 1;
}
.cd-hero-text {
text-align: center;
margin-bottom: 48px;
}
.cd-heading {
font-size: clamp(26px, 4vw, 42px);
font-weight: 700;
color: #1a1a2e;
margin: 0 0 14px;
letter-spacing: -1px;
line-height: 1.15;
}
.cd-sub {
font-size: 17px;
color: #6b6880;
margin: 0;
font-style: italic;
}
.cd-grid {
display: grid;
grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
gap: 24px;
}
.cd-card {
background: #fff;
border: 1px solid #ebe9f5;
border-radius: 20px;
padding: 32px 28px;
cursor: pointer;
text-align: left;
position: relative;
overflow: hidden;
box-shadow: 0 4px 24px rgba(0,0,0,0.07);
transition: transform 0.22s ease, box-shadow 0.22s ease;
display: flex;
flex-direction: column;
gap: 12px;
}
.cd-card-accent {
position: absolute;
top: 0; left: 0;
height: 4px;
width: 48px;
border-radius: 0 0 4px 0;
transition: width 0.3s ease;
}
.cd-icon-wrap {
width: 58px;
height: 58px;
border-radius: 16px;
display: flex;
align-items: center;
justify-content: center;
}
.cd-icon { font-size: 28px; }
.cd-card-title {
font-size: 18px;
font-weight: 700;
color: #1a1a2e;
margin: 0;
letter-spacing: -0.3px;
}
.cd-card-tagline {
font-size: 13px;
color: #888;
margin: 0;
font-family: sans-serif;
font-style: italic;
}
.cd-card-arrow {
font-size: 13px;
font-weight: 600;
font-family: sans-serif;
margin-top: 6px;
}
.cd-detail-wrap {
max-width: 820px;
margin: 0 auto;
}
.cd-back-btn {
background: none;
border: none;
font-size: 14px;
color: #7B5EA7;
cursor: pointer;
font-family: sans-serif;
font-weight: 600;
padding: 0 0 28px;
display: block;
letter-spacing: 0.2px;
}
.cd-detail-hero {
display: flex;
align-items: flex-start;
gap: 24px;
border-radius: 20px;
padding: 36px;
margin-bottom: 40px;
}
.cd-detail-icon {
font-size: 52px;
line-height: 1;
flex-shrink: 0;
}
.cd-detail-title {
font-size: 30px;
font-weight: 700;
margin: 0 0 12px;
letter-spacing: -0.5px;
}
.cd-detail-desc {
font-size: 16px;
color: #444;
margin: 0;
line-height: 1.7;
font-family: sans-serif;
}
.cd-actions-heading {
font-size: 18px;
font-weight: 700;
color: #1a1a2e;
margin: 0 0 20px;
letter-spacing: -0.3px;
}
.cd-actions-grid {
display: grid;
grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
gap: 16px;
margin-bottom: 48px;
}
.cd-action-card {
background: #fff;
border: 1px solid #ebe9f5;
border-radius: 16px;
padding: 24px 20px;
cursor: pointer;
display: flex;
flex-direction: column;
align-items: center;
gap: 12px;
box-shadow: 0 2px 16px rgba(0,0,0,0.06);
transition: background 0.2s, color 0.2s, transform 0.2s, box-shadow 0.2s;
color: #1a1a2e;
}
.cd-action-icon { font-size: 30px; }
.cd-action-label {
font-size: 14px;
font-weight: 600;
font-family: sans-serif;
text-align: center;
line-height: 1.3;
}
.cd-other-strip {
border-top: 1px solid #ebe9f5;
padding-top: 28px;
}
.cd-other-label {
font-size: 13px;
color: #999;
font-family: sans-serif;
margin: 0 0 14px;
text-transform: uppercase;
letter-spacing: 0.8px;
}
.cd-other-pills {
display: flex;
flex-wrap: wrap;
gap: 10px;
}
.cd-pill {
padding: 10px 18px;
border-radius: 999px;
border: 1px solid #ddd;
font-size: 13px;
font-family: sans-serif;
font-weight: 600;
cursor: pointer;
transition: background 0.2s, color 0.2s;
display: flex;
align-items: center;
gap: 6px;
color: #1a1a2e;
}
`}</style>
</div>
);
}
