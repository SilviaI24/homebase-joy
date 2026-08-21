-- Corrige la aplicación de 20260821055202_exponer_tipo_alquiler_properties_public.sql.
--
-- Qué pasó: ese archivo se creó vacío (0 bytes) por un cruce de tiempos —
-- se ejecutó `db push` desde otra sesión justo mientras el agente que la
-- escribía todavía no había volcado su contenido real. El CLI la registró
-- como aplicada sin hacer nada (archivo vacío = no-op). Cuando el contenido
-- real llegó, la versión ya estaba "consumida" en el historial, así que
-- `db push` ya no la iba a re-ejecutar por más que el archivo cambiara.
--
-- Al aplicar el contenido real a mano se encontró además un fallo real en su
-- propio preflight (no en el cambio en sí): comparaba
-- pg_get_viewdef(...) contra el patrón '%properties.calle, '' '', properties.numero,%',
-- pero Postgres renderiza la definición sin el prefijo de tabla cuando no hay
-- ambigüedad — la definición real es 'concat(calle, '' '', numero, ...)'. El
-- resto del archivo (la vista, el postflight) era correcto. Aquí se repite
-- con esa única corrección.
--
-- 20260821055202 se deja tal cual (vacío) como registro honesto de lo que
-- pasó — no se reescribe un archivo ya marcado como aplicado en producción.

DO $$
DECLARE
  v_columnas  text[];
  v_definicion text;
  c_esperadas CONSTANT text[] := ARRAY[
    'id', 'airtable_record_id', 'ref_code', 'title', 'address', 'city',
    'neighborhood', 'status', 'price', 'metros_construidos', 'owner_email',
    'exclusivity_end', 'created_at', 'updated_at', 'precio_final',
    'habitaciones', 'banos', 'tipo', 'imagenes', 'casos_especiales'
  ];
BEGIN
  IF to_regclass('public.properties_public') IS NULL THEN
    RAISE EXCEPTION 'public.properties_public no existe.';
  END IF;

  -- Si es_alquiler ya está presente (por si esta migración se re-ejecuta tras
  -- aplicarse con éxito), no hay nada más que hacer.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'properties_public'
      AND column_name = 'es_alquiler'
  ) THEN
    RAISE NOTICE 'properties_public.es_alquiler ya existe; nada que hacer.';
    RETURN;
  END IF;

  SELECT array_agg(c.column_name::text ORDER BY c.ordinal_position)
    INTO v_columnas
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'properties_public';

  IF v_columnas[1:20] IS DISTINCT FROM c_esperadas THEN
    RAISE EXCEPTION 'properties_public no tiene el orden de columnas esperado. Real: %. Esperado: %.', v_columnas, c_esperadas;
  END IF;

  -- Patrón corregido: sin el prefijo "properties." que Postgres no incluye
  -- al renderizar la definición cuando no hace falta para desambiguar.
  v_definicion := pg_get_viewdef('public.properties_public'::regclass, true);
  IF v_definicion NOT LIKE '%concat(calle, '' '', numero,%' THEN
    RAISE EXCEPTION 'La expresion de address no es la esperada. Definicion real: %', v_definicion;
  END IF;
END $$;

CREATE OR REPLACE VIEW public.properties_public
  WITH (security_invoker = true)
AS
SELECT
  id,
  airtable_id                   AS airtable_record_id,
  ref                           AS ref_code,
  CONCAT(tipo, ' ', categoria)  AS title,
  CONCAT(
    calle, ' ', numero,
    CASE WHEN piso <> '' THEN ' ' || piso ELSE '' END
  )                             AS address,
  localidad                     AS city,
  barrio                        AS neighborhood,
  CASE estatus
    WHEN 'Activo'     THEN 'ACTIVE'
    WHEN 'Reservado'  THEN 'RESERVED'
    WHEN 'Vendido'    THEN 'SOLD'
    WHEN 'Alquilado'  THEN 'RENTED'
    ELSE                   'INACTIVE'
  END                           AS status,
  precio                        AS price,
  metros_construidos,
  NULL::TEXT                    AS owner_email,
  fecha_fin_exclusiva           AS exclusivity_end,
  created_at,
  updated_at,
  precio_final,
  habitaciones,
  banos,
  tipo,
  imagenes,
  NULL::TEXT                    AS casos_especiales,
  -- Régimen del inmueble, para comparar contra estadisticas_barrio
  -- (barrio, tipo, es_alquiler) sin adivinarlo.
  es_alquiler
FROM public.properties;

GRANT SELECT ON public.properties_public TO anon, authenticated;

DO $$
DECLARE
  v_tipo_ok        boolean;
  v_alquiler_tipo  text;
  v_reloptions     text[];
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'properties_public'
      AND column_name = 'tipo' AND data_type = 'text'
  ) INTO v_tipo_ok;

  SELECT data_type INTO v_alquiler_tipo
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'properties_public' AND column_name = 'es_alquiler';

  IF NOT v_tipo_ok THEN
    RAISE EXCEPTION 'properties_public.tipo deberia seguir siendo TEXT y no lo es.';
  END IF;

  IF v_alquiler_tipo IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'properties_public.es_alquiler no quedo como boolean (valor: %).', COALESCE(v_alquiler_tipo, 'ausente');
  END IF;

  SELECT reloptions INTO v_reloptions FROM pg_class WHERE oid = 'public.properties_public'::regclass;
  IF v_reloptions IS NULL OR NOT ('security_invoker=true' = ANY (v_reloptions)) THEN
    RAISE EXCEPTION 'properties_public perdio security_invoker=true (reloptions: %).', v_reloptions;
  END IF;
END $$;
