// lib/founder-ai/capture-gps.ts
//
// Browser geolocation helper for Universal Inventory Intake. Captures
// lat/lng + ISO timestamp on every photo upload. GPS denied is NOT a
// blocker — the photo still uploads, the submission just gets flagged
// with gps_status='denied' so the approval queue can surface an amber
// dot for Dedrick.
//
// Used by app/founder-ai/products/intake/page.tsx on every photo capture.

export interface PhotoGeoMeta {
  captured_at:      string;                    // ISO timestamp
  latitude:         number | null;
  longitude:        number | null;
  accuracy_meters:  number | null;
  gps_status:       'captured' | 'denied' | 'unavailable' | 'timeout';
}

export async function capturePhotoGeoMeta(): Promise<PhotoGeoMeta> {
  const captured_at = new Date().toISOString();

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return { captured_at, latitude: null, longitude: null,
             accuracy_meters: null, gps_status: 'unavailable' };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        captured_at,
        latitude:        pos.coords.latitude,
        longitude:       pos.coords.longitude,
        accuracy_meters: pos.coords.accuracy,
        gps_status:      'captured',
      }),
      (err) => resolve({
        captured_at,
        latitude:        null,
        longitude:       null,
        accuracy_meters: null,
        gps_status:      err.code === 1 ? 'denied' : 'timeout',
      }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}
