# BSC Supplier→Channel Pipeline — Sequential Build Tracker

**Started:** 2026-06-20
**Owner:** Dedrick Storr
**Foundation entry:** `docs/DECISIONS.md` → 2026-06-20 entry
**Rule:** each phase finishes and is verified before the next begins. No phase
skips. SQL → Supabase Editor. `.ts`/`.tsx` → Claude Code. Full-file writes only.
Nothing pushes to production without explicit approval.

Status key: `[ ]` not started · `[~]` in progress · `[x]` done · `[!]` BLOCKED

---

## PHASE 0 — Lock the foundation
- [x] Verify live schema (channel_markups, product_pricing, products, pricing_rules, trigger body)
- [x] Lock pricing direction D1 (×0.93 supplier intake; ×1.07 retired)
- [x] Lock Save standard D2 (server-authoritative)
- [x] Lock approval lifecycle D3 (pending → approve; re-approve on cost/brand)
- [ ] Append 2026-06-20 entry to `docs/DECISIONS.md` (commit)
- [ ] Mirror entry into `system_decision_log` (→ 18 entries)

## PHASE 1 — Resolve blockers (DECISIONS required before any code)
- [x] **O1 — Margins confirmed.** `pricing_rules` governs (live Founder AI):
      nassau_pos 40 / andros_pos 40 / online_retail 35 / wholesale_in_store 22 /
      wholesale_online 19. Supersedes 2026-05-23 sacred set. RESOLVED 2026-06-20.
- [x] **O2 — Pending visibility RESOLVED.** Stay live at last-approved price;
      pending status drives the review queue, not storefront visibility.
      Re-approval updates price forward only. RESOLVED 2026-06-20.

## PHASE 2 — SQL foundation (Supabase Editor) — after Phase 1 cleared
- [x] Add `brand` column to `products` (F-E) — DONE + verified 2026-06-20 (text, nullable)
- [x] Add `operating_cost_accepted boolean default false` to `suppliers` (D1 caveat) — DONE + verified 2026-06-20
- [x] **VERIFY packing field** — `units_per_case`(int,def 1) + `unit_type` already
      exist; NO new column needed. Data is empty/default — enforce at route+Gate 2. (D7)
- [x] Packing columns sufficient — no Phase 2 ALTER required for D6 (D7)
- [ ] Verify checkout honors `org_settings.vat_active` (false→0%), not the stale
      1.10 row default (F-D)

## PHASE 3 — Fix bulk-add-products (Claude Code, full-file) — the core defect
- [x] git fetch + confirm behind=0 — DONE 2026-06-20 (clean, synced at 5de9463)
- [x] Full-file rewrite written + typechecks clean — DONE 2026-06-20 (commit 8b5371b)
- [x] Read margins from `pricing_rules` (`pricing_channel_v2`), not empty
      `channel_markups` (F-A) — code-confirmed (marginByChannel from pricing_rules)
- [x] Store ONLY 3 fixed channels (D5): nassau_pos 40, andros_pos 40,
      online_market 35 (via online_retail margin). Wholesale computed at cart. — code-confirmed
- [x] Apply ×0.93 supplier-cost intake where `operating_cost_accepted = true` (D1) — code-confirmed
- [x] Store `margin_multiplier = price ÷ cost` — footgun dead (F-B) — **SQL-PROVEN**
- [x] Coerce category to canonical enum value, avoid duplicate members (F-G/F-J) — code-confirmed
- [x] Land products as `pending_approval`, not active (D3) — code-confirmed
- [~] Capture packing (units_per_case/unit_type) per product; intake never rejects (D7) — code-written, see POST-MERGE #4
- [~] Keep `ai_writes` audit row (D2) — code-written, NOT yet observed, see POST-MERGE #3
- [x] **Pricing MATH proven via SQL** 2026-06-20: cost $10 → stored $9.30 (×0.93) →
      nassau_pos $13.02 (1.4) / andros_pos $13.02 (1.4) / online_market $12.56 (~1.3505).
      NO 1.0 multiplier. Enum translation online_retail→online_market confirmed live.
- [x] Route deployed to preview, reachable, **auth gate confirmed working** (rejected
      unauthenticated probe with its own JSON `{"ok":false,"error":"Sign in required"}`)
- [!] **Authenticated route POST never came back green** — token-grab friction
      (browser cookie is base64-wrapped / not in localStorage). Math proven by parallel
      SQL path instead. MERGED ON DECISION 2026-06-20 with residual risk accepted.
      See POST-MERGE VERIFICATION below.

---

## ⚠️ POST-MERGE VERIFICATION — confirm in real use (Dedrick, human check)
**Context:** Merged to main 2026-06-20 with the *math* proven in SQL but the *route's own
execution* never observed on a full authenticated call. These are the spots the SQL proof
could NOT cover. Test each on the first real supplier pricelist import; if it breaks, the
"where to look" + suggested fix is noted inline.

- [ ] **#1 Request parsing** — route reads `rows[].channels {nassau,andros,online,wholesale}`
      + `cost_per_unit` correctly on a real POST.
      *If broken:* import fails silently or 500s → look at the body-parse block at top of route.
      *Fix:* confirm field names match the import payload exactly (channels object keys).
