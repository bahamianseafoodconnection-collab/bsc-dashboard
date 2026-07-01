-- Card 2 needs at least one inventory location (record_inventory_in requires a
-- valid to_location_code). Seed your real locations; adjust names/entities.
-- location_type enum: freezer|cooler|retail_floor|retail_zone|fish_display|
--   dry_storage|processing_area|receiving_dock|export_holding|outdoor_table
insert into public.inventory_locations (code, name, entity, location_type, is_active)
values
  ('nassau_wh',   'Nassau Warehouse',   'bsc_marketplace_nassau', 'dry_storage',   true),
  ('nassau_cool', 'Nassau Cooler',      'bsc_marketplace_nassau', 'cooler',        true),
  ('nassau_frzr', 'Nassau Freezer',     'bsc_marketplace_nassau', 'freezer',       true)
on conflict (code) do nothing;
