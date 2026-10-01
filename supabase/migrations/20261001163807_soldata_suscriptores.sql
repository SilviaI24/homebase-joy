-- Soldata (publicación mensual de El Sol, 1 oct 2026). La web de la agencia
-- recoge las suscripciones con su propio formulario y las envía por la API de
-- Supabase, con la misma clave que ya usa para los leads de la web. Decisión de
-- David:
--   · Los suscriptores van en `contacts`, pero FUERA de la Bandeja.
--   · Si en el formulario marcan que piensan vender y quieren que les llamen,
--     entran como lead web normal (Bandeja, interés "Prospeccion").
--
-- Diseño:
--   1) ciclo_vida 'Suscriptor': solo recibe Soldata. Al no ser 'Lead', queda
--      fuera de la Bandeja y de todos los recuentos de leads (cabecera,
--      Dashboard, "Leads recientes sin asignar") sin tener que tocar cada consulta.
--   2) fuente 'Soldata': de dónde vino. Se mantiene aunque después pase a lead,
--      así se puede medir cuántas captaciones trae la publicación.
--   3) La agencia NO inserta en `contacts` directamente: llama a
--      POST /rest/v1/rpc/soldata_suscribir. Así no se crean duplicados (busca
--      por email y por teléfono normalizado), se valida el consentimiento y nunca
--      se pisa el origen de un contacto que ya existía.
--   4) Un suscriptor que vuelve por otro camino (formulario de una ficha, que
--      crea un contact_role, o una conversación de WhatsApp/voz/email) pasa solo
--      a 'Lead' con su canal, mediante triggers, para no depender de redesplegar
--      web-lead ni whatsapp-silvia.

-- 1) CHECKs ---------------------------------------------------------------
ALTER TABLE public.contacts DROP CONSTRAINT contacts_ciclo_vida_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_ciclo_vida_check CHECK (
  ciclo_vida = ANY (ARRAY['Lead', 'Prospecto', 'Cliente', 'Histórico', 'Descartado', 'Suscriptor'])
);

ALTER TABLE public.contacts DROP CONSTRAINT contacts_fuente_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_fuente_check CHECK (
  fuente IS NULL OR fuente = ANY (ARRAY[
    'Web', 'Idealista', 'Fotocasa', 'Habitaclia', 'Valorador', 'Referido', 'Oficina', 'Otro', 'Soldata'
  ])
);

-- 2) Columnas de la suscripción -------------------------------------------
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS soldata_suscrito_at timestamptz,
  ADD COLUMN IF NOT EXISTS soldata_baja_at timestamptz,
  ADD COLUMN IF NOT EXISTS soldata_consentimiento_texto text,
  ADD COLUMN IF NOT EXISTS soldata_datos jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.contacts.soldata_suscrito_at IS
  'Fecha de la primera suscripción a Soldata (con consentimiento). NULL = no suscrito.';
COMMENT ON COLUMN public.contacts.soldata_baja_at IS
  'Fecha de baja de Soldata. Volver a suscribirse la limpia.';
COMMENT ON COLUMN public.contacts.soldata_consentimiento_texto IS
  'Texto de consentimiento que aceptó la persona en la última suscripción (lo envía la web).';
COMMENT ON COLUMN public.contacts.soldata_datos IS
  'Origen de la suscripción: {"primera": {...}, "ultima": {...}} con pagina, utm_*, quiere_vender, extra (resto de campos del formulario) y at.';

CREATE INDEX IF NOT EXISTS contacts_email_lower_idx ON public.contacts (lower(btrim(email)))
  WHERE email <> '';

-- 3) RPC para la web --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.soldata_suscribir(
  p_email text,
  p_consentimiento boolean,
  p_nombre text DEFAULT NULL,
  p_telefono text DEFAULT NULL,
  p_quiere_vender boolean DEFAULT false,
  p_consentimiento_texto text DEFAULT NULL,
  p_pagina text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_nombre   text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_telefono text := nullif(btrim(coalesce(p_telefono, '')), '');
  v_tel9     text := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 9);
  v_vender   boolean := coalesce(p_quiere_vender, false);
  v_datos    jsonb;
  v_c        public.contacts%ROWTYPE;
  v_nuevo    boolean := false;
  v_bandeja  boolean := false;
