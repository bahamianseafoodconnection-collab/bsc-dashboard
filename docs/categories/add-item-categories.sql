-- Add product_category values for ALL item types (hardware, automotive, +
-- general merchandise) so the supplier catalog can categorize any product.
--
-- product_category is an ENUM — selecting a category whose value isn't in the
-- enum 500s the row (that was the "err" on the supplier pricelist). These add
-- the missing values used by the supplier category dropdown.
--
-- IMPORTANT: `alter type ... add value` cannot run inside a BEGIN/COMMIT block.
-- Run this file as-is (no transaction wrapper). Idempotent via IF NOT EXISTS.

alter type product_category add value if not exists 'poultry';
alter type product_category add value if not exists 'dairy_eggs';
alter type product_category add value if not exists 'hardware';
alter type product_category add value if not exists 'automotive';
alter type product_category add value if not exists 'tools';
alter type product_category add value if not exists 'electrical';
alter type product_category add value if not exists 'plumbing';
alter type product_category add value if not exists 'building_materials';
alter type product_category add value if not exists 'office_supplies';
alter type product_category add value if not exists 'electronics';
alter type product_category add value if not exists 'packaging';
alter type product_category add value if not exists 'kitchenware';
alter type product_category add value if not exists 'apparel';
alter type product_category add value if not exists 'pet_supplies';
alter type product_category add value if not exists 'health';
alter type product_category add value if not exists 'lawn_garden';
alter type product_category add value if not exists 'party_supplies';

-- Verify:
--   select enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid
--   where t.typname='product_category' order by e.enumsortorder;
