'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import HeroSection from '@/components/HeroSection';
import SiteFooter from '@/components/SiteFooter';

// ── YOUR ACTUAL FILE IN SUPABASE ──────────────────────────────────────────────
const HERO_IMG = 'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images/94C94225-7A21-4E0F-BA00-79CA6E108385.jpg';

const WHOLESALERS = [
  {key:'asa-h-pritchard',           name:'Asa H Pritchard',           color:'#1B4F72', emoji:'🏪'},
  {key:'bahamas-international-food', name:'Bahamas Intl Food',         color:'#1E5C2E', emoji:'🍱'},
  {key:'dalbenas',                   name:"D'Albenas",                  color:'#784212', emoji:'🏭'},
  {key:'bahamas-wholesale-agencies', name:'Bahamas Wholesale',          color:'#1A5276', emoji:'📦'},
  {key:'tpg',                        name:'TPG',                        color:'#2C3E50', emoji:'🛒'},
  {key:'thompson-trading',           name:'Thompson Trading',           color:'#922B21', emoji:'🤝'},
  {key:'island-wholesale',           name:'Island Wholesale',           color:'#196F3D', emoji:'🌴'},
];

const US_STORES = [
  {key:'sams-club',   name:"Sam's Club",     color:'#0067A0', emoji:'🏪'},
  {key:'bjs',         name:"BJ's Wholesale", color:'#CC0000', emoji:'🏬'},
  {key:'costco',      name:'Costco',         color:'#005DAA', emoji:'🏢'},
  {key:'walmart',     name:'Walmart',        color:'#0071CE', emoji:'🛒'},
  {key:'steakhouse',  name:'FL Steakhouse',  color:'#8B1A1A', emoji:'🥩'},
];

