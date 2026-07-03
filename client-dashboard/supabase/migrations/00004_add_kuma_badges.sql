-- Add kuma_badges JSONB column for storing Uptime Kuma badge URLs
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS kuma_badges JSONB DEFAULT '[]'::jsonb;

-- Example structure for kuma_badges:
-- [
--   { "label": "Status", "url": "https://status.totaldsgn.com/api/badge/2/status" },
--   { "label": "Ping",   "url": "https://status.totaldsgn.com/api/badge/2/ping"   }
-- ]