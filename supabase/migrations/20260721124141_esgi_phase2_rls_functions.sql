-- Migración de reconciliación (objetivo 4, 19 ago 2026).
-- Este archivo representa un cambio que YA está aplicado en producción bajo la
-- versión 20260721124141 (nombre 'esgi_phase2_rls_functions' en supabase_migrations.schema_migrations).
-- No ejecutar de nuevo manualmente. Contenido copiado tal cual desde la fuente
-- disponible en elsol-client-hub/supabase/esgi-migrations/20260721000004_esgi_phase2_rls_functions.sql
-- para que este repositorio tenga un registro reproducible — ver CLAUDE.md.
-- Si en algún momento se detecta que no coincide exactamente con el esquema real,
-- verificar contra la base de datos y corregir este archivo (no re-ejecutar a ciegas).

-- ============================================================
-- ESGI Phase 2 / Step 4: Funciones RLS helpers + políticas staff
-- Target: branch de ESGI (fyrfkbcabmitbfuqeccq)
-- ⚠️  Ejecutar DESPUÉS del paso 3 (las tablas deben existir).
-- ============================================================

-- ─── Funciones helper de RLS ──────────────────────────────

-- Verifica si el usuario tiene rol 'admin' en roles_usuario
CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.roles_usuario
    WHERE user_id = auth.uid() AND rol = 'admin'
  )
$$;

-- Verifica si el usuario es staff del CRM (admin o agente)
CREATE OR REPLACE FUNCTION public.es_staff_crm()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.roles_usuario
    WHERE user_id = auth.uid() AND rol IN ('admin','agente')
  )
$$;

-- Verifica si el usuario es propietario de un inmueble concreto
CREATE OR REPLACE FUNCTION public.es_propietario_inmueble(_property_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.propietario_inmueble pi
    JOIN public.propietarios p ON p.id = pi.propietario_id
    WHERE p.user_id = auth.uid() AND pi.property_id = _property_id
  )
$$;


-- ─── Políticas de acceso para staff CRM ──────────────────
-- Se añaden aquí porque dependen de es_staff_crm() que acaba de crearse.
-- Los usuarios con rol admin/agente ven y gestionan todo.

-- roles_usuario
CREATE POLICY "staff ve todos los roles"
  ON public.roles_usuario FOR SELECT TO authenticated
  USING (public.es_staff_crm());

CREATE POLICY "admin gestiona roles"
  ON public.roles_usuario FOR ALL TO authenticated
  USING (public.es_admin()) WITH CHECK (public.es_admin());

-- perfiles
CREATE POLICY "staff ve todos los perfiles"
  ON public.perfiles FOR SELECT TO authenticated
  USING (public.es_staff_crm());

-- propietarios
CREATE POLICY "staff ve todos los propietarios"
  ON public.propietarios FOR ALL TO authenticated
  USING (public.es_staff_crm()) WITH CHECK (public.es_staff_crm());

-- propietario_inmueble
CREATE POLICY "staff gestiona propietario_inmueble"
  ON public.propietario_inmueble FOR ALL TO authenticated
  USING (public.es_staff_crm()) WITH CHECK (public.es_staff_crm());

-- documentos
CREATE POLICY "staff ve todos los documentos"
  ON public.documentos FOR ALL TO authenticated
  USING (public.es_staff_crm()) WITH CHECK (public.es_staff_crm());

-- transacciones_docuten
CREATE POLICY "staff gestiona transacciones docuten"
  ON public.transacciones_docuten FOR ALL TO authenticated
  USING (public.es_staff_crm()) WITH CHECK (public.es_staff_crm());

-- fichas_portal
CREATE POLICY "staff gestiona fichas portal"
  ON public.fichas_portal FOR ALL TO authenticated
  USING (public.es_staff_crm()) WITH CHECK (public.es_staff_crm());

-- historial_ofertas
CREATE POLICY "staff gestiona historial ofertas"
  ON public.historial_ofertas FOR ALL TO authenticated
  USING (public.es_staff_crm()) WITH CHECK (public.es_staff_crm());

-- tareas
CREATE POLICY "staff gestiona tareas"
  ON public.tareas FOR ALL TO authenticated
  USING (public.es_staff_crm()) WITH CHECK (public.es_staff_crm());

-- incorporacion_inmueble
CREATE POLICY "staff gestiona incorporacion"
  ON public.incorporacion_inmueble FOR ALL TO authenticated
  USING (public.es_staff_crm()) WITH CHECK (public.es_staff_crm());

-- estadisticas_diarias
CREATE POLICY "staff ve todas las estadisticas"
  ON public.estadisticas_diarias FOR SELECT TO authenticated
  USING (public.es_staff_crm());

-- solicitudes_servicio
CREATE POLICY "staff gestiona solicitudes"
  ON public.solicitudes_servicio FOR ALL TO authenticated
  USING (public.es_staff_crm()) WITH CHECK (public.es_staff_crm());

-- notificaciones
CREATE POLICY "staff ve todas las notificaciones"
  ON public.notificaciones FOR SELECT TO authenticated
  USING (public.es_staff_crm());

CREATE POLICY "staff inserta notificaciones"
  ON public.notificaciones FOR INSERT TO authenticated
  WITH CHECK (public.es_staff_crm());

-- linea_actividad
CREATE POLICY "staff ve toda la actividad"
  ON public.linea_actividad FOR SELECT TO authenticated
  USING (public.es_staff_crm());

CREATE POLICY "staff inserta actividad"
  ON public.linea_actividad FOR INSERT TO authenticated
  WITH CHECK (public.es_staff_crm());


-- ─── Políticas staff sobre tablas existentes de ESGI ─────
-- Las tablas existentes pueden tener ya sus propias políticas.
-- Se usa DO+EXCEPTION para crear solo si no existen (idempotente).

DO $$
DECLARE
  pol RECORD;
  tablas TEXT[][] := ARRAY[
    ARRAY['contacts',      'staff ve y escribe contacts'],
    ARRAY['contact_roles', 'staff ve y escribe contact_roles'],
    ARRAY['visits',        'staff ve y escribe visits'],
    ARRAY['seguimiento',   'staff ve y escribe seguimiento'],
    ARRAY['operations',    'staff ve y escribe operations'],
    ARRAY['agents',        'staff ve y escribe agents'],
    ARRAY['contact_agents','staff ve contact_agents']
  ];
  entry TEXT[];
BEGIN
  FOREACH entry SLICE 1 IN ARRAY tablas LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (public.es_staff_crm()) WITH CHECK (public.es_staff_crm())',
        entry[2], entry[1]
      );
    EXCEPTION WHEN duplicate_object THEN
      -- Política ya existe, no hacer nada
      NULL;
    END;
  END LOOP;
END;
$$;
