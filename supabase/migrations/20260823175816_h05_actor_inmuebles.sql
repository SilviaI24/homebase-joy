-- H-05, parte 5: los 2 escritores simples de inmuebles.functions.ts
-- (addImagenToInmueble, deleteInmueble). El tercero pendiente, updateInmueble,
-- queda deliberadamente fuera: hace diffing dinámico de campos opcionales,
-- changelog condicional y cascada de ciclo_vida sobre contactos — portarlo a
-- SQL sin arriesgar un cambio de comportamiento merece su propia sesión, igual
-- que el bloque de mutations.functions.ts. geocodeInmuebles no tiene
-- consumidores en el frontend hoy (código muerto detectado de paso, no se
-- toca aquí).

BEGIN;

-- addImagenToInmueble: el upload a Storage sigue en TypeScript (no accesible
-- desde SQL); solo el UPDATE final de properties.imagenes pasa por RPC.
CREATE OR REPLACE FUNCTION public.crm_actualizar_imagenes_inmueble(
  p_property_id UUID,
  p_imagenes JSONB,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_property_id IS NULL THEN
    RAISE EXCEPTION 'El inmueble es obligatorio';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE
  ) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  UPDATE public.properties SET imagenes = p_imagenes WHERE id = p_property_id;
END;
$$;

COMMENT ON FUNCTION public.crm_actualizar_imagenes_inmueble(UUID, JSONB, UUID) IS
  'Guarda el array de imagenes de un inmueble, actor real en audit_log (H-05).';

CREATE OR REPLACE FUNCTION public.crm_eliminar_inmueble(
  p_property_id UUID,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_property_id IS NULL THEN
    RAISE EXCEPTION 'El inmueble es obligatorio';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE
  ) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  DELETE FROM public.contact_roles WHERE property_id = p_property_id;
  DELETE FROM public.properties WHERE id = p_property_id;
END;
$$;

COMMENT ON FUNCTION public.crm_eliminar_inmueble(UUID, UUID) IS
  'Borra un inmueble y sus relaciones, actor real en audit_log (H-05).';

REVOKE ALL ON FUNCTION public.crm_actualizar_imagenes_inmueble(UUID, JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_actualizar_imagenes_inmueble(UUID, JSONB, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.crm_eliminar_inmueble(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_eliminar_inmueble(UUID, UUID) TO service_role;

DO $postflight$
BEGIN
  IF has_function_privilege('anon', 'public.crm_actualizar_imagenes_inmueble(uuid,jsonb,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.crm_eliminar_inmueble(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Postflight: alguna función sigue siendo ejecutable por anon';
  END IF;
  RAISE NOTICE 'Postflight OK: las 2 funciones quedan restringidas a service_role';
END $postflight$;

COMMIT;
