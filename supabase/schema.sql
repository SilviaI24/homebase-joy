-- ============================================================
-- HOMEBASE JOY — Supabase Schema
-- El Sol Grupo CRM
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- AGENTS (Comerciales)
-- ============================================================
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

-- ============================================================
-- CONTACTS (Personas / Contactos)
-- ============================================================
CREATE TABLE contacts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Datos personales
  nombre           TEXT NOT NULL DEFAULT '',
  telefono         TEXT DEFAULT '',
  email            TEXT DEFAULT '',
  dni              TEXT DEFAULT '',
  profesion        TEXT DEFAULT '',

  -- Ciclo de vida del contacto
  -- Lead → Prospecto → Activo → Histórico (o Descartado en cualquier punto)
  ciclo_vida       TEXT NOT NULL DEFAULT 'Lead'
    CHECK (ciclo_vida IN ('Lead', 'Prospecto', 'Activo', 'Histórico', 'Descartado')),

  -- Canal por el que entró al CRM (primera toma de contacto)
  canal_origen     TEXT CHECK (canal_origen IN (
    'SilvIA-Voz', 'SilvIA-WhatsApp', 'SilvIA-Email', 'SilvIA-Valorador',
    'Idealista', 'Presencial', 'Referido', 'Manual'
  )),

  -- Contexto de la conversación / cualificación
  motivo           TEXT DEFAULT '',
  solicitud        TEXT DEFAULT '',
  conversaciones   TEXT DEFAULT '',
  observaciones    TEXT DEFAULT '',
  feedback         TEXT DEFAULT '',
  seccion          TEXT DEFAULT '',
  trabajado        TEXT DEFAULT '',

  -- Perfil de búsqueda (comprador/inquilino)
  presupuesto_min  NUMERIC,
  presupuesto_max  NUMERIC,
  habitaciones_min INTEGER,
  zonas            TEXT[] DEFAULT '{}',
  categoria        TEXT[] DEFAULT '{}',

  -- Perfil específico alquiler
  contrato_trabajo TEXT DEFAULT '',
  mascota          TEXT DEFAULT '',
  avalista         TEXT DEFAULT '',

  -- Control de duplicados
  duplicados       INTEGER DEFAULT 1,

  -- Documentos adjuntos [{ url, filename, type }]
  attachments      JSONB DEFAULT '[]',

  -- Migración desde Airtable
  airtable_id      TEXT UNIQUE,

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CONTACT ↔ AGENT (muchos a muchos, asignación general)
-- La asignación específica por gestión va en contact_roles
-- ============================================================
CREATE TABLE contact_agents (
  contact_id  UUID REFERENCES contacts(id) ON DELETE CASCADE,
  agent_id    UUID REFERENCES agents(id)   ON DELETE CASCADE,
  PRIMARY KEY (contact_id, agent_id)
);

