-- RPC nueva para el botón "Dar acceso al portal" en la ficha de cliente del
-- CRM (homebase-joy). Distinta de admin_crear_invitacion_propietario (la que
-- usa el panel admin del propio Portal): esa se llama desde el navegador con
-- la sesión del operario (auth.uid() real, se valida con es_staff_crm()); esta
-- se llama desde homebase-joy vía getSupa() (service role, sin auth.uid()),
-- así que el actor viaja como parámetro explícito y se valida contra
-- crm_usuarios -- mismo patrón que crm_crear_prospecto_manual. Idempotente:
-- si el contacto ya tiene ficha de propietario, la reutiliza en vez de
-- duplicarla.
CREATE OR REPLACE FUNCTION public.crm_invitar_propietario_portal(
  p_actor_id UUID,
  p_contact_id UUID,
  p_property_id UUID
) RETURNS TABLE(propietario_id UUID, email TEXT, nombre TEXT, ya_existia BOOLEAN)
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
