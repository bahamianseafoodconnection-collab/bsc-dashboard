'use client';

// Marketplace hero carousel of currently-live promotional flyers.
//
// "Live" = is_active=TRUE AND (now is within valid_from..valid_to if set).
// Rotates every 6 seconds. Click anywhere in a slide → cta_url. If no
// flyers are live, the banner stays hidden so the page doesn't reserve
// empty space.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Flyer {
  id:               string;
  title:            string;
  body:             string | null;
  image_url:        string | null;
  cta_label:        string;
  cta_url:          string;
  background_color: string;
  text_color:       string;
}

const ROTATE_MS = 6000;

export default function FlyerBanner() {
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [idx, setIdx]       = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from('flyers')
        .select('id, title, body, image_url, cta_label, cta_url, background_color, text_color, valid_from, valid_to')
        .eq('is_active', true)
        .or(`valid_from.is.null,valid_from.lte.${nowIso}`)
        .or(`valid_to.is.null,valid_to.gte.${nowIso}`)
        .order('display_order', { ascending: false })
        .order('created_at',    { ascending: false })
        .limit(10);
      if (!cancelled) setFlyers((data ?? []) as Flyer[]);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (flyers.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % flyers.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [flyers.length]);

  if (flyers.length === 0) return null;
  const f = flyers[idx];

  return (
    <section className="border-b border-slate-200">
      <div className="mx-auto max-w-screen-2xl px-3 sm:px-6 py-3">
        <Link href={f.cta_url}
          className="block overflow-hidden rounded-xl relative"
          style={{ backgroundColor: f.background_color }}>
          {f.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.image_url} alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-60"
              style={{ pointerEvents: 'none' }} />
          )}
          <div className="relative px-5 py-6 sm:px-8 sm:py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-2xl font-bold leading-tight"
                style={{ color: f.text_color, textShadow: f.image_url ? '0 1px 2px rgba(0,0,0,0.6)' : 'none' }}>
                {f.title}
              </h2>
              {f.body && (
                <p className="mt-1 text-sm sm:text-base opacity-90 max-w-2xl"
                  style={{ color: f.text_color, textShadow: f.image_url ? '0 1px 2px rgba(0,0,0,0.6)' : 'none' }}>
                  {f.body}
                </p>
              )}
            </div>
            <span className="shrink-0 inline-block rounded-full bg-white px-5 py-2 text-sm font-bold text-slate-900"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
              {f.cta_label} →
            </span>
          </div>
        </Link>

        {flyers.length > 1 && (
          <div className="mt-2 flex justify-center gap-1.5">
            {flyers.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)}
                aria-label={`Slide ${i + 1}`}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === idx ? 18 : 6,
                  backgroundColor: i === idx ? '#060d1f' : 'rgba(0,0,0,0.2)',
                }} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
