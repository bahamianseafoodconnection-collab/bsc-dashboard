# Bahamian Seafood Connection — Master Architecture & Build Plan

**Version 1.0 · 2026-06-07**
*Companion document to SYSTEM_AUDIT_2026-06-07.md*

---

## 1. The Vision

A single national e-commerce and operations platform for The Bahamas. Every customer — household or business — finds everything they need in one place, at retail or wholesale: seafood, meat, dry grocery, appliances, electrical, electronics, health & beauty, and building materials. Local suppliers and fishermen list their goods through their own portals. The Spiny Tail processing plant turns local catch into export-grade product. Every physical location, every delivery, and every catch is tracked live.

BSC is built to be inherited — encoded so that family and future staff can run it and understand the reasoning behind it, not just the buttons.

---

## 2. Architecture at a Glance

The whole platform fits on one card. This simplicity is the design goal, not a limitation — a system the founder and family can fully understand is a system that can be inherited and trusted.

        CUSTOMERS                STAFF / FOUNDER              SUPPLIERS / FISHERMEN
     phone · web · app          POS · dashboard               portal · intake
            |                         |                            |
            +-------------------------+----------------------------+
                                      |
                                      v
                          +------------------------+
                          |   NEXT.JS on VERCEL    |   one app · all surfaces
                          |   156 pages · 81 APIs  |
                          +-----------+------------+
                                      |
                          +-----------v------------+
                          |   SUPABASE POSTGRES    |   one source of truth
                          |  products · pricing ·  |
                          |  orders · customers ·  |
                          |  inventory · HACCP     |
                          +-----------+------------+
                                      |
              +-----------------------+-----------------------+
              v                       v                       v
        Plug'n Pay / RBC        Resend + Twilio          Claude (Founder AI)
          payments              receipts · alerts        intake · briefings

Three doors in. One app. One database. Three outside services. Nothing more is needed at Bahamian scale.

---

## 3. What Exists Today (Verified)

From the live audit: 156 pages, 81 API routes, ~107 tables, 30 components, 8 cron jobs. The platform is far more built than a typical early venture. Nearly every pillar of the vision already has a working surface.

