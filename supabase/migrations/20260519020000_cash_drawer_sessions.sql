-- =====================================================================
-- BSC Migration: 20260519020000_cash_drawer_sessions.sql
--
-- Cashier shift / cash drawer tracking. Every cashier opens a shift
-- with a starting float, every order they ring goes against that
-- session, and the shift closes with a counted cash total. The system
-- computes the variance (counted - expected) so the founder can see
-- whether the drawer matches what the POS recorded.
--
-- Wholesale credit accounts are tracked by payment_method='account' on
-- the existing orders table — no new table needed for that today.
-- =====================================================================

BEGIN;

-- ─── 1) Sessions table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_drawer_sessions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  location                    TEXT NOT NULL CHECK (location IN ('nassau','andros')),
  status                      TEXT NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open','closed')),
  opened_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opening_float_cents         INTEGER NOT NULL CHECK (opening_float_cents >= 0),
  opening_notes               TEXT,
  closed_at                   TIMESTAMPTZ,
  closed_by                   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  closing_cash_counted_cents  INTEGER CHECK (closing_cash_counted_cents IS NULL OR closing_cash_counted_cents >= 0),
  closing_notes               TEXT,
  -- variance_cents = counted - (float + cash sales). NULL until closed.
  variance_cents              INTEGER,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One open session per cashier at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_drawer_one_open_per_cashier
  ON cash_drawer_sessions (cashier_user_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_cash_drawer_status_opened
  ON cash_drawer_sessions (status, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_drawer_cashier
  ON cash_drawer_sessions (cashier_user_id, opened_at DESC);

-- ─── 2) Link orders → session ─────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cashier_session_id UUID REFERENCES cash_drawer_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cashier_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_cashier_session
  ON orders (cashier_session_id) WHERE cashier_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_cashier_user
  ON orders (cashier_user_id, created_at DESC) WHERE cashier_user_id IS NOT NULL;

-- ─── 3) Helper: current cashier's open session id ─────────────────
CREATE OR REPLACE FUNCTION current_cashier_open_session_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM cash_drawer_sessions
  WHERE cashier_user_id = auth.uid() AND status = 'open'
  ORDER BY opened_at DESC LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION current_cashier_open_session_id() TO authenticated;

-- ─── 4) Live totals per session — view ────────────────────────────
-- One row per session with rolled-up payment breakdown. Useful for the
-- admin live dashboard and the close-shift variance math.
CREATE OR REPLACE VIEW cash_drawer_session_totals AS
SELECT
  s.id                           AS session_id,
  s.cashier_user_id,
  s.location,
  s.status,
  s.opened_at,
  s.opening_float_cents,
  s.closed_at,
  s.closing_cash_counted_cents,
  s.variance_cents,
  COALESCE(SUM(CASE WHEN o.payment_method = 'cash'    THEN ROUND(o.total * 100)::INTEGER END), 0)::INTEGER AS cash_sales_cents,
  COALESCE(SUM(CASE WHEN o.payment_method = 'card'    THEN ROUND(o.total * 100)::INTEGER END), 0)::INTEGER AS card_sales_cents,
  COALESCE(SUM(CASE WHEN o.payment_method = 'wire'    THEN ROUND(o.total * 100)::INTEGER END), 0)::INTEGER AS wire_sales_cents,
  COALESCE(SUM(CASE WHEN o.payment_method = 'account' THEN ROUND(o.total * 100)::INTEGER END), 0)::INTEGER AS account_sales_cents,
  COALESCE(SUM(ROUND(o.total * 100)::INTEGER), 0)::INTEGER                                                AS total_sales_cents,
  COUNT(o.id)::INTEGER                                                                                    AS order_count
FROM cash_drawer_sessions s
LEFT JOIN orders o
  ON o.cashier_session_id = s.id
  AND o.status = 'completed'
GROUP BY s.id;

GRANT SELECT ON cash_drawer_session_totals TO authenticated;

-- ─── 5) Close-shift function: stamps closing totals + variance ────
-- Variance = counted - (float + cash sales). Positive = over, negative = short.
CREATE OR REPLACE FUNCTION close_cashier_session(
  p_session_id     UUID,
  p_counted_cents  INTEGER,
  p_notes          TEXT DEFAULT NULL
) RETURNS cash_drawer_sessions
LANGUAGE plpgsql AS $$
DECLARE
  v_session   cash_drawer_sessions;
  v_cash_sales INTEGER;
