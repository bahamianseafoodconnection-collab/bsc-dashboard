-- BSC Dashboard - Bahamas customs duty rates table + seed data
-- Date: 2026-05-09
-- Run this once in the Supabase SQL editor.
--
-- Standard Bahamas import duty model (CIF basis):
--   Total landed cost = FOB cost + Freight + Insurance + Duty + Stamp Tax + Environmental Levy
--   Duty   = (FOB + Freight + Insurance) * duty_pct / 100
--   Stamp Tax = 1% on CIF (most categories)
--   Environmental Levy = small flat or pct (varies by category)
--
-- This table is the single source of truth for the landed-cost calculator
-- at /landed-cost and the supplier portal landed-cost preview.
--
-- IMPORTANT: only "confirmed_by_user=true" rows are guaranteed accurate
-- per Dedrick's operational knowledge (May 9, 2026). All others are
-- starter approximations - verify with Bahamas Customs Department before
-- production pricing decisions on those SKUs.

create table if not exists public.customs_duty_rates (
  id                            uuid          primary key default gen_random_uuid(),
  created_at                    timestamptz   not null default now(),
  updated_at                    timestamptz   not null default now(),

  category_code                 text          not null,        -- machine code
  category_label                text          not null,        -- human label
  duty_pct                      numeric(5,2)  not null default 0 check (duty_pct between 0 and 100),

  -- Standard Bahamas adjustments (defaults match common cases)
  applies_stamp_tax             boolean       not null default true,   -- 1% on CIF
  stamp_tax_pct                 numeric(5,2)  not null default 1.0,
  applies_environmental_levy    boolean       not null default false,
  environmental_levy_pct        numeric(5,2)  not null default 0,

  hs_code                       text,                                  -- Harmonized System code if known
  notes                         text,
  confirmed_by_user             boolean       not null default false,  -- true = Dedrick confirmed
  active                        boolean       not null default true
);

create unique index if not exists customs_duty_rates_code_uniq
  on public.customs_duty_rates (category_code);

create index if not exists customs_duty_rates_active_idx
  on public.customs_duty_rates (active, category_label);

alter table public.customs_duty_rates enable row level security;

-- Public read (so the calculator works without auth on landing pages);
-- mutations go through service role.
drop policy if exists "duty_rates_select_all" on public.customs_duty_rates;
create policy "duty_rates_select_all"
  on public.customs_duty_rates for select
  using (active = true);

-- Seed data
-- ─── CONFIRMED BY DEDRICK (May 9, 2026) ───────────────────────────
insert into public.customs_duty_rates (category_code, category_label, duty_pct, confirmed_by_user, notes) values
  ('meat_fresh_frozen', 'Fresh / Frozen Meat (beef, pork, poultry)', 0,  true,  'Steak DUTY-FREE per Dedrick May 9, 2026 - massive USA arbitrage opportunity'),
  ('water_bottled',     'Bottled Water',                              60, true,  'Confirmed via 40ct case Sams math - sells $12/case with 60% duty'),
  ('snow_crab',         'Snow Crab Cluster',                          35, true,  'Used in landed-cost analysis May 9, 2026')
on conflict (category_code) do update
  set duty_pct = excluded.duty_pct,
      confirmed_by_user = excluded.confirmed_by_user,
      notes = excluded.notes,
      updated_at = now();

-- ─── STARTER APPROXIMATIONS (verify with Bahamas Customs) ─────────
insert into public.customs_duty_rates (category_code, category_label, duty_pct, confirmed_by_user, notes) values
  ('seafood_fresh',         'Fresh Seafood (whole/fillet)',           0,  false, 'Typically duty-free for food security; verify by HS code'),
  ('seafood_frozen',        'Frozen Seafood (general)',               0,  false, 'Typically duty-free; specific items like shrimp may differ'),
  ('shrimp_imported',       'Imported Shrimp',                        25, false, 'Verify - some shrimp categories carry duty'),
  ('dairy_milk',            'Dairy / Milk',                           25, false, 'Approximation - verify per category'),
  ('eggs',                  'Eggs',                                   0,  false, 'Typically duty-free as staple'),
  ('produce_fresh',         'Fresh Produce (fruit + vegetables)',     0,  false, 'Mostly duty-free; some specialty items differ'),
  ('dry_goods_staple',      'Dry Goods - Staples (rice, flour, sugar)', 0, false,'Staple food items typically duty-free'),
  ('pasta_cereal',          'Pasta / Cereal',                         35, false, 'Approximation'),
  ('canned_goods',          'Canned Goods',                           45, false, 'Approximation'),
  ('snacks',                'Snacks (chips, crackers)',               45, false, 'Approximation'),
  ('soft_drinks',           'Soft Drinks / Sodas',                    65, false, 'Approximation - similar to bottled water'),
  ('beer',                  'Beer',                                   65, false, 'Plus excise tax - calculate separately'),
  ('wine',                  'Wine',                                   65, false, 'Plus excise tax - calculate separately'),
  ('spirits',               'Spirits / Liquor',                       65, false, 'Plus excise tax - calculate separately'),
  ('cleaning_supplies',     'Cleaning Supplies',                      35, false, 'Approximation'),
  ('disposables',           'Disposables / Utensils / Packaging',     35, false, 'Approximation'),
  ('restaurant_equipment',  'Restaurant / Kitchen Equipment',         25, false, 'Approximation'),
  ('general',               'General / Uncategorized',                35, false, 'Default fallback - verify per item')
on conflict (category_code) do nothing;
