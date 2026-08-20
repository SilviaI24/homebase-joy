-- Fix: dashboard_inmuebles_stats() fallaba con "function unaccent(text) does
-- not exist" — la función tiene SET search_path = '' (correcto, es la
-- convención de seguridad de este proyecto), así que unaccent() necesita
-- estar cualificado como public.unaccent(), igual que el resto de funciones
-- SECURITY DEFINER de este repo. Verificado con execute_sql tras aplicar.

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
      count(*) FILTER (WHERE publicacion = 'PROSPECTO')                 AS prospectos_web
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
      regexp_replace(lower(public.unaccent(trim(nullif(localidad, '')))), '\s+', ' ', 'g') AS clave,
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
    'alquilados', c.alquilados, 'valorCartera', c.valor_cartera, 'prospectosWeb', c.prospectos_web,
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
