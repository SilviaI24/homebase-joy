-- Valoración de SilvIA: tabla de precios nueva de David (30 sep 2026).
-- Sustituye a la de "VALORACION POR METRO CUADRADO.txt" (15 barrios, feb 2026,
-- ver 20260924143248_silvia_valoracion_barrios.sql).
--
-- Qué cambia:
--   · 35 barrios de Gijón (antes 15), con precio €/m² con decimales y la zona
--     a la que pertenece cada uno. "Centro" y "Periurbano" dejan de ser
--     barrios: en la tabla nueva son zonas que agrupan varios.
--   · Los suplementos ya no son fijos (antes +30.000 € ascensor, +50.000 €
--     ascensor y exterior): cada barrio tiene el suyo para ascensor, exterior,
--     reformado, garaje, trastero y piscina.
--
-- Reglas de cálculo aprobadas por David el 30 sep 2026:
--   · Los suplementos se suman (uno por cada característica que tenga).
--   · El ±10% se aplica solo a m² × €/m²; los suplementos se suman enteros a
--     los dos extremos del rango.
--   · Exterior suma aunque no haya ascensor.
--   · Garaje y trastero suman solo si van incluidos en la venta; la piscina
--     suma también si es comunitaria.
--   · Si el cliente nombra algo que corresponde a varios barrios ("el centro",
--     "El Llano"), no se da cifra: SilvIA pregunta cuál es y vuelve a llamar
--     con el barrio elegido y p_barrio_confirmado = true. Nunca se elige el
--     barrio por él.
--   · Se mantiene el tramo 30–300 m²; fuera de él, sin cifra.
--   · El Bibio - Les Mestes (4.984,96 €/m², el más alto de la tabla) se
--     carga tal cual; pendiente de que David confirme que no es una errata.
--
-- Si cambian los precios, se actualiza esta tabla (no el prompt ni el código).

ALTER TABLE public.valoracion_barrios
  ALTER COLUMN precio_m2 TYPE numeric(10, 2),
  ADD COLUMN IF NOT EXISTS zona text,
  ADD COLUMN IF NOT EXISTS sup_ascensor integer NOT NULL DEFAULT 0 CHECK (sup_ascensor >= 0),
  ADD COLUMN IF NOT EXISTS sup_exterior integer NOT NULL DEFAULT 0 CHECK (sup_exterior >= 0),
  ADD COLUMN IF NOT EXISTS sup_reformado integer NOT NULL DEFAULT 0 CHECK (sup_reformado >= 0),
  ADD COLUMN IF NOT EXISTS sup_garaje integer NOT NULL DEFAULT 0 CHECK (sup_garaje >= 0),
  ADD COLUMN IF NOT EXISTS sup_trastero integer NOT NULL DEFAULT 0 CHECK (sup_trastero >= 0),
  ADD COLUMN IF NOT EXISTS sup_piscina integer NOT NULL DEFAULT 0 CHECK (sup_piscina >= 0);

COMMENT ON TABLE public.valoracion_barrios IS
  'Precio €/m² y suplementos por barrio de Gijón para las valoraciones de SilvIA. Origen: tabla de precios de David, 30 sep 2026.';

-- La tabla nueva sustituye por completo a la anterior (nombres distintos:
-- "San Lorenzo" → "Centro - San Lorenzo", guiones, etc.).
DELETE FROM public.valoracion_barrios;

-- alias: formas en que el cliente puede nombrar el barrio, ya normalizadas
-- (minúsculas, sin tildes, signos como espacios). Solo variantes del MISMO
-- barrio (incluidas las parroquias que el propio nombre agrupa), nunca
-- barrios vecinos ni la zona.
INSERT INTO public.valoracion_barrios
  (barrio, zona, precio_m2, sup_ascensor, sup_exterior, sup_reformado, sup_garaje, sup_trastero, sup_piscina, alias)
