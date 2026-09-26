-- Alta de inmueble (auditoría de procesos de alta, 26 sep 2026, P3).
--
-- El formulario "Nuevo inmueble" pedía campos que el servidor nunca
-- guardaba. Los que no tienen columna en `properties` se retiraron del
-- formulario; los dos que SÍ la tienen se guardan ahora:
--   - interior_exterior (antes el campo "Planta interior/exterior" acababa en
--     `piso`, mezclando la planta con si es exterior).
--   - "tipo_de_chalet (Chalets)" (nombre heredado de la importación de
--     Airtable; Independiente/Pareado).
--
-- crm_crear_inmueble usa una lista explícita de columnas, así que hasta
-- aplicar esta migración esas dos claves de p_row se ignoran sin error (el
-- frontend nuevo es compatible con la función antigua). Misma firma: CREATE
-- OR REPLACE conserva los GRANT/REVOKE existentes.

CREATE OR REPLACE FUNCTION public.crm_crear_inmueble(p_row jsonb, p_owner_ids uuid[], p_es_alquiler boolean, p_actor_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    agente_id, imagenes, documentos,
    interior_exterior, "tipo_de_chalet (Chalets)"
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
    v_agente_id, COALESCE(r.imagenes, '[]'::jsonb), COALESCE(r.documentos, '[]'::jsonb),
    -- NULL (no '') si no llegan: es lo que tienen hoy las ~5.800 filas sin
    -- el dato, para no crear un tercer estado "vacío" distinto de NULL.
    NULLIF(r.interior_exterior, ''), NULLIF(r."tipo_de_chalet (Chalets)", '')
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
$function$;
