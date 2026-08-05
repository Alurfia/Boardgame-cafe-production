-- Enforce unique customer name among active sessions only
-- Case-insensitive and ignores leading/trailing spaces
CREATE UNIQUE INDEX IF NOT EXISTS sessions_unique_active_customer_name_idx
ON sessions (lower(btrim(customer_name)))
WHERE status = 'active';
