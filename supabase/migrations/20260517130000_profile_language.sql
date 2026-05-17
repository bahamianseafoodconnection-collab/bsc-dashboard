-- Per-profile language preference.
-- Values used by the app: 'en' (English), 'cr' (Haitian Kreyòl), 'es' (Español).
-- Defaulting to 'en' keeps existing staff unchanged.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';

-- Tighten with a CHECK so we don't accidentally write garbage values.
-- (Drop + recreate so this migration is idempotent.)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_language_check;
ALTER TABLE profiles ADD CONSTRAINT  profiles_language_check
  CHECK (language IN ('en','cr','es'));

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'language';