- Public storefront + marketplace browse — LIVE (market, category, PDP, shop slices, US pipeline, vehicles)
- Customer accounts, cart, checkout — LIVE (login, onboarding, orders, wishlist)
- POS Nassau — LIVE
- POS Andros (Ceta's) — BUILT, operating on current prices
- Supplier portal (list → pending → approve) — BUILT
- Fishermen / captain / farmer intake — BUILT (landings + lobster intake w/ vessel + GPS)
- Export processing (Spiny Tail HACCP) — BUILT (full traceability, lots, audits, inspector views)
- Delivery tracking (/track) — SURFACE BUILT; live status wiring is Phase 6
- Founder AI — LIVE
- A/R, COGS, payroll, reports, dashboards — LIVE
- Online payment (Plug'n Pay) — SCAFFOLDED; wiring is Phase 6
- In-store card (RBC terminal) — LIVE

The conclusion: BSC does not have a build problem. It has a consistency problem — the same concept implemented more than one way, and the data layer drifted from the code layer. The work ahead is unification and finishing, not new construction.

---

## 4. The Keystone: One Pricing Engine

This is the single most important fix and the foundation everything else stands on.

The problem: pricing logic currently lives in four places that disagree.
1. lib/pricing.ts — client-side, still pre-fix (VAT disabled, old channel names)
2. bsc_set_channel_price — per-item RPC (corrected 2026-06-07: gross-up + VAT + formula mode)
3. bsc_apply_channel_margin — bulk RPC, BROKEN (no gross-up, no VAT, falsely tags rows manual_override) — the source of the poisoned margin data
4. channel_markups AND pricing_rules — two competing "source of truth" tables

Because there is no single source of truth, prices keep surprising us.

The target state — one writer, one store, one reader:
- One store: product_pricing holds the current price per product per channel.
- One writer: bsc_set_channel_price is the only function that computes and writes a price. Formula (locked, all channels): final = (cost × (1 + margin)) ÷ 0.96 × (1 + vat_rate)
- One bulk tool: bsc_apply_channel_margin, rewritten as a safe loop over the single writer — gross-up + VAT correct, honest formula tag, and a hard skip on any price_locked row.
- One reader: lib/pricing.ts becomes display-only, reading the stored price; it never recomputes with its own formula.
- One config: reconcile channel_markups vs pricing_rules down to a single table.

Protections already in place (2026-06-07):
- org_settings.vat_active master switch — OFF until government approval; VAT is built but never charged early.
- product_pricing.price_locked — founder-set prices that no function or import may overwrite. Hot sellers locked.

Channels (current + new): nassau_pos 38% · nassau_wholesale 18% · andros_pos 45% · online_market 35% · local_wholesale 15%.

---

## 5. The Catalog Model — How All Industries Fit One System

Today the catalog is food-shaped: priced per pound, perishable, mostly VAT-exempt, with lot/batch traceability and yield. The new industries don't behave the same way. The platform stays simple by keeping one products table with category-specific attribute sets layered on top — not separate systems per industry.

- Seafood / meat — sells per lb (decimal); add lot code, yield, catch source; VAT exempt (uncooked); cold-chain delivery
- Dry grocery — per unit / case; add pack size, expiry; mixed VAT; standard delivery
- Health & beauty — per unit; add expiry, brand; taxable; standard delivery
- Appliances — per unit; add model #, serial #, warranty; taxable; heavy / install delivery
- Electronics — per unit; add model #, serial #, warranty; taxable; standard / fragile delivery
- Electrical — per unit / length; add spec, gauge/rating; taxable; standard delivery
- Building materials — per unit / length / volume; add dimensions, weight, bulk; taxable; heavy / job-site delivery

What this requires (Phase 5):
- Category-aware attribute fields on products (serial, warranty, dimensions, weight) — shown only where relevant.
- Unit-of-measure already supports lb-decimal; extend cleanly to each/length/volume.
- Delivery logic that understands weight class (a fridge and a pound of conch do not ship the same way) — ties into the delivery pillar.
- VAT codes per item already exist (X/T/F) — most non-food is taxable, so the vat_active switch and per-item codes already handle it the day approval lands.

The architecture does NOT change to add industries. The category framework (enum, PDP, browse, shop slices) already exists. This is data and attribute work, not new construction.

---

## 6. Operational Pillars

Suppliers. Self-service portal: list product (name, description, cost pre-VAT, unit, stock, pack) → lands pending with all channels off → founder sets VAT/margin/image and flips channels live. Margins never visible to suppliers. Built; depends on the unified engine behind it.

Fishermen / captains / farmers. Role landings and intake exist; lobster intake captures vessel + GPS + raw weight. Live boat-side product upload feeding vessel_intakes and traceability is the growth edge. Surface built; live upload is Phase 6.

Export processing (Spiny Tail). Full HACCP/SSOP/traceability suite live — lots (STPC-YYYYMMDD-VV-NN), steps, vessels, documents, inspector audit views. Remaining piece is the export sales flow (quota, US importer-of-record, partner logistics). The confidential US cold-storage/processing partner is never named in any customer- or competitor-facing output.

Physical location management. Nassau, Andros, and inventory locations exist. "Live management" — real-time per-location stock, staff, and cash visibility — builds on the existing inventory_movements ledger and cash-drawer sessions.

Live delivery tracking. Public /track/[orderId] surface exists; order lifecycle (fulfillment_status, pod_photo_urls) exists. Wiring driver role → pickup → en-route → delivered → customer-visible status is Phase 6.

Payments. In-store RBC terminal live. Online via Plug'n Pay (HPP) scaffolded; final wiring is Phase 6.

---

## 7. The Build Plan (Dependency-Ordered)

The order is forced by dependency, not preference. Each phase stands on solid ground before the next begins. The clock is off — correctness over speed.

Phase 1 — Unify the pricing engine. (The keystone. Nothing else is safe until this is one thing.)
Collapse four pricing sources into one writer / one store / one reader. Apply the corrected bsc_set_channel_price. Rewrite or retire bsc_apply_channel_margin (lock-aware). Reconcile channel_markups vs pricing_rules. Update lib/pricing.ts to display-only. Disarm the broken bulk-margin button until rewritten.

Phase 2 — Case pricing as a real feature.
Wire manual_case_price end-to-end (storage → grid → POS → market). Migrate the stray case-price rows into their proper home. Tie to the kit flag and the 10 lb / 1-case wholesale-quantity rule.

Phase 3 — Resolve data debris.
The 24 null-price rows. Duplicate is_current pricing rows. The stray qc enum cast breaking supplier_reorder_list.

Phase 4 — Backfill clean.
Now safe: one engine, case prices homed, nulls cleared, hot sellers locked. Recompute every unlocked formula row to policy margin + gross-up, VAT dark behind the switch.

Phase 5 — Catalog expansion.
Add the physical industries (appliances, electronics, electrical, health & beauty, building materials) via category-aware attributes on the existing framework.

Phase 6 — Finish half-wired surfaces.
Live delivery tracking (driver → customer). Live fishermen upload. Online payment (Plug'n Pay). Fix the /market cache issue. Andros POS full launch.

Phase 7 — Hardening (parked items from the audit).
Daily backups + retention + alerts. Read replicas / monitoring. Card-on-file (post RBC API keys). Competitor-supplier sandbox role. Health-check fixes.

---

## 8. Operating Principles (Locked)

These are permanent guardrails, not preferences.

- One source of truth. Verify every schema fact against the live database before building — never migration files alone.
- Full-file replacements for all code deliveries. No diffs.
- One approved step at a time. Each action reviewed individually; confirm before any deploy.
- Flag legal / regulatory / ethical / reputational risk before building, and propose clean alternatives.
- VAT is never charged before government approval. Built, switched off, honest per-item codes.
- Founder-set prices are sacred (price_locked). No function or import overwrites them.
- Bill Casale 5% of gross profit — sacred, per transaction.
- Reserve Fund 0.5% + Community Fund 0.5% off every sale.
- Trade secrets (confidential US processing partner) never appear in any customer- or competitor-facing output.
- The system must remain simple enough to inherit. Complexity that only the founder or an outside expert can maintain is rejected on principle.

---

End of Master Plan v1.0. This document is the canonical reference for the BSC platform vision and build sequence. Maintained alongside the live system audit and updated as phases complete.
