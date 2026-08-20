-- M-01-bis (parte pendiente): agregación real en SQL para el dashboard y
-- Comerciales, que hasta ahora traían las 5.817 filas de properties
-- (aligeradas con listAllInmueblesLite, pero seguía siendo la tabla entera)
-- para sumar/agrupar en JavaScript en el navegador.
--
-- Replica FIEL del cálculo que hoy hace src/routes/index.tsx (stats, pulso,
-- departamentos, carteraBreakdown) — mismo filtro, misma ventana de fechas,
-- misma tasa de comisión. No es un rediseño de las cifras, es la misma
-- cuenta movida a SQL. Verificado con execute_sql contra producción antes
-- de conectarlo al dashboard.
--
-- Importante: isAlquiler() en el frontend mira el TEXTO de `tipo` (empieza
-- por "alquiler"), no la columna booleana `es_alquiler` (que Session B de
-- hoy encontró que no es fiable — ver estadisticas_barrio). Se replica el
-- mismo criterio de texto para no cambiar el resultado de las comisiones.

CREATE EXTENSION IF NOT EXISTS unaccent;

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
  -- Conteos simples por estatus + valor de cartera activa (mismo criterio
  -- que valorCartera en el frontend: suma de `precio`, no `precio_final`).
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
  -- Serie de 12 meses (mes actual incluido) de captaciones (fecha_inicio) y
  -- ventas/escrituras (fecha_escritura) — mismo agrupado que el frontend.
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
  -- Comisiones: idéntico criterio que el frontend (isAlquiler por texto de
  -- tipo, no por es_alquiler; precio_final si existe, si no precio; 3%).
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
  -- Pulso del mes: igual ventana actual/anterior que usa la tarjeta "Pulso".
  pulso AS (
    SELECT
      count(*) FILTER (WHERE to_char(fecha_inicio, 'YYYY-MM') = v_cur_month)                        AS capt_mes,
      count(*) FILTER (WHERE to_char(fecha_inicio, 'YYYY-MM') = v_prev_month)                        AS capt_prev,
      count(*) FILTER (WHERE to_char(fecha_escritura, 'YYYY-MM') = v_cur_month AND NOT es_alquiler_texto)  AS cierres_mes,
      count(*) FILTER (WHERE to_char(fecha_escritura, 'YYYY-MM') = v_prev_month AND NOT es_alquiler_texto) AS cierres_prev,
      count(*) FILTER (WHERE estatus = 'Reservado')                                                 AS reservas_total
    FROM base
  ),
  -- Actividad por zona: normaliza acentos/mayúsculas/espacios igual que
  -- normalizeKey() en el frontend, top 7 por captaciones.
  departamentos_raw AS (
    SELECT
      regexp_replace(lower(unaccent(trim(nullif(localidad, '')))), '\s+', ' ', 'g') AS clave,
      -- Igual que el frontend: primera variante "tal cual" encontrada para mostrar.
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
  -- Cartera por tipo: solo Activos, count + valor (suma de precio), top 7 por valor.
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

COMMENT ON FUNCTION public.dashboard_inmuebles_stats() IS
  'Agregados del dashboard sobre properties, calculados en SQL en vez de '
  'traer las 5.817 filas al navegador. Réplica fiel de la lógica que había '
  'en src/routes/index.tsx (stats/pulso/departamentos/carteraBreakdown) — '
  'verificado con execute_sql contra producción antes de conectarlo.';

REVOKE ALL ON FUNCTION public.dashboard_inmuebles_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_inmuebles_stats() TO service_role;
