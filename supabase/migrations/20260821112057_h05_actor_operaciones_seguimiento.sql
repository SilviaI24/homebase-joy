-- H-05, parte 3: dos extensiones baratas del mecanismo de actor explícito
-- (ver 20260821110759_audit_actor_explicito_contacts.sql para el porqué de
-- fijar app.actor_id dentro del mismo RPC que escribe, no con SET LOCAL suelto).
--
-- 1. cerrar_operacion_crm() ya recibía p_actor_user_id — solo le faltaba la
--    línea que fija el GUC. Se añade justo tras validar que el actor tiene
--    perfil CRM activo, antes de cualquier escritura (operations, properties,
--    contacts, contact_roles, seguimiento quedan todos atribuidos de golpe).
-- 2. createSeguimiento no tenía RPC — se crea crm_crear_seguimiento(), mismo
--    patrón que crm_actualizar_ciclo_vida (valida actor, fija el GUC, inserta).

BEGIN;

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cerrar_operacion_crm'
  ) THEN
    RAISE EXCEPTION 'Preflight: falta public.cerrar_operacion_crm()';
  END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.cerrar_operacion_crm(
  p_operacion_id UUID,
  p_actor_user_id UUID,
  p_actor_agente_id UUID DEFAULT NULL::UUID
)
RETURNS TABLE(operacion_id UUID, estado TEXT, property_id UUID, property_estatus TEXT, contact_role_id UUID, ya_estaba_cerrada BOOLEAN)
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_op public.operations%ROWTYPE;
  v_property public.properties%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_actor_agente_id UUID;
  v_owner_role TEXT;
  v_client_role TEXT;
  v_owner_role_id UUID;
  v_client_role_id UUID;
  v_target_property_status TEXT;
  v_actor_profile_agent_id UUID;
  v_role_count INTEGER;
