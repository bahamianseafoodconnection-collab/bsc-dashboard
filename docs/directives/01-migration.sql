-- ============================================================================
-- DIRECTIVES SYSTEM — MIGRATION (4 tables + RLS). Verified live 2026-06-28:
-- no table-name clashes; reuses handle_updated_at() + get_my_role(); founder
-- gate = get_my_role() IN ('founder','co_founder'). body_cr matches i18n 'cr'.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.directives (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('task','duty')),
  title       text NOT NULL,
  body        text,
  body_cr     text,
  body_es     text,
  priority    text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  due_date    date,
  recurrence  jsonb,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  author_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS directives_updated_at ON public.directives;
CREATE TRIGGER directives_updated_at BEFORE UPDATE ON public.directives
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.directive_targets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  directive_id uuid NOT NULL REFERENCES public.directives(id) ON DELETE CASCADE,
  target_type  text NOT NULL CHECK (target_type IN ('user','role','location')),
  target_value text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dtargets_directive ON public.directive_targets(directive_id);
CREATE INDEX IF NOT EXISTS idx_dtargets_lookup    ON public.directive_targets(target_type, target_value);

CREATE TABLE IF NOT EXISTS public.directive_instances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  directive_id uuid NOT NULL REFERENCES public.directives(id) ON DELETE CASCADE,
  cycle_key    text,
  due_date     date,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (directive_id, cycle_key)
);
CREATE INDEX IF NOT EXISTS idx_dinst_directive ON public.directive_instances(directive_id);

CREATE TABLE IF NOT EXISTS public.directive_receipts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.directive_instances(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  seen_at     timestamptz,
  done_at     timestamptz,
  done_note   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_dreceipts_user ON public.directive_receipts(user_id);

-- Targeting helper (SECURITY DEFINER, plpgsql — no nested-paren risk).
CREATE OR REPLACE FUNCTION public.directive_targets_me(p_directive_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_role text := public.get_my_role();
  v_loc  text;
  v_hit  boolean;
BEGIN
  SELECT primary_location INTO v_loc FROM public.users WHERE id = auth.uid();
  SELECT EXISTS (
    SELECT 1 FROM public.directive_targets dt
    WHERE dt.directive_id = p_directive_id
      AND ( (dt.target_type = 'user'     AND dt.target_value = auth.uid()::text)
         OR (dt.target_type = 'role'     AND dt.target_value = v_role)
         OR (dt.target_type = 'location' AND dt.target_value = v_loc) )
  ) INTO v_hit;
  RETURN v_hit;
END;
$$;

ALTER TABLE public.directives          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directive_targets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directive_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directive_receipts  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_directives_founder_all ON public.directives;
CREATE POLICY p_directives_founder_all ON public.directives FOR ALL
  USING (public.get_my_role() IN ('founder','co_founder'))
  WITH CHECK (public.get_my_role() IN ('founder','co_founder'));
DROP POLICY IF EXISTS p_directives_staff_read ON public.directives;
CREATE POLICY p_directives_staff_read ON public.directives FOR SELECT
  USING (public.directive_targets_me(id));

DROP POLICY IF EXISTS p_dtargets_founder_all ON public.directive_targets;
CREATE POLICY p_dtargets_founder_all ON public.directive_targets FOR ALL
  USING (public.get_my_role() IN ('founder','co_founder'))
  WITH CHECK (public.get_my_role() IN ('founder','co_founder'));

DROP POLICY IF EXISTS p_dinst_founder_all ON public.directive_instances;
CREATE POLICY p_dinst_founder_all ON public.directive_instances FOR ALL
  USING (public.get_my_role() IN ('founder','co_founder'))
  WITH CHECK (public.get_my_role() IN ('founder','co_founder'));
DROP POLICY IF EXISTS p_dinst_staff_read ON public.directive_instances;
CREATE POLICY p_dinst_staff_read ON public.directive_instances FOR SELECT
  USING (public.directive_targets_me(directive_id));

DROP POLICY IF EXISTS p_dreceipts_read ON public.directive_receipts;
CREATE POLICY p_dreceipts_read ON public.directive_receipts FOR SELECT
  USING (user_id = auth.uid() OR public.get_my_role() IN ('founder','co_founder'));
DROP POLICY IF EXISTS p_dreceipts_update ON public.directive_receipts;
CREATE POLICY p_dreceipts_update ON public.directive_receipts FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS p_dreceipts_insert ON public.directive_receipts;
CREATE POLICY p_dreceipts_insert ON public.directive_receipts FOR INSERT
  WITH CHECK (user_id = auth.uid());
