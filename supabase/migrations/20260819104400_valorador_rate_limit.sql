-- Límite de envíos para el formulario público /functions/v1/valorador (C-05:
-- la función no tenía CAPTCHA, límite de peticiones ni protección contra abuso).
-- No sustituye a un CAPTCHA — solo evita que un mismo origen sature la tabla
-- de inmuebles/contactos con envíos automatizados.

BEGIN;

CREATE TABLE public.valorador_submissions (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip         TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_valorador_submissions_ip_created_at
  ON public.valorador_submissions (ip, created_at DESC);

ALTER TABLE public.valorador_submissions ENABLE ROW LEVEL SECURITY;

-- Solo la Edge Function (service_role) escribe y lee esta tabla — igual que el
-- resto de tablas del CRM (ver CLAUDE.md: "todas las tablas tienen RLS con
-- policy service_role_all TO service_role. La anon key NO lee datos.").
CREATE POLICY service_role_all ON public.valorador_submissions
  TO service_role USING (true) WITH CHECK (true);

-- Housekeeping: sin índice de purga automática — son filas pequeñas (ip +
-- timestamp) y de bajo volumen; revisar periódicamente si conviene un cron
-- de limpieza más adelante.

COMMIT;
