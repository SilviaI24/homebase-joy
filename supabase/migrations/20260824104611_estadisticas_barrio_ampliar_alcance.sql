-- estadisticas_barrio (Fase 1, 20 ago 2026) — resuelve las 2 decisiones que
-- quedaron pendientes de David y que ya tienen respuesta clara con los datos
-- en la mano (verificado el 24 ago 2026 antes de aplicar):
--
-- 1. Incluir 'Alquilado' en el alcance. Antes solo Activo/Reservado/Vendido
--    -> el segmento de alquiler quedaba prácticamente vacío (8 inmuebles
--    utilizables en total, ningún grupo con muestra suficiente). Un inmueble
--    Alquilado tiene precio_final = la renta REAL ya cerrada -- es mejor dato
--    de mercado que un precio de salida de un Activo, no peor. Con esto:
--    +548 filas utilizables, y los grupos con muestra suficiente pasan de 9
--    a 18, con el alquiler de Piso ya representado en 5 barrios.
-- 2. Umbral de m² específico por tipo. El umbral general (>=20) es correcto
--    para vivienda/local/terreno, pero excluía sistemáticamente Garaje y
--    Trastero, donde un m² pequeño es normal (mismo criterio ya aplicado en
--    la migración 20260821064713_fix_metros_y_alquiler_mismarcado.sql). Para
--    esos dos tipos el único valor imposible es 0.
--
-- De paso, un tercer hallazgo verificado al revisar el impacto de lo
-- anterior: 56 filas tienen tipo = 'Alquiler Piso'/'Alquiler Local'/
-- 'Alquiler Garaje'/'Alquiler Oficina'/'Alquiler Chalet' en vez de solo
-- 'Piso'/'Local'/etc (con es_alquiler=true ya correcto en las 56) -- mismo
-- problema de normalización de texto libre que ya cubre la regla de calidad
-- de métricas agregadas, aplicado aquí a "tipo" además de a "barrio". Sin
-- esto, 'Piso' y 'Alquiler Piso' contaban como categorías distintas del
-- mismo barrio, partiendo la muestra en dos innecesariamente.

BEGIN;

DO $preflight$
DECLARE
  v_src TEXT;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'refresh_estadisticas_barrio';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'Preflight: falta public.refresh_estadisticas_barrio()';
  END IF;
  IF position('c_min_muestra CONSTANT integer := 5' IN v_src) = 0
     OR position('Vendido'::text IN v_src) = 0
     OR position('e.m2 >= 20' IN v_src) = 0 THEN
    RAISE EXCEPTION 'Preflight: el cuerpo vivo de refresh_estadisticas_barrio() no coincide con el esperado -- revisar antes de sobreescribir. Cuerpo actual: %', v_src;
  END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.refresh_estadisticas_barrio()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  -- Mínimo de muestra por (barrio, tipo, régimen) para publicar una media.
  -- Ver diseño §4.2 y verificación original del 20 ago 2026.
  c_min_muestra CONSTANT integer := 5;
  v_filas integer;
