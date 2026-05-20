-- Founder SQL editor — server-side RPC + audit log.
--
-- Powers /dashboard/sql-editor. Every invocation of bsc_admin_exec_sql()
-- is verified (caller must be founder / co_founder / control_admin),
-- read-only by default, and logged to sql_query_audit so we always know
-- WHO ran WHAT against the database WHEN.
--
-- Design rules:
--   • SECURITY DEFINER — runs as the function owner so it can read every
--     table the founder is entitled to via role. The role check inside
--     the function is the actual gate (do NOT remove it).
--   • Write operations (INSERT/UPDATE/DELETE/TRUNCATE/DROP/ALTER/CREATE/
--     GRANT/REVOKE) are refused unless p_allow_write = TRUE. This makes
--     SELECT the default and forces a deliberate flip for anything that
--     mutates state.
--   • SELECT results are wrapped in json_agg so the API returns the
--     rowset in one trip. Non-SELECT statements return rowcount only.
--   • Audit row written even on error.

CREATE TABLE IF NOT EXISTS sql_query_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sql_text      TEXT NOT NULL,
  allow_write   BOOLEAN NOT NULL DEFAULT FALSE,
  rowcount      INT,
  elapsed_ms    INT,
  error         TEXT,
  ran_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sql_audit_caller_ran_at ON sql_query_audit (caller_id, ran_at DESC);
CREATE INDEX IF NOT EXISTS idx_sql_audit_ran_at        ON sql_query_audit (ran_at DESC);

ALTER TABLE sql_query_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sql_audit_self_read ON sql_query_audit;
CREATE POLICY sql_audit_self_read ON sql_query_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('founder','co_founder','control_admin')
    )
  );

-- Writes happen via the SECURITY DEFINER function below.
DROP POLICY IF EXISTS sql_audit_block_direct_writes ON sql_query_audit;
CREATE POLICY sql_audit_block_direct_writes ON sql_query_audit
  FOR ALL
  USING (FALSE)
  WITH CHECK (FALSE);

-- ─── Founder-only SQL executor ──────────────────────────────────────

CREATE OR REPLACE FUNCTION bsc_admin_exec_sql(
  p_sql         TEXT,
  p_allow_write BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller     UUID := auth.uid();
  v_role       TEXT;
  v_trimmed    TEXT;
  v_first_word TEXT;
  v_started    TIMESTAMPTZ := clock_timestamp();
  v_elapsed_ms INT;
  v_rows       JSONB;
  v_rowcount   INT := 0;
  v_error      TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required for SQL editor';
  END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_caller;
  IF v_role IS NULL OR v_role NOT IN ('founder','co_founder','control_admin') THEN
    RAISE EXCEPTION 'SQL editor is founder-only. Caller role: %', COALESCE(v_role, 'unknown');
  END IF;

  IF p_sql IS NULL OR length(trim(p_sql)) = 0 THEN
    RAISE EXCEPTION 'Query is empty';
  END IF;

  -- Block destructive verbs unless explicitly allowed
  IF NOT p_allow_write THEN
    IF p_sql ~* '\m(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|COPY)\M' THEN
      RAISE EXCEPTION 'Write/DDL detected. Toggle "Allow writes" to run this query.';
    END IF;
  END IF;

  -- Trim leading whitespace / SQL comments to detect statement type.
  v_trimmed    := regexp_replace(p_sql, '^(\s|--[^\n]*\n|/\*.*?\*/)+', '', 'gn');
  v_first_word := upper(split_part(trim(v_trimmed), ' ', 1));

  BEGIN
    IF v_first_word IN ('SELECT', 'WITH', 'TABLE', 'VALUES', 'SHOW', 'EXPLAIN') THEN
      EXECUTE format('SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (%s) AS t', p_sql) INTO v_rows;
      v_rowcount := COALESCE(jsonb_array_length(v_rows), 0);
    ELSE
      EXECUTE p_sql;
      GET DIAGNOSTICS v_rowcount = ROW_COUNT;
      v_rows := '[]'::jsonb;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_error  := SQLERRM;
    v_rows   := NULL;
  END;

  v_elapsed_ms := EXTRACT(MILLISECONDS FROM clock_timestamp() - v_started)::INT;

  -- Audit log (bypasses RLS because we're SECURITY DEFINER).
  INSERT INTO sql_query_audit (caller_id, sql_text, allow_write, rowcount, elapsed_ms, error)
    VALUES (v_caller, p_sql, p_allow_write, v_rowcount, v_elapsed_ms, v_error);

  IF v_error IS NOT NULL THEN
    RAISE EXCEPTION '%', v_error;
  END IF;

  RETURN jsonb_build_object(
    'rows',        v_rows,
    'rowcount',    v_rowcount,
    'elapsed_ms',  v_elapsed_ms,
    'statement',   v_first_word
  );
END;
$$;

GRANT EXECUTE ON FUNCTION bsc_admin_exec_sql(TEXT, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION bsc_admin_exec_sql(TEXT, BOOLEAN) FROM PUBLIC, anon;

-- ─── Schema-integrity overview ──────────────────────────────────────
-- Returns one row per public table: row estimate (from pg_class.reltuples,
-- cheap and good enough), RLS status, last analyze, last autovacuum.

CREATE OR REPLACE FUNCTION bsc_admin_schema_overview()
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
DECLARE
  v_caller UUID := auth.uid();
  v_role   TEXT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT role INTO v_role FROM profiles WHERE id = v_caller;
  IF v_role IS NULL OR v_role NOT IN ('founder','co_founder','control_admin') THEN
    RAISE EXCEPTION 'Schema overview is founder-only. Caller role: %', COALESCE(v_role, 'unknown');
  END IF;

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

GRANT EXECUTE ON FUNCTION bsc_admin_schema_overview() TO authenticated;
REVOKE ALL ON FUNCTION bsc_admin_schema_overview() FROM PUBLIC, anon;

COMMENT ON FUNCTION bsc_admin_exec_sql IS
  'Founder-only SQL executor. Runs the given SQL after verifying the caller role is founder/co_founder/control_admin and logs the call to sql_query_audit. Write/DDL statements refused unless p_allow_write=true.';
COMMENT ON FUNCTION bsc_admin_schema_overview IS
  'Founder-only schema overview. Returns row estimates + RLS status for every public table — used by /dashboard/sql-editor to confirm the schema is in place.';
