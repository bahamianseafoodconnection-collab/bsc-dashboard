-- Marketplace flyers — promotional banners shown on /market.
--
-- Used by the Founder AI's create_flyer / list_flyers / set_flyer_active
-- tools and rendered by <FlyerBanner /> at the top of the marketplace.
--
-- A flyer is "live" when:
--   is_active = TRUE
--   AND (valid_from IS NULL OR valid_from <= NOW())
--   AND (valid_to   IS NULL OR valid_to   >= NOW())
--
-- Multiple live flyers rotate in the carousel (sorted by display_order DESC,
-- then created_at DESC).

CREATE TABLE IF NOT EXISTS flyers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT        NOT NULL,
  body              TEXT,
  image_url         TEXT,
  cta_label         TEXT        NOT NULL DEFAULT 'Shop Now',
  cta_url           TEXT        NOT NULL DEFAULT '/market',
  background_color  TEXT        NOT NULL DEFAULT '#060d1f',
  text_color        TEXT        NOT NULL DEFAULT '#f5c518',
  valid_from        TIMESTAMPTZ,
  valid_to          TIMESTAMPTZ,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  display_order     INTEGER     NOT NULL DEFAULT 0,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS flyers_active_idx
  ON flyers (is_active, display_order DESC, created_at DESC)
  WHERE is_active = TRUE;

-- Verification
SELECT 'flyers_count' AS what, COUNT(*) AS n FROM flyers;
