
-- Policy para contact_agents (RLS ya estaba habilitado, faltaba la policy)
CREATE POLICY "service_role_all" ON contact_agents
  TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Índices faltantes en operations
CREATE INDEX IF NOT EXISTS idx_operations_property  ON operations(property_id);
CREATE INDEX IF NOT EXISTS idx_operations_vendedor  ON operations(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_operations_comprador ON operations(comprador_id);

-- Índice faltante en visits
CREATE INDEX IF NOT EXISTS idx_visits_agente ON visits(agente_id);
