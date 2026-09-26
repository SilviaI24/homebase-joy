-- Alta manual de contactos (auditoría de procesos de alta, 26 sep 2026, C1/C2).
--
-- El diálogo "Nuevo cliente" guardaba el contacto sin canal_origen, fuente ni
-- tipo_interes. Con el circuito del lead (la Bandeja es la entrada única y
-- exige canal_origen de BANDEJA_CANALES), un Lead dado de alta a mano desde la
-- oficina no aparecía en ningún sitio. crm_crear_cliente acepta ahora esos
-- tres datos. Los tres parámetros nuevos tienen DEFAULT NULL para que una
-- llamada con la firma antigua (código del CRM sin desplegar todavía) siga
-- funcionando igual que antes tras aplicar esta migración.
--
-- ORDEN DE DESPLIEGUE: aplicar esta migración ANTES de desplegar el frontend
-- que envía p_canal_origen/p_fuente/p_tipo_interes (PostgREST no encuentra la
-- función si recibe parámetros que no existen).
--
-- fuente: si llega NULL, el trigger contacts_fuente_por_defecto la deduce de
-- canal_origen (Presencial -> Oficina, Web -> Web...), igual que para
-- web-lead/valorador. Los CHECK de contacts validan los tres valores.

DROP FUNCTION IF EXISTS public.crm_crear_cliente(
  text, text, text, text, text, text, text, text, text[], text, text, text, text,
  timestamptz, uuid[], boolean, text, uuid
);

CREATE OR REPLACE FUNCTION public.crm_crear_cliente(
  p_nombre text, p_ciclo_vida text, p_email text, p_telefono text, p_dni text,
  p_motivo text, p_solicitud text, p_observaciones text, p_categoria text[],
  p_profesion text, p_contrato_trabajo text, p_mascota text, p_avalista text,
  p_created_at timestamp with time zone, p_agente_ids uuid[], p_crea_relacion boolean,
  p_tipo_relacion text, p_actor_id uuid,
  p_canal_origen text DEFAULT NULL,
  p_fuente text DEFAULT NULL,
  p_tipo_interes text DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id UUID;
BEGIN
  IF p_nombre IS NULL OR btrim(p_nombre) = '' THEN
    RAISE EXCEPTION 'Nombre requerido';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  INSERT INTO public.contacts (
    nombre, ciclo_vida, email, telefono, dni, motivo, solicitud, observaciones,
    categoria, profesion, contrato_trabajo, mascota, avalista, created_at,
    canal_origen, fuente, tipo_interes
  ) VALUES (
    p_nombre, p_ciclo_vida,
    COALESCE(p_email, ''), COALESCE(p_telefono, ''), COALESCE(p_dni, ''),
    COALESCE(p_motivo, ''), COALESCE(p_solicitud, ''), COALESCE(p_observaciones, ''),
    COALESCE(p_categoria, '{}'), COALESCE(p_profesion, ''), COALESCE(p_contrato_trabajo, ''),
    COALESCE(p_mascota, ''), COALESCE(p_avalista, ''), COALESCE(p_created_at, now()),
    NULLIF(btrim(p_canal_origen), ''), NULLIF(btrim(p_fuente), ''), NULLIF(btrim(p_tipo_interes), '')
  )
  RETURNING id INTO v_id;

  -- Fase 1 (metricas en cabecera, 23 sep 2026): un evento de linea_actividad
  -- por cada Lead nuevo -- tipo_evento reutiliza el valor 'contacto' del
  -- CHECK ya existente (compartido con el Portal), el matiz va en metadata.
  -- Desde el 26 sep, con el canal real del alta en vez de NULL fijo.
  IF p_ciclo_vida = 'Lead' THEN
    INSERT INTO public.linea_actividad (contact_id, actor_id, tipo_evento, descripcion, metadata)
    VALUES (v_id, p_actor_id, 'contacto', concat('Lead creado: ', p_nombre),
      jsonb_build_object('ciclo_vida', p_ciclo_vida,
                         'canal_origen', NULLIF(btrim(p_canal_origen), '')));
  END IF;

  -- Si no se especifican agentes, el propio código de servidor ya resuelve
  -- p_agente_ids = [actor] antes de llamar -- aquí solo se inserta lo recibido.
  IF p_agente_ids IS NOT NULL AND array_length(p_agente_ids, 1) > 0 THEN
    INSERT INTO public.contact_agents (contact_id, agent_id)
    SELECT v_id, aid FROM unnest(p_agente_ids) AS aid
    ON CONFLICT (contact_id, agent_id) DO NOTHING;
  END IF;

  IF p_crea_relacion THEN
    INSERT INTO public.contact_roles (contact_id, agente_id, tipo, estado)
    VALUES (v_id, p_agente_ids[1], p_tipo_relacion, 'Prospecto');
  END IF;

  RETURN v_id;
END;
$function$;

-- Mismo criterio que el resto de crm_*: solo la llama el servidor del CRM.
REVOKE ALL ON FUNCTION public.crm_crear_cliente(
  text, text, text, text, text, text, text, text, text[], text, text, text, text,
  timestamptz, uuid[], boolean, text, uuid, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_crear_cliente(
  text, text, text, text, text, text, text, text, text[], text, text, text, text,
  timestamptz, uuid[], boolean, text, uuid, text, text, text
) TO service_role;
