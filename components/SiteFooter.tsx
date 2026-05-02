'use client';

import Link from 'next/link';

// SVG seafood icons for the repeating pattern (matching Image 1 style)
const SEAFOOD_PATTERN_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>
  <!-- Fish 1 -->
  <g transform='translate(10,10)' stroke='%23c8a84b' stroke-width='1.2' fill='none' opacity='0.35'>
    <ellipse cx='14' cy='8' rx='12' ry='6'/>
    <path d='M2 8 Q-4 4 -6 8 Q-4 12 2 8Z'/>
    <circle cx='18' cy='6' r='1.2' fill='%23c8a84b'/>
    <path d='M6 5 Q10 3 14 5' stroke-width='0.8'/>
  </g>
  <!-- Shrimp -->
  <g transform='translate(60,5)' stroke='%23c8a84b' stroke-width='1.2' fill='none' opacity='0.35'>
    <path d='M10 2 Q16 8 14 16 Q12 22 6 24'/>
    <path d='M10 2 Q4 6 4 12 Q4 18 8 22'/>
    <path d='M8 4 L12 0 M10 8 L14 5 M10 14 L15 13'/>
  </g>
  <!-- Crab claw -->
  <g transform='translate(85,60)' stroke='%23c8a84b' stroke-width='1.2' fill='none' opacity='0.3'>
    <circle cx='10' cy='10' r='8'/>
    <path d='M16 4 Q22 0 24 6 Q22 10 16 8'/>
    <path d='M16 6 Q20 4 21 8'/>
    <path d='M4 8 L2 4 M4 12 L0 14'/>
  </g>
  <!-- Fish 2 smaller -->
  <g transform='translate(8,65)' stroke='%23c8a84b' stroke-width='1' fill='none' opacity='0.28'>
    <ellipse cx='10' cy='6' rx='9' ry='5'/>
    <path d='M1 6 Q-3 3 -5 6 Q-3 9 1 6Z'/>
    <circle cx='14' cy='4' r='1' fill='%23c8a84b'/>
  </g>
  <!-- Oyster shell -->
  <g transform='translate(48,60)' stroke='%23c8a84b' stroke-width='1.1' fill='none' opacity='0.3'>
    <path d='M2 10 Q10 0 18 10 Q14 20 10 20 Q6 20 2 10Z'/>
    <path d='M2 10 Q10 12 18 10'/>
    <path d='M5 8 Q10 6 15 8' stroke-width='0.7'/>
  </g>
  <!-- Salmon steak -->
  <g transform='translate(55,80)' stroke='%23c8a84b' stroke-width='1.1' fill='none' opacity='0.28'>
    <ellipse cx='12' cy='10' rx='11' ry='8'/>
    <ellipse cx='12' cy='10' rx='6' ry='4'/>
    <path d='M6 6 Q12 4 18 6' stroke-width='0.7'/>
    <path d='M5 10 Q12 8 19 10' stroke-width='0.7'/>
  </g>
  <!-- Lobster tail -->
  <g transform='translate(85,10)' stroke='%23c8a84b' stroke-width='1.1' fill='none' opacity='0.3'>
    <path d='M4 20 Q8 12 12 8 Q16 4 20 6 Q22 10 18 14 Q14 18 8 22Z'/>
    <path d='M6 16 Q10 10 16 8' stroke-width='0.7'/>
    <path d='M4 20 L0 24 M8 22 L6 27 M12 20 L12 26'/>
  </g>
</svg>`;

const ENCODED_PATTERN = `data:image/svg+xml,${SEAFOOD_PATTERN_SVG.trim()}`;

export default function SiteFooter() {
  const year = new Date().getFullYear();

  const navLinks = [
    { label: 'Shop Local',  href: '/market' },
    { label: 'Wholesale',   href: '/local-wholesale' },
    { label: 'Shop USA',    href: '/us-shopping' },
    { label: 'Our Story',   href: '/#why-bsc' },
    { label: 'Contact',     href: 'mailto:Bahamiansc@iCloud.com' },
  ];

  const trustItems = [
    { icon: '❄️', label: 'Fresh Daily' },
    { icon: '🔒', label: 'Vacuum Sealed' },
    { icon: '🚚', label: 'Next-Day Delivery' },
    { icon: '🇧🇸', label: 'Proudly Bahamian' },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Montserrat:wght@400;500;600;700&display=swap');

        .bsc-footer {
          position: relative;
          background-color: #0a1520;
          font-family: 'Montserrat', sans-serif;
          overflow: hidden;
        }

        /* Seafood icon repeating pattern - matches Image 1 */
        .bsc-footer-pattern {
          position: absolute;
          inset: 0;
          background-image: url("${ENCODED_PATTERN}");
          background-repeat: repeat;
          background-size: 120px 120px;
          opacity: 1;
          pointer-events: none;
        }

        /* Subtle top edge glow */
        .bsc-footer-topglow {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent 0%, #c8a84b 30%, #f5c842 50%, #c8a84b 70%, transparent 100%);
          opacity: 0.6;
        }

        /* Main footer content */
        .bsc-footer-main {
          position: relative;
          z-index: 2;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 2rem;
          padding: 3rem 4rem;
          align-items: center;
        }

        /* Left column — brand/copyright */
        .footer-brand {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .footer-brand-name {
          font-family: 'Playfair Display', serif;
          font-size: 1.05rem;
          font-weight: 700;
          color: #f5c842;
          line-height: 1.3;
          letter-spacing: 0.01em;
        }
        .footer-brand-tagline {
          font-size: 0.72rem;
          color: rgba(200,168,75,0.7);
          letter-spacing: 0.08em;
          line-height: 1.5;
          font-weight: 500;
        }
        .footer-copyright {
          font-size: 0.65rem;
          color: rgba(255,255,255,0.35);
          letter-spacing: 0.05em;
          margin-top: 0.4rem;
        }

        /* Center column — trust badges (matches Image 1 center) */
        .footer-trust {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }
        .footer-trust-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: rgba(200,168,75,0.85);
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .footer-trust-sep {
          color: rgba(200,168,75,0.4);
          font-size: 0.55rem;
        }
        .footer-trust-line2 {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: rgba(200,168,75,0.65);
          font-size: 0.67rem;
          font-weight: 500;
          letter-spacing: 0.09em;
          text-transform: uppercase;
        }

        /* Right column — nav links */
        .footer-nav {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.45rem;
        }
        .footer-nav-row {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .footer-nav a {
          color: rgba(200,168,75,0.8);
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          text-decoration: none;
          transition: color 0.2s ease;
        }
        .footer-nav a:hover { color: #f5c842; }
        .footer-nav-dot {
          color: rgba(200,168,75,0.3);
          font-size: 0.55rem;
        }

        /* Bottom bar */
        .bsc-footer-bottom {
          position: relative;
          z-index: 2;
          border-top: 1px solid rgba(200,168,75,0.12);
          padding: 1rem 4rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .footer-bottom-left {
          font-size: 0.62rem;
          color: rgba(255,255,255,0.25);
          letter-spacing: 0.06em;
        }
        .footer-bottom-right {
          font-size: 0.62rem;
          color: rgba(200,168,75,0.4);
          letter-spacing: 0.06em;
        }

        /* Mobile */
        @media (max-width: 768px) {
          .bsc-footer-main {
            grid-template-columns: 1fr;
            padding: 2.5rem 1.5rem;
            gap: 2.5rem;
            text-align: center;
          }
          .footer-brand { align-items: center; }
          .footer-nav { align-items: center; }
          .footer-nav-row { justify-content: center; }
          .bsc-footer-bottom {
            flex-direction: column;
            gap: 0.4rem;
            padding: 1rem 1.5rem;
            text-align: center;
          }
        }

        @media (max-width: 640px) {
          .bsc-footer-pattern { background-size: 90px 90px; }
        }
      `}</style>

      <footer className="bsc-footer">
        {/* Seafood pattern overlay — exactly as in Image 1 */}
        <div className="bsc-footer-pattern" />
        <div className="bsc-footer-topglow" />

        <div className="bsc-footer-main">

          {/* LEFT — Brand */}
          <div className="footer-brand">
            <div className="footer-brand-name">
              Bahamian Seafood<br />Connection
            </div>
            <div className="footer-brand-tagline">
              Fresh from Ocean &amp; Farm<br />to Your Door
            </div>
            <div className="footer-copyright">
              © {year} BSC Marketplace · Nassau, Bahamas
            </div>
          </div>

          {/* CENTER — Trust badges (matching Image 1 layout) */}
          <div className="footer-trust">
            <div className="footer-trust-row">
              <span>Fresh Daily</span>
              <span className="footer-trust-sep">•</span>
              <span>Vacuum Sealed</span>
            </div>
            <div className="footer-trust-line2">
              <span>Next-Day Delivery</span>
            </div>
          </div>

          {/* RIGHT — Nav links (matching Image 1 right column) */}
          <div className="footer-nav">
            <div className="footer-nav-row">
              <Link href="/market">Shop Seafood</Link>
              <span className="footer-nav-dot">•</span>
              <Link href="/market">Shop Meat</Link>
            </div>
            <div className="footer-nav-row">
              <Link href="/local-wholesale">Wholesale</Link>
              <span className="footer-nav-dot">•</span>
              <Link href="/us-shopping">Shop USA</Link>
            </div>
            <div className="footer-nav-row">
              <Link href="/#why-bsc">Our Story</Link>
              <span className="footer-nav-dot">•</span>
              <Link href="mailto:Bahamiansc@iCloud.com">Contact</Link>
            </div>
          </div>

        </div>

        {/* Bottom micro-bar */}
        <div className="bsc-footer-bottom">
          <span className="footer-bottom-left">
            Proudly Bahamian Owned · Dedrick Tamico Storr Snr &amp; Jaquel Rolle-Storr &amp; Family
          </span>
          <span className="footer-bottom-right">
            bscbahamas.com
          </span>
        </div>
      </footer>
    </>
  );
}