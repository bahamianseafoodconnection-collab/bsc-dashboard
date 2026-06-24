# AI_TEAM_TASK.md — Approved work queue (owned by Claude Code / Architect)

> Builders (Codex) and Editors (Aider) work **only** from this file. Architect updates it; nothing here changes business rules silently. Every task respects `AI_TEAM_RULES.md`.

---

## CURRENT APPROVED TASK
**None in progress.** Founder picks the next item from the BACKLOG.

### Done this cycle
- **D — Supplier Handler Product Photos (shipped 2026-06-24):**
  `/supplier-handler/photos` + `/api/supplier-handler/products` + `/api/supplier-
  handler/set-photo`. Upload + in-browser square cropper (drag+zoom, no deps) →
  1000x1000 JPEG → service-role upload to site-images → sets only image_url
  (least privilege). Missing-photo-first grid. Phone→web handoff de-emphasized.
- **A — Processing Records Per Batch Pull (shipped 2026-06-24):**
  `/api/spinytails/batch-pull/[batch]` + `/spinytails/batch/[batch]` + scan card on
  the hub. One batch = one complete read-only audit file (receiving→export) from
  spinytails_*; missing-doc + non-conformance alerts; print-to-PDF. No schema
  change. (Future: per-lot 'Pull' button on lot-detail; simple processor step
  cards Scan→Weight→Temp→Photo→Step→Save already partly exist in /spinytails/processing.)
- **C — Retail Online Market module · Phase 1 (shipped 2026-06-24):** `/founder/retail`
  + `/api/founder/retail`. Read-only analytics: case→unit economics, fast/slow
  movers (order_cogs_lines), supplier price changes (product_costs history),
  reorder recs, founder alerts. Display label renamed Online Market → "Retail
  Online Market" (enum `online_market` UNCHANGED).
- **C — Retail · Phase 2 (shipped 2026-06-24):** structured Case Receipt —
  `/api/founder/retail/receive-cases` + `case_receipts` audit table + 📦 Receive
  modal. Derives unit_cost = case_cost ÷ units_per_case → existing product_costs
  system (re-prices) → bumps stock_count → traceable receipt.
- **C — Phase 2b (DEFERRED by Founder decision 2026-06-24):** auto-decrement
  retail stock_count on online sale = NOT wanted for now. Sale path stays
  unchanged (online sales write inventory_movements only). Revisit later.

---

## ALREADY BUILT — do NOT rebuild (extend only)
- **Role dashboards (5):** `/cashier`, `/supplier-handler`, `/driver`, `/spinytails` (processor handbook), `/founder`. Server-authoritative `/api/<role>/dashboard`. Founder/co_founder/control_admin land on `/founder`.
- **Customer credit accounts:** `/credit` + `/api/credit/accounts`; per-customer mgmt at `/dashboard/customers/[id]`. Schema live (customers.credit_limit/credit_terms/is_credit_customer/current_balance; customer_credit_ledger).
- **Bank reconciliation (general):** `/founder/bank` + `/api/founder/bank`; `bank_transactions` table. Compares bank vs system totals.
- **Spiny Tail HACCP system:** `/spinytails/*` (receiving, processing, recall, labels, audit, documents, vessels, lots, intake). Tables `spinytails_*`. Lot lifecycle received→processing→blast_freezing→approved (+recalled). Species-prefixed batch_number CON-/LOB-/SNP-YYYYMMDD-NNN.
- **Universal document capture:** `/documents/capture` + `/api/documents/*` (Claude vision identify→extract→mirror→link).
- **Live product channel toggle:** `/supplier/[id]` inline channel chips; price-aware. `ensure_channel_prices` trigger + `channel_markups`.
- **Supplier handler photo/catalog:** product images upload on `/supplier/[id]` (per-row 📷), pricelist extract, channel chips.
- **Existing payment infra:** Plug'n'Pay (RBC gateway), `/dashboard/reconciliation` (transfer→order matcher), `/api/orders/reconcile`, `/api/orders/unreconciled`, founder operational brief `/api/founder-ai/brief` + `BriefPanel`.

---

## BACKLOG (Architect-sequenced; Founder picks order)

