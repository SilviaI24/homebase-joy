-- M-02 (auditoría Codex, 14 ago 2026): índices compuestos que faltan para los
-- patrones de consulta reales del CRM (filtrar + ordenar por fecha, o buscar
-- por texto libre). Todo aditivo — no cambia datos ni comportamiento, solo
-- acelera lecturas. IF NOT EXISTS por si alguno ya existiera.
--
-- Deliberadamente NO se añade la restricción de unicidad en contact_roles que
-- sugería Codex: verificar duplicados existentes primero es trabajo de
-- calidad de datos (M-05), no algo para forzar aquí sin comprobar.

CREATE INDEX IF NOT EXISTS idx_contacts_ciclo_vida_created
  ON public.contacts (ciclo_vida, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_properties_estatus_created
  ON public.properties (estatus, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_visits_estado_fecha
  ON public.visits (estado, fecha);

CREATE INDEX IF NOT EXISTS idx_visits_agente_fecha
  ON public.visits (agente_id, fecha);

-- contact_agents ya tiene PK (contact_id, agent_id) — no sirve para buscar
-- por agent_id primero (p. ej. "todos los contactos de este agente").
CREATE INDEX IF NOT EXISTS idx_contact_agents_agent
  ON public.contact_agents (agent_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_seguimiento_contact_fecha
  ON public.seguimiento (contact_id, fecha DESC);

-- Búsqueda de texto libre ("%nombre%", "%calle%") usada hoy con ILIKE en
-- varios sitios (p. ej. buscar_lead de SilvIA) — sin índice, cada búsqueda
-- escanea la tabla entera.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_contacts_nombre_trgm
  ON public.contacts USING gin (nombre gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_properties_calle_trgm
  ON public.properties USING gin (calle gin_trgm_ops);
