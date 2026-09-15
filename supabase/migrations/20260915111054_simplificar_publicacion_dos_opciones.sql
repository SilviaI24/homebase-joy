-- Instrucciones de mejora del CRM (sep 2026), punto "Publicación": decisión
-- de los comerciales tras ver el conflicto (Opción B) -- se acepta perder el
-- aviso automático "viene de una valoración web, revísalo" a cambio de que
-- el desplegable de Publicación solo tenga las 2 opciones que pedían
-- (Subir/Publicado).
--
-- 'PROSPECTO' ya no aporta nada que 'properties.estatus' no cubra: desde el
-- punto "Cartera" de esta misma ronda de cambios, cualquier inmueble en
-- estatus='Prospección' (con o sin origen web) ya es visible en Cartera >
-- Captación > "Inmuebles captados, pendientes de activar" -- ese aviso
-- cubre ahora TODOS los orígenes, no solo el valorador web.
--
-- El KPI "prospectosWeb" del Dashboard (contaba publicacion='PROSPECTO', es
-- decir, específicamente los que llegaban del valorador) se repropone como
-- "prospectosPendientes" (cuenta estatus='Prospección', cualquier origen) en
-- vez de quedar fantasma a 0 -- mismo criterio ya aplicado en el proyecto
-- (retirar/reproponer en vez de dejar un contador muerto, ver meta_score/
-- sectionTotals).
--
-- crm_crear_prospecto_manual (RPC detrás del botón "Nueva captación directa"
-- de Captación) también hardcodeaba publicacion='PROSPECTO' al crear el
-- inmueble ligero del prospecto manual -- sin este ajuste, cerrar el CHECK
-- habría roto ese botón en el primer uso tras la migración.

BEGIN;

-- 1. Migrar datos existentes antes de cerrar el CHECK: las filas que hoy
-- tienen 'PROSPECTO' pasan a '' (sin decidir todavía Subir/Publicado) --
-- ya no estaban "revisadas" antes de este cambio, así que no es correcto
-- asumir que ya se decidió subirlas.
UPDATE public.properties SET publicacion = '' WHERE publicacion = 'PROSPECTO';

ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_publicacion_check;
ALTER TABLE public.properties
  ADD CONSTRAINT properties_publicacion_check
  CHECK (publicacion IN ('', 'SUBIR', 'PUBLICADO'));

-- crm_crear_prospecto_manual: quitar el 'PROSPECTO' hardcodeado (queda sin
-- valor, igual que cualquier otra captación pendiente de revisión).
CREATE OR REPLACE FUNCTION public.crm_crear_prospecto_manual(
  p_nombre TEXT,
  p_telefono TEXT,
  p_email TEXT,
  p_tipo TEXT,
  p_calle TEXT,
  p_numero TEXT,
  p_localidad TEXT,
  p_precio NUMERIC,
  p_superficie NUMERIC,
  p_habitaciones NUMERIC,
  p_es_alquiler BOOLEAN,
  p_categoria TEXT,
  p_agente_ids UUID[],
  p_actor_id UUID
)
RETURNS TABLE (contact_id UUID, property_id UUID)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact_id UUID;
  v_property_id UUID;
