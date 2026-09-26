-- "Centro de Gijón", "barrio de La Arena (Gijón)" → "centro", "la arena": la
-- primera prueba simulada no reconoció "Centro de Gijón" (24 sep 2026).
CREATE OR REPLACE FUNCTION public.silvia_valorar_vivienda(
  p_barrio text,
  p_metros numeric,
  p_ascensor boolean,
  p_exterior boolean
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_clave text;
  v_barrio public.valoracion_barrios%ROWTYPE;
  v_suplemento integer;
BEGIN
  -- "Centro de Gijón", "barrio de La Arena (Gijón)" → "centro", "la arena".
  v_clave := trim(regexp_replace(regexp_replace(regexp_replace(
               lower(public.unaccent(coalesce(p_barrio, ''))),
               '^(barrio( de)?|zona( de)?)\s+', ''),
               '[^a-z0-9]+', ' ', 'g'),
               '(\s|^)(de |en )?gijon(\s|$)', ' ', 'g'));
  v_clave := trim(regexp_replace(v_clave, '\s+', ' ', 'g'));

  SELECT * INTO v_barrio FROM public.valoracion_barrios b WHERE v_clave = ANY (b.alias);
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'motivo', 'barrio_no_en_tabla',
      'indicacion', 'No des ninguna cifra. Si puede ser una variante de un barrio de la lista, confírmalo con el cliente; si no, di que un especialista le preparará la orientación.',
      'barrios', (SELECT jsonb_agg(barrio ORDER BY barrio) FROM public.valoracion_barrios)
    );
  END IF;

  IF p_metros IS NULL OR p_metros < 30 OR p_metros > 300 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'motivo', 'metros_fuera_de_tabla',
      'indicacion', 'Solo se orienta entre 30 y 300 m². No des ninguna cifra; un especialista le preparará la orientación.'
    );
  END IF;

  v_suplemento := CASE
    WHEN p_ascensor AND p_exterior THEN 50000
    WHEN p_ascensor THEN 30000
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'barrio', v_barrio.barrio,
    'metros', p_metros,
    'precio_m2', v_barrio.precio_m2,
    'suplemento', v_suplemento,
    'rango_min', round(p_metros * v_barrio.precio_m2 * 0.90) + v_suplemento,
    'rango_max', round(p_metros * v_barrio.precio_m2 * 1.10) + v_suplemento
  );
END;
$function$;