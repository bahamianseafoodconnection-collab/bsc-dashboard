'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// ── YOUR ACTUAL FILE IN SUPABASE ──────────────────────────────────────────────
const HERO_IMG = 'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images/94C94225-7A21-4E0F-BA00-79CA6E108385.jpg';

export default function HeroSection() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLoaded(true), 80); return () => clearTimeout(t); }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');

        .bsc-hero { position:relative; width:100%; height:100svh; min-height:640px; max-height:980px; overflow:hidden; display:flex; align-items:center; }

        .bsc-hero-bg { position:absolute; inset:0; background:url('${HERO_IMG}') center 40%/cover; transform:scale(1.06); transition:transform 8s cubic-bezier(.25,.46,.45,.94); will-change:transform; pointer-events:none; }
        .bsc-hero-bg.on { transform:scale(1.0); }

        .bsc-hero-ov1 { position:absolute; inset:0; background:linear-gradient(108deg, rgba(5,12,24,.95) 0%, rgba(10,21,42,.84) 40%, rgba(15,33,55,.5) 65%, rgba(0,0,0,.15) 100%); pointer-events:none; }
        .bsc-hero-ov2 { position:absolute; inset:0; background:linear-gradient(to top, rgba(5,12,24,.92) 0%, rgba(5,12,24,.3) 28%, transparent 58%); pointer-events:none; }
        .bsc-hero-ov3 { position:absolute; inset:0; background:radial-gradient(ellipse 60% 80% at 100% 50%, rgba(212,168,67,.06) 0%, transparent 70%); pointer-events:none; }
        .bsc-hero-bar { position:absolute; left:0; top:0; bottom:0; width:4px; background:linear-gradient(to bottom, transparent, #d4a843 18%, #f5c842 50%, #d4a843 82%, transparent); opacity:.65; pointer-events:none; }

        .bsc-hero-inner { position:relative; z-index:10; max-width:1280px; margin:0 auto; padding:100px 6% 0; width:100%; pointer-events:none; }
        .bsc-hero-inner > * { pointer-events:auto; }

        .bsc-hero-eye { display:inline-flex; align-items:center; gap:10px; margin-bottom:22px; opacity:0; transform:translateY(18px); transition:opacity .65s ease .1s, transform .65s ease .1s; pointer-events:none; }
        .bsc-hero-eye.on { opacity:1; transform:translateY(0); }
        .bsc-hero-eye-ln { width:32px; height:1px; background:linear-gradient(to right, transparent, #d4a843); }
        .bsc-hero-eye-tx { font-family:'DM Sans',sans-serif; font-size:11px; font-weight:600; letter-spacing:.22em; text-transform:uppercase; color:#d4a843; }

        .bsc-hero-h1 { font-family:'Playfair Display',serif; font-weight:900; font-size:clamp(48px,7.8vw,98px); line-height:1.0; color:#fff; margin:0 0 8px; max-width:680px; opacity:0; transform:translateY(28px); transition:opacity .8s ease .25s, transform .8s ease .25s; pointer-events:none; }
        .bsc-hero-h1.on { opacity:1; transform:translateY(0); }
        .bsc-hero-h1-gold { display:block; font-style:italic; background:linear-gradient(130deg,#f5c842 0%,#d4a015 40%,#f0b429 72%,#c8860f 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }

        .bsc-hero-sep { display:flex; align-items:center; gap:14px; margin-bottom:24px; opacity:0; transform:translateY(18px); transition:opacity .65s ease .42s, transform .65s ease .42s; pointer-events:none; }
        .bsc-hero-sep.on { opacity:1; transform:translateY(0); }
        .bsc-hero-sep-ln { width:52px; height:1px; background:linear-gradient(to right,#d4a843,transparent); }
        .bsc-hero-sep-tx { font-family:'DM Sans',sans-serif; font-size:12px; font-weight:500; letter-spacing:.16em; color:rgba(212,168,67,.75); text-transform:uppercase; }

        .bsc-hero-desc { font-family:'DM Sans',sans-serif; font-size:clamp(14px,1.7vw,17px); line-height:1.78; color:rgba(226,232,240,.72); max-width:440px; margin-bottom:38px; font-weight:300; opacity:0; transform:translateY(18px); transition:opacity .65s ease .52s, transform .65s ease .52s; pointer-events:none; }
        .bsc-hero-desc.on { opacity:1; transform:translateY(0); }

        .bsc-hero-ctas { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:54px; opacity:0; transform:translateY(18px); transition:opacity .65s ease .62s, transform .65s ease .62s; }
        .bsc-hero-ctas.on { opacity:1; transform:translateY(0); }

        .bsc-cta-main { display:inline-flex; align-items:center; gap:8px; padding:15px 34px; background:linear-gradient(130deg,#f5c842 0%,#c8860f 100%); color:#060e1c; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; text-decoration:none; border-radius:4px; box-shadow:0 6px 32px rgba(212,160,21,.42), inset 0 1px 0 rgba(255,255,255,.14); transition:transform .2s ease, box-shadow .2s ease, filter .2s ease; position:relative; overflow:hidden; pointer-events:auto; }
        .bsc-cta-main::after { content:''; position:absolute; top:0; left:-100%; width:50%; height:100%; background:linear-gradient(90deg,transparent,rgba(255,255,255,.22),transparent); transition:left .55s ease; pointer-events:none; }
        .bsc-cta-main:hover::after { left:160%; }
        .bsc-cta-main:hover { transform:translateY(-3px); box-shadow:0 14px 42px rgba(212,160,21,.55); filter:brightness(1.06); }

        .bsc-cta-ghost { display:inline-flex; align-items:center; gap:8px; padding:14px 26px; background:rgba(255,255,255,.055); color:rgba(255,255,255,.85); font-family:'DM Sans',sans-serif; font-size:13px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; text-decoration:none; border:1.5px solid rgba(255,255,255,.2); border-radius:4px; backdrop-filter:blur(8px); transition:all .22s ease; pointer-events:auto; }
        .bsc-cta-ghost:hover { background:rgba(255,255,255,.1); border-color:rgba(212,168,67,.55); color:#f5c842; transform:translateY(-2px); }

        .bsc-hero-stats { display:flex; gap:0; opacity:0; transform:translateY(14px); transition:opacity .65s ease .78s, transform .65s ease .78s; pointer-events:none; }
        .bsc-hero-stats.on { opacity:1; transform:translateY(0); }
        .bsc-hero-stat { padding-right:28px; margin-right:28px; border-right:1px solid rgba(255,255,255,.1); }
        .bsc-hero-stat:last-child { border:none; margin:0; padding-right:0; }
        .bsc-hero-stat-n { font-family:'Playfair Display',serif; font-size:26px; font-weight:700; color:#f5c842; line-height:1; margin-bottom:5px; }
        .bsc-hero-stat-l { font-family:'DM Sans',sans-serif; font-size:10px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:rgba(255,255,255,.4); }

        .bsc-hero-scroll { position:absolute; bottom:32px; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:7px; z-index:10; cursor:pointer; animation:bscScrollFade .6s ease 1.3s both; pointer-events:auto; opacity:0; }
        @keyframes bscScrollFade { to { opacity:1; } }
        .bsc-scroll-mouse { width:23px; height:36px; border:2px solid rgba(255,255,255,.28); border-radius:12px; display:flex; justify-content:center; padding-top:6px; }
        .bsc-scroll-dot { width:4px; height:6px; background:#d4a843; border-radius:2px; animation:bscBounce 1.9s ease-in-out infinite; }
        @keyframes bscBounce { 0%,100%{transform:translateY(0);opacity:1;} 50%{transform:translateY(8px);opacity:.35;} }
        .bsc-scroll-lbl { font-family:'DM Sans',sans-serif; font-size:9px; letter-spacing:.22em; text-transform:uppercase; color:rgba(255,255,255,.3); font-weight:600; }

        @media(max-width:640px){
          .bsc-hero-inner{padding:88px 5% 0;}
          .bsc-hero-ctas{flex-direction:column;}
          .bsc-cta-main,.bsc-cta-ghost{justify-content:center;}
          .bsc-hero-stats{flex-wrap:wrap;gap:16px;}
          .bsc-hero-stat{padding:0;border:none;margin:0;min-width:80px;}
          .bsc-hero-stat-n{font-size:22px;}
        }
      `}</style>

      <section className="bsc-hero">
        <div className={`bsc-hero-bg ${loaded ? 'on' : ''}`} />
        <div className="bsc-hero-ov1" /><div className="bsc-hero-ov2" /><div className="bsc-hero-ov3" />
        <div className="bsc-hero-bar" />

        <div className="bsc-hero-inner">
          <div className={`bsc-hero-eye ${loaded ? 'on' : ''}`}>
            <span className="bsc-hero-eye-ln" />
            <span className="bsc-hero-eye-tx">Nassau · Commonwealth of the Bahamas 🇧🇸</span>
          </div>

          <h1 className={`bsc-hero-h1 ${loaded ? 'on' : ''}`}>
            Fresh From<br />Our Waters<br />
            <span className="bsc-hero-h1-gold">To Your Door.</span>
          </h1>

          <div className={`bsc-hero-sep ${loaded ? 'on' : ''}`}>
            <span className="bsc-hero-sep-ln" />
            <span className="bsc-hero-sep-tx">Seafood · Meat · Wholesale · Services</span>
          </div>

          <p className={`bsc-hero-desc ${loaded ? 'on' : ''}`}>
            Nassau's premier marketplace for premium seafood, fresh meats, and Bahamian wholesale — delivered to your door, sourced with pride.
          </p>

          <div className={`bsc-hero-ctas ${loaded ? 'on' : ''}`}>
            <Link href="/market" className="bsc-cta-main">Shop Now →</Link>
            <Link href="/local-wholesale" className="bsc-cta-ghost">🇧🇸 Wholesale</Link>
            <Link href="/us-shopping" className="bsc-cta-ghost">🇺🇸 Shop USA</Link>
          </div>

          <div className={`bsc-hero-stats ${loaded ? 'on' : ''}`}>
            {[
              {n:'9,310+', l:'lbs in cold storage'},
              {n:'7',      l:'Nassau wholesalers'},
              {n:'5',      l:'Florida stores'},
              {n:'2',      l:'Islands served'},
            ].map(s => (
              <div key={s.l} className="bsc-hero-stat">
                <div className="bsc-hero-stat-n">{s.n}</div>
                <div className="bsc-hero-stat-l">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bsc-hero-scroll" onClick={() => window.scrollTo({top:window.innerHeight,behavior:'smooth'})}>
          <div className="bsc-scroll-mouse"><div className="bsc-scroll-dot" /></div>
          <span className="bsc-scroll-lbl">Scroll</span>
        </div>
      </section>
    </>
  );
}