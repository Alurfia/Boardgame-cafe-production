-- Add explicit recorded usage fields for finished sessions
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS used_hours INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS used_minutes INTEGER NOT NULL DEFAULT 0;

-- Keep minutes in a valid range for consistency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sessions_used_minutes_range_check'
  ) THEN
    ALTER TABLE sessions
    ADD CONSTRAINT sessions_used_minutes_range_check
    CHECK (used_minutes >= 0 AND used_minutes <= 59);
  END IF;
END $$;
