-- ─────────────────────────────────────────────────────────────────────────────
-- estadisticas_barrio — motor de comparación por barrio (Fase 1)
--
-- Origen: DISENO_PORTAL_ANALITICA_PROPIETARIO_2026-08-20.md, §3.1 y §5 (Fase 1).
-- Alcance deliberadamente cerrado: SOLO número de inmuebles, precio medio y
-- precio medio por m². Sin interfaz.
--
-- FUERA DE ALCANCE, por decisión ya tomada en el documento de diseño (§4.1):
--   "tiempo medio de venta" NO se calcula aquí. Solo el 1,3 % de los inmuebles
--   marcados 'Vendido' tiene `fecha_escritura`. Publicar esa media sería inventar
--   un dato con el 1 % de la muestra. No añadir la columna hasta que se decida
--   cómo se registra la fecha de cierre real en el día a día del CRM.
--
-- ── Por qué tabla + función de refresco, y no una MATERIALIZED VIEW ──────────
-- El boceto del diseño proponía una vista materializada. Se descarta por dos
-- motivos, el primero bloqueante:
--   1. Postgres NO aplica RLS a las vistas materializadas. Esta tabla la lee el
--      portal del propietario con el rol `authenticated`; sin RLS no hay forma de
--      cerrar el acceso a `anon`. Una tabla sí admite política.
--   2. Coherencia con el patrón que ya existe en ESGI para este mismo problema
--      (`neighborhood_market_data` + `refresh_neighborhood_market_data()` + cron).
-- Además, una tabla permite guardar la trazabilidad del cálculo
-- (`num_descartados`, `calculado_at`), imposible en una matview.
--
-- ── Relación con `neighborhood_market_data` (tabla anterior) ─────────────────
-- No se toca ni se elimina: `src/components/MarketIntelligence.tsx` la sigue
-- leyendo. Pero NO sirve para el portal, y por eso se crea esta tabla nueva:
-- agrega solo sobre `estatus = 'Activo'` (80 filas hoy), no normaliza el barrio
-- (convive 'Centro' con 'CENTRO' como dos filas distintas), mezcla €/m² de venta
-- y de alquiler en la misma columna (3.536 junto a 15), acepta medias de 1 sola
-- propiedad y publica `avg_days_on_market`, justo la métrica que §4.1 prohíbe.
-- La sustitución de su uso en la app es trabajo de la Fase 2.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Tabla de resultados ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.estadisticas_barrio (
  barrio_clave        TEXT        NOT NULL,   -- lower(trim(barrio)): clave de agrupación
  tipo                TEXT        NOT NULL,
  es_alquiler         BOOLEAN     NOT NULL,
  barrio              TEXT        NOT NULL,   -- etiqueta canónica para mostrar
  num_inmuebles       INTEGER     NOT NULL,   -- inmuebles que SÍ entran en la media
  num_descartados     INTEGER     NOT NULL,   -- descartados por los filtros de plausibilidad
  muestra_suficiente  BOOLEAN     NOT NULL,   -- num_inmuebles >= mínimo (5)
  precio_medio        NUMERIC,                -- NULL si la muestra es insuficiente
  precio_medio_m2     NUMERIC,                -- NULL si la muestra es insuficiente
  precio_mediano_m2   NUMERIC,                -- NULL si la muestra es insuficiente
  calculado_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (barrio_clave, tipo, es_alquiler)
);

COMMENT ON TABLE public.estadisticas_barrio IS
  'Agregados de mercado por barrio/tipo/régimen calculados desde public.properties. '
  'Se repuebla por completo en cada ejecución de refresh_estadisticas_barrio(). '
  'No contiene datos personales: solo cifras agregadas.';

COMMENT ON COLUMN public.estadisticas_barrio.muestra_suficiente IS
  'false = menos de 5 inmuebles utilizables. En ese caso precio_medio, '
  'precio_medio_m2 y precio_mediano_m2 van a NULL a propósito, para que ninguna '
  'pantalla pueda mostrar por error una media construida con 1-4 casos.';

COMMENT ON COLUMN public.estadisticas_barrio.num_descartados IS
  'Inmuebles del grupo excluidos por precio o superficie fuera de banda. '
  'Sirve para medir la calidad del dato de origen, no para mostrarlo al propietario.';

