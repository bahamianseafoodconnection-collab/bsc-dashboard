-- Fisherman login role + RLS scoping
--
-- A fisherman is a supplier with `suppliers.auth_user_id` set to a
-- profile whose `role='fisherman'`. On login the app routes them to
-- /lobster-intake; RLS ensures they only see / submit intakes for
-- their own supplier record. Admins / processing staff continue to
-- see everything.

-- ─── 1) Link supplier ↔ auth user ──────────────────────────────────
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_auth_user_id_uniq
  ON suppliers (auth_user_id) WHERE auth_user_id IS NOT NULL;

-- ─── 2) Helper: which supplier is this logged-in fisherman? ────────
CREATE OR REPLACE FUNCTION current_fisherman_supplier_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT id FROM suppliers WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION current_fisherman_supplier_id() TO authenticated;

-- ─── 3) RLS on yield_lots ──────────────────────────────────────────
ALTER TABLE yield_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "yield_lots staff all"            ON yield_lots;
DROP POLICY IF EXISTS "yield_lots fisherman select own" ON yield_lots;
DROP POLICY IF EXISTS "yield_lots fisherman insert own" ON yield_lots;

CREATE POLICY "yield_lots staff all" ON yield_lots
  FOR ALL TO authenticated
  USING (is_bsc_admin() OR is_bsc_qc_staff())
  WITH CHECK (is_bsc_admin() OR is_bsc_qc_staff());

CREATE POLICY "yield_lots fisherman select own" ON yield_lots
  FOR SELECT TO authenticated
  USING (supplier_id = current_fisherman_supplier_id());

CREATE POLICY "yield_lots fisherman insert own" ON yield_lots
  FOR INSERT TO authenticated
  WITH CHECK (
    supplier_id = current_fisherman_supplier_id()
    AND approval_status = 'pending'
  );

-- ─── 4) RLS on suppliers ───────────────────────────────────────────
-- Staff: full access. Fisherman: SELECT/UPDATE their own row only
-- (so vessel info + yearly registration upload work on /lobster-intake).
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers staff all"            ON suppliers;
DROP POLICY IF EXISTS "suppliers fisherman select own" ON suppliers;
DROP POLICY IF EXISTS "suppliers fisherman update own" ON suppliers;

CREATE POLICY "suppliers staff all" ON suppliers
  FOR ALL TO authenticated
  USING (is_bsc_admin() OR is_bsc_qc_staff())
  WITH CHECK (is_bsc_admin() OR is_bsc_qc_staff());

CREATE POLICY "suppliers fisherman select own" ON suppliers
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "suppliers fisherman update own" ON suppliers
  FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ─── How to onboard a new fisherman (run AFTER this migration) ────
-- 1) Supabase Dashboard → Auth → Users → "Add user" (email + temp pw).
--    Copy the new user's UUID.
-- 2) Mark their profile as fisherman role:
--      INSERT INTO profiles (id, role, full_name)
--      VALUES ('<auth-uid>', 'fisherman', 'Oscar Pinder')
--      ON CONFLICT (id) DO UPDATE SET role = 'fisherman';
-- 3) Link them to their supplier record:
--      UPDATE suppliers SET auth_user_id = '<auth-uid>'
--      WHERE id = '<supplier-id>';
-- They can now log in; the app sends them straight to /lobster-intake.

-- ─── Verify ────────────────────────────────────────────────────────
SELECT column_name FROM information_schema.columns
WHERE table_name = 'suppliers' AND column_name = 'auth_user_id';

SELECT polname FROM pg_policy
WHERE polrelid = 'yield_lots'::regclass OR polrelid = 'suppliers'::regclass
ORDER BY polname;
