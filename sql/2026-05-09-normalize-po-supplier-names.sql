-- BSC Dashboard — backfill canonical supplier names on existing POs
-- Date: 2026-05-09
--
-- After commit 475560d (N. Normalize supplier names on PO create), every
-- new PO writes the canonical suppliers.business_name. This script
-- retroactively does the same for older purchase_orders rows whose
-- supplier_name only matches case-insensitively or with whitespace drift.
--
-- WHAT IT DOES
--   1. PREVIEW: dry-run query showing every proposed change
--   2. APPLY:   the actual update
--   3. AUDIT:   POs whose supplier_name still doesn't match any supplier
--      (these need manual attention — either create a suppliers row or
--      edit the PO directly)
--
-- HOW TO RUN
--   - Open Supabase SQL editor
--   - Run section 1 first. Review the rows it would change.
--   - Only then run section 2.
--   - Run section 3 to see what's left unmatched.
--
-- SAFETY
--   - Only updates rows where canonical match is exact (case-insensitive
--     trimmed). Does NOT use fuzzy similarity — typos won't auto-resolve.
--   - Original drift is logged into admin_notes so you can audit.

-- ════════════════════════════════════════════════════════════════════
-- 1. PREVIEW — see what would change. Safe to run any time.
-- ════════════════════════════════════════════════════════════════════

with raw_supplier_names as (
  select distinct supplier_name
  from public.purchase_orders
  where supplier_name is not null
    and supplier_name <> ''
),
matches as (
  select
    r.supplier_name                as current_value,
    s.business_name                as canonical_value,
    s.id                           as supplier_id,
    case
      when lower(trim(r.supplier_name)) = lower(trim(s.business_name))
        then 'business_name_exact_ci'
      when lower(trim(r.supplier_name)) = lower(trim(s.contact_name))
        then 'contact_name_exact_ci'
    end as match_type
  from raw_supplier_names r
  join public.suppliers s
    on lower(trim(r.supplier_name)) = lower(trim(s.business_name))
    or (s.contact_name is not null
        and lower(trim(r.supplier_name)) = lower(trim(s.contact_name)))
  where r.supplier_name <> s.business_name
)
select
  m.current_value,
  m.canonical_value,
  m.match_type,
  m.supplier_id,
  (
    select count(*)
    from public.purchase_orders po
    where po.supplier_name = m.current_value
  ) as po_rows_affected
from matches m
order by po_rows_affected desc, m.canonical_value;

-- ════════════════════════════════════════════════════════════════════
-- 2. APPLY — actually update the rows. Idempotent (safe to re-run).
--
--    Stamps a one-line note in admin_notes so the original spelling is
--    preserved for audit. If admin_notes already has content, the
--    normalisation note is appended on its own line.
-- ════════════════════════════════════════════════════════════════════

with renames as (
  select
    po.id            as po_id,
    po.supplier_name as old_name,
    s.business_name  as new_name,
    po.admin_notes   as old_notes
  from public.purchase_orders po
  join public.suppliers s
    on lower(trim(po.supplier_name)) = lower(trim(s.business_name))
    or (s.contact_name is not null
        and lower(trim(po.supplier_name)) = lower(trim(s.contact_name)))
  where po.supplier_name is not null
    and po.supplier_name <> ''
    and po.supplier_name <> s.business_name
)
update public.purchase_orders po
set
  supplier_name = r.new_name,
  admin_notes   = case
    when r.old_notes is null or r.old_notes = ''
      then '[normalized ' || to_char(now(),'YYYY-MM-DD') || '] supplier_name was: ' || r.old_name
    else r.old_notes || E'\n[normalized ' || to_char(now(),'YYYY-MM-DD') || '] supplier_name was: ' || r.old_name
  end,
  updated_at    = now()
from renames r
where po.id = r.po_id;

-- ════════════════════════════════════════════════════════════════════
-- 3. AUDIT — POs whose supplier_name still doesn't match any supplier.
--    These are the rows that need manual attention:
--      - either add the supplier in /supplier so the name registers
--      - or edit the PO directly in /purchase-orders
-- ════════════════════════════════════════════════════════════════════

select
  po.supplier_name,
  count(*) as po_count,
  min(po.created_at) as first_seen,
  max(po.created_at) as last_seen
from public.purchase_orders po
where po.supplier_name is not null
  and po.supplier_name <> ''
  and not exists (
    select 1
    from public.suppliers s
    where lower(trim(s.business_name)) = lower(trim(po.supplier_name))
       or (s.contact_name is not null
           and lower(trim(s.contact_name)) = lower(trim(po.supplier_name)))
  )
group by po.supplier_name
order by po_count desc, last_seen desc;

-- ════════════════════════════════════════════════════════════════════
-- OPTIONAL — fuzzy similarity for typos
-- ════════════════════════════════════════════════════════════════════
--
-- Postgres has pg_trgm for trigram similarity. Supabase usually has it
-- enabled. If the AUDIT query shows POs with obvious typos
-- ("Asa H Pricthard" instead of "Asa H Pritchard"), uncomment + run the
-- block below to see CANDIDATE matches above a similarity threshold.
-- DOES NOT update anything — review and apply manually.
--
-- create extension if not exists pg_trgm;
-- with raw_unmatched as (
--   select distinct po.supplier_name
--   from public.purchase_orders po
--   where po.supplier_name is not null
--     and not exists (
--       select 1 from public.suppliers s
--       where lower(trim(s.business_name)) = lower(trim(po.supplier_name))
--     )
-- )
-- select
--   r.supplier_name as raw,
--   s.business_name as suggested_canonical,
--   round((similarity(r.supplier_name, s.business_name)::numeric)*100, 1) as match_pct
-- from raw_unmatched r
-- cross join lateral (
--   select business_name
--   from public.suppliers
--   where business_name is not null
--   order by similarity(r.supplier_name, business_name) desc
--   limit 1
-- ) s
-- where similarity(r.supplier_name, s.business_name) >= 0.6
-- order by match_pct desc;
