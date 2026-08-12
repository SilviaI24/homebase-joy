-- wa_thread_id: identifica el hilo de conversación WhatsApp de SilvIA para este contacto
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS wa_thread_id TEXT;

CREATE INDEX IF NOT EXISTS idx_contacts_wa_thread_id
  ON public.contacts (wa_thread_id)
  WHERE wa_thread_id IS NOT NULL;

COMMENT ON COLUMN public.contacts.wa_thread_id IS
  'Thread ID del hilo WhatsApp de SilvIA. Null si no tiene conversación activa.';
