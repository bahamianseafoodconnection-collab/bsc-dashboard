# BSC Master System Checklist

**Last compiled:** 2026-05-20 by Claude Code (from atlas + master context).
**Purpose:** Single source of truth for what's built, what's pending, what's broken, and what the founder needs to do. Successor handoff document.

**Live deploy:** [bscbahamas.com](https://bscbahamas.com) · **Repo:** [bsc-dashboard](https://github.com/bahamianseafoodconnection-collab/bsc-dashboard) · **DB:** Supabase project `qgcaxkyuhwmpvpbooaqw`

## Legend

| Marker | Meaning |
|---|---|
| ✅ | Complete + live in production |
| 🟡 | Partially built — needs finishing |
| ❌ | Not started |
| ⚠️ | Live but wrong (divergent from spec or law) |
| 🔒 | Blocked on external dependency |
| 🧠 | Founder action needed (not code) |

---

## 1. Foundation

- [x] ✅ Next.js 15 App Router (130 pages, 49 API routes)
- [x] ✅ Supabase Postgres + RLS (38 tables, 41 migrations)
- [x] ✅ Vercel auto-deploy from GitHub `main`
- [x] ✅ Anthropic Claude Sonnet 4.5 at `/founder-ai`
- [x] ✅ Resend transactional email (orders@bscbahamas.com)
- [x] ✅ Domain bscbahamas.com live
- [x] ✅ Brand: gold #F5C518 + navy #060D1F + watercolor logo across all touchpoints
- [x] ✅ Supabase Auth + role-gated routing (10-role taxonomy)
- [x] ✅ Codebase atlas (`lib/founder-ai-atlas.json`, auto-regenerated on deploy)
- [ ] 🟡 Twilio (account verified, env vars set, code not finished)
- [ ] 🔒 RBC Plug & Pay (email bctmsr@rbc.com)
- [ ] 🧠 BSC US Miami physical address (before Aug 2026 lobster season)

## 2. Pricing engine

- [x] ✅ 5-channel markups (22/19/35/40/40) at `lib/pricing.ts`
- [x] ✅ Wholesale auto-upgrade per line (10+ lbs or by case)
- [x] ✅ Bill Casale 5% sacred share (per-sale allocation hook)
- [x] ✅ Specials / closed-date promotions (admin UI + market/POS/checkout)
- [x] ✅ `calculatePrice()` used at every callsite
- [x] ✅ Promo prices win over wholesale upgrade
- [x] ✅ `/dashboard/pricing-rules` admin UI + audit
- [x] ✅ Tue Shrimp + Wed Salmon promos live
- [ ] ⚠️ **VAT rule** — Bahamas law: 0% uncooked / 10% cooked. **Code currently blanket-charges 10% on every channel.** Material money/legal bug. See `project_vat_rule.md` memory.
- [ ] ❌ Thursday Conch promo (planned)
- [ ] ❌ US resale pricing model (no Bahamas duty, no mailboat)

## 3. Products & catalog

- [x] ✅ `products` + `product_costs` + `product_pricing` tables
- [x] ✅ Cost immutability (trigger blocks UPDATE; INSERT supersession)
- [x] ✅ `parent_product_id` + `portion_size` + `portions_per_parent` on products
- [x] ✅ Pending approval queue at `/founder-ai/products/pending`
- [x] ✅ `explode_product` tool (wholesale parent → retail portions)
- [x] ✅ Photo intake form at `/founder-ai/products/intake`
- [x] ✅ AI photo flow (Founder AI chat persists + uses photo)
- [x] ✅ `suggest_product_sku` (barcode-aware, dedupe)
- [x] ✅ Lobster grade publish (one-click on lot detail)
- [x] ✅ Specials editor `/dashboard/specials`
- [ ] ❌ Multi-photo upload (3 photos: front, label, wide)
- [ ] ❌ Confidence dots (gold/amber/red on extracted fields)
- [ ] ❌ `product_intake_log` audit table
- [ ] ❌ `sku_suggestion_log` table

## 4. Inventory & traceability (Spinytails HACCP)

- [x] ✅ 14 `spinytails_*` tables (lots, vessels, intakes, QC, temps, batches, grades, packagings, shipments, corrective actions, training, calibration, sanitation, documents)
- [x] ✅ Lot code format STPC-YYYYMMDD-VV-NN via `spinytails_next_lot_code()`
- [x] ✅ 5 CCPs via CHECK constraints
- [x] ✅ Full chain view at `/spinytails/lots/[lot_code]`
- [x] ✅ 28 SOP/SSOP/HACCP docs in document library
- [x] ✅ 11-step walkthrough at `/spinytails/steps`
- [x] ✅ Inspector audit access (token-gated, time-bound, scope-limited)
- [x] ✅ `order_lot_consumption` junction (trace loop closed)
- [x] ✅ Lot detail consumption recorder UI
- [x] ✅ Trace QR sticker sheets (Avery 5163)
- [x] ✅ Trace QR on customer receipts
- [x] ✅ `/trace` public landing
- [ ] ❌ Vessel registration upload UI (per `project_vessel_registration` memory)
- [ ] ❌ Calibration entry UI (data lives in table, no entry form)

## 5. Customers

- [x] ✅ `customers` table phone-unified (E.164)
- [x] ✅ `CustomerPhoneLookup` component on every channel
- [x] ✅ Walk-In Anonymous singleton (`00000000-0000-0000-0000-000000000001`)
- [x] ✅ Customer pulse at `/dashboard/customer-pulse` (founder-only)
- [x] ✅ Founder AI tools: `list_customers`, `segment_customers`, `customer_history`
- [x] ✅ Origin channel attribution + QR source tracking
- [x] ✅ Email marketing consent (with source tracking)
- [ ] ❌ `sms_marketing_consent` + `sms_consent_at` + `sms_consent_source` columns
- [ ] ❌ `whatsapp_marketing_consent` columns

## 6. Sales & AR

- [x] ✅ `orders` table (cart in JSON column)
- [x] ✅ AR aging report at `/dashboard/ar-aging`
- [x] ✅ AR statement PDF per customer
- [x] ✅ AR aging alert daily cron
- [x] ✅ AR payment behavior trends
- [x] ✅ Email blast (Resend) with CAN-SPAM unsubscribe
- [x] ✅ Promo codes admin
- [x] ✅ POS Nassau + Andros + online unified
- [x] ✅ POS specials display
- [x] ✅ Checkout respects specials
- [ ] ❌ B2B accounts (Net-30, standing orders, volume tier) — Brief 3
- [ ] ❌ US Shopping standalone brand — Brief 4

## 7. Operations & compliance

- [x] ✅ Health check (23 scans) at `/dashboard/health`
- [x] ✅ Health check daily 6am AST cron (emails on critical)
- [x] ✅ Schema integrity daily cron
- [x] ✅ Daily Briefing email (real, with customer pulse + lot consumption)
- [x] ✅ Cashier drawer sessions + trends
- [x] ✅ Cashier weekly digest (Mon 7am AST) + CSV
- [x] ✅ Cashier variance alert (per-shift email)
- [x] ✅ Vendor weekly statements (Mon 8am AST)
- [x] ✅ SSOP audit reminder daily cron
- [x] ✅ Locked records audit (orders/catch/processing)
- [x] ✅ Suspended staff detection
- [x] ✅ Founding principles ratified (12, baked into Daily Briefing prompt)

## 8. Founder AI

- [x] ✅ Chat at `/founder-ai` with vision + chat history persisted
- [x] ✅ System prompt with sacred rules, roster, channel margins
- [x] ✅ Codebase atlas in system prompt
- [x] ✅ Chat photos auto-persist to `site-images/founder-ai-chat/`
- [x] ✅ Smart photo flow: extract → auto-classify → dedupe → cost anchor → preview → confirm
- [x] ✅ Read tools: `read_file`, `query_db`, `recent_orders`, `health_check`, `demand_pattern`, `list_customers`, `segment_customers`, `customer_history`
- [x] ✅ Write tools: `add_product` (with image_url + description), `set_product_channels`, `explode_product`, `suggest_product_sku`, `send_email_blast`, `list_flyers`, `create_flyer`, `set_flyer_active`
- [x] ✅ `ai_writes` audit log (every write logged: success/denied/error)
- [x] ✅ Trade secret protection (Igloo refusal)
- [x] ✅ Suspended staff refusal (Dashnelle/Ashley/Guito)
- [x] ✅ Founder-only loop principle (Dedrick + AI privileged channel)
- [ ] ❌ Generational knowledge transfer narratives (North Star)
- [ ] ❌ AI review response drafter (currently `/reviews-admin` manual)
- [ ] ❌ Voice input (ElevenLabs out — Phase 4)

## 9. SQL editor & schema introspection

- [x] ✅ `/dashboard/sql-editor` founder-only
- [x] ✅ `sql_query_audit` log (every call: caller, sql, rowcount, elapsed, error)
- [x] ✅ `sql_query_saved` per-user presets
- [x] ✅ `bsc_admin_exec_sql()` SECURITY DEFINER RPC
- [x] ✅ `bsc_admin_schema_overview()` for /sql-editor schema sidebar
- [x] ✅ `bsc_cron_schema_overview()` for the integrity cron (service_role)
- [x] ✅ 8 built-in PRESETS
- [x] ✅ Read-only by default + click-through write toggle
- [x] ✅ Copy CSV
- [ ] ❌ EXPLAIN query mode
- [ ] ❌ Query result charts/graphs

## 10. Vendor marketplace

- [x] ✅ `vendors` / `vendor_listings` / `vendor_orders` / `vendor_payouts` tables
- [x] ✅ Vendor self-serve dashboard with vessel/farm info upload
- [x] ✅ Vendor weekly statement cron
- [ ] ❌ `BETA_MODE_VENDORS` env flag implementation (commission 15% gated)
- [ ] ❌ Vendor commission legal/tax review (BLOCKER for live commission)
- [ ] ❌ Quality rejection counter on vendor record
- [ ] ❌ Bank transfer CSV export for RBC batch payouts

## 11. External integrations

- [x] ✅ Resend email (with attachment support)
- [x] ✅ Resend batch sends
- [x] ✅ `api.qrserver.com` QR generation (no dep)
- [x] ✅ Anthropic vision via Claude (chat photos)
- [ ] 🟡 Twilio SMS Phase 1 — env set, missing steps 5-7 + `lib/phone.ts` E.164 helper
- [ ] ❌ Twilio webhook + STOP/START handler
- [ ] ❌ WhatsApp Business (Phase 3 — month 2)
- [ ] ❌ ElevenLabs voice (Phase 4 — month 3+)
- [ ] 🔒 RBC Plug & Pay (Dedrick → bctmsr@rbc.com)
- [ ] 🟡 Bank email parsing (designed not built)

## 12. Mobile & distribution

- [ ] ❌ Capacitor wrap for Next.js → native iOS + Android
- [ ] 🧠 Apple Developer Program ($99/yr)
- [ ] 🧠 Google Play Developer ($25 one-time)
- [ ] ❌ App Store submission
- [ ] ❌ Google Play submission

## 13. Tri-lingual

- [x] ✅ English
- [ ] ❌ Haitian Creole
- [ ] ❌ Spanish

## 14. Legal & compliance docs

- [x] ✅ HACCP plan (Spiny Tails Master)
- [x] ✅ SSOP docs (12 procedures)
- [x] ✅ Staff Quick Reference (one-page-per-station)
- [x] ✅ Records workbook (digital, Supabase-backed)
- [x] ✅ CAN-SPAM compliance (unsubscribe link in every blast)
- [x] ✅ Trade secret protection (Igloo refusal in AI prompt)
- [x] ✅ Bill Casale 5% sacred contract
- [x] ✅ BSC Platform Vision doc (investor/legal)
- [ ] ⚠️ Bahamas VAT compliance — see Section 2
- [ ] ❌ Vendor commission legal review

## 15. Marketing & content

- [x] ✅ Brand logo + watercolor across all touchpoints
- [x] ✅ Promo flyers (Tue + Wed; Thu planned)
- [x] ✅ Flyer Maker UI at `/founder-ai/flyer-maker`
- [x] ✅ ElevenLabs production guide (Act I + II scripts ready)
- [x] ✅ "From The Boat" 30-second spot script
- [ ] ❌ App store screenshots + listing copy
- [ ] ❌ Social media playbook
- [ ] ❌ ElevenLabs voice render (waiting on script approval)

## 16. Founder external actions (no code)

- [ ] 🧠 RBC: email bctmsr@rbc.com for Plug & Pay
- [ ] 🧠 BSC US Miami physical address (before Aug 2026)
- [ ] 🧠 Manny: last name + boat names + registrations
- [ ] 🧠 BTC phone reactivation (242-225-5282 → restore +242-821-6180)
- [ ] 🧠 Facebook recovery (after BTC)
- [ ] 🧠 Spiny Tail photos for Founder AI training (freezers, equipment)
- [ ] 🧠 Card processor decision
- [ ] 🧠 New staff language preferences (EN/HT/ES)
- [ ] 🧠 US Shopping standalone brand naming
- [ ] 🧠 Confirm Mrs. Davis ($1,070 AR) reminder sent
- [ ] 🧠 Apple Developer + Google Play Developer accounts

## 17. Recommended order of operations (next 30 days)

1. **VAT fix** — material money/legal divergence; ship first
2. **Validate production** — schema validation SQL + UI runbook
3. **Twilio Phase 1 finish** — steps 5-7 + `lib/phone.ts`; env already in Vercel
4. **Multi-photo intake** — 3-photo support + confidence dots
5. **Vessel registration UI** — per existing memory rule
6. **`sms_marketing_consent` columns** — prerequisite for Twilio Phase 1 live
7. **B2B accounts** — Net-30 + standing orders (Brief 3)
8. **Tri-lingual translations** — Haitian Creole + Spanish
9. **Capacitor mobile wrap** — App Store + Play submission
10. **WhatsApp Phase 3** — month 2 (Meta verification 2-3 weeks)
11. **Voice Phase 4** — month 3+ (ElevenLabs voice for inbound calls)

## 18. Sacred immutables (never overwrite)

- Sacred channel margins: 22/19/35/40/40
- Bill Casale 5% gross profit share
- Igloo Express Miami confidentiality
- Phone-E.164 customer unification
- Walk-In Anonymous singleton id
- Cost immutability (INSERT-supersede, never UPDATE)
- Founder-only loop for customer pulse / lot consumption
- 35-day rest cycle (June 4-9 2026 next)
- Approval queue before live (pending products)

## Audit history

| Date | Compiler | Notes |
|---|---|---|
| 2026-05-20 | Claude Code (Opus 4.7) | Initial compilation from master context + atlas + memory |
