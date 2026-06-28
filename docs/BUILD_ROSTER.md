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
- [ ] **Directives System** (founder→staff assignment board) — handoff 2026-06-27.
      4 tables (directives / directive_targets / directive_instances / directive_receipts) + RLS,
      `/founder/directives` composer (founder-only), staff "My Tasks" feed on landing pages,
      tri-lingual manual fields (EN/HT/ES, no translation API), duties=live-inherit / tasks=snapshot.
      ↳ STEP 1 verify-live + report BEFORE any SQL; STEP 2 connector mapping; STEP 3 build.
- [ ] **FIX 2** — auto-return to dashboard after a photo upload (brief "Photo attached to PO #__" confirm).
- [ ] **FIX 3** — photo routing/filing:
      • supplier invoice → Purchase Orders
      • fishing-boat receipt (uploaded by a **processor**) → PO routed to **Spiny Tail** → starts intake + traceability (lot `STPC-YYYYMMDD-VV-NN`); **boat registration auto-pulled from the fisherman/boat (vessel) file**.
      ↳ NEEDS 2 answers: (a) `purchase_orders` vs `purchase_invoices`? (b) how is a boat receipt distinguished — uploader role=processor, or a doc-type pick?
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
