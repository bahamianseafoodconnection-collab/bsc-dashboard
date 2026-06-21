# BSC Decisions & System Knowledge Ledger

> Append-only. Never delete an entry. To change a past decision, add a NEW dated entry that supersedes it and references the old one by date/title. Git history preserves everything; corrections make the record stronger, never shorter.

## How to use this file
- Every locked decision, schema change, migration, and system upgrade gets an entry here, committed to git in the same motion as the change.
- A change is not "done" until it is recorded here.
- New chats / new people: read this file at the start of any BSC work. This file (plus the system_decision_log table in Supabase) is the source of truth, not anyone's memory, not the chat's summary, not recall.
- Mirror of this file lives in Supabase table public.system_decision_log so the platform and Founder AI can read the record, not just humans.

---

## 2026-06-20 — Supplier→Channel Pricing Pipeline: Direction Locked + DB-State Verified

Context: Building the universal server-authoritative Save standard and the supplier pricelist → channel-listing pipeline. Read-only verification against live schema (Supabase MCP bsc_mcp_ro) surfaced four entangled money defects plus a missing column. This entry locks the decisions and records the verified state BEFORE any fix touches production.

### DECISIONS LOCKED

D1 — Pricing direction (SUPERSEDES 2026-06-09 ×1.07-on-cost formula). The 7% is BSC's operating cost, pushed onto the supplier at intake. Supplier is informed the system carries a 7% operating cost; their quote is negotiated down 7%. Stored cost = supplier quote × 0.93. That stored number IS true cost — read directly by COGS, the 7% facility fee, and conch 6% yield. No stripping, no ÷1.07. unit price = stored_cost × (1 + channel_margin); line = unit price × qty; final = line × (1 + vat), VAT last per jurisdiction. Strategy this funds: cheapest online price + widest availability to out-compete Bahamas Food Services / Sysco. OLD ×1.07-added-to-cost formula: RETIRED. Caveat: ×0.93 only applies to suppliers who accepted the term (suppliers.operating_cost_accepted = true); otherwise full quote.

D2 — Save standard: SERVER-AUTHORITATIVE everywhere. Money/inventory/compliance writes go through a server API (service-role, behind auth + role gate, with ai_writes audit) — never browser → RLS direct. Pattern of record: app/api/supplier/add-product/route.ts.

D3 — Product approval lifecycle. Pricelist import → products land pending_approval. Approvers: control_admin, founder, co_founder. On approval → active on selected channels. Re-approval fires ONLY on cost price change OR brand change.

D3a — Supplier approval funnel. TWO GATES. The operating_cost_accepted flag is a "Supplier Approved" on/off switch on each supplier card. Card opens → review pricelist → decide. GATE 1 supplier switch: OFF = nothing created, no ×0.93; ON = accepts supplier (×0.93 intake), auto-creates all pricelist products as pending_approval, opens product management page. On that page per product: select channels, upload/edit photo. GATE 2 per-product "Enable Live" toggle: flips that single product pending_approval → active, live on its selected channels. Per-product, not bulk.

D4 — Enum fix approach: OPTION A. Translation map lives IN the route (online_retail→online_market etc). No schema change now. Enum migration (finish pricing_channel_v2 across product_pricing/channel_markups) is a PARKED separate workstream — NOT inside this build.

D5 — Pricing layer split. STORED per-product fixed shelf prices (route writes these): nassau_pos 40%, andros_pos 40%, online_market 35% (margin source pricing_rules online_retail) — all × true cost. COMPUTED LIVE at cart, NOT stored: in-store wholesale 22%, online wholesale 19%. Wholesale qualifies at 10+ lbs OR 1+ full case. Bulk route stores ONLY the 3 fixed channels. VAT last per org_settings.vat_active.

D6 — Case-break (pack-break) pricing + mandatory packing. Every product carries units_per_case (sub-units per case): snapper 23 pcs, salmon 25 pcs, shrimp 5 bags. Cart math: full_cases = floor(qty ÷ units_per_case); remainder = qty mod units_per_case; total = full_cases × case_wholesale + remainder × retail. Card shows BOTH retail and wholesale; customer taps Retail or Wholesale. Wholesale computed live, not stored. Packing description REQUIRED on every product before go-live.

D7 — Packing data drift + intake handling. Columns units_per_case (int, default 1) and unit_type exist; no new column needed. But data unreliable: units_per_case uniformly 1, pack_size free text, weight leaks into name, unit_of_measure='each' on weight items. INTAKE HANDLING = flag + block go-live, NOT hard-reject. Switch-ON intakes ALL products as pending_approval. A product with unset/default packing is allowed in but CANNOT be enabled live (Gate 2) until reviewer sets real units_per_case + unit_type. Existing-data cleanup is a parked workstream.

