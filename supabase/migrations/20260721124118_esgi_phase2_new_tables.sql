-- Migración de reconciliación (objetivo 4, 19 ago 2026).
-- Este archivo representa un cambio que YA está aplicado en producción bajo la
-- versión 20260721124118 (nombre 'esgi_phase2_new_tables' en supabase_migrations.schema_migrations).
-- No ejecutar de nuevo manualmente. Contenido copiado tal cual desde la fuente
-- disponible en elsol-client-hub/supabase/esgi-migrations/20260721000003_esgi_phase2_new_tables.sql
-- para que este repositorio tenga un registro reproducible — ver CLAUDE.md.
-- Si en algún momento se detecta que no coincide exactamente con el esquema real,
-- verificar contra la base de datos y corregir este archivo (no re-ejecutar a ciegas).

-- ============================================================
-- ESGI Phase 2 / Step 3: Crear 14 tablas nuevas (nombres español)
-- Target: branch de ESGI (fyrfkbcabmitbfuqeccq)
-- Orden: de menor a mayor dependencia FK.
-- Las funciones RLS es_admin()/es_staff_crm() se crean en el paso 4
-- (después de que estas tablas existan). Las políticas de staff se
-- añaden también en el paso 4.
-- ============================================================


-- ─── 1. roles_usuario  (≈ user_roles) ────────────────────
CREATE TABLE IF NOT EXISTS public.roles_usuario (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rol        TEXT        NOT NULL CHECK (rol IN ('admin','agente','cliente')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, rol)
);
ALTER TABLE public.roles_usuario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuarios ven sus propios roles"
  ON public.roles_usuario FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_roles_usuario_user_id ON public.roles_usuario(user_id);


