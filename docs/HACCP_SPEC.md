# 2026-06-17 — HACCP Farm-to-Export System & Per-User Page Build Spec

Status: DEFINED, NOT YET BUILT. Captured live during the fisheries/HACCP consultant
meeting. Pending: consultant's authoritative forms, legal/audit review, and build.
This is the blueprint for the per-user staff pages and the processing/export records.

## How this maps to the system
Every record below defines a page/card for the staff role responsible for it. Each
staff member logs in and sees only their role's cards, in their ordered language
(English, Haitian Creole, Spanish), on food-grade-covered or wall-mounted devices,
locked into the continuous loop (founder-gated; a section can work on its own but
cannot break the chain). The lot code STPC-YYYYMMDD-VV-NN threads the whole chain.

## THE CLOSED LOOP (origin -> export), in order
1. Fisherman Terms of Agreement (pre-supply gate)
2. Origin record (boat-side)
3. Transport / delivery condition
4. Receiving CCP
5. Temperature monitoring logs
6. Processing log (thaw / clean / cut)
7. Sulfite testing
8. Grade sheet (lobster)
9. Primary packaging
10. Blast freezer
11. Distribution storage freezer
12. Master packaging + labeling
13. Export label content
14. Shipping & export
Systematic verification sign-off on EVERY log. Founder dashboard captures CCPs throughout.

## 1. Fisherman Terms of Agreement (pre-supply gate)
Signed agreement before a fisherman may supply: commits to good-quality, HACCP-standard,
LEGAL product; acknowledges seriousness. Binds them to reject criteria: no egg-bearing /
spawning / berried lobster or signs eggs were removed; no undersized product; no decaying /
spoiled product; no chemical overuse / contamination. LEGAL FLAG: real contract touching
fisheries law (protected species, size limits), warranties, liability — ATTORNEY REVIEW
before binding. Fits BSC principle: start relationships with clear terms, dignity, no traps.

## 2. Origin record (boat-side)
Catch picture at harvest; boat registration number (government-registered); GPS coordinates
(latitude, longitude) + timestamp; harvest gear used — traps, spears, nets(?), hooks —
multi-select (one or more) PLUS add-other option; crew list (number + persons aboard).
FLAGS: crew names + vessel GPS = personal/sensitive data — data-protection checkpoint at
build (consent, who can see position data, storage).

## 3. Transport / delivery condition (two paths)
Path A — Refrigerated vehicle: temp 33-38°F; cleaned before use; running properly.
Path B — Open bed truck: blue vats covered and clean; back of truck clean; visible ice in
bins if fresh, no ice needed if frozen; running properly.
Then (both) product temp check at receiving.

## 4. Receiving CCP (processor input -> founder dashboard)
Product temperature + time received: fresh <= 40°F / 4°C; frozen <= 0°F / -18°C.
# of bags, total lbs. Seal type per bag: metal seal / zip tie (plastic) / hand-tie string
(tamper-evidence; NOTE lobster spec says no metal ties — recording a metal tie must FLAG a
violation, not just log it). Lobster acceptance criteria: minimum tail length 5.5"; no
egg-bearing or signs eggs removed; no clipped fins or tails; no strong/off-putting odors;
no excessive melanosis (no black belly exceeding 75% of tail); sulfite <= ___ ppm (CONFIRM
100 vs 160); no metal / no metal ties; no soft shells; minimum cracks allowed. Damaged
shells -> converted to lobster meat for LOCAL sales (diversion path: NOT an export lot —
keep traceability clean, separate status). Fisherman code / ID #. Assign one receiving
batch code per supplier per load. CCP result captured -> reported to founder dashboard
(green = met, flag = breach needs corrective action).

## 5. Temperature monitoring logs
Receiving zone: twice daily (AM, PM) — Date, Time, Temp °F.
Storage zone: twice daily (AM, PM).
Freezer zone: THREE times daily — Morning, Noon, Before Closing (Before-Closing breach =
highest priority, corrective action before close). Each entry checked vs zone limit -> breach
flags to founder dashboard. CONFIRM with consultant: is manual logging sufficient, or does the
export-product freezer need continuous monitoring + overnight alarm?

## 6. Processing log (thaw / devein / clean / cut)
Critical limit: product < 40°F throughout.
Thawing table: per #Bin — Temp °F + Time, repeated at intervals.
Deveining + Cleaning: 2 HR MAX step. Log time activity started, ambient temp of room, time.
Conch cleaning level (processor selects): 90% / 95% / 100% white meat — FEEDS yield % and the
6% conch yield / MAMR 30,000-lb finished-weight quota; must stay consistent with quota paperwork.
Fish: gut, scale, fillet (as applicable). Lobster: controlled thaw + devein.
Product-bath temperature recorded; ADD ICE when bath temp rises above the critical cold limit
(corrective action). Production record: # processor; # lbs processed; # lbs waste; % yield;
batches processed / ID codes; Ice present? Y/N; random core temps <= 40°F; random sulfite
<= ___ ppm (CONFIRM 100 vs 160).

## 7. Sulfite testing CCP (conch AND lobster)
Method: color-grade sulfite test strips (color -> ppm). Record ppm reading per batch/lot
(consider attaching strip photo for audit). Critical limit <= ___ ppm (CONFIRM 100 vs 160).
Connects forward to LABEL sulfite declaration. CONFIRM with consultant: market (US/EU) label
declaration threshold (US requires declaration above 10 ppm in finished product).