BEGIN
  IF p_operacion_id IS NULL THEN
    RAISE EXCEPTION 'La operación es obligatoria';
  END IF;

  SELECT op.*
    INTO v_op
    FROM public.operations AS op
   WHERE op.id = p_operacion_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La operación no existe';
  END IF;

  IF v_op.estado = 'Cerrada' THEN
    RETURN QUERY
    SELECT
      v_op.id,
      v_op.estado,
      v_op.property_id,
      p.estatus,
      v_op.contact_role_id,
      TRUE
    FROM (SELECT 1) AS one
    LEFT JOIN public.properties AS p ON p.id = v_op.property_id;
    RETURN;
  END IF;

  IF v_op.estado = 'Cancelada' THEN
    RAISE EXCEPTION 'Una operación cancelada no puede cerrarse; debe reabrirse primero';
  END IF;

  IF v_op.estado NOT IN ('Abierta', 'En negociación') THEN
    RAISE EXCEPTION 'El estado actual de la operación no permite cerrarla';
  END IF;

  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cierre es obligatorio';
  END IF;

  SELECT crm.agent_id
    INTO v_actor_profile_agent_id
    FROM public.crm_usuarios AS crm
   WHERE crm.user_id = p_actor_user_id
     AND crm.activo = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  -- H-05: local a esta transacción; lo lee registrar_audit() en cada trigger
  -- AFTER de las escrituras de más abajo (operations, properties, contacts,
  -- contact_roles, seguimiento) y se descarta solo al cerrar el request.
  PERFORM set_config('app.actor_id', p_actor_user_id::TEXT, TRUE);

  IF p_actor_agente_id IS NOT NULL
     AND v_actor_profile_agent_id IS DISTINCT FROM p_actor_agente_id THEN
    RAISE EXCEPTION 'El agente indicado no corresponde al usuario autenticado';
  END IF;

  v_actor_agente_id := COALESCE(v_actor_profile_agent_id, v_op.agente_id);
  IF v_actor_agente_id IS NULL THEN
    RAISE EXCEPTION 'La operación necesita un agente responsable para poder cerrarse';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.agents AS a
     WHERE a.id = v_actor_agente_id
       AND a.activo IS TRUE
  ) THEN
    RAISE EXCEPTION 'El agente responsable no existe o está inactivo';
  END IF;

  IF v_op.tipo IN ('Venta', 'Alquiler') THEN
    IF v_op.property_id IS NULL THEN
      RAISE EXCEPTION 'La operación necesita un inmueble para poder cerrarse';
    END IF;
    IF v_op.vendedor_id IS NULL THEN
      RAISE EXCEPTION 'La operación necesita un propietario o arrendador';
    END IF;
    IF v_op.comprador_id IS NULL THEN
      RAISE EXCEPTION 'La operación necesita un comprador o inquilino';
    END IF;
    IF v_op.vendedor_id = v_op.comprador_id THEN
      RAISE EXCEPTION 'El propietario y el comprador o inquilino deben ser contactos distintos';
    END IF;
    IF v_op.precio_operacion IS NULL OR v_op.precio_operacion <= 0 THEN
      RAISE EXCEPTION 'La operación necesita un precio final mayor que cero';
    END IF;
    IF v_op.comision_pct IS NOT NULL
       AND (v_op.comision_pct < 0 OR v_op.comision_pct > 100) THEN
      RAISE EXCEPTION 'La comisión debe estar entre 0 y 100';
    END IF;

    SELECT p.*
      INTO v_property
      FROM public.properties AS p
     WHERE p.id = v_op.property_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El inmueble de la operación no existe';
    END IF;

    IF v_op.tipo = 'Venta' AND COALESCE(v_property.es_alquiler, FALSE) THEN
      RAISE EXCEPTION 'Un inmueble de alquiler no puede cerrarse como venta';
    END IF;
    IF v_op.tipo = 'Alquiler' AND NOT COALESCE(v_property.es_alquiler, FALSE) THEN
      RAISE EXCEPTION 'Un inmueble de venta no puede cerrarse como alquiler';
    END IF;

    v_owner_role := CASE WHEN v_op.tipo = 'Venta' THEN 'Propietario' ELSE 'Arrendador' END;
    v_client_role := CASE WHEN v_op.tipo = 'Venta' THEN 'Comprador' ELSE 'Inquilino' END;
    v_target_property_status := CASE WHEN v_op.tipo = 'Venta' THEN 'Vendido' ELSE 'Alquilado' END;

    IF v_property.estatus NOT IN ('Activo', 'Reservado') THEN
      RAISE EXCEPTION 'Solo puede cerrarse una operación con un inmueble activo o reservado';
    END IF;

    PERFORM c.id
      FROM public.contacts AS c
     WHERE c.id = ANY (ARRAY[v_op.vendedor_id, v_op.comprador_id]::UUID[])
     ORDER BY c.id
     FOR UPDATE;

    PERFORM cr.id
      FROM public.contact_roles AS cr
     WHERE cr.contact_id = ANY (ARRAY[v_op.vendedor_id, v_op.comprador_id]::UUID[])
     ORDER BY cr.id
     FOR UPDATE;

    SELECT count(*)
      INTO v_role_count
      FROM public.contact_roles AS cr
     WHERE cr.contact_id = v_op.vendedor_id
       AND cr.property_id = v_op.property_id
       AND cr.tipo = ANY (
         CASE
           WHEN v_op.tipo = 'Alquiler' THEN ARRAY['Arrendador', 'Propietario']::TEXT[]
           ELSE ARRAY['Propietario']::TEXT[]
         END
       )
       AND cr.estado IN ('Prospecto', 'Activo');

    IF v_role_count > 1 THEN
      RAISE EXCEPTION 'Hay varias relaciones abiertas de propietario para el mismo inmueble';
    END IF;

    SELECT count(*)
      INTO v_role_count
      FROM public.contact_roles AS cr
     WHERE cr.contact_id = v_op.comprador_id
       AND cr.property_id = v_op.property_id
       AND cr.tipo = v_client_role
       AND cr.estado IN ('Prospecto', 'Activo');

    IF v_role_count > 1 THEN
      RAISE EXCEPTION 'Hay varias relaciones abiertas de comprador o inquilino para el mismo inmueble';
    END IF;

    SELECT cr.id
      INTO v_owner_role_id
      FROM public.contact_roles AS cr
     WHERE cr.contact_id = v_op.vendedor_id
       AND cr.property_id = v_op.property_id
       AND cr.tipo = ANY (
         CASE
           WHEN v_op.tipo = 'Alquiler' THEN ARRAY['Arrendador', 'Propietario']::TEXT[]
           ELSE ARRAY['Propietario']::TEXT[]
         END
       )
       AND cr.estado IN ('Prospecto', 'Activo')
     ORDER BY cr.created_at DESC, cr.id
     LIMIT 1
     FOR UPDATE;

    IF v_owner_role_id IS NOT NULL THEN
      UPDATE public.contact_roles AS target_role
         SET tipo = v_owner_role,
             estado = 'Cerrado',
             agente_id = COALESCE(target_role.agente_id, v_actor_agente_id),
             fecha_conversion = COALESCE(target_role.fecha_conversion, v_now),
             fecha_cierre = v_now,
             updated_at = v_now
       WHERE target_role.id = v_owner_role_id;
    ELSE
      SELECT count(*)
        INTO v_role_count
        FROM public.contact_roles AS cr
       WHERE cr.contact_id = v_op.vendedor_id
         AND cr.property_id IS NULL
         AND cr.tipo = ANY (
           CASE
             WHEN v_op.tipo = 'Alquiler' THEN ARRAY['Arrendador', 'Propietario']::TEXT[]
             ELSE ARRAY['Propietario']::TEXT[]
           END
         )
         AND cr.estado IN ('Prospecto', 'Activo');

      IF v_role_count > 1 THEN
        RAISE EXCEPTION 'Hay varias relaciones genéricas abiertas de propietario';
      END IF;

      SELECT cr.id
        INTO v_owner_role_id
        FROM public.contact_roles AS cr
       WHERE cr.contact_id = v_op.vendedor_id
         AND cr.property_id IS NULL
         AND cr.tipo = ANY (
           CASE
             WHEN v_op.tipo = 'Alquiler' THEN ARRAY['Arrendador', 'Propietario']::TEXT[]
             ELSE ARRAY['Propietario']::TEXT[]
           END
         )
         AND cr.estado IN ('Prospecto', 'Activo')
       ORDER BY cr.created_at DESC, cr.id
       LIMIT 1
       FOR UPDATE;

      IF v_owner_role_id IS NULL THEN
        INSERT INTO public.contact_roles (
          contact_id, agente_id, property_id, tipo, estado,
          fecha_conversion, fecha_cierre, updated_at
        )
        VALUES (
          v_op.vendedor_id, v_actor_agente_id, v_op.property_id, v_owner_role,
          'Cerrado', v_now, v_now, v_now
        )
        RETURNING id INTO v_owner_role_id;
      ELSE
        UPDATE public.contact_roles
           SET property_id = v_op.property_id,
               tipo = v_owner_role,
               estado = 'Cerrado',
               agente_id = COALESCE(agente_id, v_actor_agente_id),
               fecha_conversion = COALESCE(fecha_conversion, v_now),
               fecha_cierre = v_now,
               updated_at = v_now
         WHERE id = v_owner_role_id;
      END IF;
    END IF;

    SELECT cr.id
      INTO v_client_role_id
      FROM public.contact_roles AS cr
     WHERE cr.contact_id = v_op.comprador_id
       AND cr.property_id = v_op.property_id
       AND cr.tipo = v_client_role
       AND cr.estado IN ('Prospecto', 'Activo')
     ORDER BY cr.created_at DESC, cr.id
     LIMIT 1
     FOR UPDATE;

    IF v_client_role_id IS NOT NULL THEN
      UPDATE public.contact_roles AS target_role
         SET estado = 'Cerrado',
             agente_id = COALESCE(target_role.agente_id, v_actor_agente_id),
             fecha_conversion = COALESCE(target_role.fecha_conversion, v_now),
             fecha_cierre = v_now,
             updated_at = v_now
       WHERE target_role.id = v_client_role_id;
    ELSE
      SELECT count(*)
        INTO v_role_count
        FROM public.contact_roles AS cr
       WHERE cr.contact_id = v_op.comprador_id
         AND cr.property_id IS NULL
         AND cr.tipo = v_client_role
         AND cr.estado IN ('Prospecto', 'Activo');

      IF v_role_count > 1 THEN
        RAISE EXCEPTION 'Hay varias relaciones genéricas abiertas de comprador o inquilino';
      END IF;

      SELECT cr.id
        INTO v_client_role_id
        FROM public.contact_roles AS cr
       WHERE cr.contact_id = v_op.comprador_id
         AND cr.property_id IS NULL
         AND cr.tipo = v_client_role
         AND cr.estado IN ('Prospecto', 'Activo')
       ORDER BY cr.created_at DESC, cr.id
       LIMIT 1
       FOR UPDATE;

      IF v_client_role_id IS NULL THEN
        INSERT INTO public.contact_roles (
          contact_id, agente_id, property_id, tipo, estado,
          fecha_conversion, fecha_cierre, updated_at
        )
        VALUES (
          v_op.comprador_id, v_actor_agente_id, v_op.property_id, v_client_role,
          'Cerrado', v_now, v_now, v_now
        )
        RETURNING id INTO v_client_role_id;
      ELSE
        UPDATE public.contact_roles
           SET property_id = v_op.property_id,
               estado = 'Cerrado',
               agente_id = COALESCE(agente_id, v_actor_agente_id),
               fecha_conversion = COALESCE(fecha_conversion, v_now),
               fecha_cierre = v_now,
               updated_at = v_now
         WHERE id = v_client_role_id;
      END IF;
    END IF;

    UPDATE public.properties
       SET estatus = v_target_property_status,
           precio_final = v_op.precio_operacion,
           publicacion = '',
           fecha_escritura = CASE
             WHEN v_op.tipo = 'Venta' THEN COALESCE(fecha_escritura, v_now::DATE)
             ELSE fecha_escritura
           END,
           updated_at = v_now
     WHERE id = v_op.property_id;

    UPDATE public.contacts AS c
       SET ciclo_vida = CASE
             WHEN EXISTS (
               SELECT 1
                 FROM public.contact_roles AS cr
                WHERE cr.contact_id = c.id
                  AND cr.estado IN ('Prospecto', 'Activo')
             ) THEN 'Cliente'
             ELSE 'Histórico'
           END,
           updated_at = v_now
     WHERE c.id IN (v_op.vendedor_id, v_op.comprador_id);
  END IF;

  PERFORM set_config('app.crm_atomic_close', 'on', TRUE);

  UPDATE public.operations
     SET estado = 'Cerrada',
         fecha_cierre = v_now,
         contact_role_id = COALESCE(v_client_role_id, contact_role_id),
         comision_total = CASE
           WHEN precio_operacion IS NOT NULL AND comision_pct IS NOT NULL
             THEN round((precio_operacion * comision_pct) / 100, 2)
           ELSE comision_total
         END,
         updated_at = v_now
   WHERE id = v_op.id;

  INSERT INTO public.seguimiento (
    contact_id, agente_id, tipo, texto, fecha, operation_id
  )
  SELECT DISTINCT
    party.contact_id,
    v_actor_agente_id,
    'Nota',
    concat(
      'Operación de ', lower(v_op.tipo), ' cerrada',
      CASE WHEN v_property.ref IS NOT NULL AND v_property.ref <> ''
        THEN concat(' · inmueble ', v_property.ref)
        ELSE ''
      END,
      CASE WHEN v_op.precio_operacion IS NOT NULL
        THEN concat(' · ', trim(to_char(v_op.precio_operacion, 'FM999999999990D00')), ' EUR')
        ELSE ''
      END,
      '.'
    ),
    v_now,
    v_op.id
  FROM unnest(ARRAY[v_op.vendedor_id, v_op.comprador_id]::UUID[]) AS party(contact_id)
  WHERE party.contact_id IS NOT NULL;

  INSERT INTO public.crm_auditoria_permisos (
    actor_id, tipo_evento, permiso_clave, motivo, metadata
  )
  VALUES (
    p_actor_user_id,
    'ACCION_EJECUTADA',
    'operations.close',
    'Cierre atómico de operación CRM',
    jsonb_build_object(
      'operation_id', v_op.id,
      'operation_type', v_op.tipo,
      'property_id', v_op.property_id,
      'property_status', v_target_property_status,
      'agent_id', v_actor_agente_id,
      'price', v_op.precio_operacion
    )
  );

  RETURN QUERY
  SELECT
    op.id,
    op.estado,
    op.property_id,
    p.estatus,
    op.contact_role_id,
    FALSE
  FROM public.operations AS op
  LEFT JOIN public.properties AS p ON p.id = op.property_id
  WHERE op.id = v_op.id;
