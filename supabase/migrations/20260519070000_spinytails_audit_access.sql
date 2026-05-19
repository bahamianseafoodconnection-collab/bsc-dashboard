-- =====================================================================
-- BSC Migration: 20260519070000_spinytails_audit_access.sql
--
-- Token-based, time-bound, read-only audit access for fisheries
-- inspectors (BAHFSA, Customs, Marine Resources, etc.).
--
-- Design: rather than provisioning a persistent 'inspector' role with
-- auth.users credentials, BSC creates an audit_session — a row with a
-- random token, scope (lot ids OR date range), inspector identity,
-- and an explicit expires_at. The inspector visits
-- /spinytails/audit/<token> from any browser (no login), and
-- SECURITY DEFINER RPCs serve the scoped read-only data while logging
-- every view. Revokable instantly.
--
-- Resolves the TODO from 20260519050000_spinytails_haccp_traceability.sql:
--   "Inspector read-only role to be added in spinytails_audit_access
--    migration when /spinytails/audit endpoint is built."
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1) Audit sessions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spinytails_audit_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token             TEXT NOT NULL UNIQUE,            -- 32+ char random; URL-safe
  inspector_name    TEXT NOT NULL,
  inspector_agency  TEXT NOT NULL CHECK (inspector_agency IN
                    ('BAHFSA','Customs','Marine Resources','Public Health','Other')),
  inspector_id_doc  TEXT,                            -- govt ID number (optional)
  purpose           TEXT NOT NULL,                   -- 'routine audit','recall investigation','export inspection'
  -- Scope: NULL scope_lot_ids = all lots within date window (or all-time if no dates)
  scope_lot_ids     UUID[],
  scope_date_from   DATE,
  scope_date_to     DATE,
  granted_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ,
  revoked_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_reason    TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_validity CHECK (expires_at > granted_at)
);

CREATE INDEX IF NOT EXISTS idx_audit_sessions_active
  ON spinytails_audit_sessions (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_sessions_inspector
  ON spinytails_audit_sessions (inspector_agency, granted_at DESC);

DROP TRIGGER IF EXISTS trg_audit_sessions_touch ON spinytails_audit_sessions;
CREATE TRIGGER trg_audit_sessions_touch
  BEFORE UPDATE ON spinytails_audit_sessions
  FOR EACH ROW EXECUTE FUNCTION spinytails_touch_updated_at();

-- ─── 2) View log — every inspector access ─────────────────────────
CREATE TABLE IF NOT EXISTS spinytails_audit_views (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES spinytails_audit_sessions(id) ON DELETE CASCADE,
  resource_kind TEXT NOT NULL,                       -- 'session_open','lots_list','lot_detail','documents','document','sop_step'
  resource_id   TEXT,                                -- lot_code | doc slug | step number, etc.
  viewed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_views_session
  ON spinytails_audit_views (session_id, viewed_at DESC);

-- ─── 3) Validator ────────────────────────────────────────────────
-- Returns the session row when token is valid, NULL otherwise.
-- SECURITY DEFINER so anon callers (the public viewer) can hit it.
CREATE OR REPLACE FUNCTION spinytails_audit_session_validate(p_token TEXT)
RETURNS spinytails_audit_sessions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v spinytails_audit_sessions;
BEGIN
  SELECT * INTO v FROM spinytails_audit_sessions
   WHERE token = p_token
     AND revoked_at IS NULL
     AND expires_at > NOW()
   LIMIT 1;
  RETURN v;  -- all-NULL row when not found
END;
$$;

GRANT EXECUTE ON FUNCTION spinytails_audit_session_validate(TEXT) TO anon, authenticated;

