-- =====================================================================
-- BSC Migration: 20260519060000_spinytails_documents.sql
--
-- Spiny Tails Processing Co. — SSOP / SOP / HACCP document library.
-- Source content extracted from:
--   • Spiny Tails Processing Co. - Lobster SOP Narrative.docx
--   • Spiny Tails Processing Co. - SSOP and Organizational Chart.docx
--   • Spiny Tails HACCP Traceability Master.docx
--
-- Each document can be tagged with applies_to_step (1-11), applies_to_ssop
-- (the 12 SSOPs from the migration enum), and/or applies_to_ccp (5 CCPs).
-- Tags drive cross-references on /spinytails/intake and lot-detail pages
-- so staff and inspectors see the relevant SOP at every step.
--
-- Bodies are stored inline as markdown (body_md) for quick reference and
-- the canonical PDF/docx can be uploaded to file_url. Versioning via
-- (slug, version) UNIQUE + partial index ensuring one is_current per slug.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'doc_kind') THEN
    CREATE TYPE doc_kind AS ENUM (
      'sop',        -- step-by-step procedure
      'ssop',       -- sanitation SOP
      'haccp_plan', -- HACCP plan form / hazard analysis
      'form',       -- record form (Receiving Record, etc.)
      'policy',     -- general policy
      'training',   -- training manual
      'manual'      -- equipment manual / other
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS spinytails_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT NOT NULL,                       -- e.g. 'sop-step-1-receiving'
  title            TEXT NOT NULL,
  doc_kind         doc_kind NOT NULL,
  version          TEXT NOT NULL DEFAULT '1.0',
  -- Context mapping — at least one should be set so the doc surfaces somewhere
  applies_to_step  INT  CHECK (applies_to_step IS NULL OR applies_to_step BETWEEN 1 AND 11),
  applies_to_ssop  ssop_id,
  applies_to_ccp   ccp_id,
  -- Content
  summary          TEXT,                                -- one-line description
  body_md          TEXT,                                -- markdown content (inline display)
  file_url         TEXT,                                -- canonical PDF/docx in spinytails-documents bucket
  -- Workflow / versioning
  is_current       BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from   DATE,
  expires_at       DATE,
  approved_at      TIMESTAMPTZ,
  approved_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slug, version)
);

-- Only one is_current document per slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_spinytails_docs_current_slug
  ON spinytails_documents (slug) WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_spinytails_docs_step ON spinytails_documents (applies_to_step) WHERE applies_to_step IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spinytails_docs_ssop ON spinytails_documents (applies_to_ssop) WHERE applies_to_ssop IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spinytails_docs_ccp  ON spinytails_documents (applies_to_ccp)  WHERE applies_to_ccp  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spinytails_docs_kind ON spinytails_documents (doc_kind);

-- Touch trigger (reuses helper from 20260519050000)
DROP TRIGGER IF EXISTS trg_spinytails_docs_touch ON spinytails_documents;
CREATE TRIGGER trg_spinytails_docs_touch
  BEFORE UPDATE ON spinytails_documents
  FOR EACH ROW EXECUTE FUNCTION spinytails_touch_updated_at();

