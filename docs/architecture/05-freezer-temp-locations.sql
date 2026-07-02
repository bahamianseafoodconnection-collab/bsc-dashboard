-- Front-of-dashboard "Record Freezer Temperature" card logs Blast / Holding /
-- Inventory freezers. temp_location has blast_freezer already, but no holding or
-- inventory value — add them (enum-first, then the card + API use them).
-- Run each line on its own (ADD VALUE can't share a txn with usage).
-- Ceilings enforced in the API: Blast ≤ −10°F, Holding ≤ 0°F, Inventory ≤ 0°F.
alter type public.temp_location add value if not exists 'holding_freezer';
alter type public.temp_location add value if not exists 'inventory_freezer';
