-- Migración de reconciliación (objetivo 4, 19 ago 2026).
-- Este archivo representa un cambio que YA está aplicado en producción bajo la
-- versión 20260722081048 (nombre 'esgi_bidireccional_portal_crm' en supabase_migrations.schema_migrations).
-- No ejecutar de nuevo manualmente. Contenido copiado tal cual desde la fuente
-- disponible en elsol-client-hub/supabase/esgi-migrations/20260722000001_esgi_bidireccional_portal_crm.sql
-- para que este repositorio tenga un registro reproducible — ver CLAUDE.md.
-- Si en algún momento se detecta que no coincide exactamente con el esquema real,
-- verificar contra la base de datos y corregir este archivo (no re-ejecutar a ciegas).

-- ============================================================
-- ESGI: Sistema bidireccional Portal ↔ CRM
-- Portal→CRM: cliente sube doc / solicita servicio → notifica agente (in-app)
-- CRM→Portal: agente crea tarea visible / publica doc → notifica cliente
-- Mecanismo: triggers DB + Supabase Realtime en notificaciones
-- ============================================================

-- ─── 1. agents.user_id — link con auth.users ─────────────
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON public.agents(user_id);

-- ─── 2. tareas — visibilidad al propietario ───────────────
ALTER TABLE public.tareas
  ADD COLUMN IF NOT EXISTS visible_para_propietario BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS propietario_id UUID REFERENCES public.propietarios(id) ON DELETE SET NULL;

CREATE POLICY "propietario ve sus tareas asignadas"
  ON public.tareas FOR SELECT TO authenticated
  USING (
    visible_para_propietario = true
    AND propietario_id IN (SELECT id FROM public.propietarios WHERE user_id = auth.uid())
  );

CREATE POLICY "propietario actualiza sus tareas"
  ON public.tareas FOR UPDATE TO authenticated
  USING (
    visible_para_propietario = true
    AND propietario_id IN (SELECT id FROM public.propietarios WHERE user_id = auth.uid())
  )
  WITH CHECK (
    visible_para_propietario = true
    AND propietario_id IN (SELECT id FROM public.propietarios WHERE user_id = auth.uid())
  );

-- ─── 3. documentos — visibilidad al propietario ──────────
ALTER TABLE public.documentos
  ADD COLUMN IF NOT EXISTS visible_para_propietario BOOLEAN NOT NULL DEFAULT true;