BEGIN
  IF p_nombre IS NULL OR btrim(p_nombre) = '' THEN
    RAISE EXCEPTION 'Nombre del propietario requerido';
  END IF;
  IF p_tipo IS NULL OR btrim(p_tipo) = '' THEN
    RAISE EXCEPTION 'Tipo de inmueble requerido';
  END IF;
  IF p_calle IS NULL OR btrim(p_calle) = '' THEN
    RAISE EXCEPTION 'Calle requerida';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  INSERT INTO public.contacts (nombre, ciclo_vida, canal_origen, telefono, email)
  VALUES (
    p_nombre, 'Prospecto', 'Manual',
    COALESCE(p_telefono, ''), COALESCE(p_email, '')
  )
  RETURNING id INTO v_contact_id;

  INSERT INTO public.properties (
    calle, tipo, estatus, publicacion, es_alquiler, categoria,
    numero, localidad, precio, metros_construidos, habitaciones, agente_id
  ) VALUES (
    p_calle, p_tipo, 'Prospección', '', p_es_alquiler, p_categoria,
    COALESCE(p_numero, ''), COALESCE(p_localidad, ''), p_precio, p_superficie, p_habitaciones,
    p_agente_ids[1]
  )
  RETURNING id INTO v_property_id;

  IF p_agente_ids IS NOT NULL AND array_length(p_agente_ids, 1) > 0 THEN
    INSERT INTO public.contact_agents (contact_id, agent_id)
    SELECT v_contact_id, aid FROM unnest(p_agente_ids) AS aid;
  END IF;

  INSERT INTO public.contact_roles (contact_id, property_id, agente_id, tipo)
  VALUES (v_contact_id, v_property_id, p_agente_ids[1], 'Propietario');

  RETURN QUERY SELECT v_contact_id, v_property_id;
END;
$$;

-- 2. Dashboard: prospectosWeb -> prospectosPendientes (mismo campo JSON,
-- criterio ampliado a estatus en vez de publicacion).
CREATE OR REPLACE FUNCTION public.dashboard_inmuebles_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
DECLARE
  v_now       date := now()::date;
  v_cur_month text := to_char(now(), 'YYYY-MM');
  v_cur_year  text := to_char(now(), 'YYYY');
  v_prev_month text := to_char(now() - interval '1 month', 'YYYY-MM');
  v_result    jsonb;