export default function HomePage() {
  const router = useRouter();
  const [scrolled, setScrolled]     = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');

        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

        html { scroll-behavior:smooth; overflow-x:hidden; overflow-y:auto; height:auto; width:100%; }
        body { font-family:'DM Sans',sans-serif; background:#fff; color:#0f2137; -webkit-font-smoothing:antialiased; overflow-x:hidden; overflow-y:auto; height:auto; min-height:100vh; width:100%; touch-action:pan-y; }

        /* ── NAV ── */
        .bsc-nav { position:fixed; top:0; left:0; right:0; z-index:200; height:72px; display:flex; align-items:center; transition:all .35s ease; }
        .bsc-nav.scrolled { background:rgba(6,14,28,.94); backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px); border-bottom:1px solid rgba(212,168,67,.15); box-shadow:0 4px 32px rgba(0,0,0,.4); }
        .bsc-nav.top { background:linear-gradient(to bottom, rgba(0,0,0,.45), transparent); }
        .bsc-nav-inner { max-width:1280px; width:100%; margin:0 auto; padding:0 5%; display:flex; align-items:center; justify-content:space-between; }

        /* CSS-only logo — no image dependency */
        .bsc-nav-logo { display:flex; align-items:center; gap:12px; cursor:pointer; flex-shrink:0; }
        .bsc-nav-logo-mark { width:42px; height:42px; border-radius:50%; background:linear-gradient(135deg,#0a1520 0%,#1a2e4a 100%); border:2px solid #d4a843; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 10px rgba(212,168,67,.3); transition:all .25s ease; }
        .bsc-nav-logo:hover .bsc-nav-logo-mark { border-color:#f5c842; transform:scale(1.05); }
        .bsc-nav-logo-mark-text { font-family:'Playfair Display',serif; font-size:14px; font-weight:900; color:#f5c842; letter-spacing:.5px; }
        .bsc-nav-logo-name { color:#f5a623; font-weight:900; font-size:17px; letter-spacing:2px; line-height:1; font-family:'DM Sans',sans-serif; }
        .bsc-nav-logo-sub { color:rgba(255,255,255,.55); font-size:9px; font-weight:600; letter-spacing:1.8px; margin-top:2px; text-transform:uppercase; }

        .bsc-nav-links { display:flex; align-items:center; gap:2px; }
        .bsc-nav-link { background:none; border:none; color:rgba(255,255,255,.85); font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500; letter-spacing:.04em; cursor:pointer; padding:8px 14px; border-radius:6px; transition:all .2s ease; position:relative; }
        .bsc-nav-link::after { content:''; position:absolute; bottom:4px; left:14px; right:14px; height:1.5px; background:#d4a843; transform:scaleX(0); transition:transform .2s ease; transform-origin:center; }
        .bsc-nav-link:hover { color:#fff; }
        .bsc-nav-link:hover::after { transform:scaleX(1); }
        .bsc-nav-link.active { color:#f5a623; }
        .bsc-nav-link.active::after { transform:scaleX(1); }

        .bsc-nav-right { display:flex; align-items:center; gap:10px; flex-shrink:0; }
        .bsc-nav-cart { background:none; border:none; font-size:20px; cursor:pointer; color:#fff; padding:8px; border-radius:8px; transition:background .2s; }
        .bsc-nav-cart:hover { background:rgba(255,255,255,.1); }
        .bsc-nav-signin { background:transparent; border:1.5px solid rgba(212,168,67,.65); color:#f5a623; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:600; letter-spacing:.04em; cursor:pointer; padding:9px 20px; border-radius:6px; transition:all .22s ease; }
        .bsc-nav-signin:hover { background:#d4a843; color:#060e1c; border-color:#d4a843; }

        .bsc-nav-ham { display:none; background:none; border:none; cursor:pointer; flex-direction:column; gap:5px; padding:8px; }
        .bsc-nav-ham-line { width:22px; height:2px; background:#fff; border-radius:2px; transition:all .25s ease; display:block; }

        /* ── TRUST BAR ── */
        .bsc-trust { background:#0a1520; border-top:3px solid #d4a843; border-bottom:1px solid rgba(212,168,67,.12); }
        .bsc-trust-inner { max-width:1280px; margin:0 auto; padding:0 5%; display:flex; justify-content:space-around; flex-wrap:wrap; }
        .bsc-trust-item { display:flex; align-items:center; gap:14px; padding:22px 16px; flex:1; min-width:200px; }
        .bsc-trust-icon-wrap { width:44px; height:44px; border-radius:12px; background:rgba(212,168,67,.12); border:1px solid rgba(212,168,67,.2); display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0; }
        .bsc-trust-text-title { color:#fff; font-weight:700; font-size:13px; margin-bottom:2px; }
        .bsc-trust-text-sub { color:rgba(255,255,255,.45); font-size:11px; }

        /* ── CATEGORIES ── */
        .bsc-cats { padding:96px 5%; background:#fff; }
        .bsc-cats-inner { max-width:1280px; margin:0 auto; }
        .bsc-section-label { font-size:11px; font-weight:700; letter-spacing:.22em; text-transform:uppercase; color:#d4a843; margin-bottom:12px; }
        .bsc-section-h2 { font-family:'Playfair Display',serif; font-size:clamp(28px,3.5vw,42px); font-weight:900; color:#0a1520; margin-bottom:8px; line-height:1.1; }
        .bsc-section-sub { font-size:15px; color:#64748b; margin-bottom:48px; font-weight:300; max-width:520px; line-height:1.65; }

        .bsc-cats-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:16px; }
        .bsc-cat-card { border-radius:20px; overflow:hidden; cursor:pointer; position:relative; aspect-ratio:3/4; transition:transform .28s cubic-bezier(.25,.46,.45,.94), box-shadow .28s ease; box-shadow:0 4px 20px rgba(0,0,0,.1); }
        .bsc-cat-card:hover { transform:translateY(-8px); box-shadow:0 20px 48px rgba(0,0,0,.18); }
        .bsc-cat-card-bg { position:absolute; inset:0; pointer-events:none; }
        .bsc-cat-card-overlay { position:absolute; inset:0; background:linear-gradient(to top, rgba(0,0,0,.78) 0%, rgba(0,0,0,.2) 50%, transparent 100%); pointer-events:none; }
        .bsc-cat-card:hover .bsc-cat-card-overlay { background:linear-gradient(to top, rgba(0,0,0,.88) 0%, rgba(0,0,0,.3) 60%, rgba(212,168,67,.08) 100%); }
        .bsc-cat-icon-wrap { position:absolute; top:20px; left:50%; transform:translateX(-50%); width:58px; height:58px; border-radius:16px; background:rgba(255,255,255,.1); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.15); display:flex; align-items:center; justify-content:center; font-size:26px; transition:all .28s ease; pointer-events:none; }
        .bsc-cat-card:hover .bsc-cat-icon-wrap { background:rgba(212,168,67,.2); border-color:rgba(212,168,67,.4); transform:translateX(-50%) scale(1.08); }
        .bsc-cat-content { position:absolute; bottom:0; left:0; right:0; padding:20px 18px; pointer-events:none; }
        .bsc-cat-name { font-family:'Playfair Display',serif; font-size:18px; font-weight:700; color:#fff; margin-bottom:6px; }
        .bsc-cat-desc { font-size:11px; color:rgba(255,255,255,.65); margin-bottom:12px; line-height:1.4; }
        .bsc-cat-link { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; letter-spacing:.08em; color:#f5c842; text-transform:uppercase; transition:gap .2s ease; }
        .bsc-cat-card:hover .bsc-cat-link { gap:10px; }
        .bsc-cat-bar { position:absolute; bottom:0; left:0; right:0; height:3px; background:linear-gradient(to right, #d4a843, #f5c842); transform:scaleX(0); transition:transform .28s ease; transform-origin:left; pointer-events:none; }
        .bsc-cat-card:hover .bsc-cat-bar { transform:scaleX(1); }

        /* ── WHOLESALE ── */
        .bsc-wholesale { padding:96px 5%; background:#060e1c; position:relative; overflow:hidden; }
        .bsc-wholesale::before { content:''; position:absolute; top:-1px; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,#d4a843,transparent); pointer-events:none; }
        .bsc-wholesale-inner { max-width:1280px; margin:0 auto; }
        .bsc-wholesale .bsc-section-h2 { color:#fff; }
        .bsc-wholesale .bsc-section-sub { color:rgba(255,255,255,.5); }

        .bsc-partners-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; margin-bottom:40px; }
        .bsc-partner-card { border-radius:14px; padding:18px 20px; display:flex; align-items:center; gap:16px; cursor:pointer; transition:all .25s cubic-bezier(.25,.46,.45,.94); border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.04); backdrop-filter:blur(4px); position:relative; overflow:hidden; }
        .bsc-partner-card::before { content:''; position:absolute; left:0; top:0; bottom:0; width:4px; transition:width .25s ease; pointer-events:none; }
        .bsc-partner-card:hover { background:rgba(255,255,255,.08); transform:translateX(4px); border-color:rgba(255,255,255,.12); }
        .bsc-partner-card:hover::before { width:6px; }
        .bsc-partner-emoji { font-size:24px; flex-shrink:0; }
        .bsc-partner-info { flex:1; min-width:0; }
        .bsc-partner-name { font-size:14px; font-weight:700; color:#fff; margin-bottom:3px; }
        .bsc-partner-tag { font-size:10px; color:rgba(255,255,255,.4); letter-spacing:.1em; text-transform:uppercase; }
        .bsc-partner-arrow { color:rgba(255,255,255,.3); font-size:16px; transition:all .25s ease; }
        .bsc-partner-card:hover .bsc-partner-arrow { color:#d4a843; transform:translateX(4px); }

        .bsc-wholesale-features { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:40px; }
        .bsc-wf-pill { display:flex; align-items:center; gap:8px; background:rgba(212,168,67,.1); border:1px solid rgba(212,168,67,.25); border-radius:30px; padding:9px 18px; }
        .bsc-wf-pill-text { font-size:13px; font-weight:600; color:rgba(212,168,67,.9); }

        /* ── US SHOPPING ── */
        .bsc-us { padding:96px 5%; background:#0a1520; position:relative; }
        .bsc-us::before { content:''; position:absolute; top:-1px; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,.1),transparent); pointer-events:none; }
        .bsc-us-inner { max-width:1280px; margin:0 auto; }
        .bsc-us .bsc-section-h2 { color:#fff; }
        .bsc-us .bsc-section-sub { color:rgba(255,255,255,.5); }

        .bsc-stores-grid { display:flex; gap:14px; flex-wrap:wrap; margin-bottom:40px; }
        .bsc-store-card { flex:1; min-width:160px; border-radius:14px; overflow:hidden; cursor:pointer; position:relative; padding:24px 20px; display:flex; flex-direction:column; align-items:center; gap:12px; transition:all .28s cubic-bezier(.25,.46,.45,.94); border:1px solid rgba(255,255,255,.08); }
        .bsc-store-card:hover { transform:translateY(-6px); box-shadow:0 20px 48px rgba(0,0,0,.4); border-color:rgba(255,255,255,.16); }
        .bsc-store-emoji { font-size:32px; }
        .bsc-store-name { font-size:13px; font-weight:700; color:#fff; text-align:center; line-height:1.3; }
        .bsc-store-tag { font-size:10px; color:rgba(255,255,255,.45); text-transform:uppercase; letter-spacing:.1em; }

        .bsc-us-steps { display:flex; gap:0; align-items:center; flex-wrap:wrap; margin-bottom:40px; }
        .bsc-us-step { display:flex; align-items:center; gap:12px; flex:1; min-width:160px; }
        .bsc-us-step-num { width:36px; height:36px; border-radius:50%; background:rgba(212,168,67,.15); border:1.5px solid rgba(212,168,67,.35); display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:800; color:#d4a843; flex-shrink:0; }
        .bsc-us-step-text { font-size:13px; color:rgba(255,255,255,.65); font-weight:500; }
        .bsc-us-step-arrow { color:rgba(255,255,255,.2); font-size:18px; margin:0 8px; flex-shrink:0; }

        /* ── WHY BSC ── */
        .bsc-why { padding:96px 5%; background:#f8fafc; }
        .bsc-why-inner { max-width:1280px; margin:0 auto; text-align:center; }
        .bsc-why-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:24px; margin-top:48px; }
        .bsc-why-card { background:#fff; border-radius:18px; padding:32px 24px; display:flex; flex-direction:column; align-items:center; gap:14px; box-shadow:0 2px 16px rgba(0,0,0,.06); border:1px solid #f1f5f9; transition:all .28s ease; cursor:default; }
        .bsc-why-card:hover { transform:translateY(-6px); box-shadow:0 16px 40px rgba(0,0,0,.1); border-color:rgba(212,168,67,.3); }
        .bsc-why-icon-wrap { width:64px; height:64px; border-radius:20px; background:linear-gradient(135deg,#0a1520 0%,#1a2e4a 100%); display:flex; align-items:center; justify-content:center; font-size:28px; box-shadow:0 8px 24px rgba(10,21,32,.25); transition:transform .28s ease; }
        .bsc-why-card:hover .bsc-why-icon-wrap { transform:scale(1.1) rotate(-3deg); }
        .bsc-why-card-title { font-family:'Playfair Display',serif; font-size:17px; font-weight:700; color:#0a1520; }
        .bsc-why-card-desc { font-size:13px; color:#64748b; text-align:center; line-height:1.6; font-weight:300; }

        /* ── BANNERS — both use the hero image, different overlays ── */
        .bsc-banners { display:grid; grid-template-columns:1fr 1fr; min-height:420px; }
        .bsc-banner { position:relative; overflow:hidden; cursor:pointer; }
        .bsc-banner-bg { position:absolute; inset:0; background-size:cover; background-position:center; transition:transform .55s cubic-bezier(.25,.46,.45,.94); pointer-events:none; }
        .bsc-banner:hover .bsc-banner-bg { transform:scale(1.06); }
        .bsc-banner-ov { position:absolute; inset:0; pointer-events:none; }
        .bsc-banner-ov-blue { background:linear-gradient(135deg, rgba(10,61,98,.85) 0%, rgba(26,107,154,.5) 60%, rgba(0,0,0,.3) 100%); }
        .bsc-banner-ov-red { background:linear-gradient(135deg, rgba(122,30,30,.85) 0%, rgba(159,59,54,.5) 60%, rgba(0,0,0,.3) 100%); }
        .bsc-banner-content { position:absolute; top:50%; left:10%; transform:translateY(-50%); z-index:2; }
        .bsc-banner-label { font-size:10px; font-weight:700; letter-spacing:.22em; color:#d4a843; text-transform:uppercase; margin-bottom:8px; }
        .bsc-banner-h3 { font-family:'Playfair Display',serif; font-size:clamp(22px,3vw,36px); font-weight:900; color:#fff; line-height:1.1; margin-bottom:8px; }
        .bsc-banner-desc { font-size:13px; color:rgba(255,255,255,.75); margin-bottom:22px; font-weight:300; }
        .bsc-banner-btn { display:inline-flex; align-items:center; gap:8px; padding:12px 24px; background:linear-gradient(130deg,#f5c842,#c8860f); color:#060e1c; font-size:13px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; border:none; border-radius:6px; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all .22s ease; box-shadow:0 4px 20px rgba(212,160,21,.35); }
        .bsc-banner-btn:hover { transform:translateY(-2px); box-shadow:0 8px 28px rgba(212,160,21,.5); }

        /* ── CTA STRIP ── */
        .bsc-cta-strip { background:linear-gradient(135deg,#d4a843 0%,#f5c842 35%,#d4a015 65%,#c8860f 100%); padding:80px 5%; text-align:center; position:relative; overflow:hidden; }
        .bsc-cta-strip-inner { max-width:700px; margin:0 auto; position:relative; }
        .bsc-cta-strip-h2 { font-family:'Playfair Display',serif; font-size:clamp(26px,4vw,44px); font-weight:900; color:#060e1c; margin-bottom:12px; }
        .bsc-cta-strip-sub { font-size:15px; color:rgba(6,14,28,.7); margin-bottom:36px; font-weight:400; line-height:1.65; }
        .bsc-cta-strip-btns { display:flex; gap:14px; justify-content:center; flex-wrap:wrap; }
        .bsc-cta-btn-dark { background:#060e1c; color:#f5a623; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; border:none; padding:15px 36px; border-radius:6px; cursor:pointer; transition:all .22s ease; box-shadow:0 6px 24px rgba(0,0,0,.25); }
        .bsc-cta-btn-dark:hover { background:#0f2137; transform:translateY(-2px); box-shadow:0 12px 32px rgba(0,0,0,.35); }
        .bsc-cta-btn-outline { background:transparent; color:#060e1c; font-family:'DM Sans',sans-serif; font-size:14px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; border:2px solid rgba(6,14,28,.5); padding:13px 36px; border-radius:6px; cursor:pointer; transition:all .22s ease; }
        .bsc-cta-btn-outline:hover { border-color:#060e1c; background:rgba(6,14,28,.08); transform:translateY(-2px); }

        /* ── BOTTOM TRUST ── */
        .bsc-btrust { background:#fff; padding:64px 5%; border-top:1px solid #f1f5f9; }
        .bsc-btrust-inner { max-width:1000px; margin:0 auto; display:grid; grid-template-columns:repeat(4,1fr); gap:32px; }
        .bsc-btrust-item { display:flex; flex-direction:column; align-items:center; gap:12px; text-align:center; }
        .bsc-btrust-icon { width:52px; height:52px; border-radius:16px; background:linear-gradient(135deg,#f8fafc,#e2e8f0); display:flex; align-items:center; justify-content:center; font-size:22px; box-shadow:0 2px 12px rgba(0,0,0,.08); }
        .bsc-btrust-title { font-size:13px; font-weight:700; color:#0f2137; }
        .bsc-btrust-desc { font-size:11px; color:#94a3b8; line-height:1.5; }

        .bsc-sec-btn { display:inline-flex; align-items:center; gap:8px; padding:14px 36px; background:linear-gradient(130deg,#f5c842,#c8860f); color:#060e1c; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; border:none; border-radius:6px; cursor:pointer; box-shadow:0 6px 28px rgba(212,160,21,.38); transition:all .22s ease; }
        .bsc-sec-btn:hover { transform:translateY(-3px); box-shadow:0 12px 36px rgba(212,160,21,.52); filter:brightness(1.06); }

        @media(max-width:900px){
          .bsc-cats-grid{grid-template-columns:repeat(2,1fr); gap:12px;}
          .bsc-cats-grid > *:last-child{display:none;}
          .bsc-banners{grid-template-columns:1fr;}
          .bsc-btrust-inner{grid-template-columns:repeat(2,1fr);}
        }
        @media(max-width:640px){
          .bsc-nav-links{display:none;}
          .bsc-nav-ham{display:flex;}
          .bsc-cats{padding:64px 5%;}
          .bsc-cats-grid{grid-template-columns:1fr 1fr;}
          .bsc-wholesale,.bsc-us,.bsc-why{padding:64px 5%;}
          .bsc-why-grid{grid-template-columns:1fr 1fr;}
          .bsc-btrust-inner{grid-template-columns:1fr 1fr;}
          .bsc-partners-grid{grid-template-columns:1fr;}
          .bsc-us-steps{flex-direction:column;align-items:flex-start;}
          .bsc-us-step-arrow{display:none;}
          .bsc-trust-inner{flex-direction:column;}
          .bsc-trust-item{padding:16px 0;border-bottom:1px solid rgba(255,255,255,.05);}
          .bsc-banner-h3{font-size:22px;}
        }
      `}</style>

      <div style={{backgroundColor:'#fff'}}>

        {/* STICKY NAV */}
        <nav className={`bsc-nav ${scrolled ? 'scrolled' : 'top'}`}>
          <div className="bsc-nav-inner">
            <div className="bsc-nav-logo" onClick={() => router.push('/')}>
              <div className="bsc-nav-logo-mark">
                <span className="bsc-nav-logo-mark-text">BSC</span>
              </div>
              <div>
                <div className="bsc-nav-logo-name">BSC</div>
                <div className="bsc-nav-logo-sub">Marketplace</div>
              </div>
            </div>

            <div className="bsc-nav-links">
              {[
                {label:'Home',       route:'/'},
                {label:'Shop Local', route:'/market'},
                {label:'Wholesale',  route:'/local-wholesale'},
                {label:'Shop USA',   route:'/us-shopping'},
                {label:'Services',   route:'/utilities'},
              ].map((item, i) => (
                <button key={item.label} className={`bsc-nav-link ${i===0?'active':''}`} onClick={() => router.push(item.route)}>
                  {item.label}
                </button>
              ))}
            </div>

            <div className="bsc-nav-right">
              <button className="bsc-nav-cart" onClick={() => router.push('/market')}>🛒</button>
              <button className="bsc-nav-signin" onClick={() => router.push('/login')}>Sign In</button>
              <button className="bsc-nav-ham" onClick={() => setMobileMenu(m=>!m)} aria-label="Menu">
                <span className="bsc-nav-ham-line" style={{transform: mobileMenu ? 'rotate(45deg) translateY(7px)' : 'none'}} />
                <span className="bsc-nav-ham-line" style={{opacity: mobileMenu ? 0 : 1}} />
                <span className="bsc-nav-ham-line" style={{transform: mobileMenu ? 'rotate(-45deg) translateY(-7px)' : 'none'}} />
              </button>
            </div>
          </div>
          {mobileMenu && (
            <div style={{background:'rgba(6,14,28,.97)', borderTop:'1px solid rgba(212,168,67,.15)', padding:'12px 5% 20px'}}>
              {[
                {label:'Home', route:'/'},
                {label:'Shop Local', route:'/market'},
                {label:'Wholesale', route:'/local-wholesale'},
                {label:'Shop USA', route:'/us-shopping'},
                {label:'Services', route:'/utilities'},
                {label:'Sign In', route:'/login'},
              ].map(item => (
                <button key={item.label} onClick={() => {router.push(item.route);setMobileMenu(false);}} style={{display:'block', width:'100%', background:'none', border:'none', color:'rgba(255,255,255,.8)', fontFamily:"'DM Sans',sans-serif", fontSize:'15px', fontWeight:'500', textAlign:'left', padding:'13px 4px', cursor:'pointer', borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* HERO */}
        <HeroSection />

        {/* TRUST BAR */}
        <div className="bsc-trust">
          <div className="bsc-trust-inner">
            {[
              {icon:'🦞', title:'Premium Quality',    sub:'Fresh seafood & meats daily'},
              {icon:'🔒', title:'Secure Payments',    sub:'RBC Plug & Pay encrypted'},
              {icon:'🚚', title:'Nassau & Andros',    sub:'Family Island delivery'},
              {icon:'🤝', title:'Trusted Partners',   sub:'7 Nassau wholesalers'},
            ].map((t,i) => (
              <div key={t.title} className="bsc-trust-item" style={{borderRight: i<3 ? '1px solid rgba(255,255,255,.06)':'none'}}>
                <div className="bsc-trust-icon-wrap">{t.icon}</div>
                <div>
                  <div className="bsc-trust-text-title">{t.title}</div>
                  <div className="bsc-trust-text-sub">{t.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CATEGORIES */}
        <section className="bsc-cats">
          <div className="bsc-cats-inner">
            <div className="bsc-section-label">What We Offer</div>
            <h2 className="bsc-section-h2">Shop By Category</h2>
            <p className="bsc-section-sub">Everything a Bahamian family or business needs — all under one marketplace.</p>

            <div className="bsc-cats-grid">
              {[
                {icon:'🦐', name:'Shop Marketplace', desc:'Fresh seafood, meats & groceries', route:'/market',          grad:'linear-gradient(145deg,#0a3d62,#1a6b9a,#0a3d62)'},
                {icon:'📦', name:'Wholesale & Bulk',  desc:"Nassau's top wholesale suppliers",  route:'/local-wholesale', grad:'linear-gradient(145deg,#1a3a1a,#2d6a2d,#1a3a1a)'},
                {icon:'💡', name:'Utility Bills',     desc:'Water, power, internet & more',     route:'/utilities',       grad:'linear-gradient(145deg,#4a2c00,#8a5200,#4a2c00)'},
                {icon:'🚛', name:'Delivery',          desc:'Fast delivery to your doorstep',     route:'/market',          grad:'linear-gradient(145deg,#1a0a3a,#3d1a7a,#1a0a3a)'},
                {icon:'⛵', name:'Mailboat Shipping', desc:'Ship to all Family Islands',         route:'/market',          grad:'linear-gradient(145deg,#002a3a,#005a7a,#002a3a)'},
              ].map(cat => (
                <div key={cat.name} className="bsc-cat-card" onClick={() => router.push(cat.route)}>
                  <div className="bsc-cat-card-bg" style={{background:cat.grad}} />
                  <div className="bsc-cat-card-overlay" />
                  <div className="bsc-cat-icon-wrap">{cat.icon}</div>
                  <div className="bsc-cat-content">
                    <div className="bsc-cat-name">{cat.name}</div>
                    <div className="bsc-cat-desc">{cat.desc}</div>
                    <span className="bsc-cat-link">Explore <span>→</span></span>
                  </div>
                  <div className="bsc-cat-bar" />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* WHOLESALE */}
        <section className="bsc-wholesale">
          <div className="bsc-wholesale-inner">
            <div className="bsc-section-label">Nassau's Finest</div>
            <h2 className="bsc-section-h2" style={{color:'#fff'}}>Local Wholesale Partners</h2>
            <p className="bsc-section-sub">
              Access Nassau's top wholesale suppliers directly through BSC. Order in bulk — we handle pickup and delivery so you don't have to.
            </p>

            <div className="bsc-partners-grid">
              {WHOLESALERS.map(w => (
                <div key={w.key} className="bsc-partner-card" onClick={() => router.push(`/local-wholesale/${w.key}`)}>
                  <style>{`.bsc-partner-card[data-c="${w.key}"]::before { background:${w.color}; }`}</style>
                  <span className="bsc-partner-emoji">{w.emoji}</span>
                  <div className="bsc-partner-info">
                    <div className="bsc-partner-name">{w.name}</div>
                    <div className="bsc-partner-tag">Wholesale Partner · Click to Browse</div>
                  </div>
                  <span className="bsc-partner-arrow">›</span>
                </div>
              ))}
            </div>

            <div className="bsc-wholesale-features">
              {[
                {e:'💰', t:'Wholesale Pricing'},
                {e:'📦', t:'Bulk Orders'},
                {e:'🚚', t:'BSC Delivers'},
                {e:'📱', t:'Order Online'},
                {e:'🇧🇸', t:'Nassau & Andros'},
              ].map(f => (
                <div key={f.t} className="bsc-wf-pill">
                  <span>{f.e}</span>
                  <span className="bsc-wf-pill-text">{f.t}</span>
                </div>
              ))}
            </div>

            <button className="bsc-sec-btn" onClick={() => router.push('/local-wholesale')}>
              Browse All Wholesalers →
            </button>
          </div>
        </section>

        {/* US SHOPPING */}
        <section className="bsc-us">
          <div className="bsc-us-inner">
            <div className="bsc-section-label" style={{color:'rgba(212,168,67,.7)'}}>Florida Shopping Service</div>
            <h2 className="bsc-section-h2" style={{color:'#fff'}}>
              Shop the USA.<br />
              <span style={{fontStyle:'italic', color:'#d4a843'}}>We Bring It Home.</span>
            </h2>
            <p className="bsc-section-sub">
              BSC shops Florida's top wholesale clubs so you don't have to travel. Full landed cost — customs, shipping, duty — delivered to Nassau or Andros.
            </p>

            <div className="bsc-us-steps" style={{marginBottom:'36px'}}>
              {[
                {n:'1', t:'You place your order online'},
                {n:'2', t:'BSC shops in Florida'},
                {n:'3', t:'Cleared through customs'},
                {n:'4', t:'Delivered to your door'},
              ].map((s,i) => (
                <div key={s.n} style={{display:'flex',alignItems:'center',flex:1,minWidth:160}}>
                  <div className="bsc-us-step">
                    <div className="bsc-us-step-num">{s.n}</div>
                    <div className="bsc-us-step-text">{s.t}</div>
                  </div>
                  {i<3 && <span className="bsc-us-step-arrow">›</span>}
                </div>
              ))}
            </div>

            <div className="bsc-stores-grid">
              {US_STORES.map(store => (
                <div key={store.key} className="bsc-store-card" style={{background:`linear-gradient(145deg,${store.color}cc,${store.color}88)`}} onClick={() => router.push(`/us-shopping/${store.key}`)}>
                  <span className="bsc-store-emoji">{store.emoji}</span>
                  <div className="bsc-store-name">{store.name}</div>
                  <div className="bsc-store-tag">Click to browse</div>
                </div>
              ))}
            </div>

            <div style={{marginTop:'36px'}}>
              <button className="bsc-sec-btn" onClick={() => router.push('/us-shopping')}>Browse US Stores →</button>
            </div>
          </div>
        </section>

        {/* WHY BSC */}
        <section className="bsc-why" id="why-bsc">
          <div className="bsc-why-inner">
            <div className="bsc-section-label">Our Promise</div>
            <h2 className="bsc-section-h2">Why Choose BSC?</h2>
            <p className="bsc-section-sub" style={{margin:'0 auto', textAlign:'center'}}>
              Built by a Bahamian family, for Bahamian families. Every decision we make starts at the kitchen table.
            </p>

            <div className="bsc-why-grid">
              {[
                {icon:'🦐', title:'Wide Selection',    desc:'Seafood, meats, wholesale, US imports and everyday essentials.'},
                {icon:'💰', title:'Honest Prices',     desc:'Documented margins. No greed. You know what you pay for.'},
                {icon:'🔐', title:'Secure & Simple',   desc:'RBC-encrypted checkout. Card and COD accepted.'},
                {icon:'🇧🇸', title:'Bahamian First',  desc:'Sourced locally, employing locally, built here in Nassau.'},
                {icon:'💬', title:'Real Support',      desc:'Call or WhatsApp us. A real person answers every time.'},
              ].map(w => (
                <div key={w.title} className="bsc-why-card">
                  <div className="bsc-why-icon-wrap">{w.icon}</div>
                  <div className="bsc-why-card-title">{w.title}</div>
                  <div className="bsc-why-card-desc">{w.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* DUAL BANNER — both use the same hero image with different colored overlays */}
        <div className="bsc-banners">
          <div className="bsc-banner" onClick={() => router.push('/market')}>
            <div className="bsc-banner-bg" style={{backgroundImage:`url(${HERO_IMG})`}} />
            <div className="bsc-banner-ov bsc-banner-ov-blue" />
            <div className="bsc-banner-content">
              <div className="bsc-banner-label">Fresh Daily</div>
              <h3 className="bsc-banner-h3">Premium Seafood<br />Delivered Daily</h3>
              <p className="bsc-banner-desc">From our waters to your table.</p>
              <button className="bsc-banner-btn">Shop Seafood</button>
            </div>
          </div>
          <div className="bsc-banner" onClick={() => router.push('/market')}>
            <div className="bsc-banner-bg" style={{backgroundImage:`url(${HERO_IMG})`}} />
            <div className="bsc-banner-ov bsc-banner-ov-red" />
            <div className="bsc-banner-content">
              <div className="bsc-banner-label">Premium Quality</div>
              <h3 className="bsc-banner-h3">Premium Meats<br />Cut Fresh</h3>
              <p className="bsc-banner-desc">Quality you can taste.</p>
              <button className="bsc-banner-btn">Shop Meats</button>
            </div>
          </div>
        </div>

        {/* CTA STRIP */}
        <section className="bsc-cta-strip">
          <div className="bsc-cta-strip-inner">
            <h2 className="bsc-cta-strip-h2">Ready to Shop Bahamian?</h2>
            <p className="bsc-cta-strip-sub">
              Join hundreds of Nassau families and businesses shopping fresh, local, and wholesale — all in one place.
            </p>
            <div className="bsc-cta-strip-btns">
              <button className="bsc-cta-btn-dark" onClick={() => router.push('/login')}>Create Free Account</button>
              <button className="bsc-cta-btn-outline" onClick={() => router.push('/market')}>Browse Market</button>
            </div>
          </div>
        </section>

        {/* BOTTOM TRUST */}
        <section className="bsc-btrust">
          <div className="bsc-btrust-inner">
            {[
              {icon:'🔒', title:'Secure Checkout',      desc:'100% encrypted via RBC Plug & Pay'},
              {icon:'✅', title:'Verified Suppliers',    desc:'Trusted Nassau & US wholesale partners'},
              {icon:'⭐', title:'Quality Guaranteed',    desc:'Freshness on every order, every time'},
              {icon:'😊', title:'Satisfaction Promise',  desc:'We stand behind everything we deliver'},
            ].map(t => (
              <div key={t.title} className="bsc-btrust-item">
                <div className="bsc-btrust-icon">{t.icon}</div>
                <div className="bsc-btrust-title">{t.title}</div>
                <div className="bsc-btrust-desc">{t.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <SiteFooter />
      </div>
    </>
  );
}