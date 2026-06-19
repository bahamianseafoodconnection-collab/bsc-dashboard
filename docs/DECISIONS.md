# BSC Decisions & System Knowledge Ledger

> Append-only. Never delete an entry. To change a past decision, add a NEW dated entry that supersedes it and references the old one by date/title. Git history preserves everything; corrections make the record stronger, never shorter.

## How to use this file
- Every locked decision, schema change, migration, and system upgrade gets an entry here, committed to git in the same motion as the change.
- A change is not "done" until it is recorded here.
- New chats / new people: read this file at the start of any BSC work. This file (plus the system_decision_log table in Supabase) is the source of truth, not anyone's memory, not the chat's summary, not recall.
- Mirror of this file lives in Supabase table public.system_decision_log so the platform and Founder AI can read the record, not just humans.

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
