'use client';

import Link from 'next/link';

const SUPABASE = 'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

const SVG_PAT = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='110' height='110' viewBox='0 0 110 110'>
<g stroke='%23c8a84b' stroke-width='1' fill='none' opacity='0.28'>
  <ellipse cx='18' cy='12' rx='13' ry='6' transform='translate(2,2)'/>
  <path d='M5 12 Q-2 8 -5 12 Q-2 16 5 12Z' transform='translate(2,2)'/>
  <circle cx='28' cy='9' r='1.5' fill='%23c8a84b' transform='translate(2,2)'/>
  <path d='M10 8 Q15 5 18 8' stroke-width='.7' transform='translate(2,2)'/>
  <path d='M55 5 Q63 14 60 24 Q57 32 48 35' transform='translate(5,0)'/>
  <path d='M55 5 Q46 10 46 18 Q46 26 51 32' transform='translate(5,0)'/>
  <path d='M50 7 L55 2 M53 12 L58 8 M52 20 L58 19' transform='translate(5,0)'/>
  <circle cx='75' cy='72' r='9'/>
  <path d='M83 62 Q90 58 93 64 Q90 70 83 68'/>
  <path d='M83 65 Q88 62 90 66'/>
  <path d='M64 68 L62 63 M65 73 L60 76'/>
  <ellipse cx='12' cy='75' rx='10' ry='5.5' transform='translate(3,3)'/>
  <path d='M3 75 Q-2 71 -4 75 Q-2 79 3 75Z' transform='translate(3,3)'/>
  <path d='M50 72 Q58 62 68 58 Q76 55 80 60 Q82 65 76 70 Q70 74 62 75Z'/>
  <path d='M55 68 Q60 62 67 60' stroke-width='.7'/>
  <path d='M82 8 Q90 6 92 12 Q90 18 82 14Z'/>
  <path d='M82 10 Q88 9 90 13'/>
  <path d='M75 8 L72 3 M76 13 L70 16'/>
