-- ============================================================================
-- Projects — shared entity for multi-user access
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT,
  umami_website_id TEXT,
  kuma_status_slug TEXT,
  kuma_badges JSONB,
  domain_expiry_domain TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON public.projects (updated_at DESC);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Project Members — which users belong to which projects
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON public.project_members (user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON public.project_members (project_id);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Clients can see their own memberships
DROP POLICY IF EXISTS "project_members_select_own" ON public.project_members;
CREATE POLICY "project_members_select_own" ON public.project_members
  FOR SELECT USING (auth.uid() = user_id);

-- Clients can see projects they belong to
DROP POLICY IF EXISTS "projects_select_own" ON public.projects;
CREATE POLICY "projects_select_own" ON public.projects
  FOR SELECT USING (
    id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())
  );

-- ============================================================================
-- Migrate existing client profiles into projects
-- Each existing client gets their own project with their current settings
-- ============================================================================
DO $$
DECLARE
  client RECORD;
  new_project_id UUID;
BEGIN
  FOR client IN
    SELECT p.*
    FROM public.profiles p
    WHERE p.role = 'client'
  LOOP
    BEGIN
      -- Create a project from the client's profile settings
      -- Use COALESCE to handle clients without a company_name set
      INSERT INTO public.projects (company_name, umami_website_id, kuma_status_slug, kuma_badges, domain_expiry_domain, created_at, updated_at)
      VALUES (
        COALESCE(client.company_name, 'Unnamed Project'),
        client.umami_website_id,
        client.kuma_status_slug,
        client.kuma_badges,
        client.domain_expiry_domain,
        COALESCE(client.updated_at, now()),
        COALESCE(client.updated_at, now())
      )
      RETURNING id INTO new_project_id;

      -- Add this client as the owner of their project
      INSERT INTO public.project_members (project_id, user_id, role)
      VALUES (new_project_id, client.id, 'owner');
    EXCEPTION WHEN undefined_column THEN
      -- Columns already dropped from profiles by a prior migration run; skip
      NULL;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- Add project_id to tickets and migrate existing data
-- ============================================================================
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

-- Migrate tickets: map client_id → project_id via project_members
DO $$
BEGIN
  UPDATE public.tickets t
  SET project_id = pm.project_id
  FROM public.project_members pm
  WHERE t.client_id = pm.user_id
    AND t.project_id IS NULL;
END $$;

-- Now make project_id NOT NULL and drop client_id
-- (We keep client_id for now as a transitional column; we'll drop it in a later migration after verifying)
ALTER TABLE public.tickets
  ALTER COLUMN project_id SET NOT NULL;

-- Update ticket RLS policies to use project membership
DROP POLICY IF EXISTS "tickets_select_own" ON public.tickets;
DROP POLICY IF EXISTS "tickets_insert_own" ON public.tickets;

CREATE POLICY "tickets_select_own" ON public.tickets
  FOR SELECT USING (
    project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())
  );

CREATE POLICY "tickets_insert_own" ON public.tickets
  FOR INSERT WITH CHECK (
    project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())
  );

-- ============================================================================
-- Add project_id to invoices and migrate existing data
-- ============================================================================
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

-- Migrate invoices: map client_id → project_id via project_members
DO $$
BEGIN
  UPDATE public.invoices i
  SET project_id = pm.project_id
  FROM public.project_members pm
  WHERE i.client_id = pm.user_id
    AND i.project_id IS NULL;
END $$;

ALTER TABLE public.invoices
  ALTER COLUMN project_id SET NOT NULL;

-- Update invoice RLS policies to use project membership
DROP POLICY IF EXISTS "invoices_select_own" ON public.invoices;

CREATE POLICY "invoices_select_own" ON public.invoices
  FOR SELECT USING (
    project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())
  );

-- ============================================================================
-- Update ticket_messages RLS to use project membership
-- ============================================================================
DROP POLICY IF EXISTS "ticket_messages_select_own" ON public.ticket_messages;
DROP POLICY IF EXISTS "ticket_messages_insert_own" ON public.ticket_messages;

CREATE POLICY "ticket_messages_select_own" ON public.ticket_messages
  FOR SELECT USING (
    ticket_id IN (
      SELECT id FROM public.tickets
      WHERE project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "ticket_messages_insert_own" ON public.ticket_messages
  FOR INSERT WITH CHECK (
    sender_type = 'client'
    AND ticket_id IN (
      SELECT id FROM public.tickets
      WHERE project_id IN (SELECT project_id FROM public.project_members WHERE user_id = auth.uid())
    )
  );

-- ============================================================================
-- Remove project-level columns from profiles (keep only auth-related)
-- ============================================================================
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS company_name,
  DROP COLUMN IF EXISTS umami_website_id,
  DROP COLUMN IF EXISTS kuma_status_slug,
  DROP COLUMN IF EXISTS kuma_badges,
  DROP COLUMN IF EXISTS domain_expiry_domain;