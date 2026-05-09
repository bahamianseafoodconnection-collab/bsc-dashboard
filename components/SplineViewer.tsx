'use client';

// components/SplineViewer.tsx
//
// Embeds a Spline 3D scene via Spline's official web component
// (<spline-viewer>). No npm package — the runtime loads from Spline's
// CDN as an ES module on first use, with a static image fallback
// rendered behind it for the loading beat (and as the only thing shown
// when no scene URL is configured or the scene errors).
//
// Usage:
//   <SplineViewer
//     scene={process.env.NEXT_PUBLIC_SPLINE_HERO}
//     fallback={HERO_IMG}
//     className="absolute inset-0 h-full w-full"
//   />

import React, { useEffect, useRef, useState } from 'react';

const SPLINE_VIEWER_SCRIPT =
  'https://unpkg.com/@splinetool/viewer@1.10.32/build/spline-viewer.js';

let scriptLoadingPromise: Promise<void> | null = null;
function loadSplineViewerScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;
  scriptLoadingPromise = new Promise((resolve, reject) => {
    if (customElements.get('spline-viewer')) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SPLINE_VIEWER_SCRIPT}"]`
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('spline-viewer script error')));
      return;
    }
    const s = document.createElement('script');
    s.type = 'module';
    s.src = SPLINE_VIEWER_SCRIPT;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('spline-viewer script error'));
    document.head.appendChild(s);
  });
  return scriptLoadingPromise;
}

type Props = {
  /** Spline scene URL (publish your scene + paste the .splinecode URL here) */
  scene?: string | null;
  /** Static image rendered behind the canvas while it loads + as a fallback */
  fallback?: string | null;
  alt?: string;
  /** Tailwind / inline className for both the canvas and the fallback image */
  className?: string;
};

export default function SplineViewer({
  scene,
  fallback,
  alt = '',
  className = '',
}: Props) {
  const [ready, setReady] = useState(false);
  const [errored, setErrored] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scene) return;
    let cancelled = false;
    loadSplineViewerScript()
      .then(() => { if (!cancelled) setReady(true); })
      .catch(() => { if (!cancelled) setErrored(true); });
    return () => { cancelled = true; };
  }, [scene]);

  // No scene configured (or it errored) — fall back to the static image.
  if (!scene || errored) {
    if (!fallback) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={fallback} alt={alt} className={className} />
    );
  }

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative' }}>
      {fallback && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fallback}
          alt={alt}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}
      {ready &&
        // <spline-viewer> is a custom web component registered by the
        // Spline runtime script. createElement avoids the JSX
        // IntrinsicElements check (which doesn't know about custom
        // elements) without polluting the global types.
        React.createElement('spline-viewer', {
          url: scene,
          style: {
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
          },
        })}
    </div>
  );
}