### A. Processing Records Per Batch Pull — "one batch = one audit file"  ★ recommended first
**Why first:** lowest risk, highest compliance value, builds directly on the existing `spinytails_*` schema. No new external infra.
- One-click **"PROCESSING RECORDS PER BATCH PULL"** that opens a complete digital audit file for a batch_number: Batch info, Receiving HACCP, Traceability, Processing, Temperature, HACCP/CCP, SSOP sanitation, Employee, Packing, Blast Freezer, Frozen Storage, Export, plus all attachments (photos/videos/PDFs/signatures).
- **Architect notes:** assemble read-only from existing tables first (don't invent schema until we confirm gaps live). Probe live for which sub-records already exist vs missing; deliver any new columns/tables as SQL. Add a simple processor flow: Scan batch → weight → temp → photo → step → save (auto-stamps user/date/time/facility/batch/prev-history).

### B. RBC Daily Payment Confirmation Portal + Founder Setup Guide  — SCOPED 2026-06-24

**Goal:** ingest RBC's daily Merchant POS Transaction Report, match each line to an
online checkout order, mark PAID (or recover lossy ones), route unmatched to manual
review, store the original file for audit, Founder AI daily summary.

**Grounding (verified live):** online card orders already carry
`orders.pt_authorization_code` + `payment_ref` (PnP order id) and are flipped to
`payment_status='paid'` by the PnP return handler — but that browser return is
LOSSY. So the RBC report is the AUTHORITATIVE confirmation. **Match key:
auth_code + amount** (exact), then trace#/ref as secondary; amount-only/near-date →
manual review. Reuses the "recover stranded card orders" path.

**The gating dependency = how RBC's email reaches the app. Phased:**
- **Phase 1 (build now, zero infra): MANUAL UPLOAD + the matcher.** Founder uploads
  the RBC report file (reuse document-capture pattern). Parser + matcher + audit are
  IDENTICAL to the automated version — this de-risks the unknown file format and
  ships the high-value engine immediately. NEEDS: a real sample RBC report to lock
  the parser.
- **Phase 2 (automate ingestion): inbound-email webhook.** RBC → a receiving address
  → provider POSTs a webhook (`/api/rbc/inbound`, signature-verified) → same parser/
  matcher. Provider options: (a) Cloudflare Email Routing/Workers (free, needs DNS on
  Cloudflare); (b) Postmark Inbound (simplest signed webhook); (c) Mailgun Routes;
  (d) Gmail auto-forward of RBC mail → any of the above. **Use a dedicated SUBDOMAIN
  MX (e.g. rbc.bscbahamas.com)** so the founder's Gmail MX on the apex is untouched.
  Address form: `rbc-reports+bsc-<id>-<token>@rbc.bscbahamas.com`. Secrets (webhook
  signing key, token) in Vercel env only.

**Data model (SQL, after sample seen):** `rbc_reports` (file_url, received_at,
source upload|email, status, counts) · `rbc_transactions` (report_id, processing/
txn date+time, trace_number, auth_code, amount, card_type, terminal_id, fee,
matched, matched_order_id, confirmed_at, raw). RLS on, service-role API only.

**Portal sections:** Daily RBC Inbox · Auto-Matched Paid · Unmatched · Manual Match
· Payment Audit Trail · Bank File Storage · Founder AI daily payment summary.
**Founder Setup Guide** (in-portal): the RBC steps (More → Manage Notifications →
Alerts → add the portal address → enable txn/payment + failed/awaiting/rejected/
expired alerts → save → test) + the exact copy/paste address + status states
(Not connected → Waiting for test → Test received → File verified → Auto active).

**Guardrail:** confirms payment ONLY by matching auth_code/trace + amount. **Never**
touches tax/sales-tax math. Online checkout orders only (not POS).

**Open decisions for Founder:** (1) start Phase 1 (manual) now? (2) a sample RBC
report file to lock the parser. (3) Phase 2 provider + where DNS lives.

### C. Retail Online Market pricing module (channel-scoped)
- **CRITICAL GUARDRAIL (Architect):** the enum value `online_market` is referenced across POS/market/pricing/brief code. **DO NOT rename the enum or DB value.** "Rename Online Market → Retail Online Market" is a **display-label change only** (UI strings). Renaming the underlying channel would break every channel calc — forbidden by Rule #1.
- Applies ONLY to the retail online channel. Do NOT touch wholesale/POS/Andros/restaurant/export/processing/internal, or any existing margins/pricing math.
- Case→unit costing (unit_cost = case_cost ÷ units_per_case), profit per unit/case, margin $/%. Retail inventory tracking (units sold/reserved/available, cases/units remaining accumulating against master case). Smart reorder by supplier packaging (case/master-case/carton/pallet). Fast/slow/dead-stock analytics. Supplier price-change monitoring card. Founder alerts (cost ±, fast-moving, OOS, margin below target, sales spike, supplier add/remove).
- **Architect notes:** new schema for case/unit relationship + sales velocity; deliver as SQL after live probe. Reuse existing margin config — never replace it.

### D. Supplier Handler photo workflow (mostly built — confirm/extend)
- Photo upload + management already on `/supplier/[id]`. Remaining: confirm crop/resize tooling + explicit photo→product/supplier/category/channel matching slots inside the Supplier Handler login. Treat as enhancement, not rebuild. De-emphasize the phone→web handoff as the primary path.

---

## Workflow
1. Architect writes/updates this file. 2. Codex builds the **CURRENT APPROVED TASK** only. 3. Aider reviews/refactors/cleans. 4. Git checks. 5. Tests run. 6. Commit with a descriptive message. 7. Founder reviews & approves. No agent works outside the current approved task.
