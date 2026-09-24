-- Fase 0 (mini-dashboard en cabecera) + Fase 1 (instrumentación de
-- linea_actividad) de la propuesta "Métricas en cabecera", 23 sep 2026.
--
-- Fase 0: dashboard_header_stats() -- función ligera y dedicada (no
-- reutiliza dashboard_contactos_stats() a propósito: esa calcula pipeline
-- completo + agentes + 12 meses de series, mucho más caro de lo que necesita
-- un widget que se monta en 3 páginas -- Dashboard, Contactos, Cartera).
--
-- Fase 1: linea_actividad ya existe (creada para el feed de actividad del
-- Portal, ESGI phase 2) pero el CRM nunca escribía en ella -- reconstruía
-- "actividad reciente" a mano comparando fechas de properties
-- (listInmueblesActividadReciente). Se instrumentan los 5 eventos de más
-- valor para un futuro modelo (lead creado, visita agendada/realizada,
-- inmueble reservado, operación cerrada), reutilizando el CHECK de
-- tipo_evento que YA EXISTE ('visita','cambio_estado','contacto', etc. --
-- ver linea_actividad_tipo_evento_check) en vez de ampliarlo: el matiz va en
-- descripcion/metadata, no en un tipo_evento nuevo, para no tener que
-- coordinar un cambio de constraint compartido con elsol-client-hub solo
-- para esto. El feed de "Actividad reciente" de Comerciales NO se ha tocado
-- todavía -- sigue en su heurístico actual hasta que haya suficiente
-- historial real aquí (ver Fase 2 en CLAUDE.md).

-- ── Fase 0 ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.dashboard_header_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_now    timestamptz := now();
  v_result jsonb;
