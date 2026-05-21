// components/intake/GpsBadge.tsx
//
// Tiny pill showing the GPS status of a photo upload. Used on the
// approval queue (/founder-ai/products/pending) and inline on the
// intake form after a photo is selected so the submitter sees whether
// the location was captured.

import type { PhotoGeoMeta } from '@/lib/founder-ai/capture-gps';

const STATUS_STYLE: Record<PhotoGeoMeta['gps_status'], { bg: string; fg: string; icon: string; label: string }> = {
  captured:    { bg: 'rgba(74,222,128,0.18)',  fg: '#4ade80', icon: '📍', label: 'GPS captured' },
  denied:      { bg: 'rgba(251,191,36,0.18)',  fg: '#fbbf24', icon: '🚫', label: 'GPS denied' },
  unavailable: { bg: 'rgba(148,163,184,0.18)', fg: '#94a3b8', icon: '∅',  label: 'GPS unavailable' },
  timeout:     { bg: 'rgba(251,191,36,0.18)',  fg: '#fbbf24', icon: '⏱',  label: 'GPS timeout' },
};

export default function GpsBadge({ geo }: { geo: PhotoGeoMeta | null | undefined }) {
  if (!geo) {
    return (
      <span style={{ background: 'rgba(148,163,184,0.18)', color: '#94a3b8', border: '1px solid #94a3b8', borderRadius: 12, padding: '2px 8px', fontSize: 10, fontWeight: 800, letterSpacing: 0.4 }}>
        ∅ no GPS
      </span>
    );
  }
  const s = STATUS_STYLE[geo.gps_status];
  return (
    <span
      title={geo.latitude != null && geo.longitude != null
        ? `${geo.latitude.toFixed(4)}, ${geo.longitude.toFixed(4)} ±${geo.accuracy_meters?.toFixed(0) ?? '?'}m @ ${new Date(geo.captured_at).toLocaleTimeString()}`
        : `Status: ${geo.gps_status} @ ${new Date(geo.captured_at).toLocaleTimeString()}`}
      style={{
        background: s.bg, color: s.fg, border: `1px solid ${s.fg}`,
        borderRadius: 12, padding: '2px 8px', fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}>
      {s.icon} {s.label}
    </span>
  );
}
