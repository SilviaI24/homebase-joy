-- Rollback manual de 20260815090000_close_crm_operation_atomic.sql.
-- No elimina contact_role_id/operation_id porque son columnas compartidas de la
-- reconciliación ESGI y podrían contener datos previos.

BEGIN;

DROP FUNCTION IF EXISTS public.cerrar_operacion_crm(UUID, UUID, UUID);

-- Si ya existen cierres, los guards forman parte de la integridad de esos datos
-- y deben sobrevivir al rollback de la RPC.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.operations WHERE estado = 'Cerrada') THEN
    RAISE NOTICE 'Rollback parcial: se conservan los guards porque existen operaciones cerradas';
  ELSE
    EXECUTE 'DROP TRIGGER IF EXISTS trg_crm_guard_operation_closed_state ON public.operations';
    EXECUTE 'DROP FUNCTION IF EXISTS public.crm_guard_operation_closed_state()';
    EXECUTE 'DROP TRIGGER IF EXISTS trg_crm_preserve_closed_property_state ON public.properties';
    EXECUTE 'DROP FUNCTION IF EXISTS public.crm_preserve_closed_property_state()';
  END IF;
END;
$$;

DROP INDEX IF EXISTS public.idx_operations_contact_role_id;
DROP INDEX IF EXISTS public.idx_seguimiento_operation_id;

COMMIT;
