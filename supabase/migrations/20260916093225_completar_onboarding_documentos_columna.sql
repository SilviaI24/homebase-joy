-- Completa la migración 20260813094650_add_onboarding_columns_to_propietarios,
-- que quedó a medias: propietarios.activo/estado_onboarding/casos_especiales sí
-- se aplicaron en su momento, documentos.es_onboarding no (verificado contra
-- information_schema el 16 sep 2026 — la columna no existía en producción
-- pese a que la migración figuraba como aplicada). Sin esto, Onboarding.tsx y
-- AdminPropietarios.tsx no podían leer ni escribir los documentos de
-- onboarding de un propietario.

ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS es_onboarding BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_documentos_onboarding
  ON public.documentos(property_id, es_onboarding)
  WHERE es_onboarding = true;
