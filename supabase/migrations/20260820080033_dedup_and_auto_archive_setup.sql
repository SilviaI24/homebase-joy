-- M-05: limpieza de duplicados y archivado (automático + manual) de
-- contactos inactivos.
--
-- 1) Caso concreto revisado a mano el 19 ago 2026: 4 fichas de "David"
--    (mismo teléfono 614316233) resultaron ser un lead real duplicado, NO
--    datos de prueba como se pensó al principio — una de ellas tiene una
--    visita real vinculada. Se conserva esa (con la visita) y se eliminan
--    las 3 que no tenían ningún dato propio (sin visitas, sin seguimiento,
--    sin rol) — fusión sin pérdida de información real.
--
-- 2) Archivado automático: Leads/Prospectos sin actividad en 18 meses pasan
--    a Histórico. Deliberadamente NO incluye Cliente: un cliente no
--    necesita actividad reciente para seguir siendo válido.
--
-- El archivado/restauración MANUAL (botón en la ficha del contacto) se
-- resuelve en TypeScript reutilizando actualizarCicloVida
-- (src/lib/clientes.functions.ts) — no hace falta una función SQL aparte
-- para eso, solo para el cron, que no puede llamar código de la app.
--
-- Ninguno de los dos borra nada — ciclo_vida_anterior guarda la etapa real
-- para poder "sacarlo" de histórico sin perder dónde estaba.

BEGIN;

-- 1) Dedup del caso "David" — verificado antes de escribir esto: las 3
-- filas eliminadas no tienen contact_roles, visits ni seguimiento propios.
DELETE FROM public.contacts
WHERE id IN (
  '7134a422-a15e-4feb-b953-c6531b15a750',
  '402f4c6b-59dd-4dd7-b844-cd57b375835e',
  '4d8ee97f-ee56-44d0-bb58-5f0d679c55a3'
);

-- 2) Archivado automático por inactividad.
CREATE OR REPLACE FUNCTION public.archivar_leads_inactivos(
  meses_inactividad INT DEFAULT 18
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_corte TIMESTAMPTZ := now() - (meses_inactividad || ' months')::interval;
  v_afectados INT;
BEGIN
  WITH ultima_actividad AS (
    SELECT
      c.id,
      GREATEST(
        c.created_at,
        COALESCE((SELECT max(s.fecha) FROM public.seguimiento s WHERE s.contact_id = c.id), c.created_at),
        COALESCE((SELECT max(v.fecha) FROM public.visits v WHERE v.contact_id = c.id), c.created_at),
        COALESCE((SELECT max(cr.updated_at) FROM public.contact_roles cr WHERE cr.contact_id = c.id), c.created_at)
      ) AS ultima
    FROM public.contacts c
    WHERE c.ciclo_vida IN ('Lead', 'Prospecto')
  )
  UPDATE public.contacts
  SET ciclo_vida = 'Histórico', ciclo_vida_anterior = contacts.ciclo_vida
  WHERE id IN (SELECT id FROM ultima_actividad WHERE ultima < v_corte);

  GET DIAGNOSTICS v_afectados = ROW_COUNT;
  RETURN v_afectados;
END;
$$;

REVOKE ALL ON FUNCTION public.archivar_leads_inactivos(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archivar_leads_inactivos(INT) TO service_role;

-- Corre el primer domingo de cada mes a las 05:00 UTC — fuera de horario de
-- oficina, igual criterio que los cron de sync-properties existentes.
SELECT cron.schedule(
  'archivar-leads-inactivos-mensual',
  '0 5 1-7 * 0',
  $$SELECT public.archivar_leads_inactivos(18);$$
);

COMMIT;
