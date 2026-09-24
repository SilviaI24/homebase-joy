-- Fase 1 del circuito del lead (propuesta aprobada por David, 24 sep 2026):
-- un lead sale de la Bandeja cualificado o descartado CON motivo. El motivo se
-- guarda como código estable (no como texto de pantalla) porque es la
-- etiqueta negativa que necesita un futuro modelo de conversión; las
-- etiquetas visibles viven en el frontend (src/lib/contactos-format.ts).

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS motivo_descarte text,
  ADD COLUMN IF NOT EXISTS descartado_at timestamptz;

ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS contacts_motivo_descarte_check;
ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_motivo_descarte_check CHECK (
    motivo_descarte IS NULL OR motivo_descarte = ANY (ARRAY[
      'no_responde', 'no_interesado', 'ya_resuelto', 'fuera_presupuesto',
      'fuera_zona', 'profesional', 'datos_erroneos', 'duplicado'
    ])
  );

COMMENT ON COLUMN public.contacts.motivo_descarte IS
  'Motivo del descarte desde la Bandeja (código estable). NULL si no está descartado.';

CREATE OR REPLACE FUNCTION public.crm_descartar_lead(p_contact_id uuid, p_motivo text, p_actor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ciclo_vida TEXT;
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'El contacto es obligatorio';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;
  IF p_motivo IS NULL OR p_motivo <> ALL (ARRAY[
    'no_responde', 'no_interesado', 'ya_resuelto', 'fuera_presupuesto',
    'fuera_zona', 'profesional', 'datos_erroneos', 'duplicado'
  ]) THEN
    RAISE EXCEPTION 'Motivo de descarte no válido';
  END IF;

  SELECT c.ciclo_vida INTO v_ciclo_vida
    FROM public.contacts c WHERE c.id = p_contact_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El contacto no existe';
  END IF;
  -- Solo leads: un contacto con rol comercial (Cliente) o ya archivado no se
  -- descarta desde la Bandeja.
  IF v_ciclo_vida NOT IN ('Lead', 'Prospecto') THEN
    RAISE EXCEPTION 'Solo se pueden descartar leads';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  UPDATE public.contacts
     SET ciclo_vida_anterior = v_ciclo_vida,
         ciclo_vida = 'Descartado',
         trabajado = 'Descartado',
         motivo_descarte = p_motivo,
         descartado_at = now()
   WHERE id = p_contact_id;

  INSERT INTO public.linea_actividad (contact_id, actor_id, tipo_evento, descripcion, metadata)
  VALUES (p_contact_id, p_actor_id, 'cambio_estado', 'Lead descartado',
    jsonb_build_object('evento', 'lead_descartado', 'motivo', p_motivo,
                       'ciclo_vida_anterior', v_ciclo_vida));
END;
$function$;

-- Restaurar sirve ahora para Histórico (como antes) y para Descartado. Al
-- restaurar un descartado se limpia también su marca en la cola de la Bandeja
-- y se registra el evento: que alguien deshaga un descarte es información
-- útil (etiqueta corregida), no ruido.
CREATE OR REPLACE FUNCTION public.crm_restaurar_contacto_historico(p_contact_id uuid, p_actor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ciclo_vida TEXT;
  v_anterior TEXT;
  v_motivo TEXT;
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'El contacto es obligatorio';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE
  ) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  SELECT c.ciclo_vida, c.ciclo_vida_anterior, c.motivo_descarte
    INTO v_ciclo_vida, v_anterior, v_motivo
    FROM public.contacts c WHERE c.id = p_contact_id FOR UPDATE;

  IF NOT FOUND OR v_ciclo_vida NOT IN ('Histórico', 'Descartado') THEN
    RAISE EXCEPTION 'El contacto no está en histórico ni descartado';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  IF v_ciclo_vida = 'Descartado' THEN
    UPDATE public.contacts
       SET ciclo_vida = COALESCE(v_anterior, 'Lead'),
           ciclo_vida_anterior = NULL,
           trabajado = NULL,
           motivo_descarte = NULL,
           descartado_at = NULL
     WHERE id = p_contact_id;

    INSERT INTO public.linea_actividad (contact_id, actor_id, tipo_evento, descripcion, metadata)
    VALUES (p_contact_id, p_actor_id, 'cambio_estado', 'Descarte deshecho',
      jsonb_build_object('evento', 'lead_restaurado', 'motivo_anterior', v_motivo));
  ELSE
    UPDATE public.contacts
       SET ciclo_vida = COALESCE(v_anterior, 'Lead'),
           ciclo_vida_anterior = NULL
     WHERE id = p_contact_id;
  END IF;
END;
$function$;

-- Solo el servidor del CRM (service_role vía getSupa) llama a estas RPC.
REVOKE ALL ON FUNCTION public.crm_descartar_lead(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_descartar_lead(uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crm_restaurar_contacto_historico(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_restaurar_contacto_historico(uuid, uuid) TO service_role;

-- Corrección de 20260923150000: dashboard_header_stats() es SECURITY DEFINER
-- y quedó ejecutable por anon/authenticated -- con la anon key pública se
-- podían leer los agregados del mini-dashboard sin sesión. getHeaderStats la
-- llama con service_role, así que no necesita más.
REVOKE ALL ON FUNCTION public.dashboard_header_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_header_stats() TO service_role;
