-- H-05, parte 7 (los 2 casos aplazados desde el bloque grande): createInmueble
-- y updateInmueble. Se aplazaron porque tienen ~30 columnas opcionales con
-- diffing dinámico -- el motivo real que lo hace viable ahora es
-- jsonb_populate_record(base, patch), un idiom estándar de Postgres para
-- "solo actualizar las claves presentes en el JSON, conservar el resto de
-- base": resuelve exactamente el problema de "¿el campo no vino, o vino
-- como null?" sin SQL dinámico armado a mano.
--
-- Hallazgo que simplifica esto de paso: la columna `properties.changelog`
-- NO EXISTE en el esquema real (verificado el 24 ago 2026 contra
-- information_schema). El bloque de changelog de updateInmueble() estaba
-- envuelto en un try/catch "por si la columna no existe todavía" -- pero
-- supabase-js no lanza excepción en un error de columna inexistente, solo
-- devuelve `data: null`, así que ese bloque es código muerto en la práctica
-- desde siempre: `if (cur)` nunca es cierto. No se replica en el RPC.

BEGIN;

-- ── 1. createInmueble -> crm_crear_inmueble ─────────────────────────────────
-- p_row ya viene con los nombres de columna reales (snake_case) -- es
-- literalmente el mismo objeto "row" que ya construía createInmueble en
-- TypeScript, solo que ahora viaja como JSONB en vez de v�a supabase-js.
CREATE OR REPLACE FUNCTION public.crm_crear_inmueble(
  p_row JSONB,
  p_owner_ids UUID[],
  p_es_alquiler BOOLEAN,
  p_actor_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
  -- El objeto "row" de TypeScript ya pone agente_id = agentIds[0] (o lo omite
  -- si no hay ninguno) -- se lee de ahí en vez de recibir un parámetro nuevo.
  v_agente_id UUID := NULLIF(p_row->>'agente_id', '')::UUID;
BEGIN
  IF p_row IS NULL OR NULLIF(p_row->>'calle', '') IS NULL THEN
    RAISE EXCEPTION 'Calle requerida';
  END IF;
  IF NULLIF(p_row->>'tipo', '') IS NULL THEN
    RAISE EXCEPTION 'Tipo requerido';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  INSERT INTO public.properties (
    calle, tipo, estatus, es_alquiler, categoria,
    numero, barrio, localidad, ref, publicacion, estado, descripcion, observaciones,
    piso, calefaccion, orientacion, terraza, balcon, garaje, trastero, ascensor,
    armarios_empotrados, ano_construccion, certificacion_energetica, llaves, gastos_comunidad,
    precio, habitaciones, banos, metros_construidos, fecha_inicio, fecha_exclusiva,
    agente_id, imagenes, documentos
  )
  SELECT
    r.calle, r.tipo, COALESCE(NULLIF(r.estatus, ''), 'Prospección'), p_es_alquiler, r.categoria,
    COALESCE(r.numero, ''), COALESCE(r.barrio, ''), COALESCE(r.localidad, ''), r.ref,
    COALESCE(r.publicacion, ''), COALESCE(r.estado, ''), COALESCE(r.descripcion, ''),
    COALESCE(r.observaciones, ''),
    COALESCE(r.piso, ''), COALESCE(r.calefaccion, ''), COALESCE(r.orientacion, ''),
    COALESCE(r.terraza, ''), COALESCE(r.balcon, ''), COALESCE(r.garaje, ''),
    COALESCE(r.trastero, ''), COALESCE(r.ascensor, ''), COALESCE(r.armarios_empotrados, ''),
    COALESCE(r.ano_construccion, ''), COALESCE(r.certificacion_energetica, ''),
    COALESCE(r.llaves, ''), COALESCE(r.gastos_comunidad, ''),
    r.precio, r.habitaciones, r.banos, r.metros_construidos, r.fecha_inicio, r.fecha_exclusiva,
    v_agente_id, COALESCE(r.imagenes, '[]'::jsonb), COALESCE(r.documentos, '[]'::jsonb)
  FROM jsonb_populate_record(NULL::public.properties, p_row) r
  RETURNING id INTO v_id;

  IF p_owner_ids IS NOT NULL AND array_length(p_owner_ids, 1) > 0 THEN
    INSERT INTO public.contact_roles (contact_id, property_id, agente_id, tipo, estado)
    SELECT cid, v_id, v_agente_id,
           CASE WHEN p_es_alquiler THEN 'Arrendador' ELSE 'Propietario' END,
           'Activo'
      FROM unnest(p_owner_ids) AS cid;

    UPDATE public.contacts SET ciclo_vida = 'Cliente' WHERE id = ANY(p_owner_ids);
  END IF;

  RETURN v_id;
END;
$$;

-- ── 2. updateInmueble -> crm_actualizar_inmueble ────────────────────────────
-- p_patch usa las mismas claves snake_case que ya construía el objeto "up"
-- en TypeScript. jsonb_populate_record(v_old, p_patch) conserva el valor
-- viejo de cualquier columna cuya clave no esté en el patch -- exactamente
-- la semántica de "solo escribir lo que llegó" que tenía el código original,
-- sin construir SQL dinámico.
CREATE OR REPLACE FUNCTION public.crm_actualizar_inmueble(
  p_property_id UUID,
  p_patch JSONB,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
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
    imagenes = v_new.imagenes
  WHERE id = p_property_id;

  -- Cuando cambia el estatus (chequeo por valor, no por presencia de la
  -- clave -- igual que el "if (data.estatus)" truthy del código original),
  -- recalcular ciclo_vida de todos los contactos vinculados. Misma regla que
  -- ya vive en crm_gestionar_rol, aplicada aquí en conjunto (set-based) a
  -- todos los contactos de este inmueble en vez de uno a uno.
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
$$;

-- ── Grants: solo service_role ────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.crm_crear_inmueble(JSONB,UUID[],BOOLEAN,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_crear_inmueble(JSONB,UUID[],BOOLEAN,UUID) TO service_role;

REVOKE ALL ON FUNCTION public.crm_actualizar_inmueble(UUID,JSONB,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_actualizar_inmueble(UUID,JSONB,UUID) TO service_role;

DO $postflight$
BEGIN
  IF has_function_privilege('anon', 'public.crm_crear_inmueble(jsonb,uuid[],boolean,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.crm_actualizar_inmueble(uuid,jsonb,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Postflight: alguna de las 2 funciones sigue siendo ejecutable por anon';
  END IF;
  RAISE NOTICE 'Postflight OK: crm_crear_inmueble y crm_actualizar_inmueble restringidas a service_role';
END $postflight$;

COMMIT;
