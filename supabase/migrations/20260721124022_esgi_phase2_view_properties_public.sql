-- Migración de reconciliación (objetivo 4, 19 ago 2026).
-- Este archivo representa un cambio que YA está aplicado en producción bajo la
-- versión 20260721124022 (nombre 'esgi_phase2_view_properties_public' en supabase_migrations.schema_migrations).
-- No ejecutar de nuevo manualmente. Contenido copiado tal cual desde la fuente
-- disponible en elsol-client-hub/supabase/esgi-migrations/20260721000002_esgi_phase2_view_properties_public.sql
-- para que este repositorio tenga un registro reproducible — ver CLAUDE.md.
-- Si en algún momento se detecta que no coincide exactamente con el esquema real,
-- verificar contra la base de datos y corregir este archivo (no re-ejecutar a ciegas).

-- ============================================================
-- ESGI Phase 2 / Step 2: Vista properties_public
-- Target: branch de ESGI (fyrfkbcabmitbfuqeccq)
-- ⚠️  NUNCA crear una tabla properties_public — siempre vista.
--    El frontend Lovable y los edge functions del portal la esperan.
-- ============================================================

-- security_invoker = true: la vista ejecuta con los permisos del
-- llamante, por lo que el RLS de la tabla properties se aplica
-- correctamente (anon no ve nada si properties no tiene política anon).
CREATE OR REPLACE VIEW public.properties_public
  WITH (security_invoker = true)
AS
SELECT
  id,
  airtable_id                   AS airtable_record_id,
  ref                           AS ref_code,
  CONCAT(tipo, ' ', categoria)  AS title,
  CONCAT(
    COALESCE(calle, ''),
    CASE WHEN numero IS NOT NULL AND numero <> '' THEN ' ' || numero ELSE '' END,
    CASE WHEN piso   IS NOT NULL AND piso   <> '' THEN ' ' || piso   ELSE '' END
  )                             AS address,
  localidad                     AS city,
  barrio                        AS neighborhood,
  CASE estatus
    WHEN 'Activo'    THEN 'ACTIVE'
    WHEN 'Reservado' THEN 'RESERVED'
    WHEN 'Vendido'   THEN 'SOLD'
    WHEN 'Alquilado' THEN 'RENTED'
    ELSE 'INACTIVE'
  END                           AS status,
  precio                        AS price,
  NULL::TEXT                    AS owner_email,     -- se enriquece vía propietarios cuando esté listo
  NULL::TEXT                    AS casos_especiales,
  fecha_fin_exclusiva           AS exclusivity_end,
  created_at,
  updated_at
FROM public.properties;

-- Permisos explícitos sobre la vista
GRANT SELECT ON public.properties_public TO anon, authenticated;
