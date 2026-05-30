// lib/deals.ts
//
// Single source of truth for the marketplace deal categories.
// Each entry maps the URL slug used in /market?deal=<slug> to the
// products pricing_channel value (added 2026-05-29). Setting a per-product
// margin on the deal channel in the inventory spreadsheet lists that
// product under the matching deal card.

export type DealKey = 'today' | 'hot' | 'weekly' | 'close-dated' | 'bulk';

export type Deal = {
  slug:    DealKey;
  channel: string;   // exact product_pricing.channel enum value
  label:   string;
};

export const DEALS: ReadonlyArray<Deal> = [
  { slug: 'today',       channel: 'today_deals',     label: "Today's Deals" },
  { slug: 'hot',         channel: 'hot_deals',       label: 'Hot Deals' },
  { slug: 'weekly',      channel: 'weekly_specials', label: 'Weekly Specials' },
  { slug: 'close-dated', channel: 'close_dated',     label: 'Close Dated Products' },
  { slug: 'bulk',        channel: 'bulk_deals',      label: 'Bulk Deals' },
];

export const dealBySlug    = (slug: string): Deal | undefined => DEALS.find((d) => d.slug    === slug);
export const dealByChannel = (ch: string):   Deal | undefined => DEALS.find((d) => d.channel === ch);