BEGIN
  SELECT * INTO v_session FROM cash_drawer_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session % not found', p_session_id; END IF;
  IF v_session.status = 'closed' THEN RAISE EXCEPTION 'Session % already closed at %', p_session_id, v_session.closed_at; END IF;

  -- Authorized: the cashier themselves, OR an admin/manager.
  IF auth.uid() <> v_session.cashier_user_id
     AND NOT (is_bsc_admin() OR is_bsc_qc_staff()) THEN
    RAISE EXCEPTION 'Not authorized to close this session';
  END IF;

  SELECT COALESCE(SUM(ROUND(total * 100)::INTEGER), 0) INTO v_cash_sales
  FROM orders
  WHERE cashier_session_id = p_session_id
    AND payment_method = 'cash'
    AND status = 'completed';

  UPDATE cash_drawer_sessions SET
    status                     = 'closed',
    closed_at                  = NOW(),
    closed_by                  = auth.uid(),
    closing_cash_counted_cents = p_counted_cents,
    closing_notes              = p_notes,
    variance_cents             = p_counted_cents - (v_session.opening_float_cents + v_cash_sales),
    updated_at                 = NOW()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

GRANT EXECUTE ON FUNCTION close_cashier_session(UUID, INTEGER, TEXT) TO authenticated;

-- ─── 6) Open-shift function: refuses if cashier already has one open
CREATE OR REPLACE FUNCTION open_cashier_session(
  p_location       TEXT,
  p_float_cents    INTEGER,
  p_notes          TEXT DEFAULT NULL
) RETURNS cash_drawer_sessions
LANGUAGE plpgsql AS $$
DECLARE
  v_session cash_drawer_sessions;
BEGIN
  IF p_location NOT IN ('nassau','andros') THEN RAISE EXCEPTION 'location must be nassau or andros'; END IF;
  IF p_float_cents IS NULL OR p_float_cents < 0  THEN RAISE EXCEPTION 'opening_float_cents must be >= 0'; END IF;

  IF EXISTS (SELECT 1 FROM cash_drawer_sessions WHERE cashier_user_id = auth.uid() AND status = 'open') THEN
    RAISE EXCEPTION 'You already have an open shift — close it first.';
  END IF;

  INSERT INTO cash_drawer_sessions (
    cashier_user_id, location, opening_float_cents, opening_notes, status
  ) VALUES (
    auth.uid(), p_location, p_float_cents, p_notes, 'open'
  ) RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

GRANT EXECUTE ON FUNCTION open_cashier_session(TEXT, INTEGER, TEXT) TO authenticated;

-- ─── 7) RLS ───────────────────────────────────────────────────────
-- Cashier sees only their own sessions; admin/qc/manager sees all.
ALTER TABLE cash_drawer_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_cash_drawer_staff_all  ON cash_drawer_sessions;
DROP POLICY IF EXISTS p_cash_drawer_self_read  ON cash_drawer_sessions;
DROP POLICY IF EXISTS p_cash_drawer_self_write ON cash_drawer_sessions;

CREATE POLICY p_cash_drawer_staff_all ON cash_drawer_sessions
  FOR ALL TO authenticated
  USING (is_bsc_admin() OR is_bsc_qc_staff())
  WITH CHECK (is_bsc_admin() OR is_bsc_qc_staff());

CREATE POLICY p_cash_drawer_self_read ON cash_drawer_sessions
  FOR SELECT TO authenticated
  USING (cashier_user_id = auth.uid());

-- Inserts go through open_cashier_session(); direct write also allowed
-- for the cashier themselves (avoids needing service_role from /pos).
CREATE POLICY p_cash_drawer_self_write ON cash_drawer_sessions
  FOR INSERT TO authenticated
  WITH CHECK (cashier_user_id = auth.uid());

COMMIT;

-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_name = 'cash_drawer_sessions' ORDER BY ordinal_position;

SELECT column_name FROM information_schema.columns
WHERE table_name = 'orders' AND column_name IN ('cashier_session_id','cashier_user_id');

SELECT polname FROM pg_policy WHERE polrelid = 'cash_drawer_sessions'::regclass ORDER BY polname;