BEGIN
  WITH canales AS (
    SELECT coalesce(canal_origen, 'Sin canal') AS canal, count(*) AS n
    FROM public.contacts
    GROUP BY 1
  ),
  leads_30 AS (
    SELECT count(*) AS n FROM public.contacts
    WHERE coalesce(ciclo_vida, 'Lead') = 'Lead' AND created_at >= v_now - interval '30 days'
  ),
  leads_30_prev AS (
    SELECT count(*) AS n FROM public.contacts
    WHERE coalesce(ciclo_vida, 'Lead') = 'Lead'
      AND created_at >= v_now - interval '60 days' AND created_at < v_now - interval '30 days'
  ),
  leads_90 AS (
    SELECT count(*) AS n FROM public.contacts
    WHERE coalesce(ciclo_vida, 'Lead') = 'Lead' AND created_at >= v_now - interval '90 days'
  ),
  leads_90_prev AS (
    SELECT count(*) AS n FROM public.contacts
    WHERE coalesce(ciclo_vida, 'Lead') = 'Lead'
      AND created_at >= v_now - interval '180 days' AND created_at < v_now - interval '90 days'
  ),
  demanda AS (
    SELECT
      p.id, p.calle, p.numero, p.localidad, p.ref,
      count(DISTINCT cr.contact_id) FILTER (WHERE cr.tipo = 'Interesado') AS interesados,
      count(DISTINCT v.id) FILTER (WHERE v.fecha >= v_now - interval '90 days') AS visitas
    FROM public.properties p
    LEFT JOIN public.contact_roles cr ON cr.property_id = p.id AND cr.tipo = 'Interesado'
    LEFT JOIN public.visits v ON v.property_id = p.id
    WHERE p.estatus IN ('Activo', 'Reservado')
    GROUP BY p.id, p.calle, p.numero, p.localidad, p.ref
    HAVING count(DISTINCT cr.contact_id) FILTER (WHERE cr.tipo = 'Interesado') > 0
        OR count(DISTINCT v.id) FILTER (WHERE v.fecha >= v_now - interval '90 days') > 0
    ORDER BY (
      count(DISTINCT cr.contact_id) FILTER (WHERE cr.tipo = 'Interesado')
      + count(DISTINCT v.id) FILTER (WHERE v.fecha >= v_now - interval '90 days')
    ) DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'canales', coalesce((SELECT jsonb_object_agg(canal, n) FROM canales), '{}'::jsonb),
    'leads30d', (SELECT n FROM leads_30),
    'leads30dPrev', (SELECT n FROM leads_30_prev),
    'leads90d', (SELECT n FROM leads_90),
    'leads90dPrev', (SELECT n FROM leads_90_prev),
    'propiedadDemandada', (
      SELECT jsonb_build_object(
        'id', id,
        'direccion', nullif(btrim(concat(calle, ' ', numero)), ''),
        'localidad', localidad,
        'ref', ref,
        'interesados', interesados,
        'visitas', visitas
      ) FROM demanda
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.dashboard_header_stats() TO authenticated;

-- ── Fase 1 ────────────────────────────────────────────────────────────────

-- 1) Lead creado
CREATE OR REPLACE FUNCTION public.crm_crear_cliente(p_nombre text, p_ciclo_vida text, p_email text, p_telefono text, p_dni text, p_motivo text, p_solicitud text, p_observaciones text, p_categoria text[], p_profesion text, p_contrato_trabajo text, p_mascota text, p_avalista text, p_created_at timestamp with time zone, p_agente_ids uuid[], p_crea_relacion boolean, p_tipo_relacion text, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id UUID;
BEGIN
  IF p_nombre IS NULL OR btrim(p_nombre) = '' THEN
    RAISE EXCEPTION 'Nombre requerido';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  INSERT INTO public.contacts (
    nombre, ciclo_vida, email, telefono, dni, motivo, solicitud, observaciones,
    categoria, profesion, contrato_trabajo, mascota, avalista, created_at
  ) VALUES (
    p_nombre, p_ciclo_vida,
    COALESCE(p_email, ''), COALESCE(p_telefono, ''), COALESCE(p_dni, ''),
    COALESCE(p_motivo, ''), COALESCE(p_solicitud, ''), COALESCE(p_observaciones, ''),
    COALESCE(p_categoria, '{}'), COALESCE(p_profesion, ''), COALESCE(p_contrato_trabajo, ''),
    COALESCE(p_mascota, ''), COALESCE(p_avalista, ''), COALESCE(p_created_at, now())
  )
  RETURNING id INTO v_id;

  -- Fase 1 (metricas en cabecera, 23 sep 2026): un evento de linea_actividad
  -- por cada Lead nuevo -- tipo_evento reutiliza el valor 'contacto' del
  -- CHECK ya existente (compartido con el Portal), el matiz va en metadata.
  IF p_ciclo_vida = 'Lead' THEN
    INSERT INTO public.linea_actividad (contact_id, actor_id, tipo_evento, descripcion, metadata)
    VALUES (v_id, p_actor_id, 'contacto', concat('Lead creado: ', p_nombre),
      jsonb_build_object('ciclo_vida', p_ciclo_vida, 'canal_origen', NULL));
  END IF;

  -- Si no se especifican agentes, el propio código de servidor ya resuelve
  -- p_agente_ids = [actor] antes de llamar -- aquí solo se inserta lo recibido.
  IF p_agente_ids IS NOT NULL AND array_length(p_agente_ids, 1) > 0 THEN
    INSERT INTO public.contact_agents (contact_id, agent_id)
    SELECT v_id, aid FROM unnest(p_agente_ids) AS aid
    ON CONFLICT (contact_id, agent_id) DO NOTHING;
  END IF;

  IF p_crea_relacion THEN
    INSERT INTO public.contact_roles (contact_id, agente_id, tipo, estado)
    VALUES (v_id, p_agente_ids[1], p_tipo_relacion, 'Prospecto');
  END IF;

  RETURN v_id;
END;
$function$;

-- 2) Visita agendada
CREATE OR REPLACE FUNCTION public.crm_crear_visita(p_fecha timestamp with time zone, p_estado text, p_notas text, p_property_id uuid, p_contact_id uuid, p_agente_id uuid, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id UUID;
BEGIN
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'Fecha requerida';
  END IF;
  IF p_property_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona al menos un inmueble';
  END IF;
  IF p_estado NOT IN ('Programada', 'Realizada', 'Cancelada') THEN
    RAISE EXCEPTION 'Estado de visita inválido';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  INSERT INTO public.visits (fecha, estado, notas, property_id, contact_id, agente_id)
  VALUES (p_fecha, p_estado, COALESCE(p_notas, ''), p_property_id, p_contact_id, p_agente_id)
  RETURNING id INTO v_id;

  -- Fase 1: un evento por cada visita agendada (el resto de altas, ver
  -- crm_actualizar_visita_estado más abajo para "realizada"/"cancelada").
  INSERT INTO public.linea_actividad (property_id, contact_id, actor_id, tipo_evento, descripcion, metadata)
  VALUES (p_property_id, p_contact_id, p_actor_id, 'visita', 'Visita agendada',
    jsonb_build_object('accion', 'agendada', 'visita_id', v_id, 'fecha', p_fecha));

  RETURN v_id;
END;
$function$;

-- 3) Visita realizada / cancelada
CREATE OR REPLACE FUNCTION public.crm_actualizar_visita_estado(p_visita_id uuid, p_estado text, p_actor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prev_estado TEXT;
  v_property_id UUID;
  v_contact_id UUID;
BEGIN
  IF p_visita_id IS NULL THEN
    RAISE EXCEPTION 'visitaId requerido';
  END IF;
  IF p_estado NOT IN ('Programada', 'Realizada', 'Cancelada') THEN
    RAISE EXCEPTION 'Estado de visita inválido';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  -- Fase 1: se necesita el estado anterior (para no duplicar el evento si
  -- no cambia nada) y property_id/contact_id (crm_actualizar_visita_estado
  -- solo recibe el id de la visita) antes del UPDATE de más abajo.
  SELECT estado, property_id, contact_id INTO v_prev_estado, v_property_id, v_contact_id
  FROM public.visits WHERE id = p_visita_id;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  UPDATE public.visits SET estado = p_estado WHERE id = p_visita_id;

  IF v_prev_estado IS DISTINCT FROM p_estado AND p_estado IN ('Realizada', 'Cancelada') THEN
    INSERT INTO public.linea_actividad (property_id, contact_id, actor_id, tipo_evento, descripcion, metadata)
    VALUES (
      v_property_id, v_contact_id, p_actor_id, 'visita',
      CASE p_estado WHEN 'Realizada' THEN 'Visita realizada' ELSE 'Visita cancelada' END,
      jsonb_build_object(
        'accion', CASE p_estado WHEN 'Realizada' THEN 'realizada' ELSE 'cancelada' END,
        'visita_id', p_visita_id
      )
    );
  END IF;
END;
$function$;

-- 4) Inmueble reservado
CREATE OR REPLACE FUNCTION public.crm_actualizar_inmueble(p_property_id uuid, p_patch jsonb, p_actor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old public.properties;
  v_new public.properties;
BEGIN
  IF p_property_id IS NULL THEN
    RAISE EXCEPTION 'El inmueble es obligatorio';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  SELECT * INTO v_old FROM public.properties WHERE id = p_property_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El inmueble no existe';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  SELECT * INTO v_new FROM jsonb_populate_record(v_old, p_patch);

  UPDATE public.properties SET
    estatus = v_new.estatus,
    publicacion = v_new.publicacion,
    precio = v_new.precio,
    precio_final = v_new.precio_final,
    observaciones = v_new.observaciones,
    observaciones_propietario = v_new.observaciones_propietario,
    descripcion = v_new.descripcion,
    habitaciones = v_new.habitaciones,
    banos = v_new.banos,
    metros_construidos = v_new.metros_construidos,
    piso = v_new.piso,
    estado = v_new.estado,
    ano_construccion = v_new.ano_construccion,
    certificacion_energetica = v_new.certificacion_energetica,
    calefaccion = v_new.calefaccion,
    orientacion = v_new.orientacion,
    garaje = v_new.garaje,
    trastero = v_new.trastero,
    ascensor = v_new.ascensor,
    armarios_empotrados = v_new.armarios_empotrados,
    terraza = v_new.terraza,
    balcon = v_new.balcon,
    gastos_comunidad = v_new.gastos_comunidad,
    referencia_catastral = v_new.referencia_catastral,
    fecha_inicio = v_new.fecha_inicio,
    fecha_exclusiva = v_new.fecha_exclusiva,
    fecha_fin_exclusiva = v_new.fecha_fin_exclusiva,
    fecha_reserva = v_new.fecha_reserva,
    fecha_escritura = v_new.fecha_escritura,
    honorarios = v_new.honorarios,
    tipo_exclusiva = v_new.tipo_exclusiva,
    notaria = v_new.notaria,
    llaves = v_new.llaves,
    documentos = v_new.documentos,
    agente_id = v_new.agente_id,
    imagenes = v_new.imagenes,
    duracion_exclusividad_meses = v_new.duracion_exclusividad_meses,
    comision_exclusividad_pct = v_new.comision_exclusividad_pct,
    clausulas_adicionales = v_new.clausulas_adicionales
  WHERE id = p_property_id;

  -- Fase 1: reserva -- el único cambio de estatus con valor de señal directo
  -- para demanda/tiempo-hasta-reservarse. Vendido/Alquilado/Baja quedan
  -- fuera a propósito por ahora (pasan por cerrar_operacion_crm, ya
  -- instrumentado aparte, o son bajas administrativas sin señal de demanda).
  IF NULLIF(p_patch->>'estatus', '') = 'Reservado' AND v_old.estatus IS DISTINCT FROM 'Reservado' THEN
    INSERT INTO public.linea_actividad (property_id, actor_id, tipo_evento, descripcion, metadata)
    VALUES (p_property_id, p_actor_id, 'cambio_estado', 'Inmueble reservado',
      jsonb_build_object('estatus_anterior', v_old.estatus, 'estatus_nuevo', 'Reservado'));
  END IF;

  IF NULLIF(p_patch->>'estatus', '') IS NOT NULL THEN
    UPDATE public.contacts c
       SET ciclo_vida = sub.nuevo_ciclo
      FROM (
        SELECT c2.id,
          CASE
            WHEN bool_or(p.estatus IN ('Activo', 'Reservado')) THEN 'Cliente'
            WHEN bool_or(p.estatus = 'Prospección') THEN 'Prospecto'
            WHEN bool_or(p.estatus IN ('Vendido', 'Alquilado')) THEN 'Histórico'
            WHEN bool_or(cr.tipo IN ('Propietario', 'Arrendador', 'Comprador', 'Inquilino')) THEN 'Cliente'
            ELSE 'Lead'
          END AS nuevo_ciclo
        FROM public.contacts c2
        JOIN public.contact_roles cr ON cr.contact_id = c2.id
        LEFT JOIN public.properties p ON p.id = cr.property_id
        WHERE cr.contact_id IN (
          SELECT DISTINCT contact_id FROM public.contact_roles WHERE property_id = p_property_id
        )
        AND c2.ciclo_vida IS DISTINCT FROM 'Descartado'
        GROUP BY c2.id
      ) sub
     WHERE c.id = sub.id AND c.ciclo_vida IS DISTINCT FROM sub.nuevo_ciclo;
  END IF;
END;
$function$;

-- 5) Operación cerrada (venta/alquiler)
CREATE OR REPLACE FUNCTION public.cerrar_operacion_crm(p_operacion_id uuid, p_actor_user_id uuid, p_actor_agente_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(operacion_id uuid, estado text, property_id uuid, property_estatus text, contact_role_id uuid, ya_estaba_cerrada boolean)
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

    -- Fase 1 (metricas en cabecera, 23 sep 2026): evento de cierre real --
    -- la señal de mayor valor para un futuro modelo de conversión/demanda.
    INSERT INTO public.linea_actividad (property_id, contact_id, operation_id, actor_id, tipo_evento, descripcion, metadata)
    VALUES (
      v_op.property_id, v_op.comprador_id, v_op.id, p_actor_user_id, 'cambio_estado',
      concat('Operación de ', lower(v_op.tipo), ' cerrada'),
      jsonb_build_object(
        'operacion_tipo', v_op.tipo,
        'estatus_nuevo', v_target_property_status,
        'precio', v_op.precio_operacion,
        'vendedor_id', v_op.vendedor_id,
        'comprador_id', v_op.comprador_id
      )
    );

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
