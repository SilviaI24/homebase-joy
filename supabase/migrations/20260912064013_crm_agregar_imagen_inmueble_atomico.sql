-- Auditoría 12 sep 2026: addImagenToInmueble hacía un read-modify-write en
-- TypeScript (leer imagenes, concatenar en memoria, reescribir el array
-- completo con crm_actualizar_imagenes_inmueble). Dos subidas concurrentes
-- leían el mismo array inicial y la última en escribir pisaba a la otra —
-- una foto se sube al bucket pero desaparece de la ficha.
--
-- Esta función hace el append dentro del propio UPDATE (jsonb || con el
-- "orden" calculado del mismo valor que se está actualizando), así que
-- Postgres serializa las escrituras concurrentes a la misma fila (MVCC) en
-- vez de que TypeScript pise una lectura obsoleta.
CREATE OR REPLACE FUNCTION public.crm_agregar_imagen_inmueble(
  p_property_id uuid,
  p_url text,
  p_filename text,
  p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_imagenes jsonb;
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

  UPDATE public.properties
  SET imagenes = COALESCE(imagenes, '[]'::jsonb)
    || jsonb_build_array(
         jsonb_build_object(
           'url', p_url,
           'filename', p_filename,
           'orden', COALESCE(jsonb_array_length(imagenes), 0)
         )
       )
  WHERE id = p_property_id
  RETURNING imagenes INTO v_imagenes;

  IF v_imagenes IS NULL THEN
    RAISE EXCEPTION 'Inmueble % no existe', p_property_id;
  END IF;

  RETURN v_imagenes;
END;
$function$;

-- Mismo criterio que el resto de RPC de escritura del CRM: solo service_role.
REVOKE EXECUTE ON FUNCTION public.crm_agregar_imagen_inmueble(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_agregar_imagen_inmueble(uuid, text, text, uuid) TO service_role;
