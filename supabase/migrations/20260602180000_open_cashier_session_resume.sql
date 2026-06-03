-- 20260602180000_open_cashier_session_resume.sql
--
-- Cashier resilience: open_cashier_session() now RESUMES an existing
-- open shift instead of raising "You already have an open shift."
--
-- Why: 2026-06-02 Claff (cashier) lost two full selling shifts to a
-- repeating UI dead-end. Sequence was:
--   1. Cashier signs in, opens a shift.
--   2. Tab closes / network blip / refresh-token race / browser sleep.
--   3. cash_drawer_sessions row stays status='open' (no cron closes it
--      anymore — the auto-close-shifts cron was removed in 02a1c11
--      because it was the original cause of mid-shift lockouts).
--   4. Cashier re-signs-in, /pos shows red "🔴 No shift" because
--      loadCashierSession's SELECT either races, hits a flaky RLS
--      helper, or is otherwise silently empty.
--   5. Cashier taps "Open Shift" → RPC raises → app catches the
--      regex /already.*open shift/, calls loadCashierSession again,
--      still silently empty → modal closes but cashierSession stays
--      null → UI still red → infinite loop.
--
-- Fix: collapse step 5 by making the RPC itself idempotent. If the
-- caller already has an open shift, return that row instead of raising.
-- Same business semantic (cashier ends up in their shift), but no
-- exception means no client-side recovery path can silently fail.
--
-- Also: SECURITY DEFINER so the function bypasses RLS on the
-- existing-shift SELECT (the underlying RLS helpers were the suspected
-- silent-failure root cause). cashier_user_id is still locked to
-- auth.uid() inside the function — no privilege escalation.

CREATE OR REPLACE FUNCTION public.open_cashier_session(
  p_location       TEXT,
  p_float_cents    INTEGER,
  p_notes          TEXT DEFAULT NULL
) RETURNS cash_drawer_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session cash_drawer_sessions;
  v_uid     UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_location NOT IN ('nassau','andros') THEN
    RAISE EXCEPTION 'location must be nassau or andros';
  END IF;
  IF p_float_cents IS NULL OR p_float_cents < 0 THEN
    RAISE EXCEPTION 'opening_float_cents must be >= 0';
  END IF;

  -- Resume an existing open shift for this cashier (any location) if
  -- one exists. Idempotent: clicking "Open Shift" with a stuck row
  -- silently returns the stuck row instead of raising.
  SELECT * INTO v_session
  FROM cash_drawer_sessions
  WHERE cashier_user_id = v_uid AND status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_session;
  END IF;

  -- No open shift — insert a fresh one.
  INSERT INTO cash_drawer_sessions (
    cashier_user_id, location, opening_float_cents, opening_notes, status
  ) VALUES (
    v_uid, p_location, p_float_cents, p_notes, 'open'
  ) RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_cashier_session(TEXT, INTEGER, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.open_cashier_session(TEXT, INTEGER, TEXT) FROM PUBLIC, anon;

DO $$
BEGIN
  RAISE NOTICE '✅ open_cashier_session rewritten — resumes existing open shift instead of raising. No more cashier "stuck shift" UI dead-end.';
END $$;