-- ─── Helpers ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._agente_user_id_de_property(_property_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.user_id FROM public.properties p JOIN public.agents a ON a.id = p.agente_id
  WHERE p.id = _property_id AND a.user_id IS NOT NULL LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public._propietario_user_id_de_property(_property_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT pr.user_id FROM public.propietario_inmueble pi JOIN public.propietarios pr ON pr.id = pi.propietario_id
  WHERE pi.property_id = _property_id AND pr.user_id IS NOT NULL LIMIT 1
$$;

-- ─── Trigger 1: documento subido ─────────────────────────
CREATE OR REPLACE FUNCTION public.on_documento_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_agente_uid UUID; v_propietario_uid UUID;
  v_es_propietario BOOLEAN; v_es_staff BOOLEAN;
BEGIN
  IF NEW.property_id IS NOT NULL THEN
    INSERT INTO public.linea_actividad (property_id, actor_id, tipo_evento, descripcion, metadata)
    VALUES (NEW.property_id, NEW.subido_por, 'documento', 'Documento subido: ' || NEW.nombre,
      jsonb_build_object('documento_id', NEW.id, 'categoria', NEW.categoria));
  END IF;
  IF NEW.subido_por IS NULL OR NEW.property_id IS NULL THEN RETURN NEW; END IF;
  v_es_propietario := EXISTS (SELECT 1 FROM public.propietarios WHERE user_id = NEW.subido_por);
  v_es_staff       := EXISTS (SELECT 1 FROM public.roles_usuario WHERE user_id = NEW.subido_por AND rol IN ('admin','agente'));
  IF v_es_propietario THEN
    v_agente_uid := public._agente_user_id_de_property(NEW.property_id);
    IF v_agente_uid IS NOT NULL THEN
      INSERT INTO public.notificaciones (user_id, tipo, titulo, mensaje, enlace, metadata)
      VALUES (v_agente_uid, 'documento', 'Propietario ha subido un documento', NEW.nombre,
        '/crm/documentos/' || NEW.id, jsonb_build_object('documento_id', NEW.id, 'property_id', NEW.property_id));
    END IF;
  END IF;
  IF v_es_staff AND NEW.visible_para_propietario THEN
    v_propietario_uid := public._propietario_user_id_de_property(NEW.property_id);
    IF v_propietario_uid IS NOT NULL THEN
      INSERT INTO public.notificaciones (user_id, tipo, titulo, mensaje, enlace, metadata)
      VALUES (v_propietario_uid, 'documento', 'Nuevo documento disponible',
        'Tu agente ha publicado: ' || NEW.nombre, '/portal/documentos/' || NEW.id,
        jsonb_build_object('documento_id', NEW.id, 'property_id', NEW.property_id));
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_on_documento_insert
  AFTER INSERT ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.on_documento_insert();

-- ─── Trigger 2: solicitud de servicio ────────────────────
CREATE OR REPLACE FUNCTION public.on_solicitud_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agente_uid UUID; BEGIN
  IF NEW.property_id IS NOT NULL THEN
    INSERT INTO public.linea_actividad (property_id, actor_id, tipo_evento, descripcion, metadata)
    VALUES (NEW.property_id, NEW.solicitado_por, 'solicitud', 'Solicitud de ' || NEW.tipo,
      jsonb_build_object('solicitud_id', NEW.id, 'tipo', NEW.tipo));
  END IF;
  v_agente_uid := public._agente_user_id_de_property(NEW.property_id);
  IF v_agente_uid IS NOT NULL THEN
    INSERT INTO public.notificaciones (user_id, tipo, titulo, mensaje, enlace, metadata)
    VALUES (v_agente_uid, 'solicitud', 'Nueva solicitud de servicio',
      NEW.tipo || CASE WHEN NEW.descripcion <> '' THEN ' — ' || LEFT(NEW.descripcion, 100) ELSE '' END,
      '/crm/solicitudes/' || NEW.id, jsonb_build_object('solicitud_id', NEW.id, 'property_id', NEW.property_id));
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_on_solicitud_insert
  AFTER INSERT ON public.solicitudes_servicio FOR EACH ROW EXECUTE FUNCTION public.on_solicitud_insert();

-- ─── Trigger 3: tarea visible asignada al propietario ────
CREATE OR REPLACE FUNCTION public.on_tarea_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_propietario_uid UUID; BEGIN
  IF NOT NEW.visible_para_propietario OR NEW.propietario_id IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO v_propietario_uid FROM public.propietarios WHERE id = NEW.propietario_id;
  IF v_propietario_uid IS NOT NULL THEN
    INSERT INTO public.notificaciones (user_id, tipo, titulo, mensaje, enlace, metadata)
    VALUES (v_propietario_uid, 'tarea', 'Tu agente te ha enviado una solicitud',
      NEW.titulo || CASE WHEN NEW.descripcion <> '' THEN ': ' || LEFT(NEW.descripcion, 120) ELSE '' END,
      '/portal/tareas/' || NEW.id,
      jsonb_build_object('tarea_id', NEW.id, 'property_id', NEW.property_id, 'prioridad', NEW.prioridad));
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_on_tarea_insert
  AFTER INSERT ON public.tareas FOR EACH ROW EXECUTE FUNCTION public.on_tarea_insert();

-- ─── Trigger 4: propietario completa una tarea ───────────
CREATE OR REPLACE FUNCTION public.on_tarea_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agente_uid UUID; BEGIN
  IF OLD.estado = NEW.estado OR NEW.estado <> 'completada' OR NOT NEW.visible_para_propietario THEN RETURN NEW; END IF;
  IF NEW.property_id IS NOT NULL THEN
    v_agente_uid := public._agente_user_id_de_property(NEW.property_id);
    IF v_agente_uid IS NOT NULL THEN
      INSERT INTO public.notificaciones (user_id, tipo, titulo, mensaje, enlace, metadata)
      VALUES (v_agente_uid, 'tarea', 'Propietario completó una tarea', 'Completada: ' || NEW.titulo,
        '/crm/tareas/' || NEW.id, jsonb_build_object('tarea_id', NEW.id, 'property_id', NEW.property_id));
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_on_tarea_update
  AFTER UPDATE ON public.tareas FOR EACH ROW EXECUTE FUNCTION public.on_tarea_update();

-- ─── Realtime ────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
ALTER PUBLICATION supabase_realtime ADD TABLE public.linea_actividad;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tareas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.documentos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.solicitudes_servicio;
