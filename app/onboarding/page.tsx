'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const SLIDES = [
  {
    emoji: '🐟',
    bg: 'linear-gradient(160deg, #0a1628 0%, #1a2e5a 60%, #243d78 100%)',
    tag: 'FRESH FROM THE SEA',
    title: 'Grouper. Snapper.\nConch. Lobster.',
    sub: 'Premium Bahamian seafood sourced fresh daily — delivered straight to your door.',
    accent: '#f4c842',
    img: 'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images/seafood-banner.jpg',
  },
  {
    emoji: '🥩',
    bg: 'linear-gradient(160deg, #1a0a00 0%, #3d1a00 60%, #5a2800 100%)',
    tag: 'PREMIUM MEATS',
    title: 'Ribeye. Strip.\nChops. Chicken.',
    sub: 'Cut fresh, priced right. Quality meats for every Bahamian table.',
    accent: '#f4c842',
    img: 'https://qgcaxkyuhwmpvpbooaqw.supabase.co/storage/v1/object/public/site-images/meats-banner.jpg',
  },
  {
    emoji: '🚚',
    bg: 'linear-gradient(160deg, #001a0a 0%, #003d1a 60%, #005a28 100%)',
    tag: 'NASSAU & ANDROS',
    title: 'Delivery or\nPickup. You Choose.',
    sub: 'Fast delivery across Nassau. Island shipping to Andros. WhatsApp receipt every time.',
    accent: '#4ade80',
    img: null,
  },
  {
    emoji: '⚡',
    bg: 'linear-gradient(160deg, #1a1000 0%, #3d2800 60%, #5a3d00 100%)',
    tag: 'SHOP. PAY. SAVE.',
    title: 'Pay Bills.\nBuy Cars. All Here.',
    sub: 'Utility bill payments, vehicles, auto parts — one app for everything Nassau needs.',
    accent: '#f4c842',
    img: null,
  },
];