BEGIN
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'email no válido' USING ERRCODE = '22023';
  END IF;
  IF NOT coalesce(p_consentimiento, false) THEN
    RAISE EXCEPTION 'falta el consentimiento para recibir comunicaciones' USING ERRCODE = '22023';
  END IF;
  IF length(v_tel9) <> 9 THEN
    v_tel9 := NULL;
  END IF;

  v_datos := jsonb_strip_nulls(jsonb_build_object(
    'at', now(),
    'pagina', nullif(btrim(coalesce(p_pagina, '')), ''),
    'utm_source', nullif(btrim(coalesce(p_utm_source, '')), ''),
    'utm_medium', nullif(btrim(coalesce(p_utm_medium, '')), ''),
    'utm_campaign', nullif(btrim(coalesce(p_utm_campaign, '')), ''),
    'quiere_vender', v_vender,
    'extra', CASE WHEN jsonb_typeof(p_extra) = 'object' AND p_extra <> '{}'::jsonb THEN p_extra END
  ));

  -- Mismo criterio de "misma persona" que crm_contacto_por_telefono: últimos
  -- 9 dígitos. Se prefiere quien no está descartado y el más reciente.
  SELECT c.* INTO v_c
    FROM public.contacts c
   WHERE (c.email <> '' AND lower(btrim(c.email)) = v_email)
      OR (v_tel9 IS NOT NULL AND right(regexp_replace(c.telefono, '\D', '', 'g'), 9) = v_tel9)
   ORDER BY (c.ciclo_vida IS DISTINCT FROM 'Descartado') DESC, c.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    v_nuevo := true;
    v_bandeja := v_vender;
    INSERT INTO public.contacts (
      nombre, email, telefono, ciclo_vida, canal_origen, fuente, tipo_interes,
      soldata_suscrito_at, soldata_consentimiento_texto, soldata_datos
    ) VALUES (
      coalesce(v_nombre, ''), v_email, coalesce(v_telefono, ''),
      CASE WHEN v_vender THEN 'Lead' ELSE 'Suscriptor' END,
      CASE WHEN v_vender THEN 'Web' END,
      'Soldata',
      CASE WHEN v_vender THEN 'Prospeccion' END,
      now(), p_consentimiento_texto,
      jsonb_build_object('primera', v_datos, 'ultima', v_datos)
    )
    RETURNING * INTO v_c;
  ELSE
    -- Contacto que ya existía: se marca la suscripción y se completan los
    -- datos que falten, sin tocar su fuente ni su canal de origen.
    UPDATE public.contacts SET
      nombre = CASE WHEN btrim(nombre) = '' AND v_nombre IS NOT NULL THEN v_nombre ELSE nombre END,
      email = CASE WHEN btrim(email) = '' THEN v_email ELSE email END,
      telefono = CASE WHEN btrim(telefono) = '' AND v_telefono IS NOT NULL THEN v_telefono ELSE telefono END,
      soldata_suscrito_at = coalesce(soldata_suscrito_at, now()),
      soldata_baja_at = NULL,
      soldata_consentimiento_texto = coalesce(p_consentimiento_texto, soldata_consentimiento_texto),
      soldata_datos = jsonb_build_object(
        'primera', coalesce(soldata_datos -> 'primera', v_datos),
        'ultima', v_datos)
    WHERE id = v_c.id
    RETURNING * INTO v_c;

    IF v_vender THEN
      IF v_c.ciclo_vida IN ('Suscriptor', 'Descartado', 'Histórico') THEN
        -- Vuelve con interés nuevo: a la Bandeja como lead pendiente.
        UPDATE public.contacts SET
          ciclo_vida_anterior = ciclo_vida,
          ciclo_vida = 'Lead',
          canal_origen = coalesce(canal_origen, 'Web'),
          tipo_interes = coalesce(tipo_interes, 'Prospeccion'),
          trabajado = NULL,
          motivo_descarte = NULL,
          descartado_at = NULL,
          ultimo_contacto_at = now()
        WHERE id = v_c.id;
        v_bandeja := true;
      ELSIF v_c.ciclo_vida IN ('Lead', 'Prospecto') THEN
        -- Ya es lead: se reactiva arriba de Pendientes si nadie lo ha cualificado.
        UPDATE public.contacts SET
          canal_origen = coalesce(canal_origen, 'Web'),
          tipo_interes = coalesce(tipo_interes, 'Prospeccion'),
          ultimo_contacto_at = now()
        WHERE id = v_c.id;
        v_bandeja := true;
      END IF;
      -- 'Cliente' (ya tiene rol comercial) no se mueve: queda el evento abajo.
    END IF;
  END IF;

  INSERT INTO public.linea_actividad (contact_id, tipo_evento, descripcion, metadata)
  VALUES (
    v_c.id, 'contacto',
    CASE WHEN v_vender THEN 'Suscripción a Soldata: quiere vender y que le contacten'
         ELSE 'Suscripción a Soldata' END,
    jsonb_build_object('evento', 'soldata_suscripcion', 'nuevo', v_nuevo, 'en_bandeja', v_bandeja) || v_datos
  );

  RETURN jsonb_build_object('contact_id', v_c.id, 'nuevo', v_nuevo, 'en_bandeja', v_bandeja);
