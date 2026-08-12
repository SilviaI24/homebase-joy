-- ============================================================
-- HOMEBASE JOY — Esquema inicial (baseline)
-- El Sol Grupo CRM
-- Estado: anterior a las migraciones versionadas
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── AGENTS ────────────────────────────────────────────────────
CREATE TABLE agents (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre       TEXT NOT NULL,
  email        TEXT UNIQUE,
  telefono     TEXT DEFAULT '',
  activo       BOOLEAN DEFAULT TRUE,
  airtable_id  TEXT UNIQUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── CONTACTS ──────────────────────────────────────────────────
CREATE TABLE contacts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre           TEXT NOT NULL DEFAULT '',
  telefono         TEXT DEFAULT '',
  email            TEXT DEFAULT '',
  dni              TEXT DEFAULT '',
  profesion        TEXT DEFAULT '',
  ciclo_vida       TEXT NOT NULL DEFAULT 'Lead'
    CHECK (ciclo_vida IN ('Lead', 'Prospecto', 'Activo', 'Histórico', 'Descartado')),
  canal_origen     TEXT CHECK (canal_origen IN (
    'SilvIA-Voz', 'SilvIA-WhatsApp', 'SilvIA-Email', 'SilvIA-Valorador',
    'Idealista', 'Presencial', 'Referido', 'Manual'
  )),
  motivo           TEXT DEFAULT '',
  solicitud        TEXT DEFAULT '',
  conversaciones   TEXT DEFAULT '',
  observaciones    TEXT DEFAULT '',
  feedback         TEXT DEFAULT '',
  seccion          TEXT DEFAULT '',
  trabajado        TEXT DEFAULT '',
  presupuesto_min  NUMERIC,
  presupuesto_max  NUMERIC,
  habitaciones_min INTEGER,
  zonas            TEXT[] DEFAULT '{}',
  categoria        TEXT[] DEFAULT '{}',
  contrato_trabajo TEXT DEFAULT '',
  mascota          TEXT DEFAULT '',
  avalista         TEXT DEFAULT '',
  duplicados       INTEGER DEFAULT 1,
  attachments      JSONB DEFAULT '[]',
  airtable_id      TEXT UNIQUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── CONTACT ↔ AGENT ───────────────────────────────────────────
CREATE TABLE contact_agents (
  contact_id  UUID REFERENCES contacts(id) ON DELETE CASCADE,
  agent_id    UUID REFERENCES agents(id)   ON DELETE CASCADE,
  PRIMARY KEY (contact_id, agent_id)
);

-- ── PROPERTIES ────────────────────────────────────────────────
CREATE TABLE properties (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ref                 TEXT UNIQUE,
  tipo                TEXT DEFAULT '',
  categoria           TEXT DEFAULT '',
  es_alquiler         BOOLEAN DEFAULT FALSE,
  calle               TEXT DEFAULT '',
  numero              TEXT DEFAULT '',
  piso                TEXT DEFAULT '',
  puerta              TEXT DEFAULT '',
  barrio              TEXT DEFAULT '',
  localidad           TEXT DEFAULT '',
  provincia           TEXT DEFAULT '',
  cp                  TEXT DEFAULT '',
  coordenadas         JSONB,
  metros_construidos  NUMERIC,
  metros_utiles       NUMERIC,
  habitaciones        INTEGER,
  banos               INTEGER,
  orientacion         TEXT DEFAULT '',
  descripcion         TEXT DEFAULT '',
  caracteristicas     TEXT[] DEFAULT '{}',
  precio              NUMERIC,
  precio_final        NUMERIC,
  estatus             TEXT DEFAULT 'Activo'
    CHECK (estatus IN ('Activo', 'Reservado', 'Vendido', 'Alquilado', 'Baja', 'Prospección')),
  imagenes            JSONB DEFAULT '[]',
  documentos          JSONB DEFAULT '[]',
  agente_id           UUID REFERENCES agents(id),
  airtable_id         TEXT UNIQUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── CONTACT ROLES ─────────────────────────────────────────────
CREATE TABLE contact_roles (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id       UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tipo             TEXT NOT NULL
    CHECK (tipo IN ('Propietario', 'Comprador', 'Inquilino', 'Arrendador')),
  estado           TEXT NOT NULL DEFAULT 'Prospecto'
    CHECK (estado IN ('Prospecto', 'Activo', 'Cerrado', 'Descartado')),
  agente_id        UUID REFERENCES agents(id),
  property_id      UUID REFERENCES properties(id),
  presupuesto_min  NUMERIC,
  presupuesto_max  NUMERIC,
  zonas_busqueda   TEXT[] DEFAULT '{}',
  habitaciones_min INTEGER,
  tipo_documento   TEXT,
  fecha_documento  DATE,
  fecha_inicio     TIMESTAMPTZ DEFAULT NOW(),
  fecha_conversion TIMESTAMPTZ,
  fecha_cierre     TIMESTAMPTZ,
  notas            TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── OPERATIONS ────────────────────────────────────────────────
CREATE TABLE operations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo             TEXT NOT NULL
    CHECK (tipo IN ('Venta', 'Alquiler', 'Valoración', 'Servicio')),
  estado           TEXT NOT NULL DEFAULT 'Abierta'
    CHECK (estado IN ('Abierta', 'En negociación', 'Cerrada', 'Cancelada')),
  property_id      UUID REFERENCES properties(id),
  agente_id        UUID REFERENCES agents(id),
  vendedor_id      UUID REFERENCES contacts(id),
  comprador_id     UUID REFERENCES contacts(id),
  precio_operacion NUMERIC,
  comision_pct     NUMERIC,
  comision_total   NUMERIC,
  fecha_apertura   TIMESTAMPTZ DEFAULT NOW(),
  fecha_cierre     TIMESTAMPTZ,
  notas            TEXT DEFAULT '',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── VISITS ────────────────────────────────────────────────────
CREATE TABLE visits (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id      UUID REFERENCES properties(id),
  contact_id       UUID REFERENCES contacts(id),
  agente_id        UUID REFERENCES agents(id),
  fecha            TIMESTAMPTZ NOT NULL,
  duracion_minutos INTEGER,
  estado           TEXT DEFAULT 'Programada'
    CHECK (estado IN ('Programada', 'Realizada', 'Cancelada')),
  notas            TEXT DEFAULT '',
  airtable_id      TEXT UNIQUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── SEGUIMIENTO ───────────────────────────────────────────────
CREATE TABLE seguimiento (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  agente_id  UUID REFERENCES agents(id),
  tipo       TEXT DEFAULT 'Nota'
    CHECK (tipo IN ('Llamada', 'WhatsApp', 'Email', 'Visita', 'Nota', 'SilvIA')),
  texto      TEXT NOT NULL,
  fecha      TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── PROPERTY EXTRA COLUMNS (add-property-columns) ─────────────
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS publicacion            TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS estado                 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fecha_inicio           DATE,
  ADD COLUMN IF NOT EXISTS fecha_reserva          DATE,
  ADD COLUMN IF NOT EXISTS fecha_escritura        DATE,
  ADD COLUMN IF NOT EXISTS fecha_exclusiva        DATE,
  ADD COLUMN IF NOT EXISTS fecha_fin_exclusiva    DATE,
  ADD COLUMN IF NOT EXISTS certificacion_energetica TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ano_construccion       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gastos_comunidad       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS calefaccion            TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS garaje                 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS trastero               TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ascensor               TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS armarios_empotrados    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS terraza                TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS balcon                 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS referencia_catastral   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS honorarios             TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tipo_exclusiva         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notaria                TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS llaves                 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS observaciones          TEXT NOT NULL DEFAULT '';

-- ── PROPERTY CHANGELOG (add-changelog-column) ─────────────────
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS changelog JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX idx_contacts_ciclo_vida    ON contacts(ciclo_vida);
CREATE INDEX idx_contacts_canal_origen  ON contacts(canal_origen);
CREATE INDEX idx_contacts_telefono      ON contacts(telefono);
CREATE INDEX idx_contacts_email         ON contacts(email);
CREATE INDEX idx_contacts_created_at    ON contacts(created_at DESC);

CREATE INDEX idx_contact_roles_contact  ON contact_roles(contact_id);
CREATE INDEX idx_contact_roles_tipo     ON contact_roles(tipo);
CREATE INDEX idx_contact_roles_estado   ON contact_roles(estado);
CREATE INDEX idx_contact_roles_agente   ON contact_roles(agente_id);
CREATE INDEX idx_contact_roles_property ON contact_roles(property_id);

CREATE INDEX idx_properties_estatus     ON properties(estatus);
CREATE INDEX idx_properties_alquiler    ON properties(es_alquiler);
CREATE INDEX idx_properties_agente      ON properties(agente_id);

CREATE INDEX idx_visits_fecha           ON visits(fecha DESC);
CREATE INDEX idx_visits_contact         ON visits(contact_id);
CREATE INDEX idx_visits_property        ON visits(property_id);

CREATE INDEX idx_seguimiento_contact    ON seguimiento(contact_id);
CREATE INDEX idx_seguimiento_fecha      ON seguimiento(fecha DESC);

CREATE INDEX idx_operations_estado      ON operations(estado);
CREATE INDEX idx_operations_agente      ON operations(agente_id);
CREATE INDEX idx_operations_fechacierre ON operations(fecha_cierre DESC);

-- ── updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_contacts_updated_at
  BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER t_properties_updated_at
  BEFORE UPDATE ON properties FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER t_contact_roles_updated_at
  BEFORE UPDATE ON contact_roles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER t_agents_updated_at
  BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_roles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits         ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguimiento    ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON contacts       TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON properties     TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON contact_roles  TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON agents         TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON visits         TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON seguimiento    TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON operations     TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON contact_agents TO service_role USING (TRUE) WITH CHECK (TRUE);
