-- Elimina el concepto de alcance de datos de crm_usuarios.
-- Decisión: el equipo de El Sol Grupo comparte toda la información (oficina única).
-- crm_permisos_rol.alcance_max y crm_permisos_usuario.alcance ya eran inexistentes
-- en la branch (crm_rbac_delta_v3 nunca los creó). Solo queda limpiar crm_usuarios.

BEGIN;

-- Los constraints referencian alcance_datos y deben caer primero.
ALTER TABLE public.crm_usuarios
  DROP CONSTRAINT IF EXISTS chk_alcance_rol;

ALTER TABLE public.crm_usuarios
  DROP CONSTRAINT IF EXISTS crm_usuarios_alcance_datos_check;

ALTER TABLE public.crm_usuarios
  DROP COLUMN IF EXISTS alcance_datos;

-- Postflight: columna eliminada
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'crm_usuarios'
      AND column_name  = 'alcance_datos'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT FAIL: alcance_datos sigue presente en crm_usuarios';
  END IF;
END $$;

COMMIT;
