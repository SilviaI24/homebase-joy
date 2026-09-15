-- Sincronización con Google Calendar (petición de la reunión de comerciales,
-- sep 2026): empuje único CRM -> Google, un agente conecta su propia cuenta
-- de Google Workspace y sus visitas se crean/actualizan/eliminan en su
-- calendario personal. No hay sincronización en sentido contrario.
--
-- agent_google_tokens guarda el refresh_token (permanente hasta que el
-- agente revoque el acceso desde su cuenta de Google) y el access_token de
-- corta duración cacheado para no pedir uno nuevo en cada evento.
-- visits.google_event_id enlaza cada visita con su evento en Google para
-- poder editarla/borrarla más adelante.

BEGIN;

CREATE TABLE public.agent_google_tokens (
  agent_id                 UUID PRIMARY KEY REFERENCES public.agents(id) ON DELETE CASCADE,
  refresh_token            TEXT NOT NULL,
  access_token             TEXT,
  access_token_expires_at  TIMESTAMPTZ,
  google_email             TEXT,
  connected_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_google_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.agent_google_tokens
  TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS google_event_id TEXT;

COMMIT;