-- Storage bucket — public read so inspector QR-scan links work, staff write
INSERT INTO storage.buckets (id, name, public)
VALUES ('spinytails-documents', 'spinytails-documents', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "spinytails-docs public read"   ON storage.objects;
DROP POLICY IF EXISTS "spinytails-docs staff write"   ON storage.objects;
CREATE POLICY "spinytails-docs public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'spinytails-documents');
CREATE POLICY "spinytails-docs staff write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'spinytails-documents' AND auth.role() = 'authenticated');

-- RLS — anyone authenticated can READ (staff + future inspector role),
-- staff writes, admin-only deletes.
ALTER TABLE spinytails_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_spinytails_documents_read   ON spinytails_documents;
DROP POLICY IF EXISTS p_spinytails_documents_insert ON spinytails_documents;
DROP POLICY IF EXISTS p_spinytails_documents_update ON spinytails_documents;
DROP POLICY IF EXISTS p_spinytails_documents_delete ON spinytails_documents;

CREATE POLICY p_spinytails_documents_read ON spinytails_documents
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY p_spinytails_documents_insert ON spinytails_documents
  FOR INSERT TO authenticated WITH CHECK (is_bsc_qc_staff());
CREATE POLICY p_spinytails_documents_update ON spinytails_documents
  FOR UPDATE TO authenticated
  USING (is_bsc_qc_staff()) WITH CHECK (is_bsc_qc_staff());
CREATE POLICY p_spinytails_documents_delete ON spinytails_documents
  FOR DELETE TO authenticated USING (is_bsc_admin());

-- ─────────────────────────────────────────────────────────────────────
-- SEEDS — 11 SOP steps + 12 SSOPs + 5 CCP markers
-- Bodies are condensed from the source SOP/SSOP narratives. Admin can
-- upload canonical PDFs and replace body_md via /spinytails/documents.
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO spinytails_documents (slug, title, doc_kind, applies_to_step, applies_to_ccp, version, summary, body_md, is_current, approved_at) VALUES
('sop-step-01-receiving', 'Step 1 — Receiving Lobsters', 'sop', 1, 'ccp1_receiving', '1.0',
 'Receive fresh ≤40°F or frozen ≤0°F. Record on Lobster Receiving Record.',
$$## Step 1 — Receiving Lobsters (CCP-1)

Lobster tails are received either **fresh ≤40°F/4°C** (operating 33-38°F) or **frozen ≤0°F/-18°C** in bulk polybags from fishermen.

**Quality Assurance Personnel records on the Lobster Receiving Record:**
- Temperature readings
- Product quantity and weight
- Supplier details — fisherman name, vessel, fishing area, fishing dates

**Critical Limit (CCP-1):** core temp ≤40°F (fresh) or ≤0°F (frozen). If exceeded, **reject and return to supplier**.

**Estimated time:** 30-45 minutes.$$,
 TRUE, NOW()),

('sop-step-02-quality-inspection', 'Step 2 — Quality & Safety Inspection', 'sop', 2, 'ccp1_receiving', '1.0',
 'Sample 10-15% of received lot. Test sulfite ≤100 ppm + sensory checks.',
$$## Step 2 — Quality & Safety Inspection (CCP-1)

Sample **10-15% of the received lot**. May include a chill bath for frozen product. Check for:

- **Legal size** — minimum tail length 5.5 in (14 cm) per Bahamian Fisheries laws
- **No egg-bearing lobsters**
- **No clipped fins or tails**
- **No off-putting odors**
- **No excessive melanosis** (black belly / dark discoloration)
- **Sulfite ≤100 ppm** (Codex Alimentarius). Sulfite strip test. Fishermen sometimes add 223 Sodium Metabisulfite for freshness.
- **No foreign matter** (metal, oil, paint chips). Fishermen instructed to use food-grade tie straps.
- **Soft shell**
- **Core temp** — ≤40°F critical, ≤35°F operating
- **Cracked or damaged shells**

Findings logged on the **Lobster Safety & Quality Control Record**. Failed lots are rejected and returned; supplier suspended until corrective action proven.

Accepted lots tagged with lot number + fisherman color code. Maintained records: fisherman name + address, vessel ID, first freeze date, total quantity + weight.$$,
 TRUE, NOW()),

('sop-step-03-receiving-storage', 'Step 3 — Receiving Storage Freezer', 'sop', 3, NULL, '1.0',
 'Product held at ≤0°F. Daily freezer readings on the Temperature Control Record.',
$$## Step 3 — Receiving Storage Freezer

Product placed in frozen storage maintained at **≤0°F (-18°C)** until processing.

Freezer has **temperature data loggers + alarm** for system failure / temp excursion alerts. Daily freezer readings recorded on the **Temperature Control Record**. Data logger printouts reviewed weekly.

**Time:** varies by scheduling.$$,
 TRUE, NOW()),

('sop-step-04-thawing', 'Step 4 — Thawing', 'sop', 4, 'ccp2_thawing', '1.0',
 'Ice slurry ≤40°F overnight. Core temp check next morning. Above limit = discard.',
$$## Step 4 — Thawing (CCP-2)

Product moved from receiving storage to **large vats with ice slurry ≤40°F (4°C)**, operating range 33-38°F. Held overnight, room ambient ≤70°F.

**Processing Supervisor checks core temp first thing next morning.** If batch core temp is above critical limit, **product is discarded**.

Recorded on **Temperature Control Record**.

**Time:** 8-12 hours.$$,
 TRUE, NOW()),

('sop-step-05-deveining-cleaning', 'Step 5 — De-veining & Cleaning', 'sop', 5, 'ccp3_deveining_sulfite', '1.0',
 'Manual de-vein with food-grade knives + potable water rinse. Sulfite recheck.',
$$## Step 5 — De-veining & Cleaning (CCP-3)

Tails moved to processing tables. **Manually de-veined** with stainless steel knives meeting GMP / SSOP standards. Cleaned under **running potable water**.

After cleaning: placed in clean bins **with ice (product ≤40°F)** and moved to Sorting & Grading.

**Processing Supervisor takes random samples** to check sulfite levels and core temp. Data logged on **Lobster Processing Log**. Product stays on ice throughout.

**Time:** 1-2 hours.$$,
 TRUE, NOW()),

('sop-step-06-sorting-grading', 'Step 6 — Sorting & Grading', 'sop', 6, NULL, '1.0',
 'Sort defective. Grade by oz: 5oz · 6oz · 7oz · 8oz · 9oz · 10/12 · 12/14 · 14/16 · 16/20 · 20+.',
$$## Step 6 — Sorting & Grading

Tails with excessive damage / black bellies / undesirable conditions go to a separate bin (**not for export** — used as fisherman bait or sold locally as crawfish meat, still legal under Bahamian Fisheries Law).

**Grading by weight (oz):**

| Grade | Weight range |
|---|---|
| 5oz | 4.5 - 5.4 oz |
| 6oz | 5.5 - 6.4 oz |
| 7oz | 6.5 - 7.4 oz |
| 8oz | 7.5 - 8.4 oz |
| 9oz | 8.5 - 9.4 oz |
| 10/12 oz | 9.5 - 12.4 oz |
| 12/14 oz | 12.5 - 14.4 oz |
| 14/16 oz | 14.5 - 16.4 oz |
| 16/20 oz | 16.5 - 20.4 oz |
| 20+ oz | 20.5 oz and above |

Each grade in its own bin. Supervisor takes random samples for grade + temp checks. Logged on **Lobster Processing Log**. Product remains on ice.

**Time:** 1-2 hours.$$,
 TRUE, NOW()),

('sop-step-07-primary-packaging', 'Step 7 — Primary Packaging (10lb boxes)', 'sop', 7, NULL, '1.0',
 'Individual sleeves + 10 lb cardboard boxes. Counts per grade enforced.',
$$## Step 7 — Primary Packaging (10 lb / 4.54 kg boxes)

Each tail **individually sleeved** in food-approved polybags (12x36 or 12x38). Packed into 10 lb cardboard boxes labeled with grade. Production code (DDMMYY) on every box.

**Tail count per box by grade:**

| Grade | Count |
|---|---|
| 5oz | 29-33 |
| 6oz | 25-29 |
| 7oz | 21-24 |
| 8oz | 19-21 |
| 9oz | 17-18 |
| 10/12oz | 13-16 |
| 12/14oz | 11-13 |
| 14/16oz | 10-11 |
| 16/20oz | 8-10 |
| 20+ oz | 5-8 |

Boxes placed on rolling trolleys → blast freezer. Counts recorded on **Lobster Processing Log**. Core temp ≤40°F until blast-freezing, room ambient ≤70°F.

**Time:** 1-2 hours.$$,
 TRUE, NOW()),

('sop-step-08-blast-freezing', 'Step 8 — Blast Freezing', 'sop', 8, 'ccp4_blast_freezing', '1.0',
 'Start -10°F, reach -35 to -40°F. Product core ≤0°F within 24h.',
$$## Step 8 — Blast Freezing (CCP-4)

Tails placed in blast freezer **overnight**. Freezer starts at **-10°F (-23°C)**, reaches **-35 to -40°F (-37 to -40°C)**. Product reaches **≤0°F core temp within 24 hours**.

Data loggers + alarm for system failure / temp deviation. **Initial and final readings** recorded on **Temperature Control Record**. Weekly printout review.

Temperature deviation → product and freezer conditions investigated; raise a corrective action.

**Time:** 12-24 hours.$$,
 TRUE, NOW()),

('sop-step-09-master-packaging', 'Step 9 — Master Packaging & Labeling', 'sop', 9, 'ccp5_labeling', '1.0',
 'Top boxes, affix labels. CCP-5: sulfite + crustacean allergen declarations required.',
$$## Step 9 — Master Packaging & Labeling (CCP-5)

Processing room cleaned + sanitized first. 10 lb bottom boxes from blast freezer placed on tables, tops affixed, **label applied** to every 10 lb box.

**Required label content:**
- Manufactured by **Spiny Tails Processing Co., Fire Trail Road, Nassau, New Providence, The Bahamas, PP# _____**
- Market + scientific name — **IQF Raw Spiny Lobster Tails, _Panulirus argus_**
- Full product description + intended use — **fully cook before consumption**
- Weight (10 lb / 4.54 kg)
- **Keep frozen until ready for consumption**
- **Sulfite declaration** ← CCP-5 required
- **Spiny Lobster is an allergen (crustacean)** ← CCP-5 required
- **Lot Code** ← CCP-5 required
- Production date
- Best-before date

Then **4 × 10 lb boxes** placed inside a **40 lb / 18.14 kg master carton**. Same label info, weight changed to 40 lb.

Includes **batch coding for traceability**. Supervisor conducts temp checks. Recorded on **Lobster Packaging & Labeling Record**.

**Time:** 1-2 hours.$$,
 TRUE, NOW()),

('sop-step-10-distribution-storage', 'Step 10 — Distribution Storage Freezer', 'sop', 10, NULL, '1.0',
 'Finished product ≤0°F. Three temp checks daily (AM/midday/EOD).',
$$## Step 10 — Distribution Storage Freezer

Finished product placed in frozen storage **≤0°F (-18°C)** until export.

Data loggers + alarm. **Three daily freezer readings** — morning, midday, end of day — on **Temperature Control Record**. Weekly printout review.

**Time:** varies by shipment schedule.$$,
 TRUE, NOW()),

('sop-step-11-shipping-export', 'Step 11 — Shipping & Export', 'sop', 11, NULL, '1.0',
 'Inspected by Marine Resources. COI issued. Refrigerated truck ≤0°F, temp chips in lot.',
$$## Step 11 — Shipping & Export

Product inspected by **The Department of Marine Resources**. On acceptance, **Certificate of Inspection (COI)** issued, accompanying the lot through Customs to air/sea freight.

Transport by **refrigerated truck**, travel ≤30 min, product **≤0°F (-18°C)**. **Temp chips** placed within export lots to track temperature. Sea freight maintains + tracks ≤0°F.

**Time:** per shipping schedule.$$,
 TRUE, NOW())
ON CONFLICT (slug, version) DO NOTHING;

-- 12 SSOPs (titles + summaries from the SSOP and Organizational Chart doc)
INSERT INTO spinytails_documents (slug, title, doc_kind, applies_to_ssop, version, summary, body_md, is_current, approved_at) VALUES
('ssop-01-water', 'SSOP 1 — Safety of Water', 'ssop', 'ssop_01_water', '1.0',
 'Municipal water + in-house ice. Chlorine 0.2-0.5 ppm. Daily strip testing. Bi-annual lab analysis.',
$$## SSOP 1 — Safety of Water

**Goal:** Ensure safety of water contacting food / food contact surfaces / used to manufacture ice.

**Method:**
- Municipal water supply, chlorine 0.2-0.5 ppm (WHO standards)
- In-house ice machine (2,500 lbs/day, crushed or flake)
- Daily chlorine test strips (target 0.2-0.5 ppm residual)
- Plumbing back-siphonage devices + valve controls
- Water outlets numbered on the facility map
- Independent lab microbiology + chemistry analyses

**Frequency:** Daily pre-op water testing + ice making + plumbing checks. Annual plumbing review + lab analyses. Bi-annual microbial testing.

**Corrective:** Chlorine out of range → adjust injector. Microbial hit → halt + investigate + retest before resume.

**Records (kept 2+ years):** Daily Sanitation Checklist, In-house Water Testing Log, Lab analyses, Annual Sanitation Checklist, Corrective Action Reports.$$,
 TRUE, NOW()),

('ssop-02-facility-cleanliness', 'SSOP 2 — Condition & Cleanliness of Facility & Equipment', 'ssop', 'ssop_02_facility_cleanliness', '1.0',
 'Daily sanitization. FCS every 4h (100-200ppm). Floors/walls EOD. Pre-op + post-op inspections.',
$$## SSOP 2 — Condition & Cleanliness of Facility & Equipment

**Goal:** Process areas, food contact surfaces, equipment, utensils, and gear all appropriate and clean.

**Method:**
- **Gear:** Disposable (lab coats, hair nets, masks, nitrile gloves) discarded EOD / task change / damage. Reusable (rubber boots, heavy gloves) cleaned with FDA/EPA-approved sodium hypochlorite or quaternary ammonium.
- **Floors / drains / walls:** Sanitized **EOD** with 400 ppm chlorine or 200 ppm quat ammonium.
- **Windows / doors / overhead fixtures:** Weekly.
- **Food contact surfaces (tables, scales, knives, thermometers, bins, baskets, totes, aprons, ice machine, ice bins, shovels, pallets):** Pre-op + every 4 hours with 100-200 ppm chlorine or quat.

**Frequency:** Daily pre-op + every 4h on FCS. EOD on floors/walls/boots. Weekly on windows/doors/overheads. Bi-weekly AC + freezer shelving + ice machine deep clean. Monthly condenser units.

**Verification:** Weekly records review + signature by another HACCP-trained employee. Periodic FCS + non-FCS swabbing for pathogens.

**Records (2+ years):** Daily / Periodic / Monthly Sanitation Checklists, Training Records, Corrective Actions, Verification Records.$$,
 TRUE, NOW()),

('ssop-03-cross-contamination', 'SSOP 3 — Prevention of Cross-Contamination', 'ssop', 'ssop_03_cross_contamination', '1.0',
 'Segregate raw/finished. Footbaths 400 ppm chlorine. Color-coded tools.',
$$## SSOP 3 — Prevention of Cross-Contamination

**Goal:** Prevent cross-contact / cross-contamination between unsanitary objects, food, packaging, FCS, and from raw → cooked products.

**Method:**
- **Storage:** Segregate raw + finished in separate freezer zones. Color-coded signage. Time-separate raw vs. finished movement on the floor.
- **Handwashing:** Non-hand-operable stations, hot water (110°F). Required before/after raw/processed handling.
- **Footbaths:** 400 ppm sodium hypochlorite at 3 zones — receiving/processing, boxing/processing, staff change/processing. 4 oz bleach per 5 gal water.
- **Employee gear:** Disposable changed raw→finished, blast-freezer outputs use disposable lab coats only.
- **Tools:** Color-coded ice shovel vs lobster shovel. Bins/trays colored or numbered. Tables/scales/sinks cleaned 100-200 ppm.
- **Raw Packaging Materials Room:** Separate from processing, restricted access.

**Frequency:** Daily pre-op + every 4h + post-op on processing area, footbaths, freezers, sanitizer strength, restrooms, QA room, packaging room, receiving area. Hands/gear every 4h, task change, after breaks, when filthy.

**Records:** Daily Sanitation Checklist, Cross-Contamination Inspection Log, Training, Corrective Actions.$$,
 TRUE, NOW()),

('ssop-04-handwash-toilets', 'SSOP 4 — Hand Washing, Sanitizing & Toilet Facilities', 'ssop', 'ssop_04_handwash_toilets', '1.0',
 'Hot 110°F potable water, soap, sanitizer. Non-hand-operable stations. Restrooms separated.',
$$## SSOP 4 — Maintenance of Hand Washing, Sanitizing & Toilet Facilities

**Goal:** Adequate, well-maintained handwash + sanitizing + toilet facilities to prevent contamination.

**Method:**
- Non-hand-operable handwash stations with **hot 110°F potable water + soap + sanitizer**
- Hand-sanitizing dispensers throughout the processing area
- **Restrooms physically separated** from food handling areas, well-ventilated, stocked
- Footbaths at zone transitions (400 ppm bleach)

**Frequency:** Daily pre-op + every 4h checks on stations stocked + functional. Bi-weekly deep clean of restrooms.

**Records:** Daily Sanitation Checklist (handwash + restrooms section).$$,
 TRUE, NOW()),

('ssop-05-food-protection', 'SSOP 5 — Protection of Food, Packaging & Food Contact Surfaces', 'ssop', 'ssop_05_food_protection', '1.0',
 'Covered storage, no overhead drips, segregation, contamination prevention.',
$$## SSOP 5 — Protection of Food, Food Packaging Materials & Food Contact Surfaces (from Adulteration)

**Goal:** Protect food, packaging, and FCS from adulteration via biological, chemical, or physical contaminants.

**Method:**
- Covered product storage. Sealed bins/totes during movement.
- No overhead drip sources above food handling. AC condensate drains routed away.
- Packaging materials stored in a dedicated dry room (see SSOP 12).
- Lubricants on machinery food-grade where contact possible.
- Glass policy: no glass in production zones.

**Frequency:** Daily pre-op + every 4h product protection inspection.

**Records:** Daily Sanitation Checklist (protection section), Glass Audit.$$,
 TRUE, NOW()),

('ssop-06-toxic-chemicals', 'SSOP 6 — Proper Control of Toxic Chemicals', 'ssop', 'ssop_06_toxic_chemicals', '1.0',
 'Chemicals labeled + locked storage. SDS on file. Trained personnel only.',
$$## SSOP 6 — Proper Control of Toxic Chemicals

**Goal:** Prevent toxic chemicals from contaminating food, packaging, or FCS.

**Method:**
- Cleaning + sanitizing chemicals in **labeled containers**, stored in locked cabinets away from food handling
- Safety Data Sheets (SDS) on file + accessible
- Trained personnel only handle/dilute
- Pesticides applied only by licensed contractors (see SSOP 10)
- Single-use cleaning cloths or color-coded reusable

**Frequency:** Daily pre-op check of chemical storage area.

**Records:** Daily Sanitation Checklist (chemicals section), SDS Register, Chemical Inventory.$$,
 TRUE, NOW()),

('ssop-07-employee-health', 'SSOP 7 — Employee Health', 'ssop', 'ssop_07_employee_health', '1.0',
 'Daily health check, exclusion of ill/wounded staff from food handling.',
$$## SSOP 7 — Employee Health

**Goal:** Prevent contamination by ill or wounded employees.

**Method:**
- **Daily pre-shift health check** — supervisor asks about symptoms (vomiting, diarrhea, jaundice, sore throat with fever, infected wounds)
- Ill employees **excluded from food handling**; reassigned or sent home
- **Wounds covered** with waterproof bandage + glove
- Annual medical / food handler certification per Bahamian law

**Frequency:** Daily pre-op health screening.

**Records:** Daily Health Check Log, Medical Certificate file, Exclusion Records.$$,
 TRUE, NOW()),

('ssop-08-pest-exclusion', 'SSOP 8 — Exclusion of Pests', 'ssop', 'ssop_08_pest_exclusion', '1.0',
 'Sealed openings, screened doors, pest control contractor, no harborage.',
$$## SSOP 8 — Exclusion of Pests

**Goal:** Keep rodents, insects, and birds out of processing + storage areas.

**Method:**
- **All openings sealed** — windows screened, doors self-closing, gaps caulked
- **No harborage** — exterior debris cleared, vegetation trimmed back
- Licensed **pest control contractor** monthly inspection + bait station audit
- Internal traps logged
- No food/trash in personnel break areas overnight

**Frequency:** Daily pre-op visual sweep. Monthly contractor visit + report.

**Records:** Pest Control Contractor Reports, Internal Trap Log, Daily Sanitation Checklist (pest section).$$,
 TRUE, NOW()),

('ssop-09-waste-disposal', 'SSOP 9 — Waste Disposal', 'ssop', 'ssop_09_waste_disposal', '1.0',
 'Lined bins, covered, removed daily. Offal/shell waste separated. Approved disposal.',
$$## SSOP 9 — Waste Disposal Procedures

**Goal:** Properly contain + remove waste so it doesn't become a contamination source.

**Method:**
- **Lined bins, lidded, color-coded** for general / cardboard / offal+shell+organic
- Bins emptied at end of every shift; full bins removed immediately
- **Offal + shell waste** segregated, removed daily, transported by approved waste contractor
- External dumpster locked + on hard surface, located away from intake doors
- No waste accumulated in processing rooms

**Frequency:** Continuous during ops + EOD full clear.

**Records:** Waste Removal Log, Contractor Pickup Receipts, Daily Sanitation Checklist (waste section).$$,
 TRUE, NOW()),

('ssop-10-outside-contractors', 'SSOP 10 — Outside Contractors', 'ssop', 'ssop_10_outside_contractors', '1.0',
 'Approved vendors only. Sign-in, escorted, hygiene compliance.',
$$## SSOP 10 — Responsibility of Outside Contractors

**Goal:** Contractors (pest control, plumbing, electrical, refrigeration, lab) don't introduce contamination.

**Method:**
- **Pre-approval** — contractor reviewed for licensing + insurance + food safety familiarity
- **Sign-in log** at entry. Escorted by sanitation/processing supervisor in food handling areas
- Same hygiene rules as employees (hairnets, masks, no jewelry, hands washed)
- Tools wiped down on entry; chemicals approved + segregated
- Work scheduled during non-processing windows when possible

**Frequency:** Per contractor visit.

**Records:** Contractor Sign-in Log, Contractor License + Insurance file, Service Reports.$$,
 TRUE, NOW()),

('ssop-11-transport-vehicles', 'SSOP 11 — Transport Vehicles', 'ssop', 'ssop_11_transport_vehicles', '1.0',
 'Clean + sanitized truck bed. Temp ≤0°F monitored, recorded pre/post each transport.',
$$## SSOP 11 — Condition and Cleanliness of Transport Vehicles

**Goal:** Vehicles transporting raw material or finished product don't contaminate or temperature-abuse the product.

**Method:**
- **Refrigerated truck bed cleaned + sanitized** before loading
- **Temperature ≤0°F** maintained throughout transport (finished product). Raw inbound product temp matched to receipt expectation (fresh ≤40°F / frozen ≤0°F)
- **Temperature data chip** placed in each export lot
- Pre-load + post-unload visual inspection (no debris, off-odors, pest signs)
- Drivers trained on sanitation + temp protocols

**Frequency:** Every load — pre + post.

**Records:** Transport Vehicle Inspection Log, Temperature Chip readings, Cleaning Log.$$,
 TRUE, NOW()),

('ssop-12-raw-material-storage', 'SSOP 12 — Raw Material (Packaging) Storage', 'ssop', 'ssop_12_raw_material_storage', '1.0',
 'Dry storage room, stretch-wrapped, 6 inches off walls/floors/ceiling.',
$$## SSOP 12 — Raw Material (Packaging) Storage

**Goal:** Packaging materials (polybags, cardboard boxes, master cartons, labels) stored without contamination.

**Method:**
- **Dedicated Raw Packaging Materials Room** — dry, restricted access, separate from processing
- **Plastic pallets / shelves**, materials stretch-wrapped until use
- Pallets arranged **6 inches** from walls, floors, ceilings
- FIFO rotation — older stock used first
- Visual inspection on delivery (no damage, no pest signs, no contamination)
- Lot numbers assigned to each delivery; recorded on **Raw Packaging Materials Log**

**Frequency:** Daily check + every delivery.

**Records:** Raw Packaging Materials Log, Daily Sanitation Checklist (packaging room section), Delivery Inspection.$$,
 TRUE, NOW())
ON CONFLICT (slug, version) DO NOTHING;

-- 5 CCP overview docs
INSERT INTO spinytails_documents (slug, title, doc_kind, applies_to_ccp, version, summary, body_md, is_current, approved_at) VALUES
('haccp-ccp-1-receiving', 'CCP-1 — Receiving (Bacteria growth + Sulfite level)', 'haccp_plan', 'ccp1_receiving', '1.0',
 'Fresh ≤40°F, frozen ≤0°F + sulfite ≤100 ppm. Reject + return on failure.',
$$## CCP-1 — Receiving

**Significant hazards:**
- **Pathogenic Bacteria Growth** — fresh ≤40°F (4°C), frozen ≤0°F (-18°C)
- **Food Additive Level (Sulfite)** — ≤100 ppm

**Monitoring:** Every receiving lot, Quality Assurance Personnel uses probe thermometer + sulfite test strips.

**Corrective Action:** Reject + return to supplier. Re-training as needed. Supplier suspended until corrective action provided.

**Records:** Lobster Receiving Record, Lobster Quality & Safety Record, Corrective Action Records, Training Records, Calibration Records, Laboratory Reports.$$,
 TRUE, NOW()),

('haccp-ccp-2-thawing', 'CCP-2 — Thawing (Bacteria growth)', 'haccp_plan', 'ccp2_thawing', '1.0',
 'Ice bath + core temp ≤40°F. Adjust ice if bath fails; reject product if core fails.',
$$## CCP-2 — Thawing

**Significant hazard:** Pathogenic Bacteria Growth — time-temp abuse during thaw.

**Critical Limit:** Ice bath + product core temp **≤40°F (4°C)**.

**Monitoring:** Every lot, Quality Assurance Personnel uses probe thermometer.

**Corrective Action:** Ice bath below limit → add more ice. Core temp above limit after ice added → product rejected.

**Records:** Temperature Control Record, Corrective Action Records, Training Records, Calibration Records.$$,
 TRUE, NOW()),

('haccp-ccp-3-deveining-sulfite', 'CCP-3 — De-veining & Cleaning (Sulfite recheck)', 'haccp_plan', 'ccp3_deveining_sulfite', '1.0',
 'Sulfite recheck ≤100 ppm during de-veining.',
$$## CCP-3 — De-veining & Cleaning

**Significant hazard:** Food Additive Level (Sulfite) — high sulfite causes adverse health effects.

**Critical Limit:** **≤100 ppm**.

**Monitoring:** Every lot, Processing Supervisor with sulfite strips on random samples.

**Corrective Action:** Above limit → reject + return to supplier. Re-training.

**Records:** Lobster Processing Log, Corrective Action Records, Training Records, Laboratory Reports.$$,
 TRUE, NOW()),

('haccp-ccp-4-blast-freezing', 'CCP-4 — Blast Freezing (Freezer temp)', 'haccp_plan', 'ccp4_blast_freezing', '1.0',
 'Blast -10°F start, reach -35 to -40°F. Core ≤0°F within 24 hours.',
$$## CCP-4 — Blast Freezing

**Significant hazard:** Pathogenic Bacteria Growth — inadequate freezing.

**Critical Limit:** Blast freezer starts at -10°F (-23°C), reaches -35 to -40°F (-37 to -40°C). Product core ≤0°F (-18°C) within 24 hours.

**Monitoring:** Initial + final readings via data logger + manual recording.

**Corrective Action:** Deviation → investigate freezer + product. Hold + test before release.

**Records:** Temperature Control Record, Data Logger printout, Corrective Action Records, Calibration Records.$$,
 TRUE, NOW()),

('haccp-ccp-5-labeling', 'CCP-5 — Master Packaging & Labeling (Sulfite + Crustacean declaration)', 'haccp_plan', 'ccp5_labeling', '1.0',
 'Every label must carry sulfite + crustacean allergen + lot code declarations.',
$$## CCP-5 — Master Packaging & Labeling

**Significant hazards:**
- **Food Additive Presence (Sulfite)** — sulfites must be declared per regulation
- **Food Allergen — Crustacean** — must be declared

**Critical Limits:**
- **Presence of sulfite declaration** on every label
- **Presence of crustacean allergen declaration + market name** on every label
- **Lot code matches inside contents**

**Monitoring:** Every lot, Processing Personnel visually inspects every label.

**Corrective Action:** Missing or incorrect → segregate boxes, apply corrected label. Re-training as needed.

**Records:** Lobster Packaging & Labeling Record, Corrective Action Records, Training Logs.$$,
 TRUE, NOW())
ON CONFLICT (slug, version) DO NOTHING;

COMMIT;

-- =====================================================================
-- VERIFY
-- =====================================================================
SELECT 'documents_count:' AS check, COUNT(*) AS n FROM spinytails_documents;

SELECT doc_kind, COUNT(*) AS n
FROM spinytails_documents
WHERE is_current = TRUE
GROUP BY doc_kind ORDER BY doc_kind;

SELECT 'rls_enabled:' AS check, relrowsecurity FROM pg_class
WHERE relname = 'spinytails_documents';

SELECT 'storage_bucket:' AS check, id FROM storage.buckets WHERE id = 'spinytails-documents';
