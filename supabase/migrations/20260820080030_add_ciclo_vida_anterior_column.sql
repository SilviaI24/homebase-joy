-- M-05: soporte para que el personal de oficina archive/restaure un contacto
-- manualmente, sin perder de qué etapa venía. Recordamos el ciclo_vida
-- anterior en una columna nueva para poder "sacarlo" de histórico y que
-- vuelva exactamente a donde estaba (Lead/Prospecto/Cliente), no siempre a
-- Lead por defecto.

BEGIN;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS ciclo_vida_anterior TEXT;

COMMIT;
