-- Sessions split off an active table by a partial checkout.
--
-- Groups do not always leave together. When 2 of 5 people settle up early, the
-- admin panel splits a *child* session off the table: a `checked_out` row
-- carrying the departing members, their share of the snacks, and a frozen
-- `total_cost`, while the parent stays `active` with the remainder and its
-- original `time_in`.
--
-- The child reuses the parent's `customer_name`, which is legal because the
-- unique index from `006_unique_active_session_name.sql` only covers rows
-- `WHERE status = 'active'`. This column is what tells the two rows apart in
-- history — the admin views render a "Partial" badge from it.
--
-- Billing does not change: the child is an ordinary checked-out session whose
-- total came from the same `lib/billing.ts` functions a full checkout uses, so
-- every revenue view keeps reading `total_cost` and nothing else.
ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS parent_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;

-- SET NULL rather than CASCADE: deleting the still-active parent must never
-- erase money already collected on the child.
CREATE INDEX IF NOT EXISTS sessions_parent_session_id_idx
ON sessions (parent_session_id)
WHERE parent_session_id IS NOT NULL;
