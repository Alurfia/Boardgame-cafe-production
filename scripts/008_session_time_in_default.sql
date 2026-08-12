-- `started_at` has carried DEFAULT now() since 001, but `time_in` (added in 005)
-- had none, so every check-in path had to supply the timestamp itself — and the
-- kiosk supplied it from the customer's browser clock. A device running ahead
-- wrote a check-in time in the future, which the kiosk timer then displayed as a
-- frozen 00:00 until real time caught up. Postgres owns the clock now.
ALTER TABLE sessions
ALTER COLUMN time_in SET DEFAULT now();

-- Any row that slipped in without one, plus the pre-005 rows 005's backfill
-- could not reach because they were created after it ran.
UPDATE sessions
SET time_in = started_at
WHERE time_in IS NULL;