VALUES
  ('Cabueñes',                      'Periurbano',       2059.42, 21500, 22000, 45000, 25000, 7000, 40000, ARRAY['cabuenes']),
  ('Caldones',                      'Periurbano',       2402.03, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['caldones']),
  ('Castiello - Bernueces',         'Periurbano',       1399.06, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['castiello bernueces', 'castiello', 'bernueces']),
  ('Ceares - Jesuitas',             'Este',             2003.90, 15000, 10000, 40000, 12000, 4000, 40000, ARRAY['ceares jesuitas', 'ceares', 'jesuitas']),
  ('Centro - Puerto',               'Centro',           3598.00, 20000, 20000, 50000, 20000, 7000, 40000, ARRAY['centro puerto', 'puerto', 'el puerto']),
  ('Centro - San Lorenzo',          'Centro',           3662.29, 22000, 20000, 45000, 18000, 6000, 40000, ARRAY['centro san lorenzo', 'san lorenzo']),
  ('Cimadevilla',                   'Centro',           3380.92, 15000, 15000, 35000, 16000, 5000, 40000, ARRAY['cimadevilla']),
  ('Contrueces',                    'Sur',              2344.00, 18000, 13000, 28000, 11000, 3000, 40000, ARRAY['contrueces']),
  ('Deva',                          'Periurbano',       2157.84, 21500, 18000, 45000, 22000, 6000, 40000, ARRAY['deva']),
  ('El Bibio - Les Mestes',         'Periurbano',       4984.96, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['el bibio les mestes', 'el bibio', 'bibio', 'les mestes', 'mestes']),
  ('El Coto',                       'Este',             2881.10, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['el coto', 'coto']),
  ('El Llano',                      'El Llano',         1940.86, 15000, 12000, 25000, 11000, 4000, 40000, ARRAY['el llano', 'llano']),
  ('El Llano - Pryca',              'El Llano',         2737.14, 15000, 12000, 25000, 11000, 4000, 40000, ARRAY['el llano pryca', 'llano pryca', 'pryca']),
  ('El Llano Alto',                 'El Llano',         3245.63, 15000, 12000, 25000, 11000, 4000, 40000, ARRAY['el llano alto', 'llano alto']),
  ('El Natahoyo',                   'Oeste',            2429.90, 15000, 15000, 25000, 12000, 4000, 40000, ARRAY['el natahoyo', 'natahoyo']),
  ('Granda',                        'Periurbano',       2936.30, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['granda']),
  ('Jove - Veriña',                 'Oeste',            2495.00, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['jove verina', 'jove', 'verina']),
  ('La Arena',                      'Este',             3703.26, 20000, 15000, 35000, 17000, 5000, 40000, ARRAY['la arena', 'arena']),
  ('La Calzada',                    'Oeste',            2183.19, 20000, 12000, 35000, 14000, 5000, 40000, ARRAY['la calzada', 'calzada']),
  ('La Guía',                       'Somió - Cabueñes', 2434.58, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['la guia', 'guia']),
  ('La Pedrera - Leorio - Huerces', 'Periurbano',        810.41, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['la pedrera leorio huerces', 'la pedrera', 'pedrera', 'leorio', 'huerces']),
  ('Lavandera - Fano - Baldornón',  'Periurbano',       2245.02, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['lavandera fano baldornon', 'lavandera', 'fano', 'baldornon']),
  ('Laviada',                       'Centro',           2631.76, 20000, 15000, 35000, 14000, 5000, 40000, ARRAY['laviada']),
  ('Montevil',                      'Sur',              3040.75, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['montevil']),
  ('Nuevo Gijón',                   'Sur',              2932.77, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['nuevo gijon']),
  ('Polígono',                      'Sur',              2935.41, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['poligono', 'el poligono', 'poligono de pumarin', 'poligono pumarin']),
  ('Porceyo - Cenero',              'Periurbano',       1600.01, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['porceyo cenero', 'porceyo', 'cenero']),
  ('Puao - Fresno - Serín',         'Periurbano',       1194.24, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['puao fresno serin', 'puao', 'fresno', 'serin']),
  ('Pumarín',                       'Sur',              2307.70, 18000, 12000, 25000, 10000, 3000, 40000, ARRAY['pumarin']),
  ('Roces',                         'Sur',              3083.29, 20000, 16000, 35000, 13000, 4000, 40000, ARRAY['roces']),
  ('Santurio',                      'Periurbano',       2278.23, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['santurio']),
  ('Somió',                         'Somió - Cabueñes', 3210.90, 21500, 20000, 45000, 25000, 7000, 40000, ARRAY['somio']),
  ('Tremañes',                      'Oeste',            2168.60, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['tremanes']),
  ('Vega',                          'Periurbano',       2170.98, 21500, 18000, 40000, 14000, 5000, 40000, ARRAY['vega']),
  ('Viesques',                      'Este',             4360.02, 20000, 15000, 35000, 18000, 6000, 40000, ARRAY['viesques']);

