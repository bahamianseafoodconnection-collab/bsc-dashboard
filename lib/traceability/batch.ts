// Traceability helpers — client-side GPS capture, phase labels.
// Batch numbers are generated server-side via the SQL function
// generate_batch_number(vendor_type). This file only handles the
// pieces clients need: phase names + a small geolocation utility.

export type VendorType = 'fisherman' | 'farmer' | 'other';

export interface PhaseDef {
  number: 1 | 2 | 3;
  key:    string;     // matches traceability_phases.phase_label
  title:  string;
  hint:   string;
  emoji:  string;
}

export const FISHERMAN_PHASES: PhaseDef[] = [
  { number: 1, key: 'harbour_departure', title: 'Harbour departure',    hint: 'Vessel + permission to leave the harbour today.',                emoji: '⚓' },
  { number: 2, key: 'first_catch',       title: 'First catch',           hint: 'First product hauled — freshness + handling from dinghy → main vessel freezer.', emoji: '🎣' },
  { number: 3, key: 'final_fishing',     title: 'Final fishing day',     hint: 'Last catch / return to harbour.',                                emoji: '🚤' },
];

export const FARMER_PHASES: PhaseDef[] = [
  { number: 1, key: 'seeding',           title: 'Seeding begins',        hint: 'Planting / seeding for this crop.',                              emoji: '🌱' },
  { number: 2, key: 'first_ready_crop',  title: 'First ready crop',      hint: 'First product ready for harvest.',                               emoji: '🥬' },
  { number: 3, key: 'final_harvest',     title: 'Final harvest',         hint: 'Complete harvest of this batch.',                                emoji: '🚜' },
];

export function phasesFor(vendorType: VendorType): PhaseDef[] {
  if (vendorType === 'fisherman') return FISHERMAN_PHASES;
  if (vendorType === 'farmer')    return FARMER_PHASES;
  // Generic "other" vendor still gets 3 phases — caller can rename.
  return [
    { number: 1, key: 'phase_1', title: 'Phase 1', hint: 'Start of batch.',  emoji: '📍' },
    { number: 2, key: 'phase_2', title: 'Phase 2', hint: 'Mid-point.',       emoji: '📍' },
    { number: 3, key: 'phase_3', title: 'Phase 3', hint: 'Final.',           emoji: '📍' },
  ];
}

export interface GeoFix {
  latitude:    number;
  longitude:   number;
  accuracy_m:  number;
  captured_at: string;       // ISO timestamp
}

/**
 * Best-effort browser geolocation read. Returns null when the device
 * doesn't support geolocation, the user denies, or it times out.
 */
export function captureGps(timeoutMs = 8000): Promise<GeoFix | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude:    pos.coords.latitude,
        longitude:   pos.coords.longitude,
        accuracy_m:  pos.coords.accuracy,
        captured_at: new Date(pos.timestamp).toISOString(),
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

export function gmapsLink(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (lat == null || lng == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function batchNumberPreview(vendorType: VendorType): string {
  const prefix = vendorType === 'fisherman' ? 'BSC-FISH' : vendorType === 'farmer' ? 'BSC-FARM' : 'BSC-VEND';
  const d = new Date();
  const dd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;
  return `${prefix}-${dd}-NNN`;
}