### DB-STATE FINDINGS (verified read-only, 2026-06-20)

F-A — Auto-pricing path DEAD + enums don't join. Routes read channel_markups.margin_pct (EMPTY, wrong enum pricing_channel). Real margins live in pricing_rules on pricing_channel_v2. Only nassau_pos/andros_pos share names. Map: online_retail→online_market, wholesale_in_store→local_wholesale, wholesale_online→(no target, handled by cart).
F-B — margin_multiplier=1.0 footgun CONFIRMED LIVE. bulk-add-products hardcodes 1.0; trigger recalc_channel_prices_on_purchase then recomputes price=cost×1.0 = sells at cost. Fix: store margin = price ÷ cost.
F-D — VAT master switch. org_settings.vat_active currently false → all channels 0%. On re-enable only cooked_prepared = 10%, rest stay 0%. Verify checkout honors the switch, not the stale 1.10 row default.
F-E — products.brand did NOT exist (ADDED this session, verified).
F-F — Approval flow schema-backed: products.status enum {draft, pending_approval, active, discontinued, archived} + approved_by/at, requested_channels.
F-J — product_category has duplicate members (beverage/beverages, toiletry/toiletries). Route coerces to ONE canonical value. is_bsc_processed default false = resale flag.

### RESOLVED

O1 — pricing_rules is the governing margin source (confirmed via live Founder AI). Margins (pricing_channel_v2): nassau_pos 40, andros_pos 40, online_retail 35, wholesale_in_store 22, wholesale_online 19. Supersedes the 2026-05-23 sacred set (38/45/35/18/15), now STALE.
O2 — STAY LIVE at last-approved price. Cost/brand change flips to pending_approval but product keeps selling at last-approved price until re-approved. Pending drives the review queue, not storefront visibility.

### SCHEMA CHANGES DONE THIS SESSION (verified)
- products.brand (text, nullable) — added.
- suppliers.operating_cost_accepted (boolean NOT NULL default false) — added.

### RULES REAFFIRMED
Verify live schema before building. SQL → Supabase Editor; .ts/.tsx → Claude Code; full-file writes only. git fetch + behind=0 before any push; per-command approval. No push/deploy/commit without explicit approval. Legal/audit before any money surface.

---

# 2026-06-17 — Founding entry

## 1. The missing link: the supplier -> sale -> reorder -> receiving loop
This is the core operational loop of BSC. Every piece must connect end to end.
1. Supplier uploads a price list / products into the system. Lands pending founder approval (supplier portal extraction).
2. Founder approves and sets which channels the product sells to.
3. Product sells across channels. Each sale recorded at the cashier/transaction layer.
4. supplier_reorder_list reads what sold today and reports quantity sold plus how much to repurchase, per supplier, so the same items that sold stay in stock.
5. A purchase order is generated to the specific supplier to refill what sold.
6. Supplier drops off the product at Spiny Tail.
7. QC personnel (humans) inspect quality. This determines what we actually pay: full price, adjusted price, or reject. This step is the payment gate.
8. QC records a receiving log and assigns one receiving batch code per supplier per load. Log format: bags per weight, at least 10 lines per page, then a subtotal, continued per page.
9. Accepted product enters inventory tagged with its receiving batch code, traceability spine intact, flows onto the platform to sell, loop returns to step 3.

Why it matters: QC quality-check sits between the purchase order and the payment, so BSC never pays full price for product that didn't pass, and every accepted load carries one batch code tying supplier -> receiving -> processing -> sale.

