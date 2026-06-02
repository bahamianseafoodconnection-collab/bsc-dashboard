// /api/flyers/compose
//
// Server-side flyer renderer for Founder AI. Built on Next.js's
// edge ImageResponse (next/og). Renders a portrait 1080x1920 PNG
// (Instagram story / WhatsApp share) and uploads it to the
// site-images Supabase bucket.
//
// Founder AI calls this via the compose_flyer tool with a tiny
// spec — every BSC fact (logo, brand colors, address, phone,
// trust badges, tagline) is filled in from defaults below. The
// only per-request variables are: product photo, headline, price,
// price units, day-of-week ribbon, optional second callout.
//
// Per feedback_founder_ai_assumes_context — never ask the founder
// for things we already know.

import { NextRequest, NextResponse } from 'next/server';
import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'edge';

// BSC brand defaults — owned here so Founder AI never has to pass them.
const BRAND = {
  NAVY:        '#060d1f',
  NAVY_DARK:   '#040918',
  PURPLE:      '#3b1f6a',     // alt background used on the Saturday Snow Crab piece
  GOLD:        '#f5c518',
  GOLD_DARK:   '#c8860f',
  WHITE:       '#ffffff',
  RED:         '#dc2626',
  PRICE_RED:   '#b91c1c',
  CHARCOAL:    '#1f2937',
  PHONE:       '361-3474',
  ADDRESS:     'FIRE TRAIL ROAD, NASSAU, BAHAMAS',
  TAGLINE:     'BSC MARKET PLACE — YOUR SEAFOOD WHOLESALE PARTNER',
  LOGO_URL:    'https://www.bscbahamas.com/brand/bsc-marketplace-logo.png',
  BUCKET:      'site-images',
} as const;

// Body the Founder AI compose_flyer tool sends. Everything optional
// except `headline` + `price` — the rest defaults to BSC house style.
interface FlyerSpec {
  headline:       string;     // e.g. "CONCH SPECIAL"
  price:          string;     // e.g. "$75.00" or "75.00"
  price_unit?:    string;     // e.g. "PER 10LB BAG" / "PER CASE" / "EACH" / "TODAY ONLY"
  day_ribbon?:    string;     // e.g. "TUESDAY SPECIAL" / "TODAY ONLY" / "WEEKEND DEAL"
  product_photo?: string;     // URL — defaults to a placeholder if missing
  background?:    'navy' | 'purple' | 'gold';
  secondary_line?: string;    // optional tagline above the price card
  upload?:        boolean;    // when true, upload to Storage and return URL; when false, stream the PNG inline
}

function pickBackground(b: FlyerSpec['background']): { primary: string; deep: string } {
  if (b === 'purple') return { primary: BRAND.PURPLE, deep: '#23104a' };
  if (b === 'gold')   return { primary: BRAND.GOLD,   deep: BRAND.GOLD_DARK };
  return { primary: BRAND.NAVY, deep: BRAND.NAVY_DARK };
}

function normalizePrice(p: string): { dollars: string; cents: string } {
  const cleaned = p.replace(/[^0-9.]/g, '');
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0) {
    return { dollars: '0', cents: '00' };
  }
  const fixed = num.toFixed(2);
  const [d, c] = fixed.split('.');
  return { dollars: d, cents: c };
}

