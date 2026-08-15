-- Migration: crm_rbac_initial
-- Branch: ESGI rbac-p0 (lqiabtjiwwlauuerrgab)
-- Aplicar SOLO a la branch vía MCP apply_migration, nunca con homebase-joy db push.
--
-- Decisiones de diseño:
--   · EQUIPO actualmente = todos los registros (sin filtro por agente).
--     El alcance por agente se implementará cuando se añada equipo_id a los recursos.
--   · scope_type eliminado del catálogo: la resolución de scope es responsabilidad de TS.
--   · SECURITY DEFINER + REVOKE PUBLIC en todas las funciones privilegiadas.
--   · crm_auditoria_permisos es append-only: trigger bloquea UPDATE/DELETE/TRUNCATE.
--   · Protección del último admin: advisory lock evita condición de carrera.
--   · crm_set_updated_at() — función propia para tablas crm_*; no toca update_updated_at().
--   · ADMIN debe tener alcance_datos = TODOS (forzado por chk_alcance_rol).
--   · crm_permisos y crm_permisos_rol sin policy auth_read (catálogo solo vía backend).

BEGIN;

-- ── 0. Helper updated_at — PROPIO para tablas crm_* ─────────────────────────
-- Nombre distinto de public.update_updated_at() (usada por contacts, properties,
-- agents, contact_roles) para no tocar objetos existentes desde una branch.
CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── 1. crm_usuarios ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_usuarios (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id      UUID UNIQUE REFERENCES public.agents(id) ON DELETE SET NULL,
  rol_base      TEXT NOT NULL
    CHECK (rol_base IN ('ADMIN','FINANCIERO','COMERCIAL_ADMINISTRATIVO')),
  alcance_datos TEXT NOT NULL DEFAULT 'PROPIOS'
    CHECK (alcance_datos IN ('PROPIOS','EQUIPO','TODOS')),
  -- ADMIN sin TODOS vería cero registros (PROPIOS default sin agente vinculado).
  -- FINANCIERO no puede ser PROPIOS (lee todos los datos financieros del equipo).
  CONSTRAINT chk_alcance_rol CHECK (
    (rol_base = 'ADMIN'                    AND alcance_datos = 'TODOS') OR
    (rol_base = 'FINANCIERO'               AND alcance_datos IN ('EQUIPO','TODOS')) OR
    (rol_base = 'COMERCIAL_ADMINISTRATIVO' AND alcance_datos IN ('PROPIOS','EQUIPO'))
  ),
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_usuarios_agent_id
  ON public.crm_usuarios(agent_id);
CREATE INDEX IF NOT EXISTS idx_crm_usuarios_rol_activo
  ON public.crm_usuarios(rol_base) WHERE activo = true;

CREATE TRIGGER trg_crm_usuarios_updated_at
  BEFORE UPDATE ON public.crm_usuarios
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

ALTER TABLE public.crm_usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "srvc_all" ON public.crm_usuarios
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "self_read" ON public.crm_usuarios
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── 2. Protección del último admin ───────────────────────────────────────────
-- Advisory lock impide condición de carrera si dos sesiones deshabilitan
-- al mismo tiempo a los dos últimos admins.
CREATE OR REPLACE FUNCTION public.crm_check_last_admin()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_demote BOOLEAN;
BEGIN
  -- Separar la rama DELETE de UPDATE para evitar referencias ambiguas a NEW en DELETE.
  IF TG_OP = 'DELETE' THEN
    v_demote := (OLD.rol_base = 'ADMIN' AND OLD.activo = true);
  ELSE
    v_demote := (OLD.rol_base = 'ADMIN' AND OLD.activo = true
                 AND (NEW.activo = false OR NEW.rol_base <> 'ADMIN'));
  END IF;

  IF v_demote THEN
    PERFORM pg_advisory_xact_lock(hashtext('crm_last_admin_check'));
    IF (
      SELECT COUNT(*) FROM public.crm_usuarios
      WHERE rol_base = 'ADMIN' AND activo = true AND user_id <> OLD.user_id
    ) = 0 THEN
      RAISE EXCEPTION 'crm_last_admin: no se puede eliminar o desactivar al único administrador activo'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_check_last_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.crm_check_last_admin() TO service_role;

CREATE TRIGGER trg_crm_last_admin
  BEFORE UPDATE OR DELETE ON public.crm_usuarios
  FOR EACH ROW EXECUTE FUNCTION public.crm_check_last_admin();

-- ── 3. crm_equipos + crm_equipo_miembros ─────────────────────────────────────
-- Placeholder para multi-oficina. Actualmente EQUIPO = TODOS los datos.
-- Cuando se añada equipo_id a recursos (contacts, properties, etc.),
-- este modelo se activará para filtrar.
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

-- ── 4. crm_permisos — catálogo de capacidades ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_permisos (
  clave       TEXT PRIMARY KEY,
  dominio     TEXT NOT NULL,
  accion      TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  sensible    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_permisos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srvc_all" ON public.crm_permisos
  TO service_role USING (true) WITH CHECK (true);
-- Sin policy auth_read: el catálogo solo lo lee service_role vía backend.

INSERT INTO public.crm_permisos (clave, dominio, accion, descripcion, sensible) VALUES
  -- Contactos
  ('contacts.read',              'contacts',      'read',           'Ver contactos y sus datos personales',         false),
  ('contacts.create',            'contacts',      'create',         'Crear nuevos contactos',                       false),
  ('contacts.update',            'contacts',      'update',         'Editar datos de contactos',                    false),
  ('contacts.archive',           'contacts',      'archive',        'Archivar contacto (soft, reversible)',          false),
  ('contacts.delete_hard',       'contacts',      'delete_hard',    'Eliminar contacto de forma permanente',         true),
  ('contacts.export',            'contacts',      'export',         'Exportar datos personales en CSV/XLS masivo',   true),
  -- Pipeline
  ('contact_roles.read',         'contact_roles', 'read',           'Ver el estado del pipeline',                   false),
  ('contact_roles.create',       'contact_roles', 'create',         'Añadir contacto al pipeline de un inmueble',   false),
  ('contact_roles.update',       'contact_roles', 'update',         'Cambiar estado en el pipeline',                false),
  ('contact_roles.delete',       'contact_roles', 'delete',         'Eliminar entrada del pipeline',                 true),
  -- Inmuebles
  ('properties.read',            'properties',    'read',           'Ver inmuebles y sus documentos',               false),
  ('properties.create',          'properties',    'create',         'Crear nuevos inmuebles',                       false),
  ('properties.update',          'properties',    'update',         'Editar campos básicos de inmuebles',           false),
  ('properties.status_final',    'properties',    'status_final',   'Cambiar estatus a Vendido, Alquilado o Baja',   true),
  ('properties.publish',         'properties',    'publish',        'Cambiar estado de publicación del inmueble',   false),
  ('properties.delete_hard',     'properties',    'delete_hard',    'Eliminar inmueble de forma permanente',         true),
  -- Documentos
  ('documents.upload',           'documents',     'upload',         'Subir archivos adjuntos a property-docs',      false),
  ('documents.delete',           'documents',     'delete',         'Eliminar archivos de property-docs',            true),
  -- Visitas
  ('visits.read',                'visits',        'read',           'Ver visitas',                                  false),
  ('visits.create',              'visits',        'create',         'Crear visitas',                                false),
  ('visits.update',              'visits',        'update',         'Editar visitas',                               false),
  ('visits.delete',              'visits',        'delete',         'Eliminar visitas',                              true),
  -- Seguimiento
  ('seguimiento.read',           'seguimiento',   'read',           'Ver log de comunicaciones',                    false),
  ('seguimiento.create',         'seguimiento',   'create',         'Registrar comunicación en el log',             false),
  -- Operaciones
  ('operations.read',            'operations',    'read',           'Ver operaciones sin precio ni comisión',       false),
  ('operations.read_financiero', 'operations',    'read_financiero','Ver precio de operación y comisiones',          true),
  ('operations.create',          'operations',    'create',         'Abrir nueva operación',                        false),
  ('operations.close',           'operations',    'close',          'Cerrar y validar operación (acto financiero)',  true),
  -- SilvIA
  ('silvia.use',                 'silvia',        'use',            'Usar el chat SilvIA (consultas y lectura)',    false),
  ('silvia.execute_actions',     'silvia',        'execute_actions','SilvIA puede ejecutar herramientas mutantes',  false),
  -- Comunicaciones
  ('whatsapp.send',              'communications','send_wa',        'Enviar WhatsApp a contactos',                   true),
  ('email.send',                 'communications','send_email',     'Enviar email a contactos',                      true),
  -- Administración
  ('users.manage',               'admin',         'manage_users',   'Gestionar usuarios y roles del CRM',            true),
  ('permissions.manage',         'admin',         'manage_perms',   'Crear o revocar excepciones de permiso',        true),
  ('config.manage',              'admin',         'manage_config',  'Configurar integraciones y sistema',            true),
  ('audit.read',                 'admin',         'read_audit',     'Ver el log de auditoría de permisos',           true)
ON CONFLICT (clave) DO NOTHING;

-- ── 5. crm_permisos_rol — presets por rol base ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_permisos_rol (
  rol_base      TEXT NOT NULL
    CHECK (rol_base IN ('ADMIN','FINANCIERO','COMERCIAL_ADMINISTRATIVO')),
  permiso_clave TEXT NOT NULL REFERENCES public.crm_permisos(clave) ON DELETE CASCADE,
  permitido     BOOLEAN NOT NULL DEFAULT false,
  -- alcance_max: techo del alcance para esta capability+rol.
  -- NULL = capability sin semántica de scope (ej: contacts.create no tiene scope de lectura).
  -- El scope efectivo = min(user.alcance_datos, alcance_max).
  -- EQUIPO actualmente = TODOS los datos (sin filtro por agente) hasta impl. multi-oficina.
  alcance_max   TEXT CHECK (alcance_max IN ('PROPIOS','EQUIPO','TODOS')),
  PRIMARY KEY (rol_base, permiso_clave)
);

ALTER TABLE public.crm_permisos_rol ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srvc_all" ON public.crm_permisos_rol
  TO service_role USING (true) WITH CHECK (true);
-- Sin policy auth_read: los presets solo los lee service_role vía backend.

-- ADMIN: acceso total, TODOS
INSERT INTO public.crm_permisos_rol (rol_base, permiso_clave, permitido, alcance_max)
SELECT 'ADMIN', clave, true, 'TODOS' FROM public.crm_permisos
ON CONFLICT (rol_base, permiso_clave) DO NOTHING;

-- FINANCIERO
INSERT INTO public.crm_permisos_rol (rol_base, permiso_clave, permitido, alcance_max) VALUES
  ('FINANCIERO', 'contacts.read',              true,  'TODOS'),
  ('FINANCIERO', 'contacts.create',            false, NULL),
  ('FINANCIERO', 'contacts.update',            false, NULL),
  ('FINANCIERO', 'contacts.archive',           false, NULL),
  ('FINANCIERO', 'contacts.delete_hard',       false, NULL),
  ('FINANCIERO', 'contacts.export',            false, NULL),
  ('FINANCIERO', 'contact_roles.read',         true,  'TODOS'),
  ('FINANCIERO', 'contact_roles.create',       false, NULL),
  ('FINANCIERO', 'contact_roles.update',       false, NULL),
  ('FINANCIERO', 'contact_roles.delete',       false, NULL),
  ('FINANCIERO', 'properties.read',            true,  'TODOS'),
  ('FINANCIERO', 'properties.create',          false, NULL),
  ('FINANCIERO', 'properties.update',          false, NULL),
  ('FINANCIERO', 'properties.status_final',    false, NULL),
  ('FINANCIERO', 'properties.publish',         false, NULL),
  ('FINANCIERO', 'properties.delete_hard',     false, NULL),
  ('FINANCIERO', 'documents.upload',           false, NULL),
  ('FINANCIERO', 'documents.delete',           false, NULL),
  ('FINANCIERO', 'visits.read',                true,  'TODOS'),
  ('FINANCIERO', 'visits.create',              false, NULL),
  ('FINANCIERO', 'visits.update',              false, NULL),
  ('FINANCIERO', 'visits.delete',              false, NULL),
  ('FINANCIERO', 'seguimiento.read',           true,  'TODOS'),
  ('FINANCIERO', 'seguimiento.create',         false, NULL),
  ('FINANCIERO', 'operations.read',            true,  'TODOS'),
  ('FINANCIERO', 'operations.read_financiero', true,  'TODOS'),
  ('FINANCIERO', 'operations.create',          true,  'TODOS'),
  ('FINANCIERO', 'operations.close',           true,  'TODOS'),
  ('FINANCIERO', 'silvia.use',                 true,  NULL),
  ('FINANCIERO', 'silvia.execute_actions',     false, NULL),
  ('FINANCIERO', 'whatsapp.send',              false, NULL),
  ('FINANCIERO', 'email.send',                 false, NULL),
  ('FINANCIERO', 'users.manage',               false, NULL),
  ('FINANCIERO', 'permissions.manage',         false, NULL),
  ('FINANCIERO', 'config.manage',              false, NULL),
  ('FINANCIERO', 'audit.read',                 false, NULL)
ON CONFLICT (rol_base, permiso_clave) DO NOTHING;

-- COMERCIAL_ADMINISTRATIVO
INSERT INTO public.crm_permisos_rol (rol_base, permiso_clave, permitido, alcance_max) VALUES
  ('COMERCIAL_ADMINISTRATIVO', 'contacts.read',              true,  'EQUIPO'),
  ('COMERCIAL_ADMINISTRATIVO', 'contacts.create',            true,  NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'contacts.update',            true,  'EQUIPO'),
  ('COMERCIAL_ADMINISTRATIVO', 'contacts.archive',           true,  'EQUIPO'),
  ('COMERCIAL_ADMINISTRATIVO', 'contacts.delete_hard',       false, NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'contacts.export',            false, NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'contact_roles.read',         true,  'EQUIPO'),
  ('COMERCIAL_ADMINISTRATIVO', 'contact_roles.create',       true,  NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'contact_roles.update',       true,  'EQUIPO'),
  ('COMERCIAL_ADMINISTRATIVO', 'contact_roles.delete',       false, NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'properties.read',            true,  'TODOS'),
  ('COMERCIAL_ADMINISTRATIVO', 'properties.create',          true,  NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'properties.update',          true,  'TODOS'),
  ('COMERCIAL_ADMINISTRATIVO', 'properties.status_final',    false, NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'properties.publish',         true,  'TODOS'),
  ('COMERCIAL_ADMINISTRATIVO', 'properties.delete_hard',     false, NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'documents.upload',           true,  NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'documents.delete',           false, NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'visits.read',                true,  'EQUIPO'),
  ('COMERCIAL_ADMINISTRATIVO', 'visits.create',              true,  NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'visits.update',              true,  'EQUIPO'),
  ('COMERCIAL_ADMINISTRATIVO', 'visits.delete',              false, NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'seguimiento.read',           true,  'EQUIPO'),
  ('COMERCIAL_ADMINISTRATIVO', 'seguimiento.create',         true,  NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'operations.read',            true,  'EQUIPO'),
  ('COMERCIAL_ADMINISTRATIVO', 'operations.read_financiero', false, NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'operations.create',          true,  NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'operations.close',           false, NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'silvia.use',                 true,  NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'silvia.execute_actions',     true,  NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'whatsapp.send',              true,  NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'email.send',                 true,  NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'users.manage',               false, NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'permissions.manage',         false, NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'config.manage',              false, NULL),
  ('COMERCIAL_ADMINISTRATIVO', 'audit.read',                 false, NULL)
ON CONFLICT (rol_base, permiso_clave) DO NOTHING;

-- ── 6. crm_permisos_usuario — excepciones individuales ───────────────────────
CREATE TABLE IF NOT EXISTS public.crm_permisos_usuario (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.crm_usuarios(user_id) ON DELETE CASCADE,
  permiso_clave TEXT NOT NULL REFERENCES public.crm_permisos(clave)   ON DELETE CASCADE,
  efecto        TEXT NOT NULL CHECK (efecto IN ('ALLOW','DENY')),
  alcance       TEXT CHECK (alcance IN ('PROPIOS','EQUIPO','TODOS')),
  motivo        TEXT NOT NULL DEFAULT '',
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
CREATE POLICY "srvc_all"  ON public.crm_permisos_usuario
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "self_read" ON public.crm_permisos_usuario
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── 7. crm_silvia_intenciones — dos fases de confirmación ────────────────────
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
-- Índice adicional para barrido de expiración
CREATE INDEX IF NOT EXISTS idx_silvia_intenciones_expira
  ON public.crm_silvia_intenciones(expira_at) WHERE estado = 'PENDIENTE';

ALTER TABLE public.crm_silvia_intenciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srvc_all" ON public.crm_silvia_intenciones
  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "self_read" ON public.crm_silvia_intenciones
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── 8. crm_auditoria_permisos — inmutable (append-only) ──────────────────────
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

-- Trigger: rechaza UPDATE y DELETE (inmutabilidad a nivel DB)
CREATE OR REPLACE FUNCTION public.crm_auditoria_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'crm_auditoria_permisos es inmutable (append-only)'
    USING ERRCODE = 'P0001';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_auditoria_immutable() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.crm_auditoria_immutable() TO service_role;

-- FOR EACH ROW intercepta UPDATE y DELETE
CREATE TRIGGER trg_auditoria_immutable
  BEFORE UPDATE OR DELETE ON public.crm_auditoria_permisos
  FOR EACH ROW EXECUTE FUNCTION public.crm_auditoria_immutable();

-- FOR EACH STATEMENT intercepta TRUNCATE (que no dispara triggers de fila)
CREATE TRIGGER trg_auditoria_no_truncate
  BEFORE TRUNCATE ON public.crm_auditoria_permisos
  FOR EACH STATEMENT EXECUTE FUNCTION public.crm_auditoria_immutable();

-- ── 9. Seed: equipo inicial ───────────────────────────────────────────────────
INSERT INTO public.crm_equipos (nombre, descripcion) VALUES
  ('Oficina Gijón', 'Equipo único de El Sol Grupo (oficina Gijón)')
ON CONFLICT (nombre) DO NOTHING;

-- ── 10. Seed: admin de arranque (BRANCH ONLY) ─────────────────────────────────
-- Sin este seed, requireCrmUser() es fail-closed y bloquea a todos los usuarios.
-- Usa el email del administrador inicial para encontrar su UUID en auth.users.
-- La comprobación es fail-closed: si el usuario no existe, toda la transacción revierte.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE lower(email) = lower('ai@elsolgrupo.com')
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'crm_rbac_initial: no existe el administrador ai@elsolgrupo.com en auth.users; migración cancelada'
      USING ERRCODE = 'P0001';
  END IF;
END $$;

INSERT INTO public.crm_usuarios (user_id, agent_id, rol_base, alcance_datos)
SELECT u.id, a.id, 'ADMIN', 'TODOS'
FROM auth.users u
LEFT JOIN public.agents a ON lower(a.email) = lower(u.email)
WHERE lower(u.email) = lower('ai@elsolgrupo.com')
  AND u.deleted_at IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- ── 11. Verificaciones de cardinalidad del catálogo ──────────────────────────
DO $$
DECLARE
  v_permisos  INT;
  v_rol_admin INT;
  v_rol_fin   INT;
  v_rol_com   INT;
  v_admin_inicial INT;
BEGIN
  SELECT COUNT(*) INTO v_permisos  FROM public.crm_permisos;
  SELECT COUNT(*) INTO v_rol_admin FROM public.crm_permisos_rol WHERE rol_base = 'ADMIN';
  SELECT COUNT(*) INTO v_rol_fin   FROM public.crm_permisos_rol WHERE rol_base = 'FINANCIERO';
  SELECT COUNT(*) INTO v_rol_com   FROM public.crm_permisos_rol WHERE rol_base = 'COMERCIAL_ADMINISTRATIVO';
  SELECT COUNT(*) INTO v_admin_inicial
  FROM public.crm_usuarios cu
  JOIN auth.users u ON u.id = cu.user_id
  WHERE lower(u.email) = lower('ai@elsolgrupo.com')
    AND u.deleted_at IS NULL
    AND cu.rol_base = 'ADMIN'
    AND cu.activo = true
    AND cu.alcance_datos = 'TODOS';

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
  IF v_admin_inicial <> 1 THEN
    RAISE EXCEPTION
      'crm_rbac_initial: esperado un administrador activo ai@elsolgrupo.com, hay %',
      v_admin_inicial;
  END IF;
END $$;

COMMIT;