BEGIN
  WITH base AS (
    SELECT
      id, tipo, estatus, publicacion,
      COALESCE(precio, 0)        AS precio,
      COALESCE(precio_final, precio, 0) AS precio_efectivo,
      fecha_inicio, fecha_escritura,
      COALESCE(localidad, '')    AS localidad,
      (tipo ~* '^\s*alquiler')   AS es_alquiler_texto
    FROM public.properties
  ),
  conteos AS (
    SELECT
      count(*) FILTER (WHERE estatus = 'Activo')                        AS activos,
      count(*) FILTER (WHERE estatus = 'Reservado')                     AS reservados,
      count(*) FILTER (WHERE estatus = 'Vendido')                       AS vendidos,
      count(*) FILTER (WHERE estatus = 'Alquilado')                     AS alquilados,
      coalesce(sum(precio) FILTER (WHERE estatus = 'Activo'), 0)         AS valor_cartera,
      count(*) FILTER (WHERE estatus = 'Prospección')                   AS prospectos_pendientes
    FROM base
  ),
  meses AS (
    SELECT to_char(d, 'YYYY-MM') AS mes_key, to_char(d, 'Mon') AS mes_label
    FROM generate_series(date_trunc('month', v_now) - interval '11 months',
                          date_trunc('month', v_now), interval '1 month') AS d
  ),
  serie AS (
    SELECT
      m.mes_key, m.mes_label,
      count(*) FILTER (WHERE to_char(b.fecha_inicio, 'YYYY-MM') = m.mes_key)     AS captaciones,
      count(*) FILTER (WHERE to_char(b.fecha_escritura, 'YYYY-MM') = m.mes_key)  AS ventas
    FROM meses m
    LEFT JOIN base b ON true
    GROUP BY m.mes_key, m.mes_label
    ORDER BY m.mes_key
  ),
  comisiones AS (
    SELECT
      coalesce(sum(precio_efectivo * 0.03) FILTER (
        WHERE NOT es_alquiler_texto AND estatus = 'Vendido'
          AND to_char(fecha_escritura, 'YYYY-MM') = v_cur_month
          AND precio_efectivo > 0
      ), 0) AS comision_mes,
      coalesce(sum(precio_efectivo * 0.03) FILTER (
        WHERE NOT es_alquiler_texto AND estatus = 'Vendido'
          AND to_char(fecha_escritura, 'YYYY') = v_cur_year
          AND precio_efectivo > 0
      ), 0) AS comision_anual,
      coalesce(sum(precio_efectivo * 0.03) FILTER (
        WHERE NOT es_alquiler_texto AND estatus IN ('Activo', 'Reservado')
          AND precio_efectivo > 0
      ), 0) AS comision_pipeline
    FROM base
  ),
  pulso AS (
    SELECT
      count(*) FILTER (WHERE to_char(fecha_inicio, 'YYYY-MM') = v_cur_month)                        AS capt_mes,
      count(*) FILTER (WHERE to_char(fecha_inicio, 'YYYY-MM') = v_prev_month)                        AS capt_prev,
      count(*) FILTER (WHERE to_char(fecha_escritura, 'YYYY-MM') = v_cur_month AND NOT es_alquiler_texto)  AS cierres_mes,
      count(*) FILTER (WHERE to_char(fecha_escritura, 'YYYY-MM') = v_prev_month AND NOT es_alquiler_texto) AS cierres_prev,
      count(*) FILTER (WHERE estatus = 'Reservado')                                                 AS reservas_total
    FROM base
  ),
  departamentos_raw AS (
    SELECT
      regexp_replace(lower(unaccent(trim(nullif(localidad, '')))), '\s+', ' ', 'g') AS clave,
      (array_agg(nullif(localidad, '') ORDER BY id))[1]                              AS etiqueta,
      count(*) FILTER (WHERE fecha_inicio IS NOT NULL)                               AS captaciones,
      count(*) FILTER (WHERE estatus = 'Vendido')                                    AS ventas,
      count(*) FILTER (WHERE estatus = 'Activo')                                     AS activos
    FROM base
    GROUP BY 1
  ),
  departamentos AS (
    SELECT coalesce(etiqueta, 'Sin zona') AS display, captaciones, ventas, activos
    FROM departamentos_raw
    WHERE captaciones > 0 OR activos > 0
    ORDER BY captaciones DESC
    LIMIT 7
  ),
  cartera_tipo AS (
    SELECT
      coalesce(nullif(tipo, ''), 'Otros') AS tipo,
      count(*)                            AS count,
      coalesce(sum(precio), 0)            AS valor
    FROM base
    WHERE estatus = 'Activo'
    GROUP BY 1
    ORDER BY valor DESC
    LIMIT 7
  )
  SELECT jsonb_build_object(
    'activos', c.activos, 'reservados', c.reservados, 'vendidos', c.vendidos,
    'alquilados', c.alquilados, 'valorCartera', c.valor_cartera,
    'prospectosPendientes', c.prospectos_pendientes,
    'serie', (SELECT jsonb_agg(jsonb_build_object('mes', mes_label, 'Captaciones', captaciones, 'Ventas', ventas) ORDER BY mes_key) FROM serie),
    'comisionMes', co.comision_mes, 'comisionAnual', co.comision_anual, 'comisionPipeline', co.comision_pipeline,
    'pulso', jsonb_build_object(
      'captMes', p.capt_mes, 'captPrev', p.capt_prev,
      'cierresMes', p.cierres_mes, 'cierresPrev', p.cierres_prev,
      'reservasTotal', p.reservas_total
    ),
    'departamentos', (SELECT jsonb_agg(jsonb_build_object('display', display, 'captaciones', captaciones, 'ventas', ventas, 'activos', activos)) FROM departamentos),
    'carteraBreakdown', (SELECT jsonb_agg(jsonb_build_object('tipo', tipo, 'count', count, 'valor', valor)) FROM cartera_tipo)
  )
  INTO v_result
  FROM conteos c, comisiones co, pulso p;

  RETURN v_result;
END;
$$;

COMMIT;