-- La PK ya cubre la búsqueda por (barrio_clave, tipo, es_alquiler). Se añade
-- solo el índice del caso de uso del portal: "dame todo lo de mi barrio".
CREATE INDEX IF NOT EXISTS idx_estadisticas_barrio_clave
  ON public.estadisticas_barrio (barrio_clave)
  WHERE muestra_suficiente = true;

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
-- Lectura: cualquier usuario autenticado (propietario del portal o staff). Son
-- cifras agregadas de mercado, no datos de clientes.
-- Escritura: ninguna política. Solo `service_role` (que salta RLS) y la función
-- SECURITY DEFINER de abajo pueden escribir. `anon` no lee ni escribe nada.

ALTER TABLE public.estadisticas_barrio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_lee_estadisticas_barrio" ON public.estadisticas_barrio;
CREATE POLICY "auth_lee_estadisticas_barrio" ON public.estadisticas_barrio
  FOR SELECT TO authenticated USING (true);

-- Defensa en profundidad: con RLS activo y sin políticas de escritura, INSERT /
-- UPDATE / DELETE ya quedan denegados. Se revocan además los permisos por si
-- alguien añadiese una política de escritura sin querer.
REVOKE ALL ON TABLE public.estadisticas_barrio FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.estadisticas_barrio FROM authenticated;
GRANT  SELECT ON TABLE public.estadisticas_barrio TO authenticated;

-- ── 3. Función de refresco ───────────────────────────────────────────────────
--
-- Filtros de plausibilidad — el porqué de cada uno, verificado contra producción
-- el 20 ago 2026 sobre las 2.103 filas con estatus IN ('Activo','Reservado','Vendido'):
--
--   a) `metros_construidos >= 20`
--      El sync de Airtable pierde el separador de miles: un terreno de 1.617 m²
--      está guardado como 1,617 m². Eso producía €/m² de hasta 1.237.624 y
--      disparaba la media global de venta a 4.786 €/m² frente a una mediana de
--      1.329 €/m². Ninguna unidad registrable real baja de 20 m², así que el
--      umbral elimina el error de parseo. Coste: excluye también algún trastero
--      legítimamente pequeño (109 filas en total).
--
--   b) Bandas de precio por régimen, y coherencia con `es_alquiler`
--      `es_alquiler` NO es fiable: hay 590 filas con es_alquiler = false y
--      estatus = 'Vendido' cuyo precio está entre 1 y 990 €, con una
--      distribución que hace pico en 400-700 € — son rentas mensuales, no
--      precios de venta. Mezclarlas hundía la media de venta del barrio.
--      Se exige que la bandera Y la magnitud del precio digan lo mismo; si se
--      contradicen, la fila se descarta en vez de reclasificarla. Adivinar cuál
--      de los dos campos está mal sería opinión, no dato: esas 590 fichas hay
--      que corregirlas en el origen (Airtable), no aquí.
--
--   c) Banda final sobre el propio €/m²
--      Red de seguridad para lo que sobreviva a (a) y (b).
--
-- Precio efectivo = COALESCE(precio_final, precio): el precio de cierre cuando
-- existe, el de salida si no. ATENCIÓN para la Fase 2: solo el 35 % de los
-- 'Vendido' tiene `precio_final`, así que la media es mayoritariamente precio
-- de salida. La redacción de la pantalla no puede llamarlo "precio de venta".

CREATE OR REPLACE FUNCTION public.refresh_estadisticas_barrio()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- Mínimo de muestra por (barrio, tipo, régimen) para publicar una media.
  -- Elegido con los datos en la mano: de los 74 grupos con al menos un inmueble
  -- utilizable, solo 9 llegan a 5, pero esos 9 concentran 845 de los 945
  -- inmuebles utilizables (89 %). Bajar a 3 añade 10 grupos y solo 36 inmuebles
  -- (medias de 3-4 casos). Subir a 8 quita 3 grupos y apenas gana fiabilidad.
  -- 5 es el codo de la curva, y es el valor que ya propone el diseño en §4.2.
  c_min_muestra CONSTANT integer := 5;
  v_filas integer;
