-- SilvIA de WhatsApp dentro del CRM (24 sep 2026). Sustituye al escenario de
-- Make "Silvia - 03.1 WhatsApp Assistant", que dejó de funcionar cuando OpenAI
-- retiró la API de Assistants. La Edge Function whatsapp-silvia es el único
-- escritor de whatsapp_mensajes (más el envío manual desde la Bandeja).

-- 1) Mensaje a mensaje. conversaciones sigue siendo el resumen por
--    conversación (una fila por hilo); aquí va cada mensaje, con el id de
--    WhatsApp (wamid) único para que un reintento de Meta no se procese dos
--    veces.
CREATE TABLE IF NOT EXISTS public.whatsapp_mensajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wamid text UNIQUE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversacion_id uuid REFERENCES public.conversaciones(id) ON DELETE CASCADE,
  direccion text NOT NULL CHECK (direccion IN ('entrante', 'saliente')),
  autor text NOT NULL CHECK (autor IN ('cliente', 'silvia', 'comercial')),
  tipo text NOT NULL DEFAULT 'text',
  texto text,
  estado_envio text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_mensajes_conversacion_idx
  ON public.whatsapp_mensajes (conversacion_id, created_at);
CREATE INDEX IF NOT EXISTS whatsapp_mensajes_contact_idx
  ON public.whatsapp_mensajes (contact_id, created_at DESC);

ALTER TABLE public.whatsapp_mensajes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON public.whatsapp_mensajes;
CREATE POLICY service_role_all ON public.whatsapp_mensajes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.whatsapp_mensajes FROM anon, authenticated;

-- 2) Estado de WhatsApp en el contacto.
--    whatsapp_baja: pidió no recibir más mensajes → SilvIA no le escribe.
--    silvia_pausada_hasta: un comercial le respondió desde la Bandeja →
--    SilvIA se calla en esa conversación hasta esa hora, para no pisarse
--    con una persona.
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS whatsapp_baja boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS silvia_pausada_hasta timestamptz;

-- 3) Buscar el contacto por teléfono comparando los 9 últimos dígitos (el
--    CRM guarda formatos mezclados: "+34 6xx…", "6xx xx xx xx", "0034…").
--    Prefiere un contacto no descartado y, entre ellos, el más reciente.
CREATE INDEX IF NOT EXISTS contacts_telefono_9_idx
  ON public.contacts ((right(regexp_replace(telefono, '\D', '', 'g'), 9)));

CREATE OR REPLACE FUNCTION public.crm_contacto_por_telefono(p_telefono text)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id
    FROM public.contacts c
   WHERE length(right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 9)) = 9
     AND right(regexp_replace(c.telefono, '\D', '', 'g'), 9)
         = right(regexp_replace(p_telefono, '\D', '', 'g'), 9)
   ORDER BY (c.ciclo_vida IS DISTINCT FROM 'Descartado') DESC, c.created_at DESC
   LIMIT 1;
$function$;

-- 4) Herramienta de SilvIA: buscar un inmueble por lo que diga el cliente
--    (referencia, calle aunque esté mal escrita, barrio). Mejora detectada en
--    el análisis de conversaciones: el agente no encontraba inmuebles dictados
--    de memoria. Solo lo que un cliente puede ver: Activo y PUBLICADO, más
--    Reservado (para poder decirle que está reservado). Eso deja fuera las
--    filas de prueba ("calle falsa", "PRUEBA INTERNA…"), que no están
--    publicadas. Solo datos públicos del anuncio: sin número de portal ni
--    nada del propietario. Se quitan palabras de relleno ("calle", "piso",
--    "en la"...) antes de comparar: si no, "calle Cabrales" se parecía más a
--    "calle falsa" que a "Cabrales".
CREATE OR REPLACE FUNCTION public.silvia_buscar_inmuebles(p_texto text, p_limite int DEFAULT 5)
 RETURNS TABLE (
   ref text, operacion text, tipo text, calle text, barrio text, localidad text,
   habitaciones integer, banos integer, metros numeric, precio numeric, estatus text, parecido real
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH q AS (
    SELECT trim(regexp_replace(regexp_replace(replace(
             lower(public.unaccent(coalesce(p_texto, ''))), 'c/', ' '),
             '\m(calle|avenida|avda|av|plaza|pza|paseo|travesia|piso|pisos|casa|en|la|el|los|las|de|del|y|gijon)\M', ' ', 'g'),
             '\s+', ' ', 'g')) AS t
  ),
  candidatos AS (
  SELECT p.ref,
         CASE WHEN p.es_alquiler THEN 'alquiler' ELSE 'venta' END,
         p.tipo, p.calle, p.barrio, p.localidad,
         p.habitaciones, p.banos, p.metros_construidos,
         COALESCE(p.precio_final, p.precio), p.estatus,
         GREATEST(
           CASE WHEN lower(coalesce(p.ref, '')) = q.t THEN 1.0 ELSE 0 END,
           word_similarity(q.t, lower(public.unaccent(coalesce(p.calle, '')))),
           word_similarity(q.t, lower(public.unaccent(coalesce(p.barrio, '')))) * 0.8,
           similarity(q.t, lower(public.unaccent(concat_ws(' ', p.calle, p.barrio, p.localidad))))
         )::real AS parecido
    FROM public.properties p, q
   WHERE ((p.estatus = 'Activo' AND p.publicacion = 'PUBLICADO') OR p.estatus = 'Reservado')
     AND length(q.t) >= 3
  )
  -- Umbral mínimo: mejor "no lo encuentro" que ofrecer algo que no se parece.
  SELECT * FROM candidatos
   WHERE parecido >= 0.5
   ORDER BY parecido DESC
   LIMIT LEAST(GREATEST(coalesce(p_limite, 5), 1), 10);
$function$;

REVOKE ALL ON FUNCTION public.crm_contacto_por_telefono(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_contacto_por_telefono(text) TO service_role;
REVOKE ALL ON FUNCTION public.silvia_buscar_inmuebles(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.silvia_buscar_inmuebles(text, int) TO service_role;
