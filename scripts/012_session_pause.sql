-- Pausing the clock on an active session.
--
-- Customers leave the table: they go out to eat, a board game goes missing and
-- the staff have to find it, the group waits for a friend. None of that should
-- be billed, and until now the only way to not bill it was to push `time_in`
-- forward — which destroys the record of when the customer actually checked in
-- and makes the bill impossible to audit afterwards.
--
-- Two columns rather than one, because a pause has a closed part and an open
-- part:
--
--   paused_ms  the spans that have already ended, added up
--   paused_at  the span still running — null when the clock is moving
--
-- The live paused total is `paused_ms + (now() - paused_at)`, and a session's
-- counted time is `now() - time_in - that`. `lib/billing.ts` owns that
-- arithmetic (`calculatePausedMs` / `calculateElapsedMs`); nothing recomputes
-- it inline.
--
-- `time_in` therefore keeps meaning exactly what it always meant: the moment
-- the customer checked in. Checkout closes the open span (writing `paused_at`
-- back into `paused_ms` and nulling it), so a closed row always satisfies
-- `time_out - time_in - paused_ms = the time that was billed`.
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS paused_ms BIGINT NOT NULL DEFAULT 0;

-- Negative paused time would bill a customer for hours they did not sit.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sessions_paused_ms_non_negative_check'
  ) THEN
    ALTER TABLE sessions
    ADD CONSTRAINT sessions_paused_ms_non_negative_check
    CHECK (paused_ms >= 0);
  END IF;
END $$;

-- Everything that existed before this migration ran without ever being paused.
UPDATE sessions
SET paused_ms = 0
WHERE paused_ms IS NULL;
