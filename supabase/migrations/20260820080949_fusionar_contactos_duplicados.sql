-- M-05: fusión de contactos duplicados con revisión humana (nunca automática).
-- Traspasa TODO lo que cuelga del contacto perdedor (incluidas las tablas del
-- Portal que comparten esta misma base de datos: propietarios, documentos,
-- tareas, solicitudes_servicio, historial_ofertas, linea_actividad) al
-- contacto superviviente elegido por la persona que revisa, y solo entonces
-- borra el duplicado. Si cualquier paso falla, PostgreSQL deshace la función
-- entera — no hay estado a medias.
--
-- Solo contact_agents tiene una clave compuesta (contact_id, agent_id) que
-- podría chocar si los dos contactos ya comparten el mismo agente asignado;
-- el resto son id propio, sin riesgo de colisión.

BEGIN;

CREATE OR REPLACE FUNCTION public.fusionar_contactos(_survivor_id UUID, _loser_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF _survivor_id = _loser_id THEN
    RAISE EXCEPTION 'fusionar_contactos: el superviviente y el duplicado no pueden ser el mismo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = _survivor_id) THEN
    RAISE EXCEPTION 'fusionar_contactos: superviviente % no existe', _survivor_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = _loser_id) THEN
    RAISE EXCEPTION 'fusionar_contactos: duplicado % no existe', _loser_id;
  END IF;

  INSERT INTO public.contact_agents (contact_id, agent_id)
  SELECT _survivor_id, agent_id FROM public.contact_agents WHERE contact_id = _loser_id
  ON CONFLICT DO NOTHING;
  DELETE FROM public.contact_agents WHERE contact_id = _loser_id;

  UPDATE public.contact_roles SET contact_id = _survivor_id WHERE contact_id = _loser_id;
  UPDATE public.visits SET contact_id = _survivor_id WHERE contact_id = _loser_id;
  UPDATE public.seguimiento SET contact_id = _survivor_id WHERE contact_id = _loser_id;
  UPDATE public.operations SET vendedor_id = _survivor_id WHERE vendedor_id = _loser_id;
  UPDATE public.operations SET comprador_id = _survivor_id WHERE comprador_id = _loser_id;
  UPDATE public.propietarios SET contact_id = _survivor_id WHERE contact_id = _loser_id;
  UPDATE public.documentos SET contact_id = _survivor_id WHERE contact_id = _loser_id;
  UPDATE public.historial_ofertas SET contact_id = _survivor_id WHERE contact_id = _loser_id;
  UPDATE public.tareas SET contact_id = _survivor_id WHERE contact_id = _loser_id;
  UPDATE public.solicitudes_servicio SET contact_id = _survivor_id WHERE contact_id = _loser_id;
  UPDATE public.linea_actividad SET contact_id = _survivor_id WHERE contact_id = _loser_id;

  DELETE FROM public.contacts WHERE id = _loser_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fusionar_contactos(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fusionar_contactos(UUID, UUID) TO service_role;

-- Candidatos a duplicado por teléfono normalizado (>= 9 dígitos, para no
-- agrupar por ruido de números incompletos). Devuelve filas sueltas — se
-- agrupan por tel_norm en la capa de aplicación.
CREATE OR REPLACE FUNCTION public.listar_contactos_duplicados()
RETURNS TABLE (
  tel_norm TEXT,
  contact_id UUID,
  nombre TEXT,
  telefono TEXT,
  email TEXT,
  ciclo_vida TEXT,
  created_at TIMESTAMPTZ,
  tiene_actividad BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  WITH normalizados AS (
    SELECT id, regexp_replace(telefono, '[^0-9]', '', 'g') AS tel_norm
    FROM public.contacts
    WHERE telefono IS NOT NULL
      AND length(regexp_replace(telefono, '[^0-9]', '', 'g')) >= 9
  ),
  grupos AS (
    SELECT tel_norm FROM normalizados GROUP BY tel_norm HAVING count(*) > 1
  )
  SELECT
    n.tel_norm,
    c.id,
    c.nombre,
    c.telefono,
    c.email,
    c.ciclo_vida,
    c.created_at,
    EXISTS (SELECT 1 FROM public.contact_roles cr WHERE cr.contact_id = c.id)
      OR EXISTS (SELECT 1 FROM public.visits v WHERE v.contact_id = c.id)
      OR EXISTS (SELECT 1 FROM public.seguimiento s WHERE s.contact_id = c.id)
      OR EXISTS (SELECT 1 FROM public.propietarios p WHERE p.contact_id = c.id)
  FROM public.contacts c
  JOIN normalizados n ON n.id = c.id
  JOIN grupos g ON g.tel_norm = n.tel_norm
  ORDER BY n.tel_norm, c.created_at;
$$;

REVOKE ALL ON FUNCTION public.listar_contactos_duplicados() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_contactos_duplicados() TO service_role;

COMMIT;
