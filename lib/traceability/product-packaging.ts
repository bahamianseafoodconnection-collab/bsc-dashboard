// Industry-standard packaging defaults for BSC products. Surfaces in
// vendor listing forms + admin approval + Spiny Tail processing pages
// so operators don't memorise rules per product.

export interface PackagingProfile {
  /** Visible name of the product class — matched loosely (case-insensitive substring) against vendor_listings.title / product_type */
  key:            string;
  match:          string[];                 // lowercase substrings that flag this profile
  size_grades?:   string[];                 // e.g. lobster tail sizes
  package_lbs?:   number;                   // per-box weight (5 lb box for conch)
  master_case_lbs?: number;                 // per-master-case (40 lobster, 50 conch)
  shelf_life_days?: number;                 // typical shelf life when frozen-fresh
  notes?:         string;
}

export const PRODUCT_PACKAGING: PackagingProfile[] = [
  {
    key:    'lobster_tail',
    match:  ['lobster', 'spiny tail', 'spiny lobster'],
    size_grades: ['5oz', '6oz', '7oz', '8oz', '9oz', '10/12', '12/14', '14/16', '16/20', '20UP'],
    master_case_lbs: 40,
    shelf_life_days: 365,                   // frozen
    notes:  'Master case = 40 lbs of tails. Size grade required.',
  },
  {
    key:    'conch',
    match:  ['conch'],
    package_lbs:     5,                     // 5 lb box
    master_case_lbs: 50,
    shelf_life_days: 365,                   // processed + frozen
    notes:  '5 lb box × 10 boxes per 50 lb master case.',
  },
  {
    key:    'farm_crop',
    match:  ['tomato','pepper','cucumber','okra','onion','cabbage','lettuce','potato','plantain','banana','mango','papaya','watermelon','melon','pineapple','citrus','orange','lemon','lime','herb','greens'],
    package_lbs:     1,
    shelf_life_days: 7,
    notes:  'Sold by the pound, packed by crop type. Box size set per harvest.',
  },
];

export function suggestProfile(productHint: string | null | undefined): PackagingProfile | null {
  if (!productHint) return null;
  const q = productHint.toLowerCase();
  for (const p of PRODUCT_PACKAGING) {
    if (p.match.some((m) => q.includes(m))) return p;
  }
  return null;
}