export default function OnboardingPage() {
  const [slide, setSlide]       = useState(0);
  const [animating, setAnimating] = useState(false);
  const [exiting, setExiting]   = useState(false);

  // Auto advance
  useEffect(() => {
    if (slide >= SLIDES.length - 1) return;
    const t = setTimeout(() => advance(), 4000);
    return () => clearTimeout(t);
  }, [slide]);

  function advance() {
    if (animating || slide >= SLIDES.length - 1) return;
    setExiting(true);
    setTimeout(() => {
      setSlide((s) => s + 1);
      setExiting(false);
    }, 300);
  }

  function goTo(i: number) {
    if (i === slide || animating) return;
    setExiting(true);
    setTimeout(() => {
      setSlide(i);
      setExiting(false);
    }, 250);
  }

  const current = SLIDES[slide];
  const isLast  = slide === SLIDES.length - 1;

  return (
    <div style={{ minHeight: '100vh', width: '100%', fontFamily: 'system-ui, -apple-system, sans-serif', position: 'relative', overflow: 'hidden' }}>

      {/* BACKGROUND */}
      <div style={{
        position: 'fixed', inset: 0,
        background: current.bg,
        transition: 'background 0.6s ease',
      }} />

      {/* BG PHOTO */}
      {current.img && (
        <div style={{
          position: 'fixed', inset: 0,
          backgroundImage: `url('${current.img}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.18,
          transition: 'opacity 0.6s ease',
        }} />
      )}

      {/* CONTENT */}
      <div style={{
        position: 'relative', zIndex: 10,
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        padding: '0 0 40px',
      }}>

        {/* TOP BAR */}
        <div style={{ padding: '52px 28px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* BSC Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 44 44" width="28" height="28" fill="none">
                <path d="M10 24c3-5 9-8 15-7s11 5 11 9c0 0-5-3-11-2s-10 4-15 0z" fill="#f4c842" />
                <ellipse cx="28" cy="19" rx="6" ry="4" fill="#38bdf8" opacity="0.9" />
                <circle cx="30" cy="18" r="1.2" fill="white" />
                <path d="M34 21 l5-3 l-1.5 3 l1.5 3z" fill="#f4c842" />
              </svg>
            </div>
            <div>
              <div style={{ color: '#fff', fontWeight: 900, fontSize: '15px', letterSpacing: '-0.3px' }}>BSC</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '8px', letterSpacing: '2px', textTransform: 'uppercase' }}>Marketplace</div>
            </div>
          </div>

          {/* Skip */}
          {!isLast && (
            <Link href="/market" style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', fontWeight: 600, textDecoration: 'none', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.15)' }}>
              Skip
            </Link>
          )}
        </div>

        {/* HERO AREA */}
        <div style={{
          flex: 1,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '40px 28px 20px',
          opacity: exiting ? 0 : 1,
          transform: exiting ? 'translateY(12px)' : 'translateY(0)',
          transition: 'opacity 0.3s ease, transform 0.3s ease',
        }}>

          {/* Big emoji */}
          <div style={{
            fontSize: '88px',
            marginBottom: '32px',
            filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.4))',
            lineHeight: 1,
          }}>
            {current.emoji}
          </div>

          {/* Tag */}
          <div style={{
            backgroundColor: 'rgba(255,255,255,0.08)',
            border: `1px solid ${current.accent}40`,
            color: current.accent,
            fontSize: '11px', fontWeight: 800,
            letterSpacing: '2px',
            padding: '5px 14px', borderRadius: '20px',
            marginBottom: '20px',
          }}>
            {current.tag}
          </div>

          {/* Title */}
          <h1 style={{
            color: '#fff',
            fontWeight: 900,
            fontSize: 'clamp(32px, 8vw, 52px)',
            lineHeight: 1.1,
            textAlign: 'center',
            margin: '0 0 20px',
            whiteSpace: 'pre-line',
            letterSpacing: '-0.5px',
          }}>
            {current.title}
          </h1>

          {/* Sub */}
          <p style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: '15px',
            lineHeight: 1.6,
            textAlign: 'center',
            margin: 0,
            maxWidth: '340px',
          }}>
            {current.sub}
          </p>
        </div>

        {/* DOTS */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '32px' }}>
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              style={{
                width: i === slide ? '28px' : '8px',
                height: '8px',
                borderRadius: '20px',
                backgroundColor: i === slide ? current.accent : 'rgba(255,255,255,0.25)',
                border: 'none', cursor: 'pointer', padding: 0,
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* CTA BUTTONS */}
        <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {isLast ? (
            <>
              <Link href="/login" style={{
                display: 'block', textAlign: 'center',
                backgroundColor: current.accent,
                color: '#1a2e5a',
                fontWeight: 900, fontSize: '16px',
                padding: '16px', borderRadius: '16px',
                textDecoration: 'none',
                boxShadow: `0 8px 24px ${current.accent}50`,
              }}>
                Create Account — It&apos;s Free
              </Link>
              <Link href="/market" style={{
                display: 'block', textAlign: 'center',
                backgroundColor: 'rgba(255,255,255,0.08)',
                border: '1.5px solid rgba(255,255,255,0.2)',
                color: '#fff',
                fontWeight: 700, fontSize: '15px',
                padding: '15px', borderRadius: '16px',
                textDecoration: 'none',
              }}>
                Browse Market First
              </Link>
              <Link href="/login" style={{
                display: 'block', textAlign: 'center',
                color: 'rgba(255,255,255,0.45)',
                fontSize: '13px',
                padding: '8px',
                textDecoration: 'none',
              }}>
                Already have an account? Sign In
              </Link>
            </>
          ) : (
            <>
              <button
                onClick={advance}
                style={{
                  width: '100%',
                  backgroundColor: current.accent,
                  color: '#1a2e5a',
                  border: 'none', borderRadius: '16px',
                  padding: '16px',
                  fontWeight: 900, fontSize: '16px',
                  cursor: 'pointer',
                  boxShadow: `0 8px 24px ${current.accent}40`,
                }}
              >
                Next →
              </button>
              <Link href="/market" style={{
                display: 'block', textAlign: 'center',
                color: 'rgba(255,255,255,0.4)',
                fontSize: '13px', padding: '8px',
                textDecoration: 'none',
              }}>
                Skip to Market
              </Link>
            </>
          )}
        </div>

        {/* BOTTOM TRUST ROW */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '20px', padding: '0 24px' }}>
          {['🔒 Secure', '💬 WhatsApp', '🇧🇸 Bahamian'].map((item) => (
            <span key={item} style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', fontWeight: 600 }}>{item}</span>
          ))}
        </div>
      </div>
    </div>
  );
}