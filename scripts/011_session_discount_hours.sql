-- Redeemed discount privileges, one billable hour each.
--
-- A privilege buys off one *person-hour* of the session fee: a table of five
-- that played two billable hours holds ten of them, and each redeemed one takes
-- `hourly_rate` off the bill. The discount comes out of the session fee (base
-- fee included) and never out of the snacks, so a group can wipe the time
-- charge to zero and still owe what it ate.
--
-- Staff enter this at checkout, so an `active` row is always 0. It is stored
-- rather than folded into `total_cost` alone so a past bill can still show
-- where its number came from — `total_cost` stays the frozen amount charged.
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS discount_hours INTEGER NOT NULL DEFAULT 0;

-- Negative privileges would be a credit, which is not a thing here.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sessions_discount_hours_non_negative_check'
  ) THEN
    ALTER TABLE sessions
    ADD CONSTRAINT sessions_discount_hours_non_negative_check
    CHECK (discount_hours >= 0);
  END IF;
END $$;