END;
$function$;

-- ── 2. Segundo dominio: seguimiento.create ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_crear_seguimiento(
  p_contact_id UUID,
  p_tipo TEXT,
  p_texto TEXT,
  p_agente_id UUID,
  p_actor_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'El contacto es obligatorio';
  END IF;
  IF p_texto IS NULL OR btrim(p_texto) = '' THEN
    RAISE EXCEPTION 'La nota no puede estar vacía';
  END IF;
  IF p_tipo IS NULL OR p_tipo NOT IN ('Llamada', 'WhatsApp', 'Email', 'Visita', 'Nota', 'SilvIA') THEN
    RAISE EXCEPTION 'Tipo de seguimiento inválido';
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

  INSERT INTO public.seguimiento (contact_id, agente_id, tipo, texto, fecha)
  VALUES (p_contact_id, p_agente_id, p_tipo, btrim(p_texto), now())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.crm_crear_seguimiento(UUID, TEXT, TEXT, UUID, UUID) IS
  'Crea una nota de seguimiento dejando el actor real en audit_log.usuario_id (H-05).';

REVOKE ALL ON FUNCTION public.crm_crear_seguimiento(UUID, TEXT, TEXT, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_crear_seguimiento(UUID, TEXT, TEXT, UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.crm_crear_seguimiento(UUID, TEXT, TEXT, UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.crm_crear_seguimiento(UUID, TEXT, TEXT, UUID, UUID) TO service_role;

DO $postflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'cerrar_operacion_crm'
       AND position('app.actor_id' IN p.prosrc) > 0
  ) THEN
    RAISE EXCEPTION 'Postflight: cerrar_operacion_crm no quedó fijando app.actor_id';
  END IF;

  IF has_function_privilege('anon', 'public.crm_crear_seguimiento(uuid,text,text,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.crm_crear_seguimiento(uuid,text,text,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Postflight: crm_crear_seguimiento sigue siendo ejecutable por anon/authenticated';
  END IF;

  RAISE NOTICE 'Postflight OK: cerrar_operacion_crm fija app.actor_id, crm_crear_seguimiento restringida a service_role';
END $postflight$;

COMMIT;