## 8. Grade sheet (lobster grading)
Time started / ended; ambient temp at start / end (time+temp bookends). Grade | Count |
Appropriate size: 5oz=4.5-5.4; 6oz=5.5-6.4; 7oz=6.5-7.4; 8oz=7.5-8.4; 9oz=8.5-9.4;
10/12oz=9.5-12.4; 12/14oz=12.5-14.4; 14/16oz; 16/18 or 16/20; 20+ up. CONFIRM with consultant:
clean up bracket boundaries around 14-16oz (gap/overlap flagged "missing"). Logger ID (grader).

## 9. Primary packaging
Date, Time started, Time ended. Poly bags present? Y/N. Boxes present? Y/N. Which bag sizes
used? — dropdown 12x36, 12x38, PLUS add-other if different. Box counts per grade (# 5oz boxes,
# 6oz boxes, ... through grade range). Inner level of two-level packaging (primary = inner
graded boxes w/ poly bags; master = outer 40 lb carton).

## 10. Blast freezer (per-batch fast-freeze CCP -> IQF)
Date; Time Input + Temp °F (in); Time Output + Temp °F (out). Proves fast freeze to IQF spec.
CONFIRM target output temp + max time. This may be the parasite-control CCP for any
raw-consumption product.

## 11. Distribution storage freezer (holding CCP)
Date; Time Input + Temp °F; Time Output + Temp °F; PLUS the 3x-daily monitoring (Morning/Noon/
Before Closing) at <= 0°F / -18°C. Proves continuous frozen hold until distribution.

## 12. Master packaging + labeling
Date, Time began / ended. Scales in use — capture/tick Scale ID #. Master carton (40 lb) count
per grade: 5oz, 6oz, 7oz, 8oz, 9oz, 10/12, 12/14, 14/16, 16/18 or 16/20, 20+ up.
Label verification checks (check these before ship): Sulfite declaration added? Y/N; Lobster
allergen declaration present? Y/N; All other labeling info present? Y/N; Total # of Masters.

## 13. Export label content (lobster example)
Manufactured by: company name, address, Processing Plant Approval Number (e.g., "Manufactured
by Spiny Tails Processing Co., Firetrail Road, Nassau, New Providence, The Bahamas, PP# ____" —
PP# PENDING this license update). Product market name + scientific name (e.g., IQF Raw Spiny
Lobster Tails, Panulirus argus). Full description + intended consumer use (e.g., "Raw IQF Spiny
Lobster Tails stored and distributed frozen in air packaging. Product to be fully cooked before
consumption by the general public" — CONFIRMS lobster = COOK-BEFORE-EAT, IQF, AIR-packaged).
Weight (e.g., 10 lbs / 4.54 kg). "Keep frozen until ready for consumption." Sulfite declaration.
"Spiny Lobster is an allergen (crustacean)." Lot Code (traceability anchor -> back to boat).
Production Date. Best before date. CONFIRM conch label separately (likely different intended-use;
add CITES line). CONFIRM air vs vac packaging (air sidesteps the reduced-oxygen C. botulinum concern).

## 14. Shipping & export (final link)
Admin upload (gated, tied to lot + customer): P1 RF (CONFIRM what this form is); Inspection
Worksheet; COI (CONFIRM = Certificate of Inspection?); customs-related paperwork; shipping info;
Export Declaration. CONCH adds CITES Cert (per MAMR quota: each lot needs Inspection Cert + CITES
Cert). Shipment conditions: Arrival temp < 0°F; Departure temp < 0°F (final cold-chain proof);
Vessel Title; Date + Time. Upload is admin/founder-gated and audit-logged.

## CROSS-CUTTING: Systematic verification (every log)
Verification is a SYSTEM ACTION, not a hand-filled field. On sign-off the system AUTOMATICALLY
captures Date + Time (server-stamped, immutable, not user-editable) + Signature (the verifier's
authenticated login identity). Logger (who recorded) MUST differ from Verifier (who reviews/signs).
Verifier role-gated to supervisor / QC / founder. Produces a legal-grade audit-trailed record per
log. Dashboard surfaces logs pending verification; nothing ships on an unverified log.

## CROSS-CUTTING: System-wide patterns
- Dropdown + add-other escape hatch (harvest gear, seal type, bag size).
- Time + temp bookends on every product-handling step (proves cold-chain duration).
- CCP results escalate to the founder dashboard (green/flag), like the Bank Intelligence pattern.
- Lot code STPC-YYYYMMDD-VV-NN is the single traceability anchor end to end.
- Receiving batch code (one per supplier per load) links to the processing lot code.
- Per-user role-scoped pages, tri-lingual, food-grade-covered/wall-mounted devices, loop-locked.

## OPEN ITEMS TO CONFIRM (with consultant / before build)
- P1 RF: what is this form / who issues it?
- COI: Certificate of Inspection? (vs Origin / Insurance)
- Sulfite critical limit: 100 ppm or 160 ppm? (appeared as both)
- Harvest gear "beats": is this nets? (transcription)
- Grade brackets: clean up 14-16oz gap/overlap
- Blast freezer: target output temp + max freeze time
- Conch intended use: raw / ready-to-eat vs cook-before-eat (lobster confirmed cook-before-eat)
- Air vs vacuum packaging (confirm; affects plan + label)
- Freezer monitoring: manual 3x/day accepted, or continuous + alarm required for export?
- Certifying market: US FDA, EU, or both (drives mandatory elements + label declarations)
- PP# (Processing Plant Approval Number): pending issuance from this license update

## LEGAL / BUILD GATES (per BSC rules)
- Fisherman Terms of Agreement -> attorney review before binding.
- Crew list + vessel GPS -> data-protection checkpoint (consent, access, storage).
- COI / cert / export-doc uploads -> admin/founder-gated, audit-logged.
- Verification sign-off -> authenticated, immutable timestamp, role-gated.
- Whole build -> spec-first, verify live schema before building, legal/audit pass (touches
  supplier payment via QC accept/adjust/reject and export compliance).