END;
$function$;

COMMENT ON FUNCTION public.soldata_suscribir IS
  'Alta en Soldata desde la web (agencia, clave de servicio). Crea o reutiliza el contacto; con p_quiere_vender entra en la Bandeja como lead web.';

REVOKE ALL ON FUNCTION public.soldata_suscribir(text, boolean, text, text, boolean, text, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soldata_suscribir(text, boolean, text, text, boolean, text, text, text, text, text, jsonb)
  TO service_role;

-- Baja (enlace de los emails). Devuelve si había alguien suscrito con ese email.
CREATE OR REPLACE FUNCTION public.soldata_baja(p_email text)
RETURNS boolean
LANGUAGE sql
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH b AS (
    UPDATE public.contacts SET soldata_baja_at = now()
     WHERE email <> '' AND lower(btrim(email)) = lower(btrim(coalesce(p_email, '')))
       AND soldata_suscrito_at IS NOT NULL AND soldata_baja_at IS NULL
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM b);
$function$;

REVOKE ALL ON FUNCTION public.soldata_baja(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soldata_baja(text) TO service_role;

-- 4) Un suscriptor que vuelve por otro camino pasa a lead -----------------
CREATE OR REPLACE FUNCTION public.trg_suscriptor_a_lead_por_rol()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.contacts SET
    ciclo_vida_anterior = 'Suscriptor',
    ciclo_vida = 'Lead',
    canal_origen = coalesce(canal_origen, 'Web'),
    ultimo_contacto_at = now()
  WHERE id = NEW.contact_id AND ciclo_vida = 'Suscriptor';
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS contact_roles_suscriptor_a_lead ON public.contact_roles;
CREATE TRIGGER contact_roles_suscriptor_a_lead
  AFTER INSERT ON public.contact_roles
  FOR EACH ROW EXECUTE FUNCTION public.trg_suscriptor_a_lead_por_rol();

CREATE OR REPLACE FUNCTION public.trg_suscriptor_a_lead_por_conversacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    UPDATE public.contacts SET
      ciclo_vida_anterior = 'Suscriptor',
      ciclo_vida = 'Lead',
      canal_origen = coalesce(
        canal_origen,
        CASE WHEN NEW.canal IN ('WhatsApp', 'Voz', 'Email') THEN NEW.canal ELSE 'Web' END)
    WHERE id = NEW.contact_id AND ciclo_vida = 'Suscriptor';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS conversaciones_suscriptor_a_lead ON public.conversaciones;
CREATE TRIGGER conversaciones_suscriptor_a_lead
  AFTER INSERT OR UPDATE OF contact_id ON public.conversaciones
  FOR EACH ROW EXECUTE FUNCTION public.trg_suscriptor_a_lead_por_conversacion();

-- 5) Estadísticas de canal: los suscriptores se cuentan como "Suscriptores",
--    no como "Sin canal" (David, 1 oct 2026). Mismas funciones, solo cambia
--    la etiqueta del bucket de canal_origen NULL.
CREATE OR REPLACE FUNCTION public.dashboard_header_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_now    timestamptz := now();
  v_result jsonb;
