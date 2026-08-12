-- Adds an automatic changelog column to properties.
-- Run in Supabase SQL Editor → https://supabase.com/dashboard/project/fyrfkbcabmitbfuqeccq/editor

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS changelog JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Entries have shape: { ts: ISO8601, field: string, old: string|null, new: string|null }
