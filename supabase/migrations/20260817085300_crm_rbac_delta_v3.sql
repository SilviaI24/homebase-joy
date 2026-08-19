-- RBAC sin scope de datos para ESGI CRM.
-- Aplicar a la branch rbac-p0 (bgotqyqvaxknmemgjskt), nunca directamente a producción.
--
-- Decisiones de diseño:
--   · Sin alcance_datos / alcance_max / alcance: el equipo comparte toda la información.
--   · ALLOW/DENY individual por capability — la granularidad está en las excepciones.
--   · SECURITY DEFINER + search_path = '' en todas las funciones privilegiadas.
--   · crm_auditoria_permisos es append-only: triggers bloquean UPDATE/DELETE/TRUNCATE.
--   · Protección del último admin: advisory lock evita condición de carrera.
--   · crm_permisos y crm_permisos_rol sin policy auth_read (catálogo solo vía backend).

BEGIN;

-- Preflight: el administrador inicial debe existir antes de aplicar la migración.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) = lower('ai@elsolgrupo.com')
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'crm_rbac_delta_v3: no existe ai@elsolgrupo.com en auth.users; migración cancelada'
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- ── 0. Helper updated_at ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── 1. crm_usuarios ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_usuarios (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id   UUID UNIQUE REFERENCES public.agents(id) ON DELETE SET NULL,
  rol_base   TEXT NOT NULL
    CHECK (rol_base IN ('ADMIN','FINANCIERO','COMERCIAL_ADMINISTRATIVO')),
  activo     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_usuarios_agent_id
  ON public.crm_usuarios(agent_id);
CREATE INDEX IF NOT EXISTS idx_crm_usuarios_rol_activo
  ON public.crm_usuarios(rol_base) WHERE activo = true;

CREATE TRIGGER trg_crm_usuarios_updated_at
  BEFORE UPDATE ON public.crm_usuarios
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

ALTER TABLE public.crm_usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_crm_usuarios" ON public.crm_usuarios
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "crm_usuario_lee_su_perfil" ON public.crm_usuarios
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── 2. Protección del último admin ────────────────────────────────────────────
-- Advisory lock impide condición de carrera si dos sesiones degradan simultáneamente
-- a los dos últimos admins.
CREATE OR REPLACE FUNCTION public.crm_check_last_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_es_baja_admin BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_es_baja_admin := OLD.rol_base = 'ADMIN' AND OLD.activo = true;
  ELSE
    v_es_baja_admin := OLD.rol_base = 'ADMIN'
      AND OLD.activo = true
      AND (NEW.rol_base <> 'ADMIN' OR NEW.activo = false);
  END IF;

  IF v_es_baja_admin THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('crm_last_admin_check')
    );

    IF NOT EXISTS (
      SELECT 1
      FROM public.crm_usuarios
      WHERE rol_base = 'ADMIN'
        AND activo = true
        AND user_id <> OLD.user_id
    ) THEN
      RAISE EXCEPTION
        'crm_last_admin: debe existir al menos un administrador activo'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_check_last_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.crm_check_last_admin() TO service_role;

CREATE TRIGGER trg_crm_last_admin
  BEFORE UPDATE OR DELETE ON public.crm_usuarios
  FOR EACH ROW EXECUTE FUNCTION public.crm_check_last_admin();

-- ── 3. crm_equipos + crm_equipo_miembros ──────────────────────────────────────
-- Placeholder para futura multi-oficina. Actualmente EQUIPO = todos los datos.
CREATE TABLE IF NOT EXISTS public.crm_equipos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT NOT NULL UNIQUE,
  descripcion TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_equipos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srvc_all"  ON public.crm_equipos
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "auth_read" ON public.crm_equipos
  FOR SELECT TO authenticated USING (activo = true);

