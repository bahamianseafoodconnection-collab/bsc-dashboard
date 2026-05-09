-- BSC Dashboard - Insert A/P snapshot from May 9, 2026 session
-- Date: 2026-05-09
-- Run this once in the Supabase SQL editor.
--
-- Writes the 7 mapped supplier balances from the May 9, 2026 strategy
-- session into the expenses table as outstanding (paid_at = NULL) so
-- they appear on /accounts-payable.
--
-- Idempotent via WHERE NOT EXISTS check on (vendor, amount_bsd, description).
-- Safe to re-run - won't duplicate.
--
-- Tom Gotthelf $550,000 investor debt is intentionally NOT included here -
-- it's structurally different (loan obligation, not supplier payment) and
-- belongs in a future loan_obligations table or a scheduled monthly
-- $6,940.48 expense series. Will handle separately.

insert into public.expenses (
  description,
  category,
  vendor,
  amount_bsd,
  due_date,
  paid_at,
  notes
)
select * from (values
  ('A/P Snapshot May 9, 2026 - Tropic Seafood (highest-margin branded line)',
   'supplier_payment', 'Tropic Seafood',          32752.06::numeric(12,2),
   current_date::date, null::timestamptz,
   'Captured from session A/P walk May 9, 2026. Largest supplier credit balance. PROTECT THIS LINE - highest-margin branded products.'),

  ('A/P Snapshot May 9, 2026 - Father & Sons Distribution (Jorge Caragol) - branded snapper + salmon',
   'supplier_payment', 'Father & Sons Distribution', 21695.60::numeric(12,2),
   current_date::date, null::timestamptz,
   'Captured from session A/P walk. Branded line - lane snapper, salmon 4oz/6oz. F&S is also Igloo Express reseller (15% markup) - BSC could go direct to Igloo to save 15%.'),

  ('A/P Snapshot May 9, 2026 - Sandy Port Seafood Abaco (Oscar Pinder) - 38 kits whole conch / 2,088.10 lbs at $5.50/lb',
   'supplier_payment', 'Sandy Port Seafood Abaco', 11484.55::numeric(12,2),
   current_date::date, null::timestamptz,
   'Boat owner: Oscar Pinder. 38 kits whole conch / 2,088.10 lbs at $5.50/lb. Family Island sourcing relationship - prioritize for goodwill payment.'),

  ('A/P Snapshot May 9, 2026 - Jomara Seafood (steaks; bidirectional trade partner)',
   'supplier_payment', 'Jomara Seafood',          8900.00::numeric(12,2),
   current_date::date, null::timestamptz,
   'Owed for steaks. CRITICAL: Jomara (Bob) is BSC bidirectional trade partner - BSC sells lobster tails to Jomara ($108K Oct-Nov 2025). Pay current to protect the relationship.'),

  ('A/P Snapshot May 9, 2026 - Anthony Taylor (whole conch through Spiny Tail)',
   'supplier_payment', 'Anthony Taylor',          5154.12::numeric(12,2),
   current_date::date, null::timestamptz,
   'Whole conch processed at Spiny Tail. Volume estimated ~937 lbs at assumed $5.50/lb (pending confirmation). Individual fisherman - prioritize for goodwill.'),

  ('A/P Snapshot May 9, 2026 - Rosten Munroe (23 kits / 942.9 lbs snapper varieties)',
   'supplier_payment', 'Rosten Munroe',           4350.00::numeric(12,2),
   current_date::date, null::timestamptz,
   '23 kits / 942.9 lbs total. Mutton snapper $4.52/lb, hog fish $5.10/lb, small snapper $3.53/lb, large snapper $5.15/lb. Blended $4.61/lb. Individual fisherman - prioritize for goodwill.'),

  ('A/P Snapshot May 9, 2026 - Promocean International LLC (16/20 jumbo shrimp / 173.86 lbs at $6.65/lb)',
   'supplier_payment', 'Promocean International LLC', 1156.18::numeric(12,2),
   current_date::date, null::timestamptz,
   '16/20 jumbo shrimp / 173.86 lbs at $6.65/lb. Promocean is BSC underpriced supplier - sacred rule prices at $10.10/lb but Nassau market is $14-18/lb. Override to capture leak.')
) as v(description, category, vendor, amount_bsd, due_date, paid_at, notes)
where not exists (
  select 1 from public.expenses e
  where e.vendor = v.vendor
    and e.amount_bsd = v.amount_bsd
    and e.description = v.description
);

-- Verify what landed
select vendor, amount_bsd, due_date, paid_at, description
from public.expenses
where description like 'A/P Snapshot May 9, 2026%'
order by amount_bsd desc;
