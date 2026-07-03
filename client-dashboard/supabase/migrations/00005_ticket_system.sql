-- ============================================================================
-- Ticket Messages — threaded replies for support tickets
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('client', 'admin')),
  message TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON public.ticket_messages (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created_at ON public.ticket_messages (created_at);

ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

-- Clients can read messages from their own tickets
CREATE POLICY "ticket_messages_select_own" ON public.ticket_messages
  FOR SELECT USING (
    ticket_id IN (SELECT id FROM public.tickets WHERE client_id = auth.uid())
  );

-- Clients can insert messages on their own tickets
CREATE POLICY "ticket_messages_insert_own" ON public.ticket_messages
  FOR INSERT WITH CHECK (
    sender_type = 'client'
    AND ticket_id IN (SELECT id FROM public.tickets WHERE client_id = auth.uid())
  );

-- ============================================================================
-- Update tickets table — add updated_at and closed_at
-- ============================================================================
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- ============================================================================
-- Ticket expiry function — deletes closed tickets older than N days
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_closed_tickets(retention_days INT DEFAULT 30)
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM public.tickets
  WHERE status = 'closed'
    AND closed_at < NOW() - (retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;