-- Migración de reconciliación (objetivo 4, 19 ago 2026).
-- Este archivo representa un cambio que YA está aplicado en producción bajo la
-- versión 20260813094650 (nombre 'add_onboarding_columns_to_propietarios' en supabase_migrations.schema_migrations).
-- No ejecutar de nuevo manualmente. Contenido copiado tal cual desde la fuente
-- disponible en elsol-client-hub/supabase/esgi-migrations/20260727000002_onboarding_propietarios.sql
-- para que este repositorio tenga un registro reproducible — ver CLAUDE.md.
-- Si en algún momento se detecta que no coincide exactamente con el esquema real,
-- verificar contra la base de datos y corregir este archivo (no re-ejecutar a ciegas).

-- ─────────────────────────────────────────────────────────────────────────────
-- Onboarding de propietarios — flujo de documentación previa al portal completo
-- EJECUTAR en ESGI SQL Editor antes de desplegar el frontend
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Columnas de onboarding en propietarios
ALTER TABLE public.propietarios
  ADD COLUMN IF NOT EXISTS activo              BOOLEAN   NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS estado_onboarding   TEXT      NOT NULL DEFAULT 'pendiente'
    CHECK (estado_onboarding IN ('pendiente','en_proceso','en_revision','activo')),
  ADD COLUMN IF NOT EXISTS casos_especiales    TEXT[]    NOT NULL DEFAULT '{}';
  -- Valores posibles en casos_especiales: 'herencia', 'divorcio', 'menores'

-- 2. Flag de onboarding en documentos
ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS es_onboarding BOOLEAN NOT NULL DEFAULT false;

-- Índice para filtrar docs de onboarding eficientemente
CREATE INDEX IF NOT EXISTS idx_documentos_onboarding
  ON public.documentos(property_id, es_onboarding)
  WHERE es_onboarding = true;

-- 3. Política: staff puede actualizar estado_onboarding del propietario
--    (para activar acceso completo tras revisión)
DROP POLICY IF EXISTS "staff actualiza propietarios" ON public.propietarios;
CREATE POLICY "staff actualiza propietarios" ON public.propietarios
  FOR UPDATE TO authenticated
  USING  (es_staff_crm())
  WITH CHECK (es_staff_crm());

-- Propietario puede actualizar sus propios casos_especiales y disparar en_revision
DROP POLICY IF EXISTS "propietario actualiza su onboarding" ON public.propietarios;
CREATE POLICY "propietario actualiza su onboarding" ON public.propietarios
  FOR UPDATE TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    -- Solo puede cambiar casos_especiales y pasar a 'en_revision'
    -- (la activación final la hace el agente)
  );

-- 4. Staff puede ver todos los propietarios (panel de revisión)
DROP POLICY IF EXISTS "staff lee propietarios" ON public.propietarios;
CREATE POLICY "staff lee propietarios" ON public.propietarios
  FOR SELECT TO authenticated
  USING (es_staff_crm() OR user_id = auth.uid());

-- 5. Staff puede ver todas las transacciones Docuten (para revisión)
DROP POLICY IF EXISTS "staff lee transacciones docuten" ON public.transacciones_docuten;
CREATE POLICY "staff lee transacciones docuten" ON public.transacciones_docuten
  FOR SELECT TO authenticated
  USING (es_staff_crm() OR
    property_id IN (
      SELECT pi.property_id FROM public.propietario_inmueble pi
      JOIN public.propietarios p ON p.id = pi.propietario_id
      WHERE p.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificar tras ejecutar:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'propietarios' AND column_name IN ('activo','estado_onboarding','casos_especiales');
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'documentos' AND column_name = 'es_onboarding';
-- ─────────────────────────────────────────────────────────────────────────────
