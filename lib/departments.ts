// lib/departments.ts
//
// Single source of truth for customer-facing "Shop by Department". Each
// department maps 1:1 to a real products.category value (the BSC category
// enum) — verified against live data 2026-05-29. Used by the marketplace
// category strip, the account sidebar, and the /category/[slug] pages so a
// customer's department ALWAYS matches the BSC category a product is filed
// under (no lossy "Seafood"/"Other" bucketing).
//
// To add a department: add the row here with the exact products.category
// value. slug is the URL form (underscores → hyphens).

export type Department = {
  /** Exact products.category value. */
  value: string;
  /** URL slug for /category/[slug]. */
  slug: string;
  label: string;
  emoji: string;
  blurb: string;
};

export const DEPARTMENTS: Department[] = [
  { value: 'frozen_seafood', slug: 'frozen-seafood', label: 'Frozen Seafood', emoji: '🦐',
    blurb: 'Bahamian-caught seafood, cold-chain frozen at Spiny Tail Processing — lobster, snapper, grouper, conch and more.' },
  { value: 'fresh_seafood',  slug: 'fresh-seafood',  label: 'Fresh Seafood',  emoji: '🐟',
    blurb: 'Fresh off the boat from Nassau captains, handled cold every step.' },
  { value: 'frozen_meat',    slug: 'frozen-meat',    label: 'Frozen Meat',    emoji: '🥩',
    blurb: 'Beef, chicken, pork and more — kept at processing temperatures, ready to ship.' },
  { value: 'meat',           slug: 'meat',           label: 'Meat',           emoji: '🍖',
    blurb: 'Premium cuts for Bahamian kitchens and restaurants.' },
  { value: 'produce',        slug: 'produce',        label: 'Produce',        emoji: '🥦',
    blurb: 'Fresh fruit and vegetables, local when in season, delivered cold.' },
  { value: 'grocery',        slug: 'grocery',        label: 'Grocery',        emoji: '🛒',
    blurb: 'Everyday pantry and kitchen staples for home and business.' },
  { value: 'dry_goods',      slug: 'dry-goods',      label: 'Dry Goods',      emoji: '🌾',
    blurb: 'Rice, flour, sugar, oils — the shelf-stable basics, retail and bulk.' },
  { value: 'snack',          slug: 'snacks',         label: 'Snacks',         emoji: '🍿',
    blurb: 'Chips, crackers, sweets and grab-and-go snacks.' },
  { value: 'spices',         slug: 'spices',         label: 'Spices',         emoji: '🧂',
    blurb: 'Seasonings and spices for authentic Bahamian cooking.' },
  { value: 'beverages',      slug: 'beverages',      label: 'Beverages',      emoji: '🥤',
    blurb: 'Drinks, juices and water — singles to wholesale cases.' },
  { value: 'household',      slug: 'household',      label: 'Household',      emoji: '🧽',
    blurb: 'Cleaning and home essentials for every Bahamian household.' },
  { value: 'toiletries',     slug: 'toiletries',     label: 'Toiletries',     emoji: '🧴',
    blurb: 'Personal care and toiletries, stocked alongside your grocery run.' },
];

export const departmentBySlug  = (slug: string): Department | undefined =>
  DEPARTMENTS.find((d) => d.slug === slug.toLowerCase());

export const departmentByValue = (value: string): Department | undefined =>
  DEPARTMENTS.find((d) => d.value === value);