function renderFlyer(spec: FlyerSpec): ImageResponse {
  const bg = pickBackground(spec.background);
  const { dollars, cents } = normalizePrice(spec.price);
  const ribbon = (spec.day_ribbon || 'TODAY ONLY').toUpperCase();
  const unit   = (spec.price_unit || 'TODAY ONLY').toUpperCase();
  const secondary = spec.secondary_line ? spec.secondary_line.toUpperCase() : '';

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width:  '100%',
          height: '100%',
          background: `linear-gradient(180deg, ${bg.primary} 0%, ${bg.deep} 100%)`,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          color: BRAND.WHITE,
          position: 'relative',
          padding: 0,
        }}
      >
        {/* Top bar — BSC Market Place logo (top-right) + day ribbon (top-left) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '48px 56px 0 56px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: BRAND.GOLD,
              color: BRAND.NAVY,
              padding: '14px 28px',
              borderRadius: 8,
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: 2,
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            }}
          >
            {ribbon}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.LOGO_URL} alt="BSC" width={210} height={210} style={{ background: BRAND.WHITE, borderRadius: 18, padding: 8 }} />
          </div>
        </div>

        {/* Headline — massive condensed display */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '32px 56px 0 56px' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 168,
              fontWeight: 900,
              lineHeight: 0.95,
              letterSpacing: -2,
              color: BRAND.WHITE,
              textTransform: 'uppercase',
              textShadow: '0 4px 16px rgba(0,0,0,0.4)',
            }}
          >
            {spec.headline.toUpperCase()}
          </div>
          {secondary && (
            <div style={{ display: 'flex', marginTop: 12, fontSize: 36, fontWeight: 700, color: BRAND.GOLD, letterSpacing: 1 }}>
              {secondary}
            </div>
          )}
        </div>

        {/* Hero photo + price card row */}
        <div style={{ display: 'flex', flex: 1, padding: '40px 56px', alignItems: 'center', gap: 32 }}>
          {/* Price card */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: BRAND.WHITE,
              padding: '32px 28px',
              borderRadius: 18,
              boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
              minWidth: 360,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', color: BRAND.PRICE_RED }}>
              <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1, marginRight: 8 }}>$</div>
              <div style={{ fontSize: 168, fontWeight: 900, lineHeight: 1, letterSpacing: -4 }}>{dollars}</div>
              <div style={{ fontSize: 56, fontWeight: 900, lineHeight: 1, marginLeft: 4 }}>.{cents}</div>
            </div>
            <div style={{ display: 'flex', marginTop: 14, fontSize: 32, fontWeight: 800, color: BRAND.NAVY, letterSpacing: 1 }}>
              {unit}
            </div>
          </div>

          {/* Product photo */}
          {spec.product_photo ? (
            <div
              style={{
                display: 'flex',
                flex: 1,
                height: 720,
                borderRadius: 24,
                overflow: 'hidden',
                boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={spec.product_photo} alt="" width={620} height={720} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flex: 1,
                height: 720,
                borderRadius: 24,
                background: 'rgba(255,255,255,0.08)',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 240,
              }}
            >
              🐟
            </div>
          )}
        </div>

        {/* Bottom contact bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            margin: '0 56px 24px 56px',
            padding: '20px 32px',
            background: 'rgba(255,255,255,0.08)',
            border: `2px solid ${BRAND.GOLD}`,
            borderRadius: 18,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                display: 'flex',
                width: 56,
                height: 56,
                background: '#25d366',
                borderRadius: '50%',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 32,
                color: '#fff',
              }}
            >
              💬
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: BRAND.WHITE, letterSpacing: 2 }}>WHATSAPP OR CALL</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: BRAND.GOLD, letterSpacing: 1 }}>US TODAY</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                display: 'flex',
                width: 56,
                height: 56,
                background: 'rgba(255,255,255,0.12)',
                border: `2px solid ${BRAND.GOLD}`,
                borderRadius: '50%',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                color: BRAND.GOLD,
              }}
            >
              📞
            </div>
            <div style={{ fontSize: 56, fontWeight: 900, color: BRAND.WHITE, letterSpacing: 2 }}>{BRAND.PHONE}</div>
          </div>
        </div>

        {/* Address strip (yellow band at the very bottom) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px 56px',
            background: BRAND.GOLD,
            color: BRAND.NAVY,
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: 3,
          }}
        >
          📍 {BRAND.ADDRESS}
        </div>
      </div>
    ),
    {
      width:  1080,
      height: 1920,
    },
  );
}

export async function POST(req: NextRequest) {
  let body: FlyerSpec;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.headline || !body.price) {
    return NextResponse.json({ ok: false, error: 'headline + price required' }, { status: 400 });
  }

  const image = renderFlyer(body);

  // If upload=false, stream the PNG straight back (useful for quick
  // preview in the dashboard).
  if (body.upload === false) {
    return image;
  }

  // Otherwise: persist to site-images so the URL can be shared.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !svc) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 500 });
  }
  const admin = createClient(url, svc, { auth: { autoRefreshToken: false, persistSession: false } });

  const buf = await image.arrayBuffer();
  const slug = (body.headline || 'flyer').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-|-$/g, '');
  const path = `flyers/${new Date().toISOString().slice(0, 10)}/${slug}-${Date.now()}.png`;

  const { error: upErr } = await admin.storage
    .from(BRAND.BUCKET)
    .upload(path, new Uint8Array(buf), { contentType: 'image/png', upsert: false });
  if (upErr) return NextResponse.json({ ok: false, error: `Upload failed: ${upErr.message}` }, { status: 500 });

  const { data: pub } = admin.storage.from(BRAND.BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, image_url: pub.publicUrl, path });
}
