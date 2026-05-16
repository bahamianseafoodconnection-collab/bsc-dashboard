-- Audit table for every write performed by the Founder AI's tool layer.
--
-- One row per attempt — success, denied, or error. Captures the tool name,
-- the caller's user id (from the JWT), the full input JSON, the result
-- JSON or error message, and a status.
--
-- The Founder AI's write tools (add_product, set_product_channels) MUST
-- insert into this table before they confirm success to the caller, so
-- nothing the AI does to the DB happens off the record.

BEGIN;

CREATE TABLE IF NOT EXISTS ai_writes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool        text NOT NULL,                       -- 'add_product' | 'set_product_channels'
  caller_id   uuid,                                -- profiles.id of the founder who asked
  input       jsonb,                               -- exact tool input
  result      jsonb,                               -- success payload (product_id, sku, etc.)
  status      text NOT NULL,                       -- 'success' | 'denied' | 'error'
  error       text,                                -- error message when status != 'success'
  created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_writes_created_at ON ai_writes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_writes_caller_id  ON ai_writes(caller_id);
CREATE INDEX IF NOT EXISTS idx_ai_writes_tool       ON ai_writes(tool);
CREATE INDEX IF NOT EXISTS idx_ai_writes_status     ON ai_writes(status);

-- Sanity
SELECT 'ai_writes table exists' AS status FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'ai_writes';

COMMIT;
