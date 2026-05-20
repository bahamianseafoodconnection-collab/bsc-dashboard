-- Saved SQL queries — per-user favorites for /dashboard/sql-editor.
-- Each row is owned by the founder who saved it; RLS gates read+write to
-- the owner (founder / co_founder / control_admin).

CREATE TABLE IF NOT EXISTS sql_query_saved (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label         TEXT         NOT NULL,
  sql_text      TEXT         NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sql_saved_owner ON sql_query_saved (owner_id, created_at DESC);

ALTER TABLE sql_query_saved ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sql_saved_owner_read ON sql_query_saved;
CREATE POLICY sql_saved_owner_read ON sql_query_saved
  FOR SELECT USING (owner_id = auth.uid());

DROP POLICY IF EXISTS sql_saved_owner_write ON sql_query_saved;
CREATE POLICY sql_saved_owner_write ON sql_query_saved
  FOR ALL USING (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('founder','co_founder','control_admin')
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('founder','co_founder','control_admin')
    )
  );

COMMENT ON TABLE sql_query_saved IS
  'Per-user saved SQL queries for the /dashboard/sql-editor. Owner-only read + write, gated by founder/co_founder/control_admin.';
