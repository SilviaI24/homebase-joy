-- Datos del contrato de exclusividad que hasta ahora estaban fijos en el
-- texto de la plantilla (portal-iniciar-firma/index.ts): la duración
-- ("5 MESES") y la comisión ("3,5%... 3%"), más un campo libre de cláusulas
-- adicionales. Decisión de David (21 sep 2026): para evitar errores,
-- especialmente con copropiedad, el comercial los introduce desde el CRM
-- (ficha del inmueble), no cada propietario desde el Portal.
alter table public.properties
  add column duracion_exclusividad_meses integer,
  add column comision_exclusividad_pct numeric,
  add column clausulas_adicionales text;

alter table public.properties
  add constraint properties_duracion_exclusividad_check
  check (duracion_exclusividad_meses is null or duracion_exclusividad_meses > 0);

alter table public.properties
  add constraint properties_comision_exclusividad_check
  check (comision_exclusividad_pct is null or (comision_exclusividad_pct >= 0 and comision_exclusividad_pct <= 100));

-- crm_actualizar_inmueble hace un UPDATE con columnas explícitas (no un
-- jsonb_populate_record ciego) -- hay que añadir las 3 columnas nuevas aquí
-- también para que el patch del formulario nuevo se escriba de verdad.
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
    imagenes = v_new.imagenes,
    duracion_exclusividad_meses = v_new.duracion_exclusividad_meses,
    comision_exclusividad_pct = v_new.comision_exclusividad_pct,
    clausulas_adicionales = v_new.clausulas_adicionales
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