-- ============================================================
-- PROPERTIES (Inmuebles)
-- ============================================================
CREATE TABLE properties (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ref                 TEXT UNIQUE,

  -- Clasificación
  tipo                TEXT DEFAULT '',       -- Piso, Casa, Local, Garaje...
  categoria           TEXT DEFAULT '',       -- Venta, Alquiler
  es_alquiler         BOOLEAN DEFAULT FALSE,

  -- Ubicación
  calle               TEXT DEFAULT '',
  numero              TEXT DEFAULT '',
  piso                TEXT DEFAULT '',
  puerta              TEXT DEFAULT '',
  barrio              TEXT DEFAULT '',
  localidad           TEXT DEFAULT '',
  provincia           TEXT DEFAULT '',
  cp                  TEXT DEFAULT '',
  coordenadas         JSONB,                 -- { lat, lng }

  -- Características físicas
  metros_construidos  NUMERIC,
  metros_utiles       NUMERIC,
  habitaciones        INTEGER,
  banos               INTEGER,
  orientacion         TEXT DEFAULT '',
  descripcion         TEXT DEFAULT '',
  caracteristicas     TEXT[] DEFAULT '{}',

  -- Precios
  precio              NUMERIC,
  precio_final        NUMERIC,

  -- Estado operativo
  estatus             TEXT DEFAULT 'Activo'
    CHECK (estatus IN ('Activo', 'Reservado', 'Vendido', 'Alquilado', 'Baja', 'Prospección')),

  -- Media [{ url, filename, orden }]
  imagenes            JSONB DEFAULT '[]',
  documentos          JSONB DEFAULT '[]',

  -- Agente responsable del inmueble
  agente_id           UUID REFERENCES agents(id),

  -- Migración desde Airtable
  airtable_id         TEXT UNIQUE,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CONTACT ROLES (Multi-rol por contacto)
-- Un mismo contacto puede ser Propietario + Comprador a la vez.
-- Cada rol tiene su propio agente, propiedad y estado.
-- ============================================================
CREATE TABLE contact_roles (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id   UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

  -- Qué papel tiene en esta gestión
  tipo         TEXT NOT NULL
    CHECK (tipo IN ('Propietario', 'Comprador', 'Inquilino', 'Arrendador')),

  -- Estado de esta gestión concreta
  estado       TEXT NOT NULL DEFAULT 'Prospecto'
    CHECK (estado IN ('Prospecto', 'Activo', 'Cerrado', 'Descartado')),

  -- Agente asignado a ESTA gestión (puede ser distinto al general)
  agente_id    UUID REFERENCES agents(id),

  -- Inmueble vinculado (obligatorio para Propietario, Inquilino, Arrendador)
  property_id  UUID REFERENCES properties(id),

  -- Preferencias de búsqueda (Comprador / Inquilino sin propiedad aún)
  presupuesto_min  NUMERIC,
  presupuesto_max  NUMERIC,
  zonas_busqueda   TEXT[] DEFAULT '{}',
  habitaciones_min INTEGER,

  -- Documento que activó el rol
  -- 'Hoja de encargo' → Propietario/Arrendador
  -- 'Arras'           → Comprador
  -- 'Contrato'        → Inquilino
  tipo_documento   TEXT,
  fecha_documento  DATE,

  -- Fechas del ciclo de esta gestión
  fecha_inicio     TIMESTAMPTZ DEFAULT NOW(),
  fecha_conversion TIMESTAMPTZ,   -- firmó el documento
  fecha_cierre     TIMESTAMPTZ,   -- gestión finalizada

  notas            TEXT DEFAULT '',

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- OPERATIONS (Transacciones / Gestiones cerradas)
-- Registra la operación una vez completada con su comisión.
-- ============================================================
CREATE TABLE operations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo              TEXT NOT NULL
    CHECK (tipo IN ('Venta', 'Alquiler', 'Valoración', 'Servicio')),
  estado            TEXT NOT NULL DEFAULT 'Abierta'
    CHECK (estado IN ('Abierta', 'En negociación', 'Cerrada', 'Cancelada')),

  property_id       UUID REFERENCES properties(id),
  agente_id         UUID REFERENCES agents(id),

  -- Partes de la operación
  vendedor_id       UUID REFERENCES contacts(id),   -- Propietario / Arrendador
  comprador_id      UUID REFERENCES contacts(id),   -- Comprador / Inquilino

  -- Económico
  precio_operacion  NUMERIC,
  comision_pct      NUMERIC,
  comision_total    NUMERIC,

  -- Fechas
  fecha_apertura    TIMESTAMPTZ DEFAULT NOW(),
  fecha_cierre      TIMESTAMPTZ,

  notas             TEXT DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VISITS (Visitas a inmuebles)
-- ============================================================
CREATE TABLE visits (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id       UUID REFERENCES properties(id),
  contact_id        UUID REFERENCES contacts(id),
  agente_id         UUID REFERENCES agents(id),

  fecha             TIMESTAMPTZ NOT NULL,
  duracion_minutos  INTEGER,
  estado            TEXT DEFAULT 'Programada'
    CHECK (estado IN ('Programada', 'Realizada', 'Cancelada')),

  notas             TEXT DEFAULT '',
  airtable_id       TEXT UNIQUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEGUIMIENTO (Historial de acciones por contacto)
-- Reemplaza el campo observaciones en texto plano de Airtable.
-- ============================================================
CREATE TABLE seguimiento (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  agente_id   UUID REFERENCES agents(id),

  tipo        TEXT DEFAULT 'Nota'
    CHECK (tipo IN ('Llamada', 'WhatsApp', 'Email', 'Visita', 'Nota', 'SilvIA')),
  texto       TEXT NOT NULL,

  fecha       TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
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

-- ============================================================
-- AUTO updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER t_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER t_contact_roles_updated_at
  BEFORE UPDATE ON contact_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER t_agents_updated_at
  BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (base — afinar según necesidades)
-- ============================================================
ALTER TABLE contacts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties     ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_roles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits         ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguimiento    ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations     ENABLE ROW LEVEL SECURITY;

-- Por ahora: acceso total con service_role (para la app y migraciones)
-- Cuando haya auth de usuarios, añadir políticas por agente_id
CREATE POLICY "service_role_all" ON contacts      USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON properties    USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON contact_roles USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON agents        USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON visits        USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON seguimiento   USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "service_role_all" ON operations    USING (TRUE) WITH CHECK (TRUE);