-- ─── 2. perfiles  (≈ profiles) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.perfiles (
  id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre     TEXT,
  telefono   TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuarios ven su propio perfil"
  ON public.perfiles FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY "usuarios actualizan su propio perfil"
  ON public.perfiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER trg_perfiles_updated_at
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ─── 3. propietarios  (≈ owners) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.propietarios (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id UUID        REFERENCES public.contacts(id) ON DELETE SET NULL,
  nombre     TEXT        NOT NULL,
  email      TEXT,
  telefono   TEXT,
  dni        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.propietarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "propietario ve su propio registro"
  ON public.propietarios FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE TRIGGER trg_propietarios_updated_at
  BEFORE UPDATE ON public.propietarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE INDEX IF NOT EXISTS idx_propietarios_user_id   ON public.propietarios(user_id);
CREATE INDEX IF NOT EXISTS idx_propietarios_contact_id ON public.propietarios(contact_id);


-- ─── 4. propietario_inmueble  (≈ owner_property) ─────────
CREATE TABLE IF NOT EXISTS public.propietario_inmueble (
  propietario_id UUID    NOT NULL REFERENCES public.propietarios(id) ON DELETE CASCADE,
  property_id    UUID    NOT NULL REFERENCES public.properties(id)   ON DELETE CASCADE,
  tipo_propiedad TEXT    NOT NULL DEFAULT 'TOTAL'
    CHECK (tipo_propiedad IN ('TOTAL','PARCIAL','USUFRUCTO')),
  porcentaje     NUMERIC DEFAULT 100
    CHECK (porcentaje > 0 AND porcentaje <= 100),
  fecha_inicio   DATE,
  PRIMARY KEY (propietario_id, property_id)
);
ALTER TABLE public.propietario_inmueble ENABLE ROW LEVEL SECURITY;
CREATE POLICY "propietarios ven sus inmuebles"
  ON public.propietario_inmueble FOR SELECT TO authenticated
  USING (propietario_id IN (
    SELECT id FROM public.propietarios WHERE user_id = auth.uid()
  ));
CREATE INDEX IF NOT EXISTS idx_propietario_inmueble_property ON public.propietario_inmueble(property_id);


-- ─── 5. documentos  (≈ documents) ────────────────────────
CREATE TABLE IF NOT EXISTS public.documentos (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         UUID        REFERENCES public.properties(id)  ON DELETE SET NULL,
  contact_id          UUID        REFERENCES public.contacts(id)    ON DELETE SET NULL,
  operation_id        UUID        REFERENCES public.operations(id)  ON DELETE SET NULL,
  subido_por          UUID        REFERENCES auth.users(id)         ON DELETE SET NULL,
  nombre              TEXT        NOT NULL,
  tipo_mime           TEXT        NOT NULL,
  storage_path        TEXT        NOT NULL,
  tamano_bytes        BIGINT,
  categoria           TEXT        CHECK (categoria IN (
                        'contrato','escritura','nota_encargo','dni','certificado','otro')),
  estado              TEXT        NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente','firmado','rechazado','archivado')),
  docuten_envelope_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "propietario ve documentos de sus inmuebles"
  ON public.documentos FOR SELECT TO authenticated
  USING (
    subido_por = auth.uid()
    OR property_id IN (
      SELECT pi.property_id
      FROM public.propietario_inmueble pi
      JOIN public.propietarios p ON p.id = pi.propietario_id
      WHERE p.user_id = auth.uid()
    )
  );
CREATE TRIGGER trg_documentos_updated_at
  BEFORE UPDATE ON public.documentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE INDEX IF NOT EXISTS idx_documentos_property  ON public.documentos(property_id);
CREATE INDEX IF NOT EXISTS idx_documentos_contact   ON public.documentos(contact_id);
CREATE INDEX IF NOT EXISTS idx_documentos_operation ON public.documentos(operation_id);
CREATE INDEX IF NOT EXISTS idx_documentos_envelope  ON public.documentos(docuten_envelope_id)
  WHERE docuten_envelope_id IS NOT NULL;


-- ─── 6. transacciones_docuten  (≈ docuten_transactions) ──
CREATE TABLE IF NOT EXISTS public.transacciones_docuten (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id        UUID        REFERENCES public.documentos(id)  ON DELETE SET NULL,
  property_id         UUID        REFERENCES public.properties(id)  ON DELETE SET NULL,
  tipo_documento      TEXT        NOT NULL,
  envelope_id         TEXT        UNIQUE,
  estado              TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (estado IN ('pending','sent','signed','rejected','expired','error')),
  url_firma           TEXT,
  firmado_por_nombre  TEXT,
  firmado_por_email   TEXT,
  metadata            JSONB       DEFAULT '{}',
  firmado_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.transacciones_docuten ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated lee transacciones docuten"
  ON public.transacciones_docuten FOR SELECT TO authenticated
  USING (true);
CREATE TRIGGER trg_transacciones_docuten_updated_at
  BEFORE UPDATE ON public.transacciones_docuten
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE INDEX IF NOT EXISTS idx_tx_docuten_envelope  ON public.transacciones_docuten(envelope_id);
CREATE INDEX IF NOT EXISTS idx_tx_docuten_property  ON public.transacciones_docuten(property_id);


-- ─── 7. fichas_portal  (≈ portal_listings) ───────────────
CREATE TABLE IF NOT EXISTS public.fichas_portal (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       UUID        NOT NULL UNIQUE
                      REFERENCES public.properties(id) ON DELETE CASCADE,
  activo            BOOLEAN     NOT NULL DEFAULT false,
  destacado         BOOLEAN     NOT NULL DEFAULT false,
  orden             INT         DEFAULT 0,
  descripcion_portal TEXT,
  precio_portal     NUMERIC,
  imagenes_portal   JSONB       DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fichas_portal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon ve fichas activas"
  ON public.fichas_portal FOR SELECT TO anon
  USING (activo = true);
CREATE POLICY "authenticated ve todas las fichas"
  ON public.fichas_portal FOR SELECT TO authenticated
  USING (true);
CREATE TRIGGER trg_fichas_portal_updated_at
  BEFORE UPDATE ON public.fichas_portal
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE INDEX IF NOT EXISTS idx_fichas_portal_activo
  ON public.fichas_portal(activo) WHERE activo = true;


-- ─── 8. historial_ofertas  (≈ offer_history) ─────────────
CREATE TABLE IF NOT EXISTS public.historial_ofertas (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id UUID        NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  contact_id   UUID        REFERENCES public.contacts(id)            ON DELETE SET NULL,
  agente_id    UUID        REFERENCES public.agents(id)              ON DELETE SET NULL,
  tipo         TEXT        NOT NULL
                CHECK (tipo IN ('OFERTA','CONTRAOFERTA','ACEPTADA','RECHAZADA')),
  importe      NUMERIC     NOT NULL,
  condiciones  TEXT        DEFAULT '',
  fecha        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.historial_ofertas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated ve historial ofertas"
  ON public.historial_ofertas FOR SELECT TO authenticated
  USING (true);
CREATE INDEX IF NOT EXISTS idx_historial_ofertas_operation ON public.historial_ofertas(operation_id);


-- ─── 9. tareas  (≈ tasks) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tareas (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        TEXT        NOT NULL,
  descripcion   TEXT        DEFAULT '',
  asignado_a    UUID        REFERENCES public.agents(id)     ON DELETE SET NULL,
  contact_id    UUID        REFERENCES public.contacts(id)   ON DELETE SET NULL,
  property_id   UUID        REFERENCES public.properties(id) ON DELETE SET NULL,
  operation_id  UUID        REFERENCES public.operations(id) ON DELETE SET NULL,
  estado        TEXT        NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente','en_progreso','completada','cancelada')),
  prioridad     TEXT        NOT NULL DEFAULT 'media'
                  CHECK (prioridad IN ('baja','media','alta','urgente')),
  fecha_limite  TIMESTAMPTZ,
  completada_at TIMESTAMPTZ,
  creado_por    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tareas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated ve tareas"
  ON public.tareas FOR SELECT TO authenticated
  USING (true);
CREATE TRIGGER trg_tareas_updated_at
  BEFORE UPDATE ON public.tareas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE INDEX IF NOT EXISTS idx_tareas_asignado    ON public.tareas(asignado_a);
CREATE INDEX IF NOT EXISTS idx_tareas_estado      ON public.tareas(estado);
CREATE INDEX IF NOT EXISTS idx_tareas_fecha_limite ON public.tareas(fecha_limite)
  WHERE fecha_limite IS NOT NULL;


-- ─── 10. incorporacion_inmueble  (≈ property_onboarding) ─
CREATE TABLE IF NOT EXISTS public.incorporacion_inmueble (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id          UUID        NOT NULL UNIQUE
                         REFERENCES public.properties(id) ON DELETE CASCADE,
  nota_encargo         BOOLEAN     DEFAULT false,
  fotos                BOOLEAN     DEFAULT false,
  plano                BOOLEAN     DEFAULT false,
  descripcion          BOOLEAN     DEFAULT false,
  publicado_web        BOOLEAN     DEFAULT false,
  publicado_portales   BOOLEAN     DEFAULT false,
  notas                TEXT        DEFAULT '',
  completado_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.incorporacion_inmueble ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated ve incorporacion"
  ON public.incorporacion_inmueble FOR SELECT TO authenticated
  USING (true);
CREATE TRIGGER trg_incorporacion_updated_at
  BEFORE UPDATE ON public.incorporacion_inmueble
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ─── 11. estadisticas_diarias  (≈ property_stats_daily) ──
CREATE TABLE IF NOT EXISTS public.estadisticas_diarias (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       UUID        NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  fecha             DATE        NOT NULL,
  visitas_web       INT         DEFAULT 0,
  visitas_portales  INT         DEFAULT 0,
  contactos         INT         DEFAULT 0,
  favoritos         INT         DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (property_id, fecha)
);
ALTER TABLE public.estadisticas_diarias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "propietario ve estadisticas de sus inmuebles"
  ON public.estadisticas_diarias FOR SELECT TO authenticated
  USING (property_id IN (
    SELECT pi.property_id
    FROM public.propietario_inmueble pi
    JOIN public.propietarios p ON p.id = pi.propietario_id
    WHERE p.user_id = auth.uid()
  ));
CREATE INDEX IF NOT EXISTS idx_estadisticas_property_fecha
  ON public.estadisticas_diarias(property_id, fecha DESC);


-- ─── 12. solicitudes_servicio  (≈ service_requests) ──────
CREATE TABLE IF NOT EXISTS public.solicitudes_servicio (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    UUID        REFERENCES public.properties(id)  ON DELETE SET NULL,
  contact_id     UUID        REFERENCES public.contacts(id)    ON DELETE SET NULL,
  solicitado_por UUID        REFERENCES auth.users(id)         ON DELETE SET NULL,
  agente_id      UUID        REFERENCES public.agents(id)      ON DELETE SET NULL,
  tipo           TEXT        NOT NULL CHECK (tipo IN (
                   'limpieza','mantenimiento','fotografia',
                   'valoracion','juridico','otro')),
  descripcion    TEXT        DEFAULT '',
  estado         TEXT        NOT NULL DEFAULT 'nueva'
                   CHECK (estado IN ('nueva','asignada','en_proceso','completada','cancelada')),
  resolucion     TEXT        DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.solicitudes_servicio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solicitante ve sus solicitudes"
  ON public.solicitudes_servicio FOR SELECT TO authenticated
  USING (solicitado_por = auth.uid());
CREATE TRIGGER trg_solicitudes_updated_at
  BEFORE UPDATE ON public.solicitudes_servicio
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE INDEX IF NOT EXISTS idx_solicitudes_property ON public.solicitudes_servicio(property_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado   ON public.solicitudes_servicio(estado);


-- ─── 13. notificaciones  (≈ notifications) ───────────────
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo       TEXT        NOT NULL CHECK (tipo IN (
               'documento','visita','tarea','oferta','solicitud','sistema')),
  titulo     TEXT        NOT NULL,
  mensaje    TEXT        NOT NULL,
  leida      BOOLEAN     NOT NULL DEFAULT false,
  enlace     TEXT,
  metadata   JSONB       DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuarios ven sus notificaciones"
  ON public.notificaciones FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "usuarios marcan leida sus notificaciones"
  ON public.notificaciones FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_notificaciones_user
  ON public.notificaciones(user_id, leida);
CREATE INDEX IF NOT EXISTS idx_notificaciones_created
  ON public.notificaciones(created_at DESC);


-- ─── 14. linea_actividad  (≈ activity_timeline) ──────────
CREATE TABLE IF NOT EXISTS public.linea_actividad (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID        REFERENCES public.properties(id)  ON DELETE SET NULL,
  contact_id   UUID        REFERENCES public.contacts(id)    ON DELETE SET NULL,
  operation_id UUID        REFERENCES public.operations(id)  ON DELETE SET NULL,
  actor_id     UUID        REFERENCES auth.users(id)         ON DELETE SET NULL,
  tipo_evento  TEXT        NOT NULL CHECK (tipo_evento IN (
                 'visita','documento','firma','oferta','cambio_estado',
                 'nota','tarea','solicitud','contacto')),
  descripcion  TEXT        NOT NULL,
  metadata     JSONB       DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.linea_actividad ENABLE ROW LEVEL SECURITY;
CREATE POLICY "propietario ve actividad de sus inmuebles"
  ON public.linea_actividad FOR SELECT TO authenticated
  USING (
    actor_id = auth.uid()
    OR property_id IN (
      SELECT pi.property_id
      FROM public.propietario_inmueble pi
      JOIN public.propietarios p ON p.id = pi.propietario_id
      WHERE p.user_id = auth.uid()
    )
  );
CREATE INDEX IF NOT EXISTS idx_linea_actividad_property
  ON public.linea_actividad(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_linea_actividad_contact
  ON public.linea_actividad(contact_id, created_at DESC);
