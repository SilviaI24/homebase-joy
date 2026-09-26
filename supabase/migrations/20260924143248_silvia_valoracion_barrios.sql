-- Valoración de SilvIA por WhatsApp (24 sep 2026). David: "las valoraciones
-- son de lo más importante del asistente; todas las líneas de precio y zonas
-- deben respetarse literalmente".
--
-- Origen: "VALORACION POR METRO CUADRADO.txt" del vector store de SilvIA
-- (OpenAI, 12 feb 2026). Sus 924 líneas de precio cuadran sin excepción con:
--   valor = m² × €/m² del barrio + suplemento
--   suplemento: 0 (sin ascensor), 30.000 € (con ascensor),
--               50.000 € (con ascensor y exterior)
-- y el prompt de SilvIA fija el rango: m² × (€/m² × 0,90) … m² × (€/m² × 1,10).
-- El cálculo lo hace esta función, no el modelo: una cifra de valoración no
-- puede depender de que el modelo lea bien una tabla o haga bien una suma.
--
-- Decisiones de lectura literal (pendientes de confirmar por David):
--   · El suplemento se suma al final de los dos extremos del rango.
--   · Exterior SIN ascensor no tiene suplemento en el archivo → 0.
--   · El archivo cubre 30–300 m²; fuera de ese tramo no se da cifra.
--   · Barrio que no esté en la tabla → no se da cifra (nunca el más parecido).

CREATE TABLE IF NOT EXISTS public.valoracion_barrios (
  barrio text PRIMARY KEY,
  precio_m2 integer NOT NULL CHECK (precio_m2 > 0),
  alias text[] NOT NULL DEFAULT '{}',
  actualizado_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.valoracion_barrios IS
  'Precio €/m² por barrio de Gijón para las valoraciones de SilvIA. Origen: VALORACION POR METRO CUADRADO.txt (vector store de SilvIA, feb 2026).';

ALTER TABLE public.valoracion_barrios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON public.valoracion_barrios;
CREATE POLICY service_role_all ON public.valoracion_barrios
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.valoracion_barrios FROM anon, authenticated;

-- alias: formas en que el cliente puede nombrar el barrio, ya normalizadas
-- (minúsculas, sin tildes, guiones como espacios). Solo variantes del MISMO
-- nombre que usa el archivo, nunca barrios vecinos.
INSERT INTO public.valoracion_barrios (barrio, precio_m2, alias) VALUES
  ('Centro',          3250, ARRAY['centro']),
  ('Cimadevilla',     3571, ARRAY['cimadevilla', 'centro puerto', 'centro puerto cimadevilla']),
  ('San Lorenzo',     3258, ARRAY['san lorenzo']),
  ('Laviada',         2634, ARRAY['laviada']),
  ('El Llano',        2123, ARRAY['el llano', 'llano']),
  ('El Llano–Pryca',  2604, ARRAY['el llano pryca', 'llano pryca', 'pryca']),
  ('Ceares–Jesuitas', 2176, ARRAY['ceares jesuitas', 'ceares', 'jesuitas']),
  ('La Arena',        3088, ARRAY['la arena', 'arena']),
  ('Viesques',        3235, ARRAY['viesques']),
  ('El Natahoyo',     2007, ARRAY['el natahoyo', 'natahoyo']),
  ('La Calzada',      1890, ARRAY['la calzada', 'calzada']),
  ('Contrueces',      2042, ARRAY['contrueces']),
  ('Pumarín',         1925, ARRAY['pumarin']),
  ('Roces',           2469, ARRAY['roces']),
  ('Periurbano',      1547, ARRAY['periurbano'])
ON CONFLICT (barrio) DO UPDATE SET precio_m2 = EXCLUDED.precio_m2, alias = EXCLUDED.alias, actualizado_at = now();

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

REVOKE ALL ON FUNCTION public.silvia_valorar_vivienda(text, numeric, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvia_valorar_vivienda(text, numeric, boolean, boolean) TO service_role;
