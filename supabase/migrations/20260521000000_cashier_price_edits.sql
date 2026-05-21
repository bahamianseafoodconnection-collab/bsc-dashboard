-- Cashier price edits — Claff (and other cashiers) can set the live
-- Nassau / Andros POS price at the register. The system back-computes
-- cost from the new POS price + the product's vat_category, then
-- recomputes ALL OTHER channels via the 5-channel markup model. Every
-- edit is logged here so Dedrick can review after a few days and
-- ratify or correct.
--
-- The actual writes (products_costs + product_pricing) happen
-- separately via the canonical immutability pattern (INSERT new rows;
-- costs_expire_previous trigger flips the old ones). This table is the
-- AUDIT TRAIL, not the source of truth for prices.

CREATE TABLE IF NOT EXISTS cashier_price_edits (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id           UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_sku          TEXT         NOT NULL,
  cashier_user_id      UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  cashier_role         TEXT         NOT NULL,             -- 'cashier' | 'andros_staff' | 'manager' | 'founder' etc.
  channel_set          TEXT         NOT NULL,             -- 'nassau_pos' | 'andros_pos' (which POS sourced the edit)
  vat_category         TEXT         NOT NULL,
  old_cost_per_unit    NUMERIC(12,4),
  new_cost_per_unit    NUMERIC(12,4) NOT NULL,
  old_nassau_price     NUMERIC(12,2),
  new_nassau_price     NUMERIC(12,2) NOT NULL,
  channel_prices       JSONB        NOT NULL,             -- snapshot of new prices for all 5 channels
  reason               TEXT,                              -- optional cashier note
  edited_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  dedrick_reviewed     BOOLEAN      NOT NULL DEFAULT FALSE,
  dedrick_reviewed_at  TIMESTAMPTZ,
  dedrick_notes        TEXT,
  dedrick_decision     TEXT         CHECK (dedrick_decision IN ('keep','revise','reject'))
);

CREATE INDEX IF NOT EXISTS idx_cpe_edited_at        ON cashier_price_edits (edited_at DESC);
CREATE INDEX IF NOT EXISTS idx_cpe_product          ON cashier_price_edits (product_id, edited_at DESC);
CREATE INDEX IF NOT EXISTS idx_cpe_pending_review   ON cashier_price_edits (edited_at DESC) WHERE NOT dedrick_reviewed;
CREATE INDEX IF NOT EXISTS idx_cpe_cashier          ON cashier_price_edits (cashier_user_id, edited_at DESC);

ALTER TABLE cashier_price_edits ENABLE ROW LEVEL SECURITY;

-- The cashier who made the edit can read it back (so the POS could show "you edited this 10 min ago").
DROP POLICY IF EXISTS cpe_self_read ON cashier_price_edits;
CREATE POLICY cpe_self_read ON cashier_price_edits
  FOR SELECT
  USING (cashier_user_id = auth.uid());

-- Admins read every edit — that's the review queue.
DROP POLICY IF EXISTS cpe_admin_read ON cashier_price_edits;
CREATE POLICY cpe_admin_read ON cashier_price_edits
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('founder','co_founder','control_admin','basic_admin')
    )
  );

-- Admins can mark reviewed.
DROP POLICY IF EXISTS cpe_admin_update ON cashier_price_edits;
CREATE POLICY cpe_admin_update ON cashier_price_edits
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('founder','co_founder','control_admin','basic_admin')
    )
  );

-- INSERTs happen only via the SERVICE_ROLE API route (no direct client write).
DROP POLICY IF EXISTS cpe_block_direct_insert ON cashier_price_edits;
CREATE POLICY cpe_block_direct_insert ON cashier_price_edits
  FOR INSERT WITH CHECK (FALSE);

COMMENT ON TABLE cashier_price_edits IS
  'Audit log for cashier-initiated POS price edits. Source of truth for prices stays product_pricing + product_costs (immutable supersession). Dedrick reviews this queue every 4-5 days to ratify or correct.';
