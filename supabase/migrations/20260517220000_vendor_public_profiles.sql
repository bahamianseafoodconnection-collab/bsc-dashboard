-- vendor_public_profiles — a column-filtered public view of vendors.
--
-- The base `vendors` table holds PII (phone, email, government_id_number,
-- license_number, bank_account_*, routing_info) that customers must
-- never see. Its RLS blocks every non-owner / non-admin SELECT.
--
-- Customer-facing marketplace pages (/shop/fresh-catch, /shop/farm-fresh)
-- need *marketing* info — business name, vendor type, trust tier,
-- location (which island, not address) — to render a card next to a
-- listing. This view exposes only those safe columns, and only for
-- vendors whose approval_status='approved'.
--
-- Grants on the view + RLS on the base table together enforce the
-- column-level filter that PostgreSQL row-level policies cannot.

DROP VIEW IF EXISTS vendor_public_profiles;
CREATE VIEW vendor_public_profiles
WITH (security_invoker = true)  -- evaluate with the caller's permissions
AS
SELECT
  id,
  business_name,
  vendor_type,
  trust_tier,
  location
FROM vendors
WHERE approval_status = 'approved';

-- A view doesn't inherit base-table RLS column-by-column, but
-- security_invoker means the SELECT still runs as the calling user, so
-- the base table's vendors_select_self_admin policy would still kick
-- in. We need to add a policy that explicitly allows reading approved
-- rows — but ONLY the safe columns. Since RLS can't restrict columns,
-- the workaround is:
--
--   1. Add a permissive SELECT policy on `vendors` for approved rows.
--   2. REVOKE direct SELECT from anon + authenticated on the base table.
--   3. GRANT SELECT only on the view to anon + authenticated.
--
-- That way the base table can still be queried by the view (and by
-- admins via service role), but no client JS can `SELECT * FROM vendors`
-- and get back PII.

-- Step 1 — permissive policy on base table for approved rows (needed
-- by the view's invoker context).
DROP POLICY IF EXISTS "vendors_public_view_approved" ON vendors;
CREATE POLICY "vendors_public_view_approved" ON vendors
  FOR SELECT USING (approval_status = 'approved');

-- Step 2 — strip direct table SELECT from the public roles.
REVOKE SELECT ON vendors FROM anon;
REVOKE SELECT ON vendors FROM authenticated;

-- Step 3 — grant SELECT on the view to the public roles.
GRANT SELECT ON vendor_public_profiles TO anon;
GRANT SELECT ON vendor_public_profiles TO authenticated;

-- Admins (founder/co_founder/control_admin/manager/basic_admin) and the
-- vendor owner still need full table access. Grant via service_role and
-- keep the existing RLS policies (vendors_select_self_admin) live; they
-- are checked only when the row is fetched through a privileged client
-- (which API routes do via SUPABASE_SERVICE_ROLE_KEY). The owner-self
-- + admin policies were created in 20260517210000_vendor_marketplace.sql
-- and remain in place.

-- Verify
SELECT 'view_columns' AS what, column_name FROM information_schema.columns
WHERE table_name = 'vendor_public_profiles' ORDER BY ordinal_position;
