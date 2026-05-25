# BSC Marketplace landing — photo manifest

Drop each photo at the exact filename listed below. The landing
(`app/page.tsx`) uses these names directly — once a file exists at the
expected path, the placeholder tile keeps showing until you swap the
`<PhotoSlot>` for a `<Image>` (see "Activation" at the bottom).

All photos: **dark / premium / Bahamian seafood marketplace tone.**
Match the navy `#020B1C` + gold `#F5C518` palette wherever possible.

## Manifest

| # | Filename | Aspect | Recommended size | Use |
|---|---|---|---|---|
| 1 | `hero-seafood-lobster-fish.jpg` | 4:5 mobile / 4:3 desktop / 1:1 large | ≥ 1600 × 1600 | Main hero photo, right side. Lobster, fish, shrimp on ice, lemon, dark ocean lighting. |
| 2 | `ocean-dark-texture.jpg` | wide | 1920 × 600 | Optional full-hero overlay texture. Dark navy ocean water, subtle blue highlights. *(not currently rendered — reserved for a future overlay)* |
| 3 | `bsc-direct-wholesale-boxes.jpg` | 4:3 | ≥ 1200 × 900 | BSC Direct Wholesale gold card, right side. Stacked wholesale boxes / warehouse pallets / delivery supply. |
| 4 | `shop-bsc-online-marketplace.jpg` | 4:3 | ≥ 1200 × 900 | "Shop BSC Online" service card (first position). Branded online marketplace mockup / curated delivery box / shopping flatlay on dark premium bg. |
| 5 | `fresh-catch-tuna.jpg` | 4:3 | ≥ 1200 × 900 | "Fresh from Bahamian Fishermen" service card. Premium fish on ice, dark blue tone. |
| 6 | `farm-fresh-produce.jpg` | 4:3 | ≥ 1200 × 900 | "From our Bahamian Farmers Farm" service card. Bahamian produce — greens, tomatoes, peppers. |
| 7 | `pay-bills-lightning.jpg` | 4:3 | ≥ 1200 × 900 | "Pay your bills" service card. Gold lightning / electric payment energy. |
| 8 | `category-seafood-lobster.jpg` | 4:5 | ≥ 900 × 1100 | "Seafood" category tile. Lobster on ice. |
| 9 | `category-meat-steak.jpg` | 4:5 | ≥ 900 × 1100 | "Meat" category tile. Premium steak cuts on dark bg. |
| 10 | `category-produce-market.jpg` | 4:5 | ≥ 900 × 1100 | "Produce" category tile. Colorful fresh vegetables. |
| 11 | `category-beverages.jpg` | 4:5 | ≥ 900 × 1100 | "Beverages" category tile. Water, sodas, juices, grocery display. |
| 12 | `bahamas-flag-icon.png` | square | 128 × 128 | Optional — header circle / hero badge / footer brand. Currently the flag emoji renders inline; this PNG is only needed if a custom flag asset is preferred. |
| 13 | `bsc-logo-gold.png` | flexible | varies | Optional brand mark / watermark. The existing `/public/brand/bsc-marketplace-logo.png` is already used wherever logos appear. |

## Activation

Today every slot shows a branded placeholder with the filename so you
can verify the layout while photos are being sourced. When a real photo
is dropped at the expected path, the placeholder still shows — final
step is to switch from `<PhotoSlot>` to `next/image` for that slot.

A one-line edit per slot inside `app/page.tsx` activates the real
photo. Example for the hero:

```tsx
// Before (placeholder only):
<PhotoSlot
  filename="hero-seafood-lobster-fish.jpg"
  alt="Fresh Bahamian seafood — lobster, fish, shrimp on ice"
  aspectClass="aspect-[4/5] sm:aspect-[4/3] lg:aspect-square"
  ring
/>

// After (real photo + placeholder behind as fail-safe):
<div className="relative w-full aspect-[4/5] sm:aspect-[4/3] lg:aspect-square rounded-3xl overflow-hidden ring-1 ring-gold-brand/30 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
  <Image
    src="/images/homepage/hero-seafood-lobster-fish.jpg"
    alt="Fresh Bahamian seafood — lobster, fish, shrimp on ice"
    fill
    priority
    sizes="(max-width: 1024px) 100vw, 50vw"
    className="object-cover"
  />
</div>
```

Replace each `<PhotoSlot>` instance the same way as the photos arrive.
Don't have to do all 11 at once — mix and match works.

## Notes

- Files NOT committed to the repo. Large/binary photos belong in cloud
  storage or Vercel's static folder, dropped per deploy.
- The `bahamas-flag-icon.png` slot uses the emoji 🇧🇸 in the current
  build. Replace with a PNG via an `<img>` element if a custom asset is
  desired.
- Prefer JPG for photographs (smaller than PNG). PNG only for logos /
  flags / graphics with transparency.
- Compress before upload — TinyPNG or similar; aim for < 300 KB per hero,
  < 150 KB per card.
