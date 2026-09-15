-- Instrucciones de mejora del CRM (sep 2026), punto "Formularios de
-- inmueble" (§2.8, Bloque Propietario): faltaba un campo de observaciones
-- propio de la relación con el propietario, distinto de `properties.
-- observaciones` (que es sobre el inmueble en sí, no sobre el propietario).
--
-- crm_crear_inmueble/crm_actualizar_inmueble usan columnas explícitas en su
-- INSERT/UPDATE (jsonb_populate_record solo resuelve el "qué claves llegaron
-- en el JSON", no qué columnas se escriben) -- añadir un campo persistido
-- nuevo exige tocar las dos, mismo patrón que el resto de columnas.

BEGIN;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS observaciones_propietario TEXT DEFAULT '';

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
    observaciones_propietario,
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
    COALESCE(r.observaciones_propietario, ''),
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
    imagenes = v_new.imagenes
  WHERE id = p_property_id;

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

COMMIT;
