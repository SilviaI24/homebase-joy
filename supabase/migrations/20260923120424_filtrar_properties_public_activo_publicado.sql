-- Defensa en profundidad para properties_public: hasta ahora la vista no
-- filtraba por estatus/publicacion — exponía TODOS los inmuebles (Reservado,
-- Vendido, Baja incluidos) a anon/authenticated, confiando por completo en
-- que la web (WordPress) aplicase correctamente su propio filtro
-- "estatus=Activo AND publicacion=Publicado" (contrato confirmado por el
-- equipo de la web). Con este cambio, un inmueble que deje de estar
-- disponible no puede llegar a la web aunque el cron de sincronización vaya
-- con retraso, aunque WordPress cachee resultados, o aunque su filtro tenga
-- algún día un bug — el propio origen de datos ya solo expone lo publicable.
--
-- Mismas columnas y mismo criterio que la definición vigente
-- (20260821055531_fix_exponer_tipo_alquiler_properties_public.sql), solo se
-- añade el WHERE.

DO $$
DECLARE
  v_columnas text[];
  c_esperadas CONSTANT text[] := ARRAY[
    'id', 'airtable_record_id', 'ref_code', 'title', 'address', 'city',
    'neighborhood', 'status', 'price', 'metros_construidos', 'owner_email',
    'exclusivity_end', 'created_at', 'updated_at', 'precio_final',
    'habitaciones', 'banos', 'tipo', 'imagenes', 'casos_especiales',
    'es_alquiler'
  ];
BEGIN
  IF to_regclass('public.properties_public') IS NULL THEN
    RAISE EXCEPTION 'public.properties_public no existe.';
  END IF;

  SELECT array_agg(c.column_name::text ORDER BY c.ordinal_position)
    INTO v_columnas
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'properties_public';

  IF v_columnas IS DISTINCT FROM c_esperadas THEN
    RAISE EXCEPTION 'properties_public no tiene el orden de columnas esperado. Real: %. Esperado: %.', v_columnas, c_esperadas;
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
  es_alquiler
FROM public.properties
WHERE estatus = 'Activo' AND publicacion = 'PUBLICADO';

GRANT SELECT ON public.properties_public TO anon, authenticated;

DO $$
DECLARE
  v_definicion text;
  v_reloptions text[];
  v_filas_no_publicables bigint;
BEGIN
  v_definicion := pg_get_viewdef('public.properties_public'::regclass, true);
  IF v_definicion NOT LIKE '%WHERE estatus = ''Activo''%'
     OR v_definicion NOT LIKE '%publicacion = ''PUBLICADO''%' THEN
    RAISE EXCEPTION 'El WHERE de properties_public no quedó como se esperaba. Definición real: %', v_definicion;
  END IF;

  SELECT reloptions INTO v_reloptions FROM pg_class WHERE oid = 'public.properties_public'::regclass;
  IF v_reloptions IS NULL OR NOT ('security_invoker=true' = ANY (v_reloptions)) THEN
    RAISE EXCEPTION 'properties_public perdió security_invoker=true (reloptions: %).', v_reloptions;
  END IF;

  SELECT count(*) INTO v_filas_no_publicables
  FROM public.properties_public
  WHERE status <> 'ACTIVE';
  IF v_filas_no_publicables <> 0 THEN
    RAISE EXCEPTION 'properties_public sigue exponiendo % filas no Activas.', v_filas_no_publicables;
  END IF;
END $$;
