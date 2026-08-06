-- Admin/staff accounts for the /admin dashboard.
--
-- SECURITY NOTE — this table is deliberately UNLIKE every other table here.
-- The rest of the schema has an `USING (true) WITH CHECK (true)` policy because
-- the kiosk is unauthenticated and the anon key is public. Password hashes must
-- NOT be reachable that way, so `app_users` enables RLS and grants NO policy at
-- all: the anon key cannot read, insert, update or delete it. Logins go through
-- `verify_login()`, a SECURITY DEFINER function that compares the password
-- inside the database and returns only the id, username and role.
--
-- Manage accounts from the Supabase SQL editor (see the snippets at the bottom).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive, space-trimmed usernames, matching the login lookup below.
CREATE UNIQUE INDEX IF NOT EXISTS app_users_unique_username_idx
ON app_users (lower(btrim(username)));

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- No policy is created on purpose. Belt and braces: drop the default grants too,
-- so even a policy added by mistake later cannot expose the hashes.
REVOKE ALL ON TABLE app_users FROM anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Login                                                                       */
/* -------------------------------------------------------------------------- */

-- Returns at most one row. Never returns password_hash. Runs as the definer so
-- it can read app_users despite the locked-down RLS above.
CREATE OR REPLACE FUNCTION public.verify_login(p_username TEXT, p_password TEXT)
RETURNS TABLE (id UUID, username TEXT, role TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT u.id, u.username, u.role
  FROM public.app_users u
  WHERE lower(btrim(u.username)) = lower(btrim(p_username))
    AND u.is_active
    AND u.password_hash = extensions.crypt(p_password, u.password_hash)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_login(TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_login(TEXT, TEXT) TO anon, authenticated;

/* -------------------------------------------------------------------------- */
/* Starter accounts                                                            */
/* -------------------------------------------------------------------------- */

-- !!! CHANGE BOTH PASSWORDS BEFORE THIS GOES ANYWHERE REAL !!!
-- Defaults: admin / Admin123, staff / Staff1234
INSERT INTO app_users (username, password_hash, role)
VALUES
  ('admin', extensions.crypt('Admin123', extensions.gen_salt('bf')), 'admin'),
  ('staff', extensions.crypt('Staff1234', extensions.gen_salt('bf')), 'staff')
ON CONFLICT (lower(btrim(username))) DO NOTHING;

/* -------------------------------------------------------------------------- */
/* Account management snippets                                                 */
/* -------------------------------------------------------------------------- */

-- Add a user:
--   INSERT INTO app_users (username, password_hash, role)
--   VALUES ('nina', extensions.crypt('their-password', extensions.gen_salt('bf')), 'staff');
--
-- Change a password:
--   UPDATE app_users
--   SET password_hash = extensions.crypt('new-password', extensions.gen_salt('bf')),
--       updated_at = now()
--   WHERE lower(btrim(username)) = 'nina';
--
-- Disable an account without deleting its history:
--   UPDATE app_users SET is_active = false, updated_at = now()
--   WHERE lower(btrim(username)) = 'nina';
