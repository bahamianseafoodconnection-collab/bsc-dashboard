-- daily_briefings — archive of every BSC Daily Briefing the system has
-- generated, sent, or attempted. One row per briefing_date.
--
-- raw_data_json holds the structured snapshot the AI used (bank transactions,
-- orders, fees, customers, inventory). Nullable so we can write a placeholder
-- row tonight before the bank-data aggregator exists.
--
-- generated_content holds the assembled email body (HTML or markdown — we
-- store the raw model output so we can rebuild the email later if needed).
--
-- sent_to is the recipient email list at send time.
-- status is one of: 'pending' | 'sent' | 'failed' | 'placeholder'.

CREATE TABLE IF NOT EXISTS daily_briefings (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_date     DATE         NOT NULL,
  raw_data_json     JSONB,
  generated_content TEXT,
  sent_to           TEXT[]       NOT NULL DEFAULT '{}'::text[],
  sent_at           TIMESTAMPTZ,
  status            TEXT         NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','failed','placeholder')),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS daily_briefings_date_idx
  ON daily_briefings (briefing_date DESC);

CREATE INDEX IF NOT EXISTS daily_briefings_status_idx
  ON daily_briefings (status)
  WHERE status IN ('pending','failed');

-- Verify
SELECT
  column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'daily_briefings'
ORDER BY ordinal_position;