BEGIN
  WITH canales AS (
    SELECT coalesce(canal_origen, CASE WHEN ciclo_vida = 'Suscriptor' THEN 'Suscriptores' ELSE 'Sin canal' END) AS canal, count(*) AS n
    FROM public.contacts
    GROUP BY 1
  ),
  leads_30 AS (
    SELECT count(*) AS n FROM public.contacts
    WHERE coalesce(ciclo_vida, 'Lead') = 'Lead' AND created_at >= v_now - interval '30 days'
  ),
  leads_30_prev AS (
    SELECT count(*) AS n FROM public.contacts
    WHERE coalesce(ciclo_vida, 'Lead') = 'Lead'
      AND created_at >= v_now - interval '60 days' AND created_at < v_now - interval '30 days'
  ),
  leads_90 AS (
    SELECT count(*) AS n FROM public.contacts
    WHERE coalesce(ciclo_vida, 'Lead') = 'Lead' AND created_at >= v_now - interval '90 days'
  ),
  leads_90_prev AS (
    SELECT count(*) AS n FROM public.contacts
    WHERE coalesce(ciclo_vida, 'Lead') = 'Lead'
      AND created_at >= v_now - interval '180 days' AND created_at < v_now - interval '90 days'
  ),
  demanda AS (
    SELECT
      p.id, p.calle, p.numero, p.localidad, p.ref,
      count(DISTINCT cr.contact_id) FILTER (WHERE cr.tipo = 'Interesado') AS interesados,
      count(DISTINCT v.id) FILTER (WHERE v.fecha >= v_now - interval '90 days') AS visitas
    FROM public.properties p
    LEFT JOIN public.contact_roles cr ON cr.property_id = p.id AND cr.tipo = 'Interesado'
    LEFT JOIN public.visits v ON v.property_id = p.id
    WHERE p.estatus IN ('Activo', 'Reservado')
    GROUP BY p.id, p.calle, p.numero, p.localidad, p.ref
    HAVING count(DISTINCT cr.contact_id) FILTER (WHERE cr.tipo = 'Interesado') > 0
        OR count(DISTINCT v.id) FILTER (WHERE v.fecha >= v_now - interval '90 days') > 0
    ORDER BY (
      count(DISTINCT cr.contact_id) FILTER (WHERE cr.tipo = 'Interesado')
      + count(DISTINCT v.id) FILTER (WHERE v.fecha >= v_now - interval '90 days')
    ) DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'canales', coalesce((SELECT jsonb_object_agg(canal, n) FROM canales), '{}'::jsonb),
    'leads30d', (SELECT n FROM leads_30),
    'leads30dPrev', (SELECT n FROM leads_30_prev),
    'leads90d', (SELECT n FROM leads_90),
    'leads90dPrev', (SELECT n FROM leads_90_prev),
    'propiedadDemandada', (
      SELECT jsonb_build_object(
        'id', id,
        'direccion', nullif(btrim(concat(calle, ' ', numero)), ''),
        'localidad', localidad,
        'ref', ref,
        'interesados', interesados,
        'visitas', visitas
      ) FROM demanda
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.dashboard_contactos_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_now    date := now()::date;
  v_result jsonb;
BEGIN
  WITH meses AS (
    SELECT to_char(d, 'YYYY-MM') AS mes_key
    FROM generate_series(
      date_trunc('month', v_now) - interval '11 months',
      date_trunc('month', v_now),
      interval '1 month'
    ) AS d
  ),
  pipeline AS (
    SELECT
      count(*) FILTER (WHERE coalesce(ciclo_vida, 'Lead') = 'Lead')       AS lead,
      count(*) FILTER (WHERE ciclo_vida = 'Prospecto')                    AS prospecto,
      count(*) FILTER (WHERE ciclo_vida = 'Cliente')                      AS cliente,
      count(*) FILTER (WHERE ciclo_vida = 'Histórico')                   AS historico,
      count(*) FILTER (WHERE ciclo_vida = 'Descartado')                   AS descartado
    FROM public.contacts
  ),
  canales AS (
    SELECT coalesce(canal_origen, CASE WHEN ciclo_vida = 'Suscriptor' THEN 'Suscriptores' ELSE 'Sin canal' END) AS canal, count(*) AS n
    FROM public.contacts
    GROUP BY 1
  ),
  leads_mes AS (
    SELECT m.mes_key, count(c.id) AS total
    FROM meses m
    LEFT JOIN public.contacts c ON to_char(c.created_at, 'YYYY-MM') = m.mes_key
    GROUP BY m.mes_key
  ),
  visitas_mes AS (
    SELECT
      m.mes_key,
      count(*) FILTER (WHERE v.estado = 'Realizada') AS realizadas,
      count(*) FILTER (WHERE v.estado = 'Cancelada') AS canceladas
    FROM meses m
    LEFT JOIN public.visits v
      ON v.fecha IS NOT NULL AND to_char(v.fecha, 'YYYY-MM') = m.mes_key
    GROUP BY m.mes_key
  ),
  agente_counts AS (
    SELECT
      ca.agent_id,
      count(*) FILTER (WHERE coalesce(c.ciclo_vida, 'Lead') IN ('Cliente', 'Prospecto')) AS clientes,
      count(*) FILTER (WHERE coalesce(c.ciclo_vida, 'Lead') NOT IN ('Cliente', 'Prospecto')) AS leads
    FROM public.contact_agents ca
    JOIN public.contacts c ON c.id = ca.contact_id
    GROUP BY ca.agent_id
  ),
  agentes AS (
    SELECT
      a.nombre,
      coalesce(ac.leads, 0)    AS leads,
      coalesce(ac.clientes, 0) AS clientes
    FROM public.agents a
    LEFT JOIN agente_counts ac ON ac.agent_id = a.id
    WHERE a.activo IS TRUE
    ORDER BY (coalesce(ac.clientes, 0) + coalesce(ac.leads, 0)) DESC, a.nombre
  )
  SELECT jsonb_build_object(
    'pipeline', jsonb_build_object(
      'Lead', p.lead, 'Prospecto', p.prospecto, 'Cliente', p.cliente,
      'Histórico', p.historico, 'Descartado', p.descartado
    ),
    'canales', coalesce((SELECT jsonb_object_agg(canal, n) FROM canales), '{}'::jsonb),
    'leadsPorMes', coalesce(
      (SELECT jsonb_agg(jsonb_build_object('mes', mes_key, 'total', total) ORDER BY mes_key) FROM leads_mes),
      '[]'::jsonb
    ),
    'visitasPorMes', coalesce(
      (SELECT jsonb_agg(jsonb_build_object('mes', mes_key, 'realizadas', realizadas, 'canceladas', canceladas) ORDER BY mes_key) FROM visitas_mes),
      '[]'::jsonb
    ),
    'agentes', coalesce(
      (SELECT jsonb_agg(jsonb_build_object('nombre', nombre, 'leads', leads, 'clientes', clientes)) FROM agentes),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM pipeline p;

  RETURN v_result;
END;
$function$
;

