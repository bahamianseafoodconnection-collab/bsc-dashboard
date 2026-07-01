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
  { value: 'poultry',        slug: 'poultry',        label: 'Poultry',        emoji: '🍗',
    blurb: 'Chicken, turkey and poultry — retail and bulk.' },
  { value: 'dairy_eggs',     slug: 'dairy-eggs',     label: 'Dairy & Eggs',   emoji: '🥚',
    blurb: 'Milk, cheese, butter and eggs, kept cold.' },
  // General merchandise (added 2026-07) — hardware, auto & everyday goods.
  { value: 'hardware',       slug: 'hardware',       label: 'Hardware',       emoji: '🔩',
    blurb: 'Fasteners, fittings and general hardware for home and job site.' },
  { value: 'automotive',     slug: 'automotive',     label: 'Automotive',     emoji: '🚗',
    blurb: 'Oils, fluids, parts and accessories for your vehicle.' },
  { value: 'tools',          slug: 'tools',          label: 'Tools',          emoji: '🛠️',
    blurb: 'Hand and power tools for every trade.' },
  { value: 'electrical',     slug: 'electrical',     label: 'Electrical',     emoji: '💡',
    blurb: 'Wiring, fixtures, breakers and electrical supplies.' },
  { value: 'plumbing',       slug: 'plumbing',       label: 'Plumbing',       emoji: '🚿',
    blurb: 'Pipes, fittings, valves and plumbing essentials.' },
  { value: 'building_materials', slug: 'building-materials', label: 'Building Materials', emoji: '🧱',
    blurb: 'Cement, lumber, board and construction supplies.' },
  { value: 'office_supplies', slug: 'office-supplies', label: 'Office Supplies', emoji: '🖇️',
    blurb: 'Paper, pens, folders and everything for the office.' },
  { value: 'electronics',    slug: 'electronics',    label: 'Electronics',    emoji: '🔌',
    blurb: 'Small electronics, batteries, cables and accessories.' },
  { value: 'packaging',      slug: 'packaging',      label: 'Packaging & Disposables', emoji: '📦',
    blurb: 'Cups, containers, bags and food-service disposables.' },
  { value: 'kitchenware',    slug: 'kitchenware',    label: 'Kitchenware',    emoji: '🍳',
    blurb: 'Pots, pans, utensils and kitchen essentials.' },
  { value: 'apparel',        slug: 'apparel',        label: 'Apparel',        emoji: '👕',
    blurb: 'Workwear, uniforms and everyday clothing.' },
  { value: 'pet_supplies',   slug: 'pet-supplies',   label: 'Pet Supplies',   emoji: '🐾',
    blurb: 'Food, treats and supplies for pets.' },
  { value: 'health',         slug: 'health',         label: 'Health',         emoji: '💊',
    blurb: 'Over-the-counter health, first-aid and wellness items.' },
  { value: 'lawn_garden',    slug: 'lawn-garden',    label: 'Lawn & Garden',  emoji: '🌱',
    blurb: 'Soil, plants, tools and outdoor supplies.' },
  { value: 'party_supplies', slug: 'party-supplies', label: 'Party Supplies', emoji: '🎉',
    blurb: 'Decorations, tableware and everything for the celebration.' },
];

export const departmentBySlug  = (slug: string): Department | undefined =>
  DEPARTMENTS.find((d) => d.slug === slug.toLowerCase());

export const departmentByValue = (value: string): Department | undefined =>
  DEPARTMENTS.find((d) => d.value === value);
