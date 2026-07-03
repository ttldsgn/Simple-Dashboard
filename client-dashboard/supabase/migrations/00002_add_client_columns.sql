-- Add per-client Umami and Kuma configuration columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS umami_website_id TEXT,
  ADD COLUMN IF NOT EXISTS kuma_status_slug TEXT;