-- Add role column to profiles for admin/client distinction
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'client';

-- Create index on role for efficient admin lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);

-- Update existing profiles: set the first user (or a specific email) as admin
-- Replace with your actual admin email before running:
-- UPDATE public.profiles SET role = 'admin' WHERE id IN (
--   SELECT id FROM auth.users WHERE email = 'your-email@example.com'
-- );