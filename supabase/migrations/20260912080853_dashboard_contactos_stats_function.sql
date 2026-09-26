-- getStatsData (clientes.functions.ts) calculaba pipeline/canales/leadsPorMes/
-- visitasPorMes/agentes en TypeScript sobre datos traídos con LIMIT 5000
-- (contacts) y LIMIT 2000 (visits) — correcto hoy (4.149 contactos totales),
-- pero deja de serlo en cuanto el volumen supere esos topes (mismo patrón
-- de bug ya corregido antes para inmuebles con dashboard_inmuebles_stats()).
-- Esta función calcula lo mismo en SQL, sobre la tabla completa, sin límite.

BEGIN;

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
    -- Mismo criterio que el TS original: ciclo_vida NULL cuenta como 'Lead'.
    SELECT
      count(*) FILTER (WHERE coalesce(ciclo_vida, 'Lead') = 'Lead')       AS lead,
      count(*) FILTER (WHERE ciclo_vida = 'Prospecto')                    AS prospecto,
      count(*) FILTER (WHERE ciclo_vida = 'Cliente')                      AS cliente,
      count(*) FILTER (WHERE ciclo_vida = 'Histórico')                   AS historico,
      count(*) FILTER (WHERE ciclo_vida = 'Descartado')                   AS descartado
    FROM public.contacts
  ),
  canales AS (
    -- Igual que el TS original: solo NULL cae en 'Sin canal', '' es su
    -- propia clave (así se comportaba el código que reemplaza).
    SELECT coalesce(canal_origen, 'Sin canal') AS canal, count(*) AS n
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
$function$;

REVOKE ALL ON FUNCTION public.dashboard_contactos_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_contactos_stats() TO service_role;

DO $postflight$
BEGIN
  IF has_function_privilege('anon', 'public.dashboard_contactos_stats()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Postflight: dashboard_contactos_stats sigue siendo ejecutable por anon';
  END IF;
  RAISE NOTICE 'Postflight OK: dashboard_contactos_stats restringida a service_role';
END $postflight$;

COMMIT;