## 2. Role definitions (physical places and humans)
cashier: Humans at a device in the physical retail store (Nassau Marketplace, Ceta's Andros). The point of money movement: they record every sale and expense, customers, overhead operating cost, purchases, and customer communication. This is the retail / transaction layer.

qc_staff: Humans inside Spiny Tail Processing Plant. The traceability and true-cost spine. They:
- receive product from suppliers and record the receiving plus the product cost;
- inspect product quality, which determines what BSC pays for the product, or whether the product is rejected;
- pull product from a received batch to process;
- match each processed output back to the exact supplier batch it came from, preserving the product's traceability story;
- record the yield loss through processing (e.g. conch 6% yield, lobster trim, weight lost when raw becomes finished);
- which produces the true cost and true profit of the processed product before it is resold to BSC and channeled onto the platform.

## 3. Core objects
supplier_reorder_list: NOT just a report. An automated replenishment engine: it reads what sold daily and generates the repurchase need per supplier, so the same items being sold are always available. As of 2026-06-17 this object exists live-only (in the running database) and is not in any migration; it is schema drift and must be captured into migrations.

## 4. The two traceability codes (must connect)
Receiving batch code: Assigned at drop-off, one per supplier per load, by QC on the receiving log. Comes first in the chain.
Processing lot code: Format STPC-YYYYMMDD-VV-NN (never deviate). Assigned at processing. Comes second.
The receiving batch code must link to the processing lot code, which links to the finished product, which links to the sale. That unbroken chain is BSC's farm-to-platform traceability.

## 5. Build status as of 2026-06-17
Built (confirmed this session):
- Supplier portal: price-list/product upload plus AI extraction plus founder approval.
- supplier_reorder_list replenishment engine (but live-only; see drift, section 3).
- Purchase order detail/print route; record-transfer-to-supplier payment step.

Needs live verification before building (do NOT assume):
- Auto-generation of POs directly from the reorder list.

Not yet built (the gap named 2026-06-17):
- QC receiving log with the required format (bags per weight, at least 10 lines per page, subtotal, per-page continuation, one receiving batch code per supplier per load).
- Quality-check-determines-payment logic (accept full / adjust / reject).
- Linkage from receiving batch code to processing lot code.

## 6. The seven layers where bugs can live (systematic sweep map)
1. Database schema objects: policies, functions, views, matviews, triggers, constraints, column defaults. Sweep: query pg_* catalogs for a pattern.
2. Database data: scalar, array, and jsonb values. Sweep: generated column scans plus referential-integrity (orphan) checks.
3. Schema drift: gap between migrations and the live DB. Sweep: diff live schema vs migration files.
4. Application code: Next.js routes, components, lib. Sweep: grep plus tsc --noEmit plus build.
5. Edge functions / serverless: supabase/functions/, outside app/. Same bug classes as code, separate location.
6. Environment / config: Vercel env vars, Supabase settings, secrets. Sweep: inventory env per environment; confirm a redeploy applied changes.
7. External integrations: RBC email pipeline, Plug'n Pay, Twilio, MCP connectors. Sweep: contract tests plus end-to-end transaction tests.

Method: Layer isolation (prove each clean in order, cheapest first; eliminate, don't suspect). Error message as compass (read the exact error vocabulary before theorizing). Verify live, never recall.

## 7. Open follow-ups (carried forward)
- [ ] qc import bug: DB fully swept clean (code, scalar, array, jsonb all 0 rows). Stray qc is injected by application code at query time. Next: grep app lib supabase for a live qc that should be qc_staff.
- [ ] Capture schema drift into migrations (baseline pull) so migrations equal reality. Requires Supabase CLI, a deliberate official-source tool install, cleared first.
- [ ] Build founder_principles (north-star rules) and wire it to this ledger.
- [ ] Founder AI live error: ANTHROPIC_API_KEY exists in Vercel; confirm value is a live key and that production was redeployed after it was set.
- [ ] Design QC receiving log plus receiving batch code (spec on paper first; legal/audit review because it touches supplier payment), then build.

---

# 2026-06-17 - Loop lock, card-sets, and checklist (defined, not yet built)

## 8. The loop lock (continuous system loop) - the keystone
The continuous system loop traps all business operations so nothing breaks or is lost, and it makes the system generational.
- The loop stays closed and intact at all times.
- Each section (supplier upload/approval, sales/POS, supplier_reorder_list, purchase order, receiving, QC quality/payment gate, processing/yield, lot code, inventory, platform) works on its own but is a locked link in the loop.
- No section can be removed, reordered, or broken by anyone below founder level.
- Only the founder can add to or alter the loop; the founder unlocks to extend, then it re-locks.
- A new staff member, new chat, or new developer can work WITHIN a section but cannot break the chain.
- Protects against drift (the failure that left supplier_reorder_list live-only with no migration).
- Status: defined, not yet built. Spec-first; founder-gated; legal/audit review required.

## 9. Processor (qc_staff) card-set
On login, a processor sees a work queue of cards, one set per batch, showing every record to make and complete for that batch, in their ordered language (English, Haitian Creole, Spanish) and in the required order. Card contents come from BSC compliance documents (QC, HACCP, SOP, SSOP) which the founder will upload later. Until uploaded, build only the card-queue frame, not the contents; do not invent compliance forms. Each completed card writes into the loop's receiving and processing records: receiving log plus receiving batch code; quality check (accept, adjust, or reject) which is the payment gate; processing plus yield loss; lot code STPC-YYYYMMDD-VV-NN. Status: defined, not yet built; pending uploaded forms plus legal/audit.

## 10. Cashier card-set
On login, a cashier sees their cards: POS; Purchase Order payment; Expenses payment; Returns; Product picture and information edit. HARD RESTRICTION on product edit: may update photo and information, but may NOT change price and may NOT change product name (founder/approval-controlled; enforced via RLS). Cards render in the cashier's ordered language. Status: defined, not yet built; spec-first; legal/audit.

## 11. The checklist lives in the ledger
The checklist no longer lives in chat memory. It lives here and updates in the same motion as every change. Current open items and items completed this session are recorded in the Supabase system_decision_log entry titled "checklist lives in the ledger" (2026-06-17) and should be mirrored here going forward, append-only, never deleted.

---

# 2026-06-19 — HACCP spec landed (cross-reference)

The BSC compliance documents that sections 9 (processor card-set), the HACCP records, and the per-user-page spec were "pending upload" on have now landed in-repo as docs/HACCP_SPEC.md (commit fb7f07c, 171 lines), mirrored in Supabase system_decision_log (5 entries, 2026-06-17). Status remains DEFINED, NOT YET BUILT — the spec is captured but the consultant's authoritative forms, legal/audit review, and the open items (P1 RF, COI meaning, sulfite ppm, gear "beats", grade brackets, blast-freezer target, conch intended-use, PP# pending, US/EU market) still gate the build. See docs/HACCP_SPEC.md for the full farm-to-export record map.

---

# 2026-06-20 — Facility agreement restructured: percentage model (7% + $2k insurance)

PROCESSING FACILITY USE & EXPORT SERVICES AGREEMENT — restructured from hard-number model (7,000 lb processed conch/lobster/yr fee, $6,000/yr insurance per fisherman) to percentage-based, simpler and cleaner. Supersedes the v1 hard-number model.

FEE STRUCTURE (LOCKED):
- 7% of ALL finished product (conch + lobster combined, in-kind) as processing/packaging/licensing fee. Includes packaging materials up to 100,000 lb collectively/yr.
- $2,000/yr per partner boat — insurance contribution, due August 15 annually.
- Example: 10,000 lb raw conch (6% yield = 9,400 lb finished) → facility takes 7% of 9,400 = 658 lb finished as fee.

PARTNER BOATS (3 total):
- Facility-use agreement, 7% + $2k insurance.
- Supplier portal login (same portal as external suppliers JBI, BWA) — real-time intake visibility, transparency into their own processing and yields.

OTHER FISHERMEN (all others):
- BSC buys from them direct. No facility-use agreement. No portal access. Just purchase orders.

OPERATING SEASON & TERM:
- August 1 – May 31: Spiny Lobster season.
- June 1 – July 31: Seasonal closure → partner boats harvest conch.
- Agreement runs year-round, auto-renews August 1 annually.
- 30 days written notice to terminate; immediate termination for regulatory violations, illegal harvesting, 2 documented quality strikes.

STORAGE & MONITORING:
- On-site freezer ~30,000 lb + 40-foot reefer container when needed.
- Temperature monitoring: all storage zones (on-site + reefer when deployed), logged 3x/day (Morning/Noon/Before-Closing) with status (on/off), temperature, time. Satisfies HACCP cold-chain record/verification.
- OPEN: reefer real-time alarming question for consultant (temp stick logs but does not alarm; overnight reefer failure = catastrophic loss).

TRACEABILITY & SEALING:
- Vessel info, harvest dates, general fishing areas, mother-ship ID, landing locations required.
- PRIVACY PROTECTED: exact trap locations, condo locations, GPS coordinates NOT required.
- Sealing: zip ties, string, or Facility-approved methods only. NO METAL TIES (consistent with HACCP spec).

DOCUMENT STATUS: Draft written, ready for Bahamian attorney review before signing (same bar as Gulf Stream / Tropic). Mirrored in Supabase system_decision_log.

---

# 2026-06-20 — STEP 1 SHIPPED

2026-06-20 — STEP 1 SHIPPED: bulk-add-products pricing route (commit 8b5371b) merged to main + deployed to production www.bscbahamas.com. Math SQL-proven via Supabase SQL Editor (×0.93 landed cost, margin=price/cost, no 1.0 footgun) — NOT yet verified via authenticated route call. Route runtime behavior (auth/parsing/ai_writes audit/packing flag/category coercion) logged as 5 post-merge checks in PIPELINE_BUILD_CHECKLIST.md — verify in real use.