-- Firma nueva: los parámetros añadidos llevan DEFAULT para que la versión
-- desplegada de whatsapp-silvia (que llama con 4 argumentos) siga
-- funcionando hasta que se despliegue la nueva. Se borra la de 4 argumentos
-- para que la llamada no sea ambigua.
DROP FUNCTION IF EXISTS public.silvia_valorar_vivienda(text, numeric, boolean, boolean);

CREATE OR REPLACE FUNCTION public.silvia_valorar_vivienda(
  p_barrio text,
  p_metros numeric,
  p_ascensor boolean,
  p_exterior boolean,
  p_reformado boolean DEFAULT false,
  p_garaje boolean DEFAULT false,
  p_trastero boolean DEFAULT false,
  p_piscina boolean DEFAULT false,
  p_barrio_confirmado boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_completa text;
  v_clave text;
  v_barrio public.valoracion_barrios%ROWTYPE;
  v_opciones text[];
  v_base numeric;
  v_sup jsonb;
  v_sup_total integer;
BEGIN
  -- "Barrio de La Arena (Gijón)" → "la arena". Se guarda también la versión
  -- sin quitar "gijon", para no convertir "Nuevo Gijón" en "nuevo".
  v_completa := trim(regexp_replace(regexp_replace(regexp_replace(
                  lower(public.unaccent(coalesce(p_barrio, ''))),
                  '^(barrio( de)?|zona( de)?)\s+', ''),
                  '[^a-z0-9]+', ' ', 'g'),
                  '\s+', ' ', 'g'));
  v_clave := trim(regexp_replace(regexp_replace(v_completa,
               '(\s|^)(de |en )?gijon(\s|$)', ' ', 'g'),
               '\s+', ' ', 'g'));

  -- Nombres que corresponden a varios barrios con precios distintos: sin
  -- confirmar, se pregunta al cliente en vez de elegir uno.
  v_opciones := CASE
    WHEN v_clave IN ('centro', 'el centro')
      THEN ARRAY['Centro - Puerto', 'Centro - San Lorenzo', 'Cimadevilla', 'Laviada']
    WHEN v_clave IN ('el llano', 'llano')
      THEN ARRAY['El Llano', 'El Llano - Pryca', 'El Llano Alto']
  END;

  SELECT * INTO v_barrio FROM public.valoracion_barrios b
   WHERE v_completa = ANY (b.alias) OR v_clave = ANY (b.alias)
   LIMIT 1;

  IF v_opciones IS NOT NULL AND (NOT FOUND OR NOT coalesce(p_barrio_confirmado, false)) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'motivo', 'barrio_ambiguo',
      'indicacion', 'Ese nombre abarca varios barrios con precios distintos. No des ninguna cifra: pregunta con naturalidad en cuál de estos está la vivienda (sin mencionar precios) y vuelve a llamar con el nombre exacto elegido y barrio_confirmado = true.',
      'opciones', to_jsonb(v_opciones)
    );
  END IF;

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

  v_sup := jsonb_strip_nulls(jsonb_build_object(
    'ascensor',  CASE WHEN p_ascensor  THEN v_barrio.sup_ascensor  END,
    'exterior',  CASE WHEN p_exterior  THEN v_barrio.sup_exterior  END,
    'reformado', CASE WHEN p_reformado THEN v_barrio.sup_reformado END,
    'garaje',    CASE WHEN p_garaje    THEN v_barrio.sup_garaje    END,
    'trastero',  CASE WHEN p_trastero  THEN v_barrio.sup_trastero  END,
    'piscina',   CASE WHEN p_piscina   THEN v_barrio.sup_piscina   END
  ));
  SELECT coalesce(sum(value::integer), 0) INTO v_sup_total FROM jsonb_each_text(v_sup);
  v_base := p_metros * v_barrio.precio_m2;

  RETURN jsonb_build_object(
    'ok', true,
    'barrio', v_barrio.barrio,
    'metros', p_metros,
    'precio_m2', v_barrio.precio_m2,
    'suplementos', v_sup,
    'suplemento', v_sup_total,
    'rango_min', round(v_base * 0.90) + v_sup_total,
    'rango_max', round(v_base * 1.10) + v_sup_total
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.silvia_valorar_vivienda(text, numeric, boolean, boolean, boolean, boolean, boolean, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvia_valorar_vivienda(text, numeric, boolean, boolean, boolean, boolean, boolean, boolean, boolean) TO service_role;
