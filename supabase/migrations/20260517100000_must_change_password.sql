-- Force-password-change on first sign in.
--
-- profiles.must_change_password = TRUE means: next time the user lands
-- in the app, the AppShell guard redirects them to /change-password
-- and won't let them out until they set a fresh password.
--
-- Used for staff accounts created with temp passwords (e.g. Nicholson's
-- BSC2024! starter password).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Provision Nicholson ─────────────────────────────────────
-- IMPORTANT: this only works AFTER you create the auth user manually:
--   Supabase Dashboard → Authentication → Users → Add User
--     Email:    Nic@bsc.com
--     Password: BSC2024!
--     (uncheck "Send email confirmation" so he can sign in immediately)
--
-- Then run the rest of this script — the SELECT pulls his new auth.users
-- row by email and upserts the matching profile.

INSERT INTO profiles (id, role, full_name, must_change_password)
SELECT u.id, 'receiver', 'Nicholson', TRUE
FROM auth.users u
WHERE u.email = 'Nic@bsc.com'
ON CONFLICT (id) DO UPDATE
SET role                 = 'receiver',
    full_name            = COALESCE(profiles.full_name, 'Nicholson'),
    must_change_password = TRUE;

-- Verify
SELECT p.id, p.role, p.full_name, p.must_change_password, u.email
FROM profiles p JOIN auth.users u ON u.id = p.id
WHERE u.email = 'Nic@bsc.com';
