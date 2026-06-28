# BSC Build Roster + Checklist

> Rule: continue the current build; log every new request here; work the queue
> after each build completes. Updated after every build.

## 🔴 NOW
- [x] **Resolve Taylor's login** — done (auth-id repair ran; Taylor reaches /pos).

## ✅ READY TO PUSH — #2 Invoice auto-add + slow-movers (awaiting founder go)
- [x] `/api/founder/slow-movers` + `/founder/slow-movers` page + dashboard tile
- [x] `/api/supplier/invoice-auto-add` (match + review-queue create via bulk-add)
- [x] `/api/supplier/invoice-import-data` (picker data)
- [x] `/founder/invoice-import` review page (pick invoice + supplier → preview → add)
- [x] founder dashboard nav tiles (slow-movers + invoice-import)
- [ ] **push #2** (all of the above together) — awaiting go

## 🟢 QUEUED (in order)
- [~] **Directives System** (founder→staff assignment board) — handoff 2026-06-27. Decisions: body_cr / all-4-landings / defer auto-fire.
      - [x] STEP 1 verify-live + STEP 2 connector mapping (reported)
      - [x] STEP 3a migration → `docs/directives/01-migration.sql` (helper now plpgsql, paren-safe) — FOUNDER TO RUN (first attempt pasted the handoff block by mistake)
      - [x] STEP 3b `/founder/directives` composer (API + page) — built local, compiles. Task/duty, 3-lang body, role/location/user targets, seen/done counts, close. Audit→ai_writes.
      - [x] STEP 3d task=1 instance / duty=current-cycle instance on create (cycleKey helper)
      - [x] STEP 3c staff feed: `/api/directives/feed` (targeting + lazy duty-cycle + tri-lingual via profiles.language + seen/done) + `components/directives/MyDirectives.tsx` (fail-silent) embedded on /founder, /cashier, /spinytails, /supplier-handler
      - [ ] **BLOCKER:** migration not yet applied live (0 tables — pasted wrong text twice). Re-deliver as fenced block. Then push composer + feed.
- [ ] **FIX 2** — auto-return to dashboard after a photo upload (brief "Photo attached to PO #__" confirm).
- [ ] **FIX 3** — photo routing/filing:
      • supplier invoice → Purchase Orders
      • fishing-boat receipt (uploaded by a **processor**) → PO routed to **Spiny Tail** → starts intake + traceability (lot `STPC-YYYYMMDD-VV-NN`); **boat registration auto-pulled from the fisherman/boat (vessel) file**.
      ↳ NEEDS 2 answers: (a) `purchase_orders` vs `purchase_invoices`? (b) how is a boat receipt distinguished — uploader role=processor, or a doc-type pick?
- [ ] ⭐ **PACKAGE 3 — Payment Terminal Integration (PRIORITY)** — real-time RBC terminal (MID 024150/TID 02415004) + Plug'n Pay webhooks → auto-confirm paid orders; declined/timeout → hold "Payment Pending" + `/founder/payment-approvals` manual override. New: `orders.payment_approval_status` + `payment_webhook_received_at` + `payment_webhooks` table + order-confirm gating + 2 webhook endpoints. ⚠️ BLOCKED on Julian (webhook docs/creds/signature algo/sandbox); migration + manual page + gating buildable now, signature validation NOT. Test staging first. NEVER auto-process unpaid.
- [ ] **Supplier Catalog Image Pipeline** (spec 2026-06-28) — private `supplier_catalogs` bucket (is_staff RLS) → extract images from PDFs/email → match to pricelist by Item ID → `{supplier}_{product_id}` upload → auth URLs → "Image URL" column. NDC first (207 lines, 19 images). ⚠️ source files EXTERNAL — founder must provide. Reusable code buildable without them. Verify bucket + report first batch before push.
- [ ] `get_my_user_record` hardening (fallback to staff_roster) — recommended, prevents recurrence.

## ⏸ DEFERRED (blocked / by date)
- [ ] International **audit log + export docs** — until Spiny Tail has real processing data (lots/temps/certs).
- [ ] **Slice 3** commercial marketplace — needs RUN 1/RUN 2 schema applied.
- [ ] Phase 2: #3 6% fix (no live target — confirmed), #5 Slice 2 Spiny-Tail queue, #6 velocity pricing, #7 tri-lingual.

## 🧰 FOUNDER TO RUN (SQL — not code)
- [ ] Taylor login repair (clipboard now).
- [ ] RUN 1 + RUN 2 Phase-1 schema (commercial tiers, `business_accounts`, `quota_tracking`) — unblocks commercial + international accounts + the export gate.
- [ ] (optional) `get_my_user_record` staff_roster fallback.

## 🚀 SHIPPED (recent)
- Phone orders (entry→approval→print) + Slice 1 paid-orders + Nassau daily-sales filter.
- International export gate + export-only `/market` filter + banner (dormant until RUN 2 + accounts).
