# AI_TEAM_TASK.md — Approved work queue (owned by Claude Code / Architect)

> Builders (Codex) and Editors (Aider) work **only** from this file. Architect updates it; nothing here changes business rules silently. Every task respects `AI_TEAM_RULES.md`.

---

## CURRENT APPROVED TASK
**None in progress.** Founder to pick the next feature from the BACKLOG below (sequenced by the Architect). Until then, no agent should start app changes.

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

### B. RBC Daily Payment Confirmation Portal + Founder Setup Guide
**Why staged:** needs **inbound-email infrastructure** the app doesn't have yet (a mail webhook / parse endpoint to receive RBC's report attachment). That's the gating dependency — decide the inbound channel first.
- Generate a unique receiving address/token (e.g. `rbc-reports+bsc-<id>-<token>@bscbahamas.com`), shown for copy/paste into RBC.
- Setup status states: Not connected → Waiting for RBC test email → Test email received → RBC file verified → Auto confirmation active.
- Parse report → extract trace#, auth code, amount, card type, terminal, fee, dates → match trace#+amount to online checkout orders → mark PAID; unmatched → manual review. Store original file for audit.
- Sections: Daily RBC Inbox · Auto-Matched · Unmatched · Manual Match · Audit Trail · File Storage · Founder AI daily payment summary.
- **Guardrail:** confirms payment only by matching trace#+amount. **Never** touches tax or sales-tax math.

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
