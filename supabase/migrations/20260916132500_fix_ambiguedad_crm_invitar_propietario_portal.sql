-- Fix: RETURNS TABLE(propietario_id UUID, ...) crea una variable interna
-- "propietario_id" en el cuerpo de la función, que choca con la columna
-- propietario_inmueble.propietario_id dentro del propio
-- INSERT ... ON CONFLICT (propietario_id, property_id) -> "column reference
-- propietario_id is ambiguous" (encontrado probando el botón en vivo,
-- 16 sep 2026). Se renombran las columnas de salida para que no colisionen
-- con ninguna columna real usada en el cuerpo de la función.
DROP FUNCTION IF EXISTS public.crm_invitar_propietario_portal(UUID, UUID, UUID);

CREATE FUNCTION public.crm_invitar_propietario_portal(
  p_actor_id UUID,
  p_contact_id UUID,
  p_property_id UUID
) RETURNS TABLE(out_propietario_id UUID, out_email TEXT, out_nombre TEXT, out_ya_existia BOOLEAN)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact RECORD;
  v_propietario_id UUID;
  v_ya_existia BOOLEAN := false;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  SELECT c.nombre, c.email, c.telefono INTO v_contact
  FROM public.contacts c WHERE c.id = p_contact_id;
  IF v_contact IS NULL THEN
    RAISE EXCEPTION 'Contacto no encontrado';
  END IF;
  IF v_contact.email IS NULL OR btrim(v_contact.email) = '' THEN
    RAISE EXCEPTION 'El contacto no tiene email registrado';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  SELECT p.id INTO v_propietario_id
  FROM public.propietarios p
  WHERE p.contact_id = p_contact_id
  LIMIT 1;

  IF v_propietario_id IS NULL THEN
    INSERT INTO public.propietarios (nombre, email, telefono, contact_id)
    VALUES (v_contact.nombre, lower(v_contact.email), COALESCE(v_contact.telefono, ''), p_contact_id)
    RETURNING id INTO v_propietario_id;
  ELSE
    v_ya_existia := true;
  END IF;

  INSERT INTO public.propietario_inmueble (propietario_id, property_id)
  VALUES (v_propietario_id, p_property_id)
  ON CONFLICT (propietario_id, property_id) DO NOTHING;

  RETURN QUERY SELECT v_propietario_id, lower(v_contact.email), v_contact.nombre, v_ya_existia;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_invitar_propietario_portal(UUID,UUID,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_invitar_propietario_portal(UUID,UUID,UUID) TO service_role;