CREATE TABLE IF NOT EXISTS public.crm_equipo_miembros (
  equipo_id  UUID NOT NULL REFERENCES public.crm_equipos(id)       ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.crm_usuarios(user_id) ON DELETE CASCADE,
  PRIMARY KEY (equipo_id, user_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_equipo_mbrs_user
  ON public.crm_equipo_miembros(user_id);

ALTER TABLE public.crm_equipo_miembros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srvc_all"  ON public.crm_equipo_miembros
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "self_read" ON public.crm_equipo_miembros
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── 4. crm_permisos — catálogo de capacidades ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_permisos (
  clave       TEXT PRIMARY KEY,
  dominio     TEXT NOT NULL,
  accion      TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  sensible    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_permisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_crm_permisos" ON public.crm_permisos
  TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.crm_permisos (clave, dominio, accion, descripcion, sensible) VALUES
  -- Contactos
  ('contacts.read',              'contacts',      'read',            'Ver contactos y sus datos personales',          false),
  ('contacts.create',            'contacts',      'create',          'Crear nuevos contactos',                        false),
  ('contacts.update',            'contacts',      'update',          'Editar datos de contactos',                     false),
  ('contacts.archive',           'contacts',      'archive',         'Archivar contacto (soft, reversible)',           false),
  ('contacts.delete_hard',       'contacts',      'delete_hard',     'Eliminar contacto de forma permanente',          true),
  ('contacts.export',            'contacts',      'export',          'Exportar datos personales en CSV/XLS masivo',    true),
  -- Pipeline
  ('contact_roles.read',         'contact_roles', 'read',            'Ver el estado del pipeline',                    false),
  ('contact_roles.create',       'contact_roles', 'create',          'Añadir contacto al pipeline de un inmueble',    false),
  ('contact_roles.update',       'contact_roles', 'update',          'Cambiar estado en el pipeline',                 false),
  ('contact_roles.delete',       'contact_roles', 'delete',          'Eliminar entrada del pipeline',                  true),
  -- Inmuebles
  ('properties.read',            'properties',    'read',            'Ver inmuebles y sus documentos',                false),
  ('properties.create',          'properties',    'create',          'Crear nuevos inmuebles',                        false),
  ('properties.update',          'properties',    'update',          'Editar campos básicos de inmuebles',            false),
  ('properties.status_final',    'properties',    'status_final',    'Cambiar estatus a Vendido, Alquilado o Baja',    true),
  ('properties.publish',         'properties',    'publish',         'Cambiar estado de publicación del inmueble',    false),
  ('properties.delete_hard',     'properties',    'delete_hard',     'Eliminar inmueble de forma permanente',          true),
  -- Documentos
  ('documents.upload',           'documents',     'upload',          'Subir archivos adjuntos a property-docs',       false),
  ('documents.delete',           'documents',     'delete',          'Eliminar archivos de property-docs',             true),
  -- Visitas
  ('visits.read',                'visits',        'read',            'Ver visitas',                                   false),
  ('visits.create',              'visits',        'create',          'Crear visitas',                                 false),
  ('visits.update',              'visits',        'update',          'Editar visitas',                                false),
  ('visits.delete',              'visits',        'delete',          'Eliminar visitas',                               true),
  -- Seguimiento
  ('seguimiento.read',           'seguimiento',   'read',            'Ver log de comunicaciones',                     false),
  ('seguimiento.create',         'seguimiento',   'create',          'Registrar comunicación en el log',              false),
  -- Operaciones
  ('operations.read',            'operations',    'read',            'Ver operaciones sin precio ni comisión',        false),
  ('operations.read_financiero', 'operations',    'read_financiero', 'Ver precio de operación y comisiones',           true),
  ('operations.create',          'operations',    'create',          'Abrir nueva operación',                         false),
  ('operations.close',           'operations',    'close',           'Cerrar y validar operación (acto financiero)',   true),
  -- SilvIA
  ('silvia.use',                 'silvia',        'use',             'Usar el chat SilvIA (consultas y lectura)',     false),
  ('silvia.execute_actions',     'silvia',        'execute_actions', 'SilvIA puede ejecutar herramientas mutantes',   false),
  -- Comunicaciones
  ('whatsapp.send',              'communications','send_wa',         'Enviar WhatsApp a contactos',                    true),
  ('email.send',                 'communications','send_email',      'Enviar email a contactos',                       true),
  -- Administración
  ('users.manage',               'admin',         'manage_users',    'Gestionar usuarios y roles del CRM',             true),
  ('permissions.manage',         'admin',         'manage_perms',    'Crear o revocar excepciones de permiso',         true),
  ('config.manage',              'admin',         'manage_config',   'Configurar integraciones y sistema',             true),
  ('audit.read',                 'admin',         'read_audit',      'Ver el log de auditoría de permisos',            true)
ON CONFLICT (clave) DO NOTHING;

-- ── 5. crm_permisos_rol — presets por rol (sin alcance_max) ───────────────────
CREATE TABLE IF NOT EXISTS public.crm_permisos_rol (
  rol_base      TEXT NOT NULL
    CHECK (rol_base IN ('ADMIN','FINANCIERO','COMERCIAL_ADMINISTRATIVO')),
  permiso_clave TEXT NOT NULL REFERENCES public.crm_permisos(clave) ON DELETE CASCADE,
  permitido     BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (rol_base, permiso_clave)
);

ALTER TABLE public.crm_permisos_rol ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_crm_permisos_rol" ON public.crm_permisos_rol
  TO service_role USING (true) WITH CHECK (true);

-- ADMIN: acceso total
INSERT INTO public.crm_permisos_rol (rol_base, permiso_clave, permitido)
SELECT 'ADMIN', clave, true FROM public.crm_permisos
ON CONFLICT (rol_base, permiso_clave) DO NOTHING;

-- FINANCIERO: lee todo, opera financiero; no escribe ni gestiona
INSERT INTO public.crm_permisos_rol (rol_base, permiso_clave, permitido) VALUES
  ('FINANCIERO', 'contacts.read',              true),
  ('FINANCIERO', 'contacts.create',            false),
  ('FINANCIERO', 'contacts.update',            false),
  ('FINANCIERO', 'contacts.archive',           false),
  ('FINANCIERO', 'contacts.delete_hard',       false),
  ('FINANCIERO', 'contacts.export',            false),
  ('FINANCIERO', 'contact_roles.read',         true),
  ('FINANCIERO', 'contact_roles.create',       false),
  ('FINANCIERO', 'contact_roles.update',       false),
  ('FINANCIERO', 'contact_roles.delete',       false),
  ('FINANCIERO', 'properties.read',            true),
  ('FINANCIERO', 'properties.create',          false),
  ('FINANCIERO', 'properties.update',          false),
  ('FINANCIERO', 'properties.status_final',    false),
  ('FINANCIERO', 'properties.publish',         false),
  ('FINANCIERO', 'properties.delete_hard',     false),
  ('FINANCIERO', 'documents.upload',           false),
  ('FINANCIERO', 'documents.delete',           false),
  ('FINANCIERO', 'visits.read',                true),
  ('FINANCIERO', 'visits.create',              false),
  ('FINANCIERO', 'visits.update',              false),
  ('FINANCIERO', 'visits.delete',              false),
  ('FINANCIERO', 'seguimiento.read',           true),
  ('FINANCIERO', 'seguimiento.create',         false),
  ('FINANCIERO', 'operations.read',            true),
  ('FINANCIERO', 'operations.read_financiero', true),
  ('FINANCIERO', 'operations.create',          true),
  ('FINANCIERO', 'operations.close',           true),
  ('FINANCIERO', 'silvia.use',                 true),
  ('FINANCIERO', 'silvia.execute_actions',     false),
  ('FINANCIERO', 'whatsapp.send',              false),
  ('FINANCIERO', 'email.send',                 false),
  ('FINANCIERO', 'users.manage',               false),
  ('FINANCIERO', 'permissions.manage',         false),
  ('FINANCIERO', 'config.manage',              false),
  ('FINANCIERO', 'audit.read',                 false)
ON CONFLICT (rol_base, permiso_clave) DO NOTHING;

-- COMERCIAL_ADMINISTRATIVO: operativa comercial completa; sin financiero ni admin
INSERT INTO public.crm_permisos_rol (rol_base, permiso_clave, permitido) VALUES
  ('COMERCIAL_ADMINISTRATIVO', 'contacts.read',              true),
  ('COMERCIAL_ADMINISTRATIVO', 'contacts.create',            true),
  ('COMERCIAL_ADMINISTRATIVO', 'contacts.update',            true),
  ('COMERCIAL_ADMINISTRATIVO', 'contacts.archive',           true),
  ('COMERCIAL_ADMINISTRATIVO', 'contacts.delete_hard',       false),
  ('COMERCIAL_ADMINISTRATIVO', 'contacts.export',            false),
  ('COMERCIAL_ADMINISTRATIVO', 'contact_roles.read',         true),
  ('COMERCIAL_ADMINISTRATIVO', 'contact_roles.create',       true),
  ('COMERCIAL_ADMINISTRATIVO', 'contact_roles.update',       true),
  ('COMERCIAL_ADMINISTRATIVO', 'contact_roles.delete',       false),
  ('COMERCIAL_ADMINISTRATIVO', 'properties.read',            true),
  ('COMERCIAL_ADMINISTRATIVO', 'properties.create',          true),
  ('COMERCIAL_ADMINISTRATIVO', 'properties.update',          true),
  ('COMERCIAL_ADMINISTRATIVO', 'properties.status_final',    false),
  ('COMERCIAL_ADMINISTRATIVO', 'properties.publish',         true),
  ('COMERCIAL_ADMINISTRATIVO', 'properties.delete_hard',     false),
  ('COMERCIAL_ADMINISTRATIVO', 'documents.upload',           true),
  ('COMERCIAL_ADMINISTRATIVO', 'documents.delete',           false),
  ('COMERCIAL_ADMINISTRATIVO', 'visits.read',                true),
  ('COMERCIAL_ADMINISTRATIVO', 'visits.create',              true),
  ('COMERCIAL_ADMINISTRATIVO', 'visits.update',              true),
  ('COMERCIAL_ADMINISTRATIVO', 'visits.delete',              false),
  ('COMERCIAL_ADMINISTRATIVO', 'seguimiento.read',           true),
  ('COMERCIAL_ADMINISTRATIVO', 'seguimiento.create',         true),
  ('COMERCIAL_ADMINISTRATIVO', 'operations.read',            true),
  ('COMERCIAL_ADMINISTRATIVO', 'operations.read_financiero', false),
  ('COMERCIAL_ADMINISTRATIVO', 'operations.create',          true),
  ('COMERCIAL_ADMINISTRATIVO', 'operations.close',           false),
  ('COMERCIAL_ADMINISTRATIVO', 'silvia.use',                 true),
  ('COMERCIAL_ADMINISTRATIVO', 'silvia.execute_actions',     true),
  ('COMERCIAL_ADMINISTRATIVO', 'whatsapp.send',              true),
  ('COMERCIAL_ADMINISTRATIVO', 'email.send',                 true),
  ('COMERCIAL_ADMINISTRATIVO', 'users.manage',               false),
  ('COMERCIAL_ADMINISTRATIVO', 'permissions.manage',         false),
  ('COMERCIAL_ADMINISTRATIVO', 'config.manage',              false),
  ('COMERCIAL_ADMINISTRATIVO', 'audit.read',                 false)
ON CONFLICT (rol_base, permiso_clave) DO NOTHING;

-- ── 6. crm_permisos_usuario — excepciones individuales ────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_permisos_usuario (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.crm_usuarios(user_id) ON DELETE CASCADE,
  permiso_clave TEXT NOT NULL REFERENCES public.crm_permisos(clave)   ON DELETE CASCADE,
  efecto        TEXT NOT NULL CHECK (efecto IN ('ALLOW','DENY')),
  motivo        TEXT NOT NULL CHECK (length(btrim(motivo)) > 0),
  otorgado_por  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expira_at     TIMESTAMPTZ,
  activo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, permiso_clave, efecto)
);

CREATE INDEX IF NOT EXISTS idx_crm_perm_usr_user
  ON public.crm_permisos_usuario(user_id) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_crm_perm_usr_expira
  ON public.crm_permisos_usuario(expira_at)
  WHERE activo = true AND expira_at IS NOT NULL;

ALTER TABLE public.crm_permisos_usuario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_crm_permisos_usuario" ON public.crm_permisos_usuario
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "crm_usuario_lee_sus_excepciones" ON public.crm_permisos_usuario
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Impide que el único admin con control quede bloqueado de users.manage / permissions.manage
-- mediante un DENY individual activo, dejando el sistema sin administrador efectivo.
CREATE OR REPLACE FUNCTION public.crm_preserve_admin_control()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_objetivo_es_admin         BOOLEAN;
  v_hay_otro_admin_con_control BOOLEAN;
BEGIN
  IF NEW.activo <> true
    OR NEW.efecto <> 'DENY'
    OR NEW.permiso_clave NOT IN ('users.manage', 'permissions.manage')
    OR (NEW.expira_at IS NOT NULL AND NEW.expira_at <= now())
  THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.crm_usuarios AS u
    WHERE u.user_id = NEW.user_id
      AND u.rol_base = 'ADMIN'
      AND u.activo = true
  ) INTO v_objetivo_es_admin;

  IF NOT v_objetivo_es_admin THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.crm_usuarios AS u
    WHERE u.user_id <> NEW.user_id
      AND u.rol_base = 'ADMIN'
      AND u.activo = true
      AND NOT EXISTS (
        SELECT 1
        FROM public.crm_permisos_usuario AS p
        WHERE p.user_id = u.user_id
          AND p.permiso_clave = NEW.permiso_clave
          AND p.efecto = 'DENY'
          AND p.activo = true
          AND (p.expira_at IS NULL OR p.expira_at > now())
      )
  ) INTO v_hay_otro_admin_con_control;

  IF NOT v_hay_otro_admin_con_control THEN
    RAISE EXCEPTION
      'crm_admin_control: debe quedar otro administrador con el permiso %',
      NEW.permiso_clave
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_preserve_admin_control() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.crm_preserve_admin_control() TO service_role;

