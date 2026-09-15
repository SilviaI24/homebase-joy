-- Instrucciones de mejora del CRM (sep 2026), punto "Agenda": hoy solo se
-- puede pasar una visita a Cancelada (crm_actualizar_visita_estado) -- no se
-- puede corregir la fecha/inmueble/cliente/agente de una visita ya creada, ni
-- eliminarla si se creó por error o ya no tiene sentido conservarla (visita
-- duplicada, prueba, etc.).
--
-- crm_eliminar_visita revive el permiso 'visits.delete', retirado el 9 sep
-- 2026 (20260909124258_retirar_permisos_sin_uso_real.sql) precisamente
-- porque no había ninguna función real detrás -- ahora sí la hay. Se
-- re-inserta con la misma descripción/sensibilidad que tenía en su momento
-- (crm_rbac_delta_v3), otorgado a ADMIN y OPERATIVO (los comerciales
-- necesitan poder limpiar una visita mal creada en el día a día) y denegado
-- a FINANCIERO (sin cuentas activas hoy, ver nota en CLAUDE.md).
--
-- crm_actualizar_visita reutiliza el permiso 'visits.update' ya existente --
-- editar los datos de una visita es la misma capacidad que ya gobierna
-- cambiar su estado.

BEGIN;

INSERT INTO public.crm_permisos (clave, dominio, accion, descripcion, sensible)
VALUES (
  'visits.delete',
  'visits',
  'delete',
  'Eliminar visitas',
  true
)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO public.crm_permisos_rol (rol_base, permiso_clave, permitido)
VALUES
  ('ADMIN', 'visits.delete', true),
  ('OPERATIVO', 'visits.delete', true),
  ('FINANCIERO', 'visits.delete', false)
ON CONFLICT (rol_base, permiso_clave) DO NOTHING;

-- ── crm_actualizar_visita ────────────────────────────────────────────────────
-- Edita fecha/inmueble/cliente/agente/notas de una visita ya creada. El
-- estado se sigue cambiando solo con crm_actualizar_visita_estado (sin
-- duplicar esa validación aquí).
CREATE OR REPLACE FUNCTION public.crm_actualizar_visita(
  p_visita_id UUID,
  p_fecha TIMESTAMPTZ,
  p_property_id UUID,
  p_contact_id UUID,
  p_agente_id UUID,
  p_notas TEXT,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_visita_id IS NULL THEN
    RAISE EXCEPTION 'visitaId requerido';
  END IF;
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'Fecha requerida';
  END IF;
  IF p_property_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona un inmueble';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  UPDATE public.visits
  SET
    fecha       = p_fecha,
    property_id = p_property_id,
    contact_id  = p_contact_id,
    agente_id   = p_agente_id,
    notas       = COALESCE(p_notas, '')
  WHERE id = p_visita_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita no encontrada';
  END IF;
END;
$$;

-- ── crm_eliminar_visita ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_eliminar_visita(
  p_visita_id UUID,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_visita_id IS NULL THEN
    RAISE EXCEPTION 'visitaId requerido';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  DELETE FROM public.visits WHERE id = p_visita_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Visita no encontrada';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_actualizar_visita(UUID,TIMESTAMPTZ,UUID,UUID,UUID,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_actualizar_visita(UUID,TIMESTAMPTZ,UUID,UUID,UUID,TEXT,UUID) TO service_role;

REVOKE ALL ON FUNCTION public.crm_eliminar_visita(UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_eliminar_visita(UUID,UUID) TO service_role;

DO $postflight$
DECLARE
  v_anon_puede BOOLEAN;
BEGIN
  SELECT
    has_function_privilege('anon', 'public.crm_actualizar_visita(uuid,timestamptz,uuid,uuid,uuid,text,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.crm_eliminar_visita(uuid,uuid)', 'EXECUTE')
  INTO v_anon_puede;

  IF v_anon_puede THEN
    RAISE EXCEPTION 'Postflight: anon no debería poder ejecutar crm_actualizar_visita/crm_eliminar_visita';
  END IF;
END;
$postflight$;

COMMIT;
