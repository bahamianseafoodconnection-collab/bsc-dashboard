-- Removes the four generic "— monthly" expense rows that duplicate the
-- pre-existing real-bill descriptions. Decision (May 15 2026): keep the
-- specific bill names because they map to real invoices.
--
-- Net effect: monthly fixed overhead drops by $6,970.
--
-- KEPT (legacy):
--   BSC Marketplace Store Rent — Nassau Firetrial Road  $4,150 rent
--   BPL — Bahamas Power & Light                         $2,300 utilities
--   BPL — Andros (Ceta's Variety Store)                   $400 utilities
--   Phone & Internet                                      $120 utilities
--   Water & Sewage Authority                              $400 utilities (separate bill, not a dupe)
--
-- DELETED (my generic versions):
--   Nassau Rental — monthly                             $4,150 rent
--   Nassau Electricity — monthly                        $2,300 utilities
--   Andros Electricity — monthly                          $400 utilities
--   Nassau Internet — monthly                             $120 utilities
--
-- KEPT (mine, no legacy duplicate):
--   Andros Internet — monthly                             $128 utilities

BEGIN;

DELETE FROM expenses WHERE description IN (
  'Nassau Rental — monthly',
  'Nassau Electricity — monthly',
  'Andros Electricity — monthly',
  'Nassau Internet — monthly'
);

-- Verification — recount fixed overhead after the dedupe.
SELECT category, COUNT(*) AS rows, SUM(amount) AS monthly_total
FROM expenses
WHERE category IN ('salaries','utilities','rent','operations','maintenance')
GROUP BY category ORDER BY category;

SELECT amount, category, description FROM expenses
WHERE category IN ('salaries','utilities','rent','operations','maintenance')
ORDER BY category, amount DESC;

COMMIT;
