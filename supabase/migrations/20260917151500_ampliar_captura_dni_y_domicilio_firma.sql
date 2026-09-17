-- 17 sep 2026: propietarios.dni tampoco se rellena nunca hoy (confirmado por
-- grep — ninguna migración lo escribe; crm_invitar_propietario_portal solo
-- copia nombre/email/telefono). El contrato de exclusividad real necesita
-- DNI además de domicilio, así que se amplían las funciones creadas hace
-- unos minutos (20260917150000) para capturar ambos datos juntos en vez de
-- solo el domicilio.

DROP FUNCTION IF EXISTS public.propietario_actualizar_domicilio(TEXT);
DROP FUNCTION IF EXISTS public.crm_actualizar_domicilio_propietario(UUID, UUID, TEXT);

CREATE FUNCTION public.propietario_actualizar_datos_firma(p_dni TEXT, p_domicilio TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.propietarios
  SET dni       = COALESCE(NULLIF(btrim(p_dni), ''), dni),
      domicilio = COALESCE(NULLIF(btrim(p_domicilio), ''), domicilio)
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Propietario no encontrado';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.propietario_actualizar_datos_firma(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.propietario_actualizar_datos_firma(TEXT, TEXT) TO authenticated;

CREATE FUNCTION public.crm_actualizar_datos_firma_propietario(
  p_actor_id UUID,
  p_propietario_id UUID,
  p_dni TEXT,
  p_domicilio TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  UPDATE public.propietarios
  SET dni       = COALESCE(NULLIF(btrim(p_dni), ''), dni),
      domicilio = COALESCE(NULLIF(btrim(p_domicilio), ''), domicilio)
  WHERE id = p_propietario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Propietario no encontrado';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_actualizar_datos_firma_propietario(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_actualizar_datos_firma_propietario(UUID, UUID, TEXT, TEXT) TO service_role;
