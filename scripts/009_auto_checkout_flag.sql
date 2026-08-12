-- Sessions closed by the nightly sweep rather than by a person.
--
-- A customer who walks out without checking out leaves the session `active`
-- forever: the kiosk timer keeps running, the name stays locked by
-- `006_unique_active_session_name.sql`, and the takings for that day never
-- settle. `/api/cron/auto-checkout` closes those every morning at 10:00
-- Asia/Bangkok — see `lib/auto-checkout.ts`.
--
-- The flag exists so staff can tell a swept bill from one a person confirmed.
-- The amount is computed the same way either way (`lib/billing.ts`), but the
-- clock ran unattended, so the total is worth a second look before it is
-- treated as real revenue.
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS auto_checked_out BOOLEAN NOT NULL DEFAULT false;

-- Everything closed before this migration was closed by hand.
UPDATE sessions
SET auto_checked_out = false
WHERE auto_checked_out IS NULL;
