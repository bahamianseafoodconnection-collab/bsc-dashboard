-- bsc_cron_schema_overview() — same shape as bsc_admin_schema_overview()
-- but no role check, because it's invoked by Vercel cron via the
-- service_role key (which has no auth.uid()). EXECUTE is granted only
-- to service_role; revoked from PUBLIC + anon + authenticated.

CREATE OR REPLACE FUNCTION bsc_cron_schema_overview()
RETURNS TABLE (
  table_name       TEXT,
  row_estimate     BIGINT,
  live_rows        BIGINT,
  rls_enabled      BOOLEAN,
  last_analyzed    TIMESTAMPTZ,
  last_autovacuum  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.relname::TEXT                                AS table_name,
    GREATEST(c.reltuples, 0)::BIGINT                AS row_estimate,
    COALESCE(s.n_live_tup, 0)::BIGINT               AS live_rows,
    c.relrowsecurity                                AS rls_enabled,
    s.last_analyze                                  AS last_analyzed,
    s.last_autovacuum                               AS last_autovacuum
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
  WHERE c.relkind = 'r' AND n.nspname = 'public'
  ORDER BY c.relname;
END;
$$;

REVOKE ALL ON FUNCTION bsc_cron_schema_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION bsc_cron_schema_overview() TO service_role;

COMMENT ON FUNCTION bsc_cron_schema_overview IS
  'Cron-callable schema overview. Same data as bsc_admin_schema_overview() but no auth.uid() role check — service_role only.';
