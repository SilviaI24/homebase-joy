-- Fase 2 del circuito del lead (24 sep 2026).
--
-- 1) contacts.fuente: DE DÓNDE vino el lead (portal, web, referido...),
--    separado de canal_origen, que es POR DÓNDE hablamos con él (WhatsApp,
--    voz, email). Hasta hoy iban mezclados en un solo campo y "Legado" no
--    decía ninguna de las dos cosas. NULL = fuente desconocida: no se
--    infiere buscando palabras en el texto de la conversación.

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS fuente text;

ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_fuente_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_fuente_check CHECK (
  fuente IS NULL OR fuente = ANY (ARRAY[
    'Web', 'Idealista', 'Fotocasa', 'Habitaclia', 'Valorador', 'Referido', 'Oficina', 'Otro'
  ])
);

COMMENT ON COLUMN public.contacts.fuente IS
  'De dónde vino el lead (portal, web, referido...). Distinto de canal_origen (por dónde se habla). NULL = desconocida.';

-- Valores de canal_origen que en realidad ya son una fuente. Solo mapeo
-- exacto, sin heurística de texto.
CREATE OR REPLACE FUNCTION public.fuente_desde_canal_origen(p_canal text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE p_canal
    WHEN 'Web' THEN 'Web'
    WHEN 'Valorador' THEN 'Valorador'
    WHEN 'Idealista' THEN 'Idealista'
    WHEN 'Referido' THEN 'Referido'
    WHEN 'Presencial' THEN 'Oficina'
    ELSE NULL
  END;
$function$;

UPDATE public.contacts
   SET fuente = public.fuente_desde_canal_origen(canal_origen)
 WHERE fuente IS NULL AND public.fuente_desde_canal_origen(canal_origen) IS NOT NULL;

-- Las Edge Functions que crean contactos (web-lead, valorador) no conocen
-- este campo: el trigger lo rellena al insertar sin tener que redesplegarlas.
CREATE OR REPLACE FUNCTION public.trg_contacts_fuente_por_defecto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.fuente IS NULL THEN
    NEW.fuente := public.fuente_desde_canal_origen(NEW.canal_origen);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS contacts_fuente_por_defecto ON public.contacts;
CREATE TRIGGER contacts_fuente_por_defecto
  BEFORE INSERT ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.trg_contacts_fuente_por_defecto();

CREATE OR REPLACE FUNCTION public.crm_marcar_fuente_lead(p_contact_id uuid, p_fuente text, p_actor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'El contacto es obligatorio';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  -- El CHECK de la columna valida el valor; NULL = "no lo sabemos".
  UPDATE public.contacts SET fuente = p_fuente WHERE id = p_contact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El contacto no existe';
  END IF;
END;
$function$;

-- 2) Pipeline de interesados por comercial. La etapa se DERIVA de lo que ya
--    está registrado (cierre > oferta > visita > contactado > cualificado),
--    no es un campo que alguien tenga que mover a mano. El comercial es el
--    asignado al contacto; si no hay, el del rol; si no, el del inmueble que
--    le interesa (idea de David, 22 sep 2026: heredar el comercial de la
--    propiedad en vez de exigir asignación manual). agente_origen dice de
--    cuál de los tres salió, para que la pantalla lo distinga.
CREATE OR REPLACE FUNCTION public.crm_pipeline_interesados(p_tipo text)
 RETURNS TABLE (
   contact_id uuid,
   nombre text,
   telefono text,
   etapa text,
   agente_id uuid,
   agente_origen text,
   property_id uuid,
   inmueble text,
   ultima_fecha timestamptz
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH base AS (
    SELECT DISTINCT ON (c.id)
           c.id, c.nombre, c.telefono, c.trabajado, c.created_at,
           r.agente_id AS rol_agente, r.property_id,
           p.agente_id AS inmueble_agente, p.calle, p.numero
      FROM public.contacts c
      JOIN public.contact_roles r ON r.contact_id = c.id AND r.tipo = p_tipo
      LEFT JOIN public.properties p ON p.id = r.property_id
     WHERE c.ciclo_vida IN ('Cliente', 'Prospecto')
     ORDER BY c.id, (r.agente_id IS NOT NULL) DESC, (p.agente_id IS NOT NULL) DESC, r.created_at DESC
  )
  SELECT b.id,
         b.nombre,
         b.telefono,
         CASE
           WHEN EXISTS (SELECT 1 FROM public.contact_roles r2
                         WHERE r2.contact_id = b.id AND r2.tipo = p_tipo AND r2.estado = 'Cerrado') THEN 'Cierre'
           WHEN EXISTS (SELECT 1 FROM public.historial_ofertas o WHERE o.contact_id = b.id) THEN 'Oferta'
           WHEN EXISTS (SELECT 1 FROM public.visits v
                         WHERE v.contact_id = b.id AND v.estado IS DISTINCT FROM 'Cancelada') THEN 'Visita'
           WHEN b.trabajado = 'Contactado'
             OR EXISTS (SELECT 1 FROM public.seguimiento s WHERE s.contact_id = b.id) THEN 'Contactado'
           ELSE 'Cualificado'
         END,
         COALESCE(ca.agent_id, b.rol_agente, b.inmueble_agente),
         CASE
           WHEN ca.agent_id IS NOT NULL THEN 'asignado'
           WHEN b.rol_agente IS NOT NULL THEN 'rol'
           WHEN b.inmueble_agente IS NOT NULL THEN 'inmueble'
         END,
         b.property_id,
         NULLIF(TRIM(CONCAT_WS(' ', b.calle, b.numero)), ''),
         GREATEST(
           b.created_at,
           (SELECT MAX(v.fecha) FROM public.visits v WHERE v.contact_id = b.id),
           (SELECT MAX(s.fecha) FROM public.seguimiento s WHERE s.contact_id = b.id)
         )
    FROM base b
    LEFT JOIN LATERAL (
      SELECT x.agent_id FROM public.contact_agents x
       WHERE x.contact_id = b.id ORDER BY x.agent_id LIMIT 1
    ) ca ON TRUE;
$function$;

REVOKE ALL ON FUNCTION public.crm_marcar_fuente_lead(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_marcar_fuente_lead(uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crm_pipeline_interesados(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_pipeline_interesados(text) TO service_role;
REVOKE ALL ON FUNCTION public.trg_contacts_fuente_por_defecto() FROM PUBLIC, anon, authenticated;