-- ─── 4) Public viewers (token-gated, scope-aware, view-logged) ────
-- 4a) Session landing data — useful for the viewer page header
CREATE OR REPLACE FUNCTION spinytails_audit_session_open(p_token TEXT)
RETURNS TABLE (
  inspector_name    TEXT,
  inspector_agency  TEXT,
  purpose           TEXT,
  granted_at        TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  scope_lot_count   INT,
  scope_date_from   DATE,
  scope_date_to     DATE
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v spinytails_audit_sessions;
BEGIN
  v := spinytails_audit_session_validate(p_token);
  IF v.id IS NULL THEN RETURN; END IF;

  INSERT INTO spinytails_audit_views (session_id, resource_kind) VALUES (v.id, 'session_open');

  RETURN QUERY
  SELECT v.inspector_name, v.inspector_agency, v.purpose, v.granted_at, v.expires_at,
         COALESCE(array_length(v.scope_lot_ids, 1), 0),
         v.scope_date_from, v.scope_date_to;
END;
$$;

GRANT EXECUTE ON FUNCTION spinytails_audit_session_open(TEXT) TO anon, authenticated;

-- 4b) Lots index — scoped by the session
CREATE OR REPLACE FUNCTION spinytails_audit_view_lots(p_token TEXT)
RETURNS TABLE (
  lot_code          TEXT,
  receipt_date      DATE,
  status            TEXT,
  vessel_code       CHAR(2),
  fisherman_name    TEXT,
  color_tag         TEXT,
  intake_lbs        NUMERIC,
  finished_lbs      NUMERIC,
  yield_pct         NUMERIC,
  shipped_at        TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v spinytails_audit_sessions;
BEGIN
  v := spinytails_audit_session_validate(p_token);
  IF v.id IS NULL THEN RETURN; END IF;

  INSERT INTO spinytails_audit_views (session_id, resource_kind) VALUES (v.id, 'lots_list');

  RETURN QUERY
  SELECT
    l.lot_code,
    l.receipt_date,
    l.status::TEXT,
    ve.vessel_code,
    ve.fisherman_name,
    ve.color_tag,
    COALESCE((SELECT SUM(quantity_lbs) FROM spinytails_lot_intakes WHERE lot_id = l.id), 0)::NUMERIC,
    COALESCE((SELECT SUM(finished_weight_lbs) FROM spinytails_processing_batches WHERE lot_id = l.id), 0)::NUMERIC,
    (SELECT ROUND(AVG(yield_pct)::numeric, 2) FROM spinytails_processing_batches WHERE lot_id = l.id AND yield_pct IS NOT NULL),
    l.shipped_at
  FROM spinytails_lots l
  JOIN spinytails_vessels ve ON ve.id = l.vessel_id
  WHERE (v.scope_lot_ids IS NULL OR l.id = ANY(v.scope_lot_ids))
    AND (v.scope_date_from IS NULL OR l.receipt_date >= v.scope_date_from)
    AND (v.scope_date_to   IS NULL OR l.receipt_date <= v.scope_date_to)
  ORDER BY l.receipt_date DESC, l.lot_code DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION spinytails_audit_view_lots(TEXT) TO anon, authenticated;

-- 4c) Single-lot full trace — pipes through the existing view, scope-checked
CREATE OR REPLACE FUNCTION spinytails_audit_view_lot_trace(p_token TEXT, p_lot_code TEXT)
RETURNS SETOF spinytails_lot_full_trace
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v        spinytails_audit_sessions;
  v_lot_id UUID;
BEGIN
  v := spinytails_audit_session_validate(p_token);
  IF v.id IS NULL THEN RETURN; END IF;

  -- Resolve lot + scope check
  SELECT id INTO v_lot_id FROM spinytails_lots WHERE lot_code = p_lot_code;
  IF v_lot_id IS NULL THEN RETURN; END IF;
  IF v.scope_lot_ids IS NOT NULL AND NOT (v_lot_id = ANY(v.scope_lot_ids)) THEN RETURN; END IF;
  IF v.scope_date_from IS NOT NULL OR v.scope_date_to IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM spinytails_lots
      WHERE id = v_lot_id
        AND (v.scope_date_from IS NULL OR receipt_date >= v.scope_date_from)
        AND (v.scope_date_to   IS NULL OR receipt_date <= v.scope_date_to)
    ) THEN RETURN; END IF;
  END IF;

  INSERT INTO spinytails_audit_views (session_id, resource_kind, resource_id)
    VALUES (v.id, 'lot_detail', p_lot_code);

  RETURN QUERY SELECT * FROM spinytails_lot_full_trace WHERE lot_code = p_lot_code;