CREATE TRIGGER trg_crm_preserve_admin_control
  BEFORE INSERT OR UPDATE ON public.crm_permisos_usuario
  FOR EACH ROW EXECUTE FUNCTION public.crm_preserve_admin_control();

-- ── 7. crm_silvia_intenciones — confirmación en dos fases ─────────────────────
CREATE TABLE IF NOT EXISTS public.crm_silvia_intenciones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name   TEXT NOT NULL,
  args        JSONB NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE','EJECUTADA','EXPIRADA','RECHAZADA')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_at   TIMESTAMPTZ NOT NULL DEFAULT now() + interval '5 minutes',
  executed_at TIMESTAMPTZ,
  resultado   JSONB
);

CREATE INDEX IF NOT EXISTS idx_silvia_intenciones_lookup
  ON public.crm_silvia_intenciones(user_id, estado, expira_at);
CREATE INDEX IF NOT EXISTS idx_silvia_intenciones_expira
  ON public.crm_silvia_intenciones(expira_at) WHERE estado = 'PENDIENTE';

ALTER TABLE public.crm_silvia_intenciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srvc_all" ON public.crm_silvia_intenciones
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "self_read" ON public.crm_silvia_intenciones
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── 8. crm_auditoria_permisos — inmutable (append-only) ───────────────────────
CREATE TABLE IF NOT EXISTS public.crm_auditoria_permisos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  afectado_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo_evento       TEXT NOT NULL
    CHECK (tipo_evento IN (
      'ROL_CAMBIO','PERMISO_OTORGADO','PERMISO_REVOCADO',
      'ACCESO_DENEGADO','ACCION_EJECUTADA','INTENT_CREADO','INTENT_EJECUTADO'
    )),
  permiso_clave     TEXT,
  rol_base_anterior TEXT,
  rol_base_nuevo    TEXT,
  alcance_anterior  TEXT,
  alcance_nuevo     TEXT,
  efecto            TEXT CHECK (efecto IN ('ALLOW','DENY')),
  motivo            TEXT,
  request_id        TEXT,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_audit_afectado
  ON public.crm_auditoria_permisos(afectado_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_audit_actor
  ON public.crm_auditoria_permisos(actor_id, created_at DESC);

ALTER TABLE public.crm_auditoria_permisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srvc_insert" ON public.crm_auditoria_permisos
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "srvc_select" ON public.crm_auditoria_permisos
  FOR SELECT TO service_role USING (true);

CREATE OR REPLACE FUNCTION public.crm_auditoria_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  RAISE EXCEPTION 'crm_auditoria_permisos es inmutable (append-only)'
    USING ERRCODE = 'P0001';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_auditoria_immutable() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.crm_auditoria_immutable() TO service_role;

CREATE TRIGGER trg_auditoria_immutable
  BEFORE UPDATE OR DELETE ON public.crm_auditoria_permisos
  FOR EACH ROW EXECUTE FUNCTION public.crm_auditoria_immutable();

CREATE TRIGGER trg_auditoria_no_truncate
  BEFORE TRUNCATE ON public.crm_auditoria_permisos
  FOR EACH STATEMENT EXECUTE FUNCTION public.crm_auditoria_immutable();

-- ── 9. Seed: equipo inicial ────────────────────────────────────────────────────
INSERT INTO public.crm_equipos (nombre, descripcion) VALUES
  ('Oficina Gijón', 'Equipo único de El Sol Grupo (oficina Gijón)')
ON CONFLICT (nombre) DO NOTHING;

-- ── 10. Seed: usuarios CRM ────────────────────────────────────────────────────
-- Admin: fail-closed. Si no existe, la migración entera revierte.
INSERT INTO public.crm_usuarios (user_id, agent_id, rol_base)
SELECT u.id, a.id, 'ADMIN'
FROM auth.users u
LEFT JOIN public.agents a ON lower(a.email) = lower(u.email)
WHERE lower(u.email) = lower('ai@elsolgrupo.com')
  AND u.deleted_at IS NULL
ON CONFLICT (user_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.crm_usuarios cu
    JOIN auth.users u ON u.id = cu.user_id
    WHERE lower(u.email) = lower('ai@elsolgrupo.com')
      AND cu.rol_base = 'ADMIN'
      AND cu.activo = true
  ) THEN
    RAISE EXCEPTION
      'crm_rbac_delta_v3: no se pudo insertar el administrador ai@elsolgrupo.com'
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- Agentes comerciales: idempotente, se omiten si no existen en auth.users.
INSERT INTO public.crm_usuarios (user_id, agent_id, rol_base)
SELECT u.id, a.id, 'COMERCIAL_ADMINISTRATIVO'
FROM auth.users u
LEFT JOIN public.agents a ON lower(a.email) = lower(u.email)
WHERE lower(u.email) IN (
  'gp@elsolgrupo.com',
  'rustica@elsolgrupo.com',
  'viviendas@elsolgrupo.com',
  'inmuebles@elsolgrupo.com'
)
  AND u.deleted_at IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- ── 11. Postflight: cardinalidad y estado del catálogo ────────────────────────
DO $$
DECLARE
  v_permisos  INT;
  v_rol_admin INT;
  v_rol_fin   INT;
  v_rol_com   INT;
  v_admin     INT;
BEGIN
  SELECT COUNT(*) INTO v_permisos  FROM public.crm_permisos;
  SELECT COUNT(*) INTO v_rol_admin FROM public.crm_permisos_rol WHERE rol_base = 'ADMIN';
  SELECT COUNT(*) INTO v_rol_fin   FROM public.crm_permisos_rol WHERE rol_base = 'FINANCIERO';
  SELECT COUNT(*) INTO v_rol_com   FROM public.crm_permisos_rol WHERE rol_base = 'COMERCIAL_ADMINISTRATIVO';
  SELECT COUNT(*) INTO v_admin
  FROM public.crm_usuarios cu
  JOIN auth.users u ON u.id = cu.user_id
  WHERE lower(u.email) = lower('ai@elsolgrupo.com')
    AND u.deleted_at IS NULL
    AND cu.rol_base = 'ADMIN'
    AND cu.activo = true;

  IF v_permisos <> 36 THEN
    RAISE EXCEPTION 'crm_permisos: esperadas 36 filas, hay %', v_permisos;
  END IF;
  IF v_rol_admin <> 36 THEN
    RAISE EXCEPTION 'ADMIN presets: esperados 36, hay %', v_rol_admin;
  END IF;
  IF v_rol_fin <> 36 THEN
    RAISE EXCEPTION 'FINANCIERO presets: esperados 36, hay %', v_rol_fin;
  END IF;
  IF v_rol_com <> 36 THEN
    RAISE EXCEPTION 'COMERCIAL presets: esperados 36, hay %', v_rol_com;
  END IF;
  IF v_admin <> 1 THEN
    RAISE EXCEPTION
      'crm_rbac_delta_v3: esperado 1 administrador activo (ai@elsolgrupo.com), hay %',
      v_admin;
  END IF;
END $$;

COMMIT;
