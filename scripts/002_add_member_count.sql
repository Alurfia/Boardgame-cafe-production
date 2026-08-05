-- Add member_count column to sessions table
ALTER TABLE sessions
ADD COLUMN member_count INTEGER NOT NULL DEFAULT 1;