END;
$$;

GRANT EXECUTE ON FUNCTION spinytails_audit_view_lot_trace(TEXT, TEXT) TO anon, authenticated;

-- 4d) Documents library (current versions only — SOPs/SSOPs are universal)
CREATE OR REPLACE FUNCTION spinytails_audit_view_documents(p_token TEXT)
RETURNS SETOF spinytails_documents
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v spinytails_audit_sessions;
BEGIN
  v := spinytails_audit_session_validate(p_token);
  IF v.id IS NULL THEN RETURN; END IF;

  INSERT INTO spinytails_audit_views (session_id, resource_kind) VALUES (v.id, 'documents');

  RETURN QUERY SELECT * FROM spinytails_documents WHERE is_current = TRUE
    ORDER BY doc_kind, applies_to_step NULLS LAST, applies_to_ssop NULLS LAST, applies_to_ccp NULLS LAST, title;
END;
$$;

GRANT EXECUTE ON FUNCTION spinytails_audit_view_documents(TEXT) TO anon, authenticated;

-- ─── 5) Token generator helper (for the admin UI) ─────────────────
-- 32-byte URL-safe random token. Caller responsible for uniqueness via
-- the UNIQUE constraint — if collision, retry.
CREATE OR REPLACE FUNCTION spinytails_audit_generate_token()
RETURNS TEXT LANGUAGE SQL VOLATILE AS $$
  SELECT translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_x');
$$;

GRANT EXECUTE ON FUNCTION spinytails_audit_generate_token() TO authenticated;

-- ─── 6) RLS on the new tables ─────────────────────────────────────
-- Staff full access (admins to create+revoke; QC staff to view).
-- Anon callers never touch these tables directly — they always go
-- through SECURITY DEFINER functions which validate the token.
ALTER TABLE spinytails_audit_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE spinytails_audit_views    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_audit_sessions_staff_all ON spinytails_audit_sessions;
CREATE POLICY p_audit_sessions_staff_all ON spinytails_audit_sessions
  FOR ALL TO authenticated
  USING (is_bsc_admin() OR is_bsc_qc_staff())
  WITH CHECK (is_bsc_admin() OR is_bsc_qc_staff());

DROP POLICY IF EXISTS p_audit_views_staff_all ON spinytails_audit_views;
CREATE POLICY p_audit_views_staff_all ON spinytails_audit_views
  FOR ALL TO authenticated
  USING (is_bsc_admin() OR is_bsc_qc_staff())
  WITH CHECK (is_bsc_admin() OR is_bsc_qc_staff());

COMMIT;

-- =====================================================================
-- VERIFY
-- =====================================================================
SELECT 'tables' AS check, COUNT(*)::text AS n FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('spinytails_audit_sessions','spinytails_audit_views')
UNION ALL
SELECT 'rpcs', COUNT(*)::text FROM pg_proc
WHERE proname IN (
  'spinytails_audit_session_validate',
  'spinytails_audit_session_open',
  'spinytails_audit_view_lots',
  'spinytails_audit_view_lot_trace',
  'spinytails_audit_view_documents',
  'spinytails_audit_generate_token'
)
UNION ALL
SELECT 'sessions_rls', relrowsecurity::text FROM pg_class WHERE relname = 'spinytails_audit_sessions'
UNION ALL
SELECT 'views_rls',    relrowsecurity::text FROM pg_class WHERE relname = 'spinytails_audit_views'
UNION ALL
SELECT 'smoke_token_generator', length(spinytails_audit_generate_token())::text;
