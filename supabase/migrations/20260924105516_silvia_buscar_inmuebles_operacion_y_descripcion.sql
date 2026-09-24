-- SilvIA: la búsqueda de inmuebles pasa a ser la ÚNICA fuente de datos de
-- cartera (24 sep 2026). En la primera prueba real, SilvIA ofreció un dúplex
-- alquilado desde el 1 sep (AT1073) que sacó del vector store de OpenAI, que
-- guarda copias diarias antiguas de cada ficha. Se quita file_search del
-- agente y esta función cubre lo que aportaba: filtrar por operación, listar
-- lo disponible en una zona sin nombrar calle y devolver la descripción.

DROP FUNCTION IF EXISTS public.silvia_buscar_inmuebles(text, int);

CREATE OR REPLACE FUNCTION public.silvia_buscar_inmuebles(
  p_texto text,
  p_operacion text DEFAULT NULL,
  p_limite int DEFAULT 5
)
 RETURNS TABLE (
   ref text, operacion text, tipo text, calle text, barrio text, localidad text,
   habitaciones integer, banos integer, metros numeric, precio numeric, estatus text,
   descripcion text, parecido real
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH q AS (
    SELECT trim(regexp_replace(regexp_replace(replace(
             lower(public.unaccent(coalesce(p_texto, ''))), 'c/', ' '),
             '\m(calle|avenida|avda|av|plaza|pza|paseo|travesia|piso|pisos|casa|en|la|el|los|las|de|del|y|gijon|alquiler|venta|comprar|alquilar)\M', ' ', 'g'),
             '\s+', ' ', 'g')) AS t
  ),
  candidatos AS (
    SELECT p.ref,
           CASE WHEN p.es_alquiler THEN 'alquiler' ELSE 'venta' END AS operacion,
           p.tipo, p.calle, p.barrio, p.localidad,
           p.habitaciones, p.banos, p.metros_construidos AS metros,
           COALESCE(p.precio_final, p.precio) AS precio, p.estatus,
           left(regexp_replace(coalesce(p.descripcion, ''), '\s+', ' ', 'g'), 600) AS descripcion,
           CASE WHEN length(q.t) < 3 THEN 1.0 ELSE GREATEST(
             CASE WHEN lower(coalesce(p.ref, '')) = q.t THEN 1.0 ELSE 0 END,
             word_similarity(q.t, lower(public.unaccent(coalesce(p.calle, '')))),
             word_similarity(q.t, lower(public.unaccent(coalesce(p.barrio, '')))),
             word_similarity(q.t, lower(public.unaccent(coalesce(p.localidad, '')))),
             similarity(q.t, lower(public.unaccent(concat_ws(' ', p.calle, p.barrio, p.localidad))))
           ) END::real AS parecido,
           p.updated_at
      FROM public.properties p, q
     WHERE ((p.estatus = 'Activo' AND p.publicacion = 'PUBLICADO') OR p.estatus = 'Reservado')
       AND (p_operacion IS NULL
            OR (p_operacion = 'alquiler' AND p.es_alquiler)
            OR (p_operacion = 'venta' AND NOT p.es_alquiler))
  )
  -- Umbral mínimo: mejor "no lo encuentro" que ofrecer algo que no se parece.
  SELECT ref, operacion, tipo, calle, barrio, localidad, habitaciones, banos, metros,
         precio, estatus, descripcion, parecido
    FROM candidatos
   WHERE parecido >= 0.5
   ORDER BY parecido DESC, (estatus = 'Activo') DESC, updated_at DESC
   LIMIT LEAST(GREATEST(coalesce(p_limite, 5), 1), 10);
$function$;

REVOKE ALL ON FUNCTION public.silvia_buscar_inmuebles(text, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvia_buscar_inmuebles(text, text, int) TO service_role;