</g></svg>`);

const LINKS = {
  shop:    [{ label:'Online Market',    href:'/market' }, { label:'Local Wholesale', href:'/local-wholesale' }, { label:'Shop USA',         href:'/us-shopping' }, { label:'Checkout',         href:'/checkout' }],
  services:[{ label:'Pay Utility Bills',href:'/utilities' }, { label:'Vehicles & Parts',href:'/vehicles' }, { label:'Yield Calculator', href:'/yield' }, { label:'Order Fulfillment',href:'/order-fulfillment' }],
  company: [{ label:'Our Story',        href:'/#why-bsc' }, { label:'Supplier Portal', href:'/supplier' }, { label:'Login / Sign Up',  href:'/login' }, { label:'Dashboard',       href:'/dashboard' }],
};

export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap');

        .bsc-footer { position:relative; background:#060e1c; font-family:'DM Sans',sans-serif; overflow:hidden; }
        .bsc-footer-pat { position:absolute; inset:0; background-image:url("data:image/svg+xml,${SVG_PAT}"); background-size:110px 110px; opacity:.9; pointer-events:none; }
        .bsc-footer-top-glow { position:absolute; top:0; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent 0%,#c8a84b 25%,#f5c842 50%,#c8a84b 75%,transparent 100%); opacity:.55; }
        .bsc-footer-fade { position:absolute; top:0; left:0; right:0; height:180px; background:linear-gradient(to bottom,rgba(6,14,28,.85),transparent); pointer-events:none; }

        .bsc-footer-main { position:relative; z-index:2; max-width:1280px; margin:0 auto; padding:64px 5% 48px; display:grid; grid-template-columns:1.6fr 1fr 1fr 1fr; gap:48px; }

        /* Brand column */
        .bsc-footer-brand { display:flex; flex-direction:column; gap:0; }
        .bsc-footer-logo { display:flex; align-items:center; gap:12px; margin-bottom:20px; }
        .bsc-footer-logo-img { width:48px; height:48px; border-radius:50%; object-fit:cover; border:2px solid #d4a843; }
        .bsc-footer-logo-text { display:flex; flex-direction:column; }
        .bsc-footer-logo-name { font-family:'Playfair Display',serif; font-size:17px; font-weight:700; color:#f5c842; letter-spacing:.04em; line-height:1.1; }
        .bsc-footer-logo-sub { font-size:9px; font-weight:600; letter-spacing:.2em; text-transform:uppercase; color:rgba(212,168,67,.6); margin-top:3px; }

        .bsc-footer-tagline { font-size:13px; color:rgba(255,255,255,.45); line-height:1.65; max-width:240px; margin-bottom:24px; font-weight:300; }
        .bsc-footer-contact { display:flex; flex-direction:column; gap:8px; margin-bottom:24px; }
        .bsc-footer-contact a { font-size:12px; color:rgba(255,255,255,.5); text-decoration:none; transition:color .2s; display:flex; align-items:center; gap:8px; }
        .bsc-footer-contact a:hover { color:#d4a843; }

        /* Nav columns */
        .bsc-footer-col { }
        .bsc-footer-col-title { font-size:10px; font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:#d4a843; margin-bottom:18px; padding-bottom:10px; border-bottom:1px solid rgba(212,168,67,.2); }
        .bsc-footer-col-links { display:flex; flex-direction:column; gap:10px; }
        .bsc-footer-col-links a { font-size:13px; color:rgba(255,255,255,.5); text-decoration:none; transition:all .2s ease; display:flex; align-items:center; gap:6px; font-weight:400; }
        .bsc-footer-col-links a::before { content:''; width:0; height:1px; background:#d4a843; transition:width .2s ease; }
        .bsc-footer-col-links a:hover { color:#e8d5a3; transform:translateX(4px); }
        .bsc-footer-col-links a:hover::before { width:12px; }

        /* Bottom bar */
        .bsc-footer-bottom { position:relative; z-index:2; border-top:1px solid rgba(212,168,67,.1); }
        .bsc-footer-bottom-inner { max-width:1280px; margin:0 auto; padding:20px 5%; display:flex; align-items:center; justify-content:space-between; gap:20px; flex-wrap:wrap; }
        .bsc-footer-copy { font-size:11px; color:rgba(255,255,255,.25); letter-spacing:.04em; }
        .bsc-footer-badges { display:flex; gap:8px; }
        .bsc-footer-badge { font-size:9px; font-weight:700; letter-spacing:.1em; color:rgba(212,168,67,.5); border:1px solid rgba(212,168,67,.2); padding:3px 10px; border-radius:3px; text-transform:uppercase; }

        /* Trust strip */
        .bsc-footer-trust { position:relative; z-index:2; border-top:1px solid rgba(255,255,255,.04); padding:28px 5%; max-width:1280px; margin:0 auto; display:flex; justify-content:center; gap:40px; flex-wrap:wrap; }
        .bsc-footer-trust-item { display:flex; align-items:center; gap:10px; }
        .bsc-footer-trust-icon { font-size:18px; }
        .bsc-footer-trust-text { }
        .bsc-footer-trust-title { font-size:12px; font-weight:600; color:rgba(255,255,255,.6); }
        .bsc-footer-trust-sub { font-size:10px; color:rgba(255,255,255,.3); margin-top:1px; }

        @media(max-width:900px){
          .bsc-footer-main{grid-template-columns:1fr 1fr;gap:36px;}
        }
        @media(max-width:580px){
          .bsc-footer-main{grid-template-columns:1fr;gap:32px;padding:48px 5% 36px;}
          .bsc-footer-trust{gap:24px;}
          .bsc-footer-bottom-inner{flex-direction:column;text-align:center;}
        }
      `}</style>

      <footer className="bsc-footer">
        <div className="bsc-footer-pat" />
        <div className="bsc-footer-top-glow" />
        <div className="bsc-footer-fade" />

        <div className="bsc-footer-main">
          {/* Brand */}
          <div className="bsc-footer-brand">
            <div className="bsc-footer-logo">
              <img src={`${SUPABASE}/logo.jpg`} alt="BSC" className="bsc-footer-logo-img" />
              <div className="bsc-footer-logo-text">
                <span className="bsc-footer-logo-name">Bahamian Seafood<br />Connection</span>
                <span className="bsc-footer-logo-sub">BSC Marketplace</span>
              </div>
            </div>
            <p className="bsc-footer-tagline">
              Nassau's premier marketplace for premium seafood, fresh meats, and Bahamian wholesale. Proudly family-owned.
            </p>
            <div className="bsc-footer-contact">
              <a href="tel:+12425584495">📞 +1 (242) 558-4495</a>
              <a href="https://wa.me/12423613474">💬 WhatsApp: +1 (242) 361-3474</a>
              <a href="mailto:Bahamiansc@iCloud.com">✉️ Bahamiansc@iCloud.com</a>
              <a href="https://bscbahamas.com" target="_blank" rel="noopener noreferrer">🌐 bscbahamas.com</a>
            </div>
          </div>

          {/* Shop links */}
          <div className="bsc-footer-col">
            <div className="bsc-footer-col-title">Shop</div>
            <div className="bsc-footer-col-links">
              {LINKS.shop.map(l => <Link key={l.href} href={l.href}>{l.label}</Link>)}
            </div>
          </div>

          {/* Services */}
          <div className="bsc-footer-col">
            <div className="bsc-footer-col-title">Services</div>
            <div className="bsc-footer-col-links">
              {LINKS.services.map(l => <Link key={l.href} href={l.href}>{l.label}</Link>)}
            </div>
          </div>

          {/* Company */}
          <div className="bsc-footer-col">
            <div className="bsc-footer-col-title">Company</div>
            <div className="bsc-footer-col-links">
              {LINKS.company.map(l => <Link key={l.href} href={l.href}>{l.label}</Link>)}
            </div>
          </div>
        </div>

        {/* Trust strip */}
        <div className="bsc-footer-trust">
          {[
            {icon:'❄️', title:'Fresh Daily',         sub:'Sourced and delivered fresh'},
            {icon:'🔒', title:'Secure Payments',     sub:'RBC Plug & Pay encrypted'},
            {icon:'🚚', title:'Nassau & Andros',     sub:'Family Island delivery'},
            {icon:'🇧🇸', title:'Proudly Bahamian',  sub:'Owned by the Storr family'},
          ].map(t => (
            <div key={t.title} className="bsc-footer-trust-item">
              <span className="bsc-footer-trust-icon">{t.icon}</span>
              <div className="bsc-footer-trust-text">
                <div className="bsc-footer-trust-title">{t.title}</div>
                <div className="bsc-footer-trust-sub">{t.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="bsc-footer-bottom">
          <div className="bsc-footer-bottom-inner">
            <span className="bsc-footer-copy">© {year} BSC Marketplace · Dedrick Tamico Storr Snr & Jaquel Rolle-Storr & Family · Nassau, Bahamas</span>
            <div className="bsc-footer-badges">
              {['RBC Secured','VAT Registered','COD Available'].map(b => (
                <span key={b} className="bsc-footer-badge">{b}</span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}