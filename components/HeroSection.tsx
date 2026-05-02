'use client';

import Link from 'next/link';

const SUPABASE_URL = 'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images';

export default function HeroSection() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Montserrat:wght@400;600;700&display=swap');

        .hero-root {
          position: relative;
          width: 100%;
          height: 100vh;
          min-height: 600px;
          max-height: 900px;
          overflow: hidden;
          font-family: 'Montserrat', sans-serif;
        }

        /* Background image from Supabase */
        .hero-bg {
          position: absolute;
          inset: 0;
          background-image: url('${SUPABASE_URL}/hero.jpg');
          background-size: cover;
          background-position: center 30%;
          background-repeat: no-repeat;
          transform: scale(1.04);
          transition: transform 8s ease-out;
        }
        .hero-root:hover .hero-bg {
          transform: scale(1.00);
        }

        /* Dark overlay gradient */
        .hero-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            135deg,
            rgba(0,0,0,0.72) 0%,
            rgba(10,18,30,0.55) 40%,
            rgba(0,0,0,0.65) 100%
          );
        }

        /* Vignette edges */
        .hero-vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.6) 100%);
        }

        /* Content */
        .hero-content {
          position: relative;
          z-index: 10;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 0 1.5rem;
          animation: heroFadeUp 1s ease-out both;
        }

        @keyframes heroFadeUp {
          from { opacity: 0; transform: translateY(32px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Eyebrow */
        .hero-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          color: #d4a843;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          margin-bottom: 1.2rem;
          opacity: 0;
          animation: heroFadeUp 0.8s ease-out 0.2s both;
        }
        .hero-eyebrow::before,
        .hero-eyebrow::after {
          content: '';
          display: block;
          width: 36px;
          height: 1px;
          background: #d4a843;
          opacity: 0.7;
        }

        /* Main heading */
        .hero-heading {
          font-family: 'Playfair Display', serif;
          font-weight: 900;
          line-height: 1.0;
          margin: 0 0 1rem;
          opacity: 0;
          animation: heroFadeUp 0.9s ease-out 0.35s both;
        }
        .hero-heading-white {
          display: block;
          font-size: clamp(3rem, 8vw, 7rem);
          color: #ffffff;
          letter-spacing: -0.01em;
          text-shadow: 0 4px 32px rgba(0,0,0,0.5);
        }
        .hero-heading-gold {
          display: block;
          font-size: clamp(3rem, 8vw, 7rem);
          background: linear-gradient(135deg, #f5c842 0%, #d4a015 40%, #f0b429 70%, #c8860f 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          filter: drop-shadow(0 2px 16px rgba(212,160,21,0.4));
        }

        /* Divider */
        .hero-divider {
          width: 60px;
          height: 2px;
          background: linear-gradient(90deg, transparent, #d4a843, transparent);
          margin: 0.8rem auto 1.2rem;
          opacity: 0;
          animation: heroFadeUp 0.8s ease-out 0.5s both;
        }

        /* Subtitle */
        .hero-subtitle {
          font-size: clamp(0.85rem, 2.2vw, 1.1rem);
          font-weight: 600;
          color: #e8d5a3;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 2.2rem;
          opacity: 0;
          animation: heroFadeUp 0.8s ease-out 0.55s both;
        }
        .hero-subtitle-dot {
          color: #d4a843;
          margin: 0 0.6rem;
        }

        /* CTA Buttons */
        .hero-ctas {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          justify-content: center;
          opacity: 0;
          animation: heroFadeUp 0.8s ease-out 0.7s both;
        }

        .btn-primary {
          display: inline-block;
          padding: 0.95rem 2.6rem;
          background: linear-gradient(135deg, #f5c842 0%, #c8860f 100%);
          color: #0a0a0a;
          font-family: 'Montserrat', sans-serif;
          font-size: 0.82rem;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          text-decoration: none;
          border-radius: 3px;
          box-shadow: 0 4px 24px rgba(212,160,21,0.45), 0 1px 0 rgba(255,255,255,0.15) inset;
          transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
          position: relative;
          overflow: hidden;
        }
        .btn-primary::after {
          content: '';
          position: absolute;
          top: 0; left: -100%;
          width: 60%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent);
          transition: left 0.5s ease;
        }
        .btn-primary:hover::after { left: 150%; }
        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(212,160,21,0.55);
          filter: brightness(1.08);
        }
        .btn-primary:active { transform: translateY(0); }

        .btn-secondary {
          display: inline-block;
          padding: 0.95rem 2.2rem;
          background: transparent;
          color: #e8d5a3;
          font-family: 'Montserrat', sans-serif;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          text-decoration: none;
          border: 1.5px solid rgba(212,168,67,0.55);
          border-radius: 3px;
          transition: all 0.25s ease;
          backdrop-filter: blur(4px);
        }
        .btn-secondary:hover {
          border-color: #d4a843;
          color: #f5c842;
          background: rgba(212,168,67,0.1);
          transform: translateY(-2px);
        }

        /* Trust badges at bottom */
        .hero-trust {
          position: absolute;
          bottom: 2rem;
          left: 0;
          right: 0;
          display: flex;
          justify-content: center;
          gap: 2rem;
          z-index: 10;
          opacity: 0;
          animation: heroFadeUp 0.8s ease-out 0.9s both;
        }
        .hero-trust-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: rgba(232,213,163,0.8);
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .hero-trust-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #d4a843;
          opacity: 0.7;
        }

        /* Scroll cue */
        .hero-scroll {
          position: absolute;
          bottom: 1.5rem;
          right: 2rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          z-index: 10;
          opacity: 0;
          animation: heroFadeUp 0.8s ease-out 1.1s both;
        }
        .hero-scroll-label {
          font-size: 0.6rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: rgba(212,168,67,0.6);
          writing-mode: vertical-rl;
        }
        .hero-scroll-line {
          width: 1px;
          height: 40px;
          background: linear-gradient(to bottom, rgba(212,168,67,0.6), transparent);
          animation: scrollPulse 2s ease-in-out infinite;
        }
        @keyframes scrollPulse {
          0%, 100% { opacity: 0.4; transform: scaleY(1); }
          50%       { opacity: 1;   transform: scaleY(0.6); }
        }

        /* Mobile */
        @media (max-width: 640px) {
          .hero-trust { gap: 1rem; flex-wrap: wrap; padding: 0 1rem; }
          .hero-trust-item { font-size: 0.65rem; }
          .hero-scroll { display: none; }
          .btn-primary, .btn-secondary { padding: 0.85rem 1.6rem; font-size: 0.75rem; }
        }
      `}</style>

      <section className="hero-root">
        {/* Background */}
        <div className="hero-bg" />
        <div className="hero-overlay" />
        <div className="hero-vignette" />

        {/* Main content */}
        <div className="hero-content">
          <span className="hero-eyebrow">Bahamian Seafood Connection</span>

          <h1 className="hero-heading">
            <span className="hero-heading-white">SEAFOOD &amp;</span>
            <span className="hero-heading-gold">MEAT</span>
          </h1>

          <div className="hero-divider" />

          <p className="hero-subtitle">
            Premium Fresh
            <span className="hero-subtitle-dot">•</span>
            Straight from Ocean &amp; Farm
            <span className="hero-subtitle-dot">•</span>
            Nassau Delivered
          </p>

          <div className="hero-ctas">
            <Link href="/market" className="btn-primary">Shop Now</Link>
            <Link href="/local-wholesale" className="btn-secondary">Wholesale</Link>
            <Link href="/us-shopping" className="btn-secondary">Shop USA</Link>
          </div>
        </div>

        {/* Bottom trust bar */}
        <div className="hero-trust">
          {['Fresh Daily', 'Vacuum Sealed', 'Nassau Delivery', 'Proudly Bahamian'].map((item, i) => (
            <div key={item} className="hero-trust-item">
              {i > 0 && <span className="hero-trust-dot" />}
              {item}
            </div>
          ))}
        </div>

        {/* Scroll indicator */}
        <div className="hero-scroll">
          <span className="hero-scroll-label">Scroll</span>
          <div className="hero-scroll-line" />
        </div>
      </section>
    </>
  );
}