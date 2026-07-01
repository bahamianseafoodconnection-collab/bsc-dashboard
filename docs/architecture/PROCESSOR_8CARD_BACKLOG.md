# BACKLOG — Processor Dashboard: 8-Card Cold-Chain Sequence

Founder handoff (2026-07). **Deferred** — build after the current dashboard-redesign
build order (directives → cashier → founder feed → supplier-handler). Replaces the
current Step-2 `/processor` take-in with a clean 8-card stage sequence. Every action
logs time+date+batch(CON-/LOB-YYYYMMDD-NN)+boat+registration cert+catch location and
feeds Dedrick's founder activity/approval feed. **Verify schema against live DB first.
Full files only. Show each card before push. Empty/erroring cards = do NOT ship.**

## The 8 cards (in order)
1. **New raw product from boat** — boat select → auto-attach that boat's registration
   cert (vessel-certs); add new boat inline (name, reg#, cert upload); inputs: product
   type, core temp, weight, bags/bins + wt per bag; auto batch code; captures boat +
   cert + catch location + date; saves raw batch into freezer (`in_receiving_freezer`).
2. **Inventory intake: finished product from supplier** — finished goods from a supplier
   (not a boat): select supplier, product, quantity, cost; lands in inventory (separate
   from boat raw-stock).
3. **Remove from freezer (Holding or Blast)** — select batch → auto-show product/date/
   boat/cert/catch location; pick freezer (Holding|Blast); reason (defrost-for-processing
   / BSC sales / external order); logs who/when/why; removes from that freezer.
4. **Defrosting** — select batch → shows product/weight/boat/cert/batch; log defrost
   start time+date; bath temperature recorded.
5. **Deveining** — select batch; bath temp REQUIRED; time+date stamped.
6. **Sleeving** — select boat + batch; time+date stamped.
7. **Blast freezer** — batch code + origin (boat/cert); shows full stage history + all
   logged bath/freezer temps carried forward; records into blast freezer + date.
8. **Remove from blast → boxing + labeling → holding freezer (final)** — pull from blast;
   enter cases by grade (e.g. 10×5oz, 4×6oz); every case ties to batch+boat+reg#+catch
   location; generate case barcodes + labels (label engine); boxed+labeled onto pallet,
   wrapped, into HOLDING freezer, marked ready for shipping.

## Standing temp-log cards (always available, scanner-linked)
- Blast Freezer Temp Log (target 0°F), Holding Freezer Temp Log, Inventory Freezer Temp
  Log, Bath/Batch Temp Log. Barcode scanner → readings auto-attach to scanned batch.

## Dedicated FRONT-OF-DASHBOARD card — Record Freezer Temperature
Not buried. Select freezer (Blast/Holding/Inventory) → temp reading → time+date auto.
Required 3×/day (morning/noon/evening); dashboard shows which readings are still due
("noon reading not yet logged"). Scanner-linked (attaches to scanned batch). Target
Blast+Holding 0°F, flag out-of-range. Feeds Fisheries Freezer #1/#2 grid.

## Notes / reuse (already built this session)
- Batch generator `spinytails_next_batch_number` (CON-/LOB-) — never deviate.
- Existing plumbing: receive API (decision + purchase_cost), defrost/processing/grading
  pages, label engine (`lib/spinytails-product-label`), freezer-temp API, inventory.
- Cards 3-8 largely map to existing spinytails tables + the /spinytails/* flows —
  this is mostly a clean card-based REASSEMBLY on /processor, not new schema.
- Founder feed = read-only live activity across all stages.
