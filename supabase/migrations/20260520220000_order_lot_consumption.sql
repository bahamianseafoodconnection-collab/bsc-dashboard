-- Closes the trace loop between orders and spinytails HACCP lots.
--
-- Every time a finished BSC product ships against a specific spiny-tail
-- lot, we record one row here: which order drew from which lot, for
-- which product, in what quantity. From this single table both
-- directions of the question are answerable in one SQL:
--
--   "Who consumed lot STPC-20260805-AT-01?"  → SELECT customers FROM olc WHERE lot_id=...
--   "Which lots did customer X consume?"     → SELECT lots FROM olc WHERE order.customer_id=...
--
-- The packing-station UI on /spinytails/lots/[lot_code] writes these
-- rows. Orders that shipped before this table existed remain visible
-- via the customer-pulse page's regex fallback (which scans STPC-*
-- patterns in admin_notes / wholesale_items).

CREATE TABLE IF NOT EXISTS order_lot_consumption (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID         NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  lot_id        UUID         NOT NULL REFERENCES spinytails_lots(id) ON DELETE RESTRICT,
  product_id    UUID         REFERENCES products(id) ON DELETE SET NULL,
  quantity_lbs  NUMERIC(10,3),
  notes         TEXT,
  recorded_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  recorded_by   UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (order_id, lot_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_olc_order_id    ON order_lot_consumption (order_id);
CREATE INDEX IF NOT EXISTS idx_olc_lot_id      ON order_lot_consumption (lot_id);
CREATE INDEX IF NOT EXISTS idx_olc_recorded_at ON order_lot_consumption (recorded_at DESC);

ALTER TABLE order_lot_consumption ENABLE ROW LEVEL SECURITY;

-- Read: any signed-in staff can see who consumed what (HACCP trace requirement).
DROP POLICY IF EXISTS olc_read_staff ON order_lot_consumption;
CREATE POLICY olc_read_staff ON order_lot_consumption
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Write: only privileged staff. Mirrors the spinytails write rules.
DROP POLICY IF EXISTS olc_write_staff ON order_lot_consumption;
CREATE POLICY olc_write_staff ON order_lot_consumption
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('founder','co_founder','control_admin','basic_admin','manager','processor','receiver','qc_staff')
    )
  );

DROP POLICY IF EXISTS olc_delete_admin ON order_lot_consumption;
CREATE POLICY olc_delete_admin ON order_lot_consumption
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('founder','co_founder','control_admin')
    )
  );

COMMENT ON TABLE order_lot_consumption IS
  'Junction table closing the trace loop: every (order, spinytails_lot) pairing that a sale drew from. Populated by the packing-station consumption recorder.';
COMMENT ON COLUMN order_lot_consumption.quantity_lbs IS
  'How many lbs of this lot were consumed by this order. Nullable for case-quantity sales where lbs is implicit.';