- [ ] **#2 Enum translation fires in route code** — online row writes `product_pricing.channel
      = 'online_market'` (DB proven to accept it; route's `writeChannel` logic must emit it).
      *If broken:* 22P02 invalid enum on the online row → look at PRICING_PLAN writeChannel map.
      *Fix:* ensure online_retail→online_market translation is applied before insert.
- [ ] **#3 ai_writes audit row** — proven in NEITHER path. Confirm an audit row is written
      per import (operating_cost_factor, landed_status, packing_incomplete_count, status).
      *If broken:* imports work but audit table empty/wrong → look at the ai_writes insert block.
      *Fix:* verify the insert runs after product creation and captures the 3-state status.
- [ ] **#4 Packing-incomplete flag** — `units_per_case ≤ 1` lands product flagged
      `packing_incomplete` AND blocks Enable-Live until reviewer sets real case count (D7).
      *If broken:* products go live without real packing data → look at packing flag + Gate 2 guard.
      *Fix:* enforce the block at Enable-Live, not just the flag at intake.
- [ ] **#5 Category coercion** — `coerceCategory()` maps user input + dedupes
      (`seafood`→`fresh_seafood`, `beverage`/`beverages`, `toiletry`/`toiletries`).
      *If broken:* wrong category or 500 on category → look at coerceCategory map.
      *Fix:* add the missing label → canonical enum value mapping.

**Lowest risk (most proven):** core money math (×0.93, margins, margin=price÷cost, no 1.0).
**Highest risk (least proven):** #3 audit write and #1 parsing — neither observed end-to-end.

## PHASE 3b — Cart case-break wholesale pricing (D5/D6)
- [ ] Card shows BOTH retail (per-unit) and wholesale (per-case) prices, computed
      live from true cost × margin
- [ ] Retail / Wholesale buttons; wholesale flow inputs cases and/or units
- [ ] Case-break math: full_cases × case_wholesale + remainder × retail (D6)
- [ ] Reads `units_per_case` from packing description; not stored as pricing rows

## PHASE 4 — Supplier approval funnel UI (the two gates) (D3a)
- [ ] Supplier card: "Supplier Approved" on/off switch → writes
      `operating_cost_accepted`; card opens to review pricelist first (GATE 1)
- [ ] Switch ON → auto-intake all pricelist products at ×0.93 as
      `pending_approval`, open product management page
- [ ] Product management page: per-product channel select + photo upload/edit
- [ ] Per-product "Enable Live" toggle → `pending_approval` → `active`, live on
      selected channels (GATE 2)
- [ ] Forward-only: switch ON applies ×0.93 to NEW intake; switch OFF stops
      future ×0.93 but does NOT dark live products (stay-live rule)

## PHASE 5 — Approval re-trigger + Save standard rollout
- [ ] Re-approval trigger: cost change OR brand change → flip to
      `pending_approval`; STAYS LIVE at last-approved price (O2) (D3)
- [ ] Canonical server-authoritative persist primitive; point forms at it (D2)
- [ ] Sweep 50+ browser-direct writes; route money/inventory through server
- [ ] Flagged surfaces: `app/ashley/` (terminated), `sql-editor` (lock to founder)

## PHASE 6 — Verify the loop end-to-end
- [ ] JBI 71-product import test → confirm `qc` enum bug dead/alive
- [ ] Confirm extracted pricelist → priced channels → pending → approve → live
- [ ] Confirm cost change re-prices correctly AND re-triggers approval
- [ ] Confirm COGS / facility fee / yield still read TRUE cost (×0.93 clean)
- [ ] **Run the 5 POST-MERGE VERIFICATION checks above on first real import**

---

## PHASE 7 — Operations Cockpit (one role-based dashboard view) — SCOPED NEXT
ONE combined view per staff dashboard; THREE clean data layers underneath.
- [ ] Read-only verify: roles, freezer/processing/yield tables, low-stock source
- [ ] Layer 1 — Duties: things to do (assigned / self-logged / recurring);
      ANY staff can assign based on need + capability + availability
- [ ] Lifecycle: Assigned → Acknowledged → Done → Verified (Done is enough)
- [ ] Layer 2 — Ops events (audit-grade, separate from duties): freezer-out weight,
      who took it, where it went, processed, FINISHED weight (yield). Ties to
      inventory_movements + lot code STPC-YYYYMMDD-VV-NN. MUST stay HACCP-clean.
- [ ] Layer 3 — Stock signals: low/high, being processed (computed from inventory)
- [ ] "Needs attention" panel per role
- [ ] Communicate button → send task to assigned staff and/or driver
- [ ] Server-authoritative writes; tri-lingual labels (EN/Creole/Spanish)

## PHASE 8 — User Management page — SCOPED NEXT
- [ ] Add users with role + login credentials
- [ ] **Save = SERVER save via Supabase Auth admin API** (service-role) — NEVER
      handle passwords/credentials in browser, never write creds to a plain table
- [ ] Page locked to founder / co_founder / control_admin only (it grants access)
- [ ] Audit every user create/role change in ai_writes
- [ ] Working Save button (front-end reflects, backend persists)

---

## PARKED (not in this pipeline, don't lose)
- **PACKING/UNIT DATA CLEANUP (own workstream, D7):** units_per_case=1 catalog-wide,
  unit_of_measure='each' on weight items, weight/count leaking into product name.
  Reviewer backfills real case counts; fix unit drift. NOT this build.
- **ENUM MIGRATION (own workstream, D4/Option B deferred):** finish
  `pricing_channel_v2` across `product_pricing` + `channel_markups`, or
  consolidate to one enum. Removes the translation-map trap for all future
  routes. Live money table — deliberate, sequenced migration only. NOT during
  the pipeline build.
- Model drift: extract-pricelist comment vs haiku; Founder AI on sonnet-4-5 (F-H)
- Founder AI auth "Authentication required" session-token fix
- Reefer alarm: logs but doesn't alarm → consultant question + dashboard tie
- Facility agreement → Bahamian attorney review (binding, unsigned)
- Conch permit MAMR/PP-45 — verify revised number + expiry off physical paper