BEGIN
  DELETE FROM public.estadisticas_barrio;

  WITH en_alcance AS (
    SELECT
      lower(btrim(p.barrio))                                      AS barrio_clave,
      -- Normaliza 'Alquiler Piso' -> 'Piso' (case-insensitive): mismo tipo
      -- real, es_alquiler ya distingue el régimen. Ver hallazgo del 24 ago.
      btrim(regexp_replace(p.tipo, '^\s*alquiler\s+', '', 'i'))    AS tipo,
      p.es_alquiler,
      p.metros_construidos                                        AS m2,
      COALESCE(NULLIF(p.precio_final, 0), NULLIF(p.precio, 0))    AS precio_ef
    FROM public.properties p
    -- 'Alquilado' añadido el 24 ago 2026 -- ver comentario de cabecera.
    WHERE p.estatus IN ('Activo', 'Reservado', 'Vendido', 'Alquilado')
      AND btrim(COALESCE(p.barrio, '')) <> ''
      AND btrim(COALESCE(p.tipo, ''))   <> ''
      AND p.es_alquiler IS NOT NULL
  ),
  evaluado AS (
    SELECT
      e.*,
      e.precio_ef / NULLIF(e.m2, 0) AS precio_m2,
      (
        e.m2 IS NOT NULL
        -- Umbral de m² por tipo, añadido el 24 ago 2026 -- Garaje/Trastero
        -- son legítimamente pequeños; el resto sigue exigiendo >=20.
        AND (
          (e.tipo IN ('Garaje', 'Trastero') AND e.m2 > 0)
          OR (e.tipo NOT IN ('Garaje', 'Trastero') AND e.m2 >= 20)
        )
        AND e.precio_ef IS NOT NULL AND e.precio_ef > 0
        AND (
          (e.es_alquiler = false
             AND e.precio_ef BETWEEN 20000 AND 5000000
             AND e.precio_ef / NULLIF(e.m2, 0) BETWEEN 200 AND 8000)
          OR
          (e.es_alquiler = true
             AND e.precio_ef BETWEEN 100 AND 10000
             AND e.precio_ef / NULLIF(e.m2, 0) BETWEEN 2 AND 100)
        )
      ) AS utilizable
    FROM en_alcance e
  ),
  etiquetas AS (
    SELECT DISTINCT ON (q.barrio_clave) q.barrio_clave, q.barrio_label
    FROM (
      SELECT
        lower(btrim(p.barrio)) AS barrio_clave,
        btrim(p.barrio)        AS barrio_label,
        count(*)               AS n
      FROM public.properties p
      WHERE btrim(COALESCE(p.barrio, '')) <> ''
      GROUP BY 1, 2
    ) q
    ORDER BY
      q.barrio_clave,
      (q.barrio_label = upper(q.barrio_label)),
      q.n DESC,
      q.barrio_label
  )
  INSERT INTO public.estadisticas_barrio (
    barrio_clave, tipo, es_alquiler, barrio,
    num_inmuebles, num_descartados, muestra_suficiente,
    precio_medio, precio_medio_m2, precio_mediano_m2, calculado_at
  )
  SELECT
    v.barrio_clave,
    v.tipo,
    v.es_alquiler,
    COALESCE(t.barrio_label, v.barrio_clave),
    count(*) FILTER (WHERE v.utilizable)::integer,
    count(*) FILTER (WHERE NOT v.utilizable)::integer,
    count(*) FILTER (WHERE v.utilizable) >= c_min_muestra,
    CASE WHEN count(*) FILTER (WHERE v.utilizable) >= c_min_muestra
         THEN round(avg(v.precio_ef)  FILTER (WHERE v.utilizable), 2) END,
    CASE WHEN count(*) FILTER (WHERE v.utilizable) >= c_min_muestra
         THEN round(avg(v.precio_m2) FILTER (WHERE v.utilizable), 2) END,
    CASE WHEN count(*) FILTER (WHERE v.utilizable) >= c_min_muestra
         THEN round(
                (percentile_cont(0.5) WITHIN GROUP (
                   ORDER BY CASE WHEN v.utilizable THEN v.precio_m2 END
                 ))::numeric, 2) END,
    now()
  FROM evaluado v
  LEFT JOIN etiquetas t ON t.barrio_clave = v.barrio_clave
  GROUP BY v.barrio_clave, v.tipo, v.es_alquiler, t.barrio_label;

  SELECT count(*) INTO v_filas FROM public.estadisticas_barrio;
  RETURN v_filas;
END;
$function$;

COMMENT ON FUNCTION public.refresh_estadisticas_barrio() IS
  'Repuebla estadisticas_barrio. Alcance: Activo/Reservado/Vendido/Alquilado, tipo normalizado (sin prefijo "Alquiler "), umbral de m² por tipo (Garaje/Trastero >0, resto >=20). Ver migración 20260824104611.';

SELECT public.refresh_estadisticas_barrio();

DO $postflight$
DECLARE
  v_total integer;
  v_con_muestra integer;
  v_alquiler_con_muestra integer;
BEGIN
  SELECT count(*) INTO v_total FROM public.estadisticas_barrio;
  SELECT count(*) INTO v_con_muestra FROM public.estadisticas_barrio WHERE muestra_suficiente;
  SELECT count(*) INTO v_alquiler_con_muestra
    FROM public.estadisticas_barrio WHERE muestra_suficiente AND es_alquiler = true;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Postflight: refresh_estadisticas_barrio() no produjo ninguna fila';
  END IF;
  IF v_con_muestra < 15 THEN
    RAISE EXCEPTION 'Postflight: solo % grupos con muestra suficiente, se esperaban >=15 tras ampliar el alcance', v_con_muestra;
  END IF;
  IF v_alquiler_con_muestra = 0 THEN
    RAISE EXCEPTION 'Postflight: el segmento de alquiler sigue sin ningún grupo con muestra suficiente';
  END IF;

  RAISE NOTICE 'Postflight OK: % filas totales, % grupos con muestra suficiente (% de alquiler)', v_total, v_con_muestra, v_alquiler_con_muestra;
END $postflight$;

COMMIT;
