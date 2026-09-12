-- H-05 (actor real en audit_log) — completar los 2 flujos que quedaban con
-- escritura directa: createOperacion y updateOperacionEstado
-- (operaciones.functions.ts). closeOperacion ya usaba cerrar_operacion_crm
-- desde antes; estos dos son los únicos que faltaban para el 100% real.
--
-- Mismo patrón que el resto de H-05: SECURITY INVOKER, actor validado contra
-- crm_usuarios (activo=TRUE), set_config('app.actor_id', ...) dentro del
-- mismo RPC que escribe (registrar_audit() lo lee vía ese GUC), y
-- REVOKE/GRANT para que solo service_role pueda ejecutar.

BEGIN;

-- Preflight: confirmar que las funciones no existen ya con otra forma
-- (evita pisar algo si esta migración se reaplica sobre un estado distinto).
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname IN ('crm_crear_operacion', 'crm_actualizar_estado_operacion')
  ) THEN
    RAISE NOTICE 'Preflight: al menos una función ya existe — CREATE OR REPLACE la actualizará.';
  END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.crm_crear_operacion(
  p_tipo TEXT,
  p_precio_operacion NUMERIC,
  p_comision_pct NUMERIC,
  p_property_id UUID,
  p_agente_id UUID,
  p_vendedor_id UUID,
  p_comprador_id UUID,
  p_notas TEXT,
  p_actor_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_id UUID;
  v_agente_id UUID;
  v_comision_total NUMERIC;
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('Venta', 'Alquiler', 'Valoración', 'Servicio') THEN
    RAISE EXCEPTION 'Tipo de operación inválido';
  END IF;
  IF p_precio_operacion IS NOT NULL AND p_precio_operacion < 0 THEN
    RAISE EXCEPTION 'Precio de operación inválido';
  END IF;
  IF p_comision_pct IS NOT NULL AND (p_comision_pct < 0 OR p_comision_pct > 100) THEN
    RAISE EXCEPTION 'La comisión debe estar entre 0 y 100';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE
  ) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  -- Mismo fallback que el TS original: si no se indica agente, el de la
  -- propia sesión que crea la operación.
  v_agente_id := COALESCE(p_agente_id, (SELECT agent_id FROM public.crm_usuarios WHERE user_id = p_actor_id));
  IF v_agente_id IS NULL THEN
    RAISE EXCEPTION 'La operación necesita un agente responsable';
  END IF;

  -- Misma fórmula que el TS original (Math.round(precio*pct)/100): redondeo
  -- a 2 decimales, matemáticamente idéntico a round(precio*pct/100, 2).
  v_comision_total := CASE
    WHEN p_precio_operacion IS NOT NULL AND p_comision_pct IS NOT NULL
    THEN round(p_precio_operacion * p_comision_pct / 100, 2)
    ELSE NULL
  END;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  INSERT INTO public.operations (
    tipo, estado, fecha_apertura, precio_operacion, comision_pct, comision_total,
    property_id, agente_id, vendedor_id, comprador_id, notas
  ) VALUES (
    p_tipo, 'Abierta', now(), p_precio_operacion, p_comision_pct, v_comision_total,
    p_property_id, v_agente_id, p_vendedor_id, p_comprador_id,
    COALESCE(NULLIF(trim(p_notas), ''), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.crm_actualizar_estado_operacion(
  p_operacion_id UUID,
  p_estado TEXT,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_current TEXT;
BEGIN
  IF p_operacion_id IS NULL THEN
    RAISE EXCEPTION 'Operación requerida';
  END IF;
  IF p_estado IS NULL OR p_estado NOT IN ('Abierta', 'En negociación', 'Cerrada', 'Cancelada') THEN
    RAISE EXCEPTION 'Estado de operación inválido';
  END IF;
  IF p_estado = 'Cerrada' THEN
    RAISE EXCEPTION 'El cierre definitivo debe ejecutarse con la acción Cerrar operación';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE
  ) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  SELECT estado INTO v_current FROM public.operations WHERE id = p_operacion_id;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'La operación no existe';
  END IF;
  IF v_current = 'Cerrada' THEN
    RAISE EXCEPTION 'Una operación cerrada no puede reabrirse desde el CRM';
  END IF;

  -- Mismo atajo que el TS original: si no cambia el estado, no hay nada que
  -- escribir (evita ruido en audit_log por un guardado sin cambios reales).
  IF v_current = p_estado THEN
    RETURN;
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  UPDATE public.operations SET estado = p_estado WHERE id = p_operacion_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.crm_crear_operacion(TEXT,NUMERIC,NUMERIC,UUID,UUID,UUID,UUID,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_crear_operacion(TEXT,NUMERIC,NUMERIC,UUID,UUID,UUID,UUID,TEXT,UUID) TO service_role;

REVOKE ALL ON FUNCTION public.crm_actualizar_estado_operacion(UUID,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_actualizar_estado_operacion(UUID,TEXT,UUID) TO service_role;

DO $postflight$
DECLARE
  v_anon_puede BOOLEAN;
BEGIN
  SELECT
    has_function_privilege('anon', 'public.crm_crear_operacion(text,numeric,numeric,uuid,uuid,uuid,uuid,text,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.crm_actualizar_estado_operacion(uuid,text,uuid)', 'EXECUTE')
  INTO v_anon_puede;

  IF v_anon_puede THEN
    RAISE EXCEPTION 'Postflight: alguna de las 2 funciones sigue siendo ejecutable por anon';
  END IF;

  RAISE NOTICE 'Postflight OK: las 2 funciones quedan restringidas a service_role';
END $postflight$;

COMMIT;
