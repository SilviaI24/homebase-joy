-- Migración de reconciliación (objetivo 4, 19 ago 2026).
-- Este archivo representa un cambio que YA está aplicado en producción bajo la
-- versión 20260721124010 (nombre 'esgi_phase2_alter_tables' en supabase_migrations.schema_migrations).
-- No ejecutar de nuevo manualmente. Contenido copiado tal cual desde la fuente
-- disponible en elsol-client-hub/supabase/esgi-migrations/20260721000001_esgi_phase2_alter_tables.sql
-- para que este repositorio tenga un registro reproducible — ver CLAUDE.md.
-- Si en algún momento se detecta que no coincide exactamente con el esquema real,
-- verificar contra la base de datos y corregir este archivo (no re-ejecutar a ciegas).

-- ============================================================
-- ESGI Phase 2 / Step 1: Enriquecer tablas existentes
-- Target: branch de ESGI (fyrfkbcabmitbfuqeccq)
-- ⚠️  NUNCA ejecutar directamente en producción ESGI.
--    Aplicar en branch, probar, y esperar OK de David para merge.
-- ============================================================

-- ─── agents: añadir columna rol ──────────────────────────
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS rol TEXT DEFAULT 'AGENTE'
    CHECK (rol IN ('AGENTE', 'SENIOR', 'MANAGER'));

-- ─── visits: añadir feedback del portal ──────────────────
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS feedback_puntuacion INT
    CHECK (feedback_puntuacion BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS feedback_texto TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS resultado       TEXT DEFAULT '';

-- ─── seguimiento: enriquecer con columnas del portal ─────
-- (equivale a communications_log; NO crear tabla nueva)
ALTER TABLE public.seguimiento
  ADD COLUMN IF NOT EXISTS operation_id UUID
    REFERENCES public.operations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS direccion TEXT DEFAULT 'SALIENTE'
    CHECK (direccion IN ('ENTRANTE','SALIENTE')),
  ADD COLUMN IF NOT EXISTS asunto    TEXT,
  ADD COLUMN IF NOT EXISTS cuerpo    TEXT,
  ADD COLUMN IF NOT EXISTS metadata  JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS enviado_at TIMESTAMPTZ DEFAULT now();

-- ─── operations: añadir FK a contact_role ────────────────
-- Cierra el loop pipeline (contact_roles) → deal cerrado (operations)
ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS contact_role_id UUID
    REFERENCES public.contact_roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Trigger updated_at en operations (usa función ya existente en ESGI)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_operations_updated_at'
      AND tgrelid = 'public.operations'::regclass
  ) THEN
    EXECUTE '
      CREATE TRIGGER trg_operations_updated_at
        BEFORE UPDATE ON public.operations
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()
    ';
  END IF;
END;
$$;
