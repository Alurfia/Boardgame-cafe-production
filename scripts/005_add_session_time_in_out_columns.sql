-- Add explicit in/out timestamps for sessions
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS time_in TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS time_out TIMESTAMPTZ;

-- Backfill existing rows from current start/end timestamps
UPDATE sessions
SET
  time_in = COALESCE(time_in, started_at),
  time_out = COALESCE(time_out, ended_at);
