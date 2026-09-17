-- 17 sep 2026: soporte para personalizar el contrato de exclusividad real
-- (domicilio del propietario, que no se guardaba en ningún sitio) y para
-- que el comercial revise documentación y active el acceso al portal
-- desde homebase-joy (CRM) en vez del panel admin del propio Portal.
--
-- Se reutiliza la máquina de estados que ya existía en
-- propietarios.estado_onboarding (pendiente/en_proceso/en_revision/activo,
-- ver 20260813094650_add_onboarding_columns_to_propietarios.sql) — no se
-- crea ningún estado ni columna de "revisado" nueva.

ALTER TABLE public.propietarios ADD COLUMN IF NOT EXISTS domicilio TEXT;

-- Autoservicio desde el Portal: el propio propietario guarda su domicilio
-- (RLS en propietarios solo permite SELECT de la propia fila, no UPDATE).
CREATE OR REPLACE FUNCTION public.propietario_actualizar_domicilio(p_domicilio TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_domicilio IS NULL OR btrim(p_domicilio) = '' THEN
    RAISE EXCEPTION 'El domicilio no puede estar vacío';
  END IF;

  UPDATE public.propietarios
  SET domicilio = btrim(p_domicilio)
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Propietario no encontrado';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.propietario_actualizar_domicilio(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.propietario_actualizar_domicilio(TEXT) TO authenticated;

-- Desde el CRM (homebase-joy, service role sin auth.uid() — H-05: actor
-- explícito validado contra crm_usuarios, igual que
-- crm_invitar_propietario_portal).
CREATE OR REPLACE FUNCTION public.crm_actualizar_domicilio_propietario(
  p_actor_id UUID,
  p_propietario_id UUID,
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
  IF p_domicilio IS NULL OR btrim(p_domicilio) = '' THEN
    RAISE EXCEPTION 'El domicilio no puede estar vacío';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  UPDATE public.propietarios
  SET domicilio = btrim(p_domicilio)
  WHERE id = p_propietario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Propietario no encontrado';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_actualizar_domicilio_propietario(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_actualizar_domicilio_propietario(UUID, UUID, TEXT) TO service_role;

-- Aprobar/rechazar un documento de onboarding subido por el propietario.
-- Mismo botón que ya existía en AdminPropietarios.tsx (Portal), ahora
-- también disponible desde el CRM.
CREATE OR REPLACE FUNCTION public.crm_actualizar_estado_documento(
  p_actor_id UUID,
  p_documento_id UUID,
  p_estado TEXT
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
  IF p_estado NOT IN ('aprobado', 'rechazado') THEN
    RAISE EXCEPTION 'Estado no válido: %', p_estado;
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  UPDATE public.documentos
  SET estado = p_estado
  WHERE id = p_documento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento no encontrado';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_actualizar_estado_documento(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_actualizar_estado_documento(UUID, UUID, TEXT) TO service_role;

-- Activar el acceso completo del propietario (equivalente al botón
-- "Activar acceso completo" de AdminPropietarios.tsx en el Portal, ahora
-- disponible desde el CRM — pasa estado_onboarding a 'activo', el mismo
-- valor que ya desbloquea el Dashboard en ProtectedRoute.tsx).
CREATE OR REPLACE FUNCTION public.crm_activar_propietario(
  p_actor_id UUID,
  p_propietario_id UUID
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
  SET estado_onboarding = 'activo'
  WHERE id = p_propietario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Propietario no encontrado';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_activar_propietario(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_activar_propietario(UUID, UUID) TO service_role;
