-- Recrea admin_crear_invitacion_propietario y claim_propietario_invitation.
-- El frontend de elsol-client-hub las llama (AdminPropietarios.tsx para crear
-- la invitación, AuthContext.tsx para vincular la cuenta al aceptarla) pero
-- verificado el 16 sep 2026 que ninguna de las dos existía en pg_proc de
-- producción — no hay migración local previa que las cree, se aplicaron
-- sueltas en algún momento anterior y se perdieron. Efecto real: el botón
-- "Nuevo propietario" del panel admin fallaba siempre.

CREATE OR REPLACE FUNCTION public.admin_crear_invitacion_propietario(
  _nombre TEXT,
  _email TEXT,
  _telefono TEXT,
  _property_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _propietario_id UUID;
BEGIN
  IF NOT es_staff_crm() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  INSERT INTO public.propietarios (nombre, email, telefono)
  VALUES (_nombre, lower(_email), _telefono)
  RETURNING id INTO _propietario_id;

  INSERT INTO public.propietario_inmueble (propietario_id, property_id)
  VALUES (_propietario_id, _property_id);

  RETURN _propietario_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_crear_invitacion_propietario(TEXT,TEXT,TEXT,UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_crear_invitacion_propietario(TEXT,TEXT,TEXT,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_propietario_invitation()
RETURNS TABLE(propietario_id UUID, propietario_nombre TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _uid UUID := auth.uid();
  _email TEXT := lower(auth.jwt() ->> 'email');
  _row RECORD;
BEGIN
  IF _uid IS NULL OR _email IS NULL THEN
    RETURN;
  END IF;

  SELECT p.id, p.nombre INTO _row
  FROM public.propietarios p
  WHERE lower(p.email) = _email AND p.user_id IS NULL
  LIMIT 1;

  IF _row IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.propietarios SET user_id = _uid WHERE id = _row.id;

  RETURN QUERY SELECT _row.id, _row.nombre;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_propietario_invitation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_propietario_invitation() TO authenticated;