BEGIN
  -- Repoblado completo dentro de una transacción: los lectores siguen viendo
  -- los datos anteriores hasta el COMMIT.
  DELETE FROM public.estadisticas_barrio;

  WITH en_alcance AS (
    SELECT
      lower(btrim(p.barrio))                                      AS barrio_clave,
      btrim(p.tipo)                                               AS tipo,
      p.es_alquiler,
      p.metros_construidos                                        AS m2,
      COALESCE(NULLIF(p.precio_final, 0), NULLIF(p.precio, 0))    AS precio_ef
    FROM public.properties p
    WHERE p.estatus IN ('Activo', 'Reservado', 'Vendido')
      AND btrim(COALESCE(p.barrio, '')) <> ''   -- sin barrio no hay comparación posible
      AND btrim(COALESCE(p.tipo, ''))   <> ''   -- sin tipo tampoco
      AND p.es_alquiler IS NOT NULL
  ),
  evaluado AS (
    SELECT
      e.*,
      -- NULLIF obligatorio: hay 17 filas en alcance con metros_construidos = 0,
      -- que sin esto abortarían el refresco con "division by zero".
      e.precio_ef / NULLIF(e.m2, 0) AS precio_m2,
      (
        e.m2 IS NOT NULL AND e.m2 >= 20
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
  -- Etiqueta canónica del barrio: 'Centro', 'CENTRO' y 'centro' son el mismo
  -- barrio. Se agrupa en minúsculas y se muestra la variante más frecuente,
  -- prefiriendo la que no está toda en mayúsculas.
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
      (q.barrio_label = upper(q.barrio_label)),  -- false (mixto) antes que true (MAYÚSCULAS)
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
    -- Las tres medias van a NULL si la muestra no llega al mínimo: así ninguna
    -- pantalla puede mostrar una cifra que no deberíamos publicar.
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
$$;

COMMENT ON FUNCTION public.refresh_estadisticas_barrio() IS
  'Repuebla public.estadisticas_barrio desde public.properties y devuelve el '
  'número de filas escritas. Idempotente. Pensada para el cron diario y para '
  'llamarse por RPC con service_role.';

-- Solo el cron y el backend con service_role pueden lanzar el recálculo.
REVOKE ALL ON FUNCTION public.refresh_estadisticas_barrio() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_estadisticas_barrio() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_estadisticas_barrio() TO service_role;

COMMIT;

-- ── 4. Primer cálculo ────────────────────────────────────────────────────────

SELECT public.refresh_estadisticas_barrio() AS filas_escritas;

-- ── 5. Cron diario ───────────────────────────────────────────────────────────
-- Huecos ya ocupados en ESGI (cron.job, leído el 20 ago 2026):
--   03:00 diario      purge-old-notificaciones
--   05:00 dom (1-7)   archivar-leads-inactivos-mensual
--   18:00 dom         sync-properties-full-1
--   18:30 dom         sync-properties-full-2
--   19:00 diario      sync-properties            (meta, Airtable → properties)
--   19:30 diario      sync-properties-images  +  refresh-neighborhood-market-data
--
-- Se elige 20:15 UTC (22:15 en España): después del sync incremental de las
-- 19:00 y del de imágenes de las 19:30 (que puede tardar hasta 120 s), de modo
-- que los agregados se calculan siempre sobre los datos ya frescos de Airtable,
-- y sin caer en ningún hueco ocupado.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-estadisticas-barrio') THEN
    PERFORM cron.unschedule('refresh-estadisticas-barrio');
  END IF;
END $$;

SELECT cron.schedule(
  'refresh-estadisticas-barrio',
  '15 20 * * *',
  $$ SELECT public.refresh_estadisticas_barrio(); $$
);

-- ── 6. Verificación ──────────────────────────────────────────────────────────

SELECT barrio, tipo, es_alquiler, num_inmuebles, num_descartados,
       precio_medio, precio_medio_m2, precio_mediano_m2
FROM public.estadisticas_barrio
WHERE muestra_suficiente
ORDER BY num_inmuebles DESC;

SELECT jobname, schedule, active FROM cron.job
WHERE jobname = 'refresh-estadisticas-barrio';
