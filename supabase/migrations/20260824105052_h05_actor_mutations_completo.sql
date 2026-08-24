-- H-05, parte 6 (última del bloque grande): las 8 de las 9 funciones de
-- escritura de mutations.functions.ts que sí se pueden convertir sin
-- arriesgar cambio de comportamiento. Mismo patrón que todas las anteriores:
-- actor como parámetro, fijado con set_config(...,TRUE) dentro del mismo RPC
-- que escribe, SECURITY INVOKER, restringido a service_role.
--
-- Beneficio colateral real (no solo el actor): al mover cada flujo a un solo
-- RPC, las escrituras que antes eran varias llamadas HTTP separadas con
-- rollback manual en TypeScript (H-02) pasan a ser atómicas de verdad -- si
-- cualquier paso falla, toda la transacción se revierte sola, sin necesitar
-- el código de compensación que había antes.
--
-- Deliberadamente sin convertir: createInmueble (createServerFn en
-- mutations.functions.ts). Tiene ~30 columnas opcionales, incluidos arrays
-- JSONB de imágenes/documentos construidos dinámicamente -- la misma
-- categoría de riesgo que updateInmueble, ya aplazado. Ambos son candidatos
-- a una sesión de "CRUD de inmuebles" propia.
--
-- Todos los defaults de columna se verificaron contra el esquema real antes
-- de escribir esto (ver sesión del 24 ago 2026): la mayoría de texto en
-- contacts/properties por defecto es '' (no NULL) -- se preserva con
-- COALESCE(parametro, '') en vez de dejar que un parámetro NULL se cuele.

BEGIN;

-- ── 1. createVisita -> crm_crear_visita ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_crear_visita(
  p_fecha TIMESTAMPTZ,
  p_estado TEXT,
  p_notas TEXT,
  p_property_id UUID,
  p_contact_id UUID,
  p_agente_id UUID,
  p_actor_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'Fecha requerida';
  END IF;
  IF p_property_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona al menos un inmueble';
  END IF;
  IF p_estado NOT IN ('Programada', 'Realizada', 'Cancelada') THEN
    RAISE EXCEPTION 'Estado de visita inválido';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  INSERT INTO public.visits (fecha, estado, notas, property_id, contact_id, agente_id)
  VALUES (p_fecha, p_estado, COALESCE(p_notas, ''), p_property_id, p_contact_id, p_agente_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── 2. updateVisitaEstado -> crm_actualizar_visita_estado ───────────────────
CREATE OR REPLACE FUNCTION public.crm_actualizar_visita_estado(
  p_visita_id UUID,
  p_estado TEXT,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_visita_id IS NULL THEN
    RAISE EXCEPTION 'visitaId requerido';
  END IF;
  IF p_estado NOT IN ('Programada', 'Realizada', 'Cancelada') THEN
    RAISE EXCEPTION 'Estado de visita inválido';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  UPDATE public.visits SET estado = p_estado WHERE id = p_visita_id;
END;
$$;

-- ── 3. assignClienteAgentes -> crm_asignar_agentes_cliente ──────────────────
CREATE OR REPLACE FUNCTION public.crm_asignar_agentes_cliente(
  p_contact_id UUID,
  p_agente_ids UUID[],
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'Cliente requerido';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  DELETE FROM public.contact_agents WHERE contact_id = p_contact_id;
  IF p_agente_ids IS NOT NULL AND array_length(p_agente_ids, 1) > 0 THEN
    INSERT INTO public.contact_agents (contact_id, agent_id)
    SELECT p_contact_id, aid FROM unnest(p_agente_ids) AS aid;
  END IF;
END;
$$;

-- ── 4. activarProspecto -> crm_activar_prospecto ────────────────────────────
-- Ya no necesita el rollback manual del código original: al ser un solo RPC,
-- si el UPDATE de contacts falla, el UPDATE de properties se revierte solo.
CREATE OR REPLACE FUNCTION public.crm_activar_prospecto(
  p_contact_id UUID,
  p_property_id UUID,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'contactId requerido';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  IF p_property_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.contact_roles cr
       WHERE cr.contact_id = p_contact_id AND cr.property_id = p_property_id
    ) THEN
      RAISE EXCEPTION 'El inmueble no está vinculado a este prospecto';
    END IF;

    UPDATE public.properties SET estatus = 'Activo', publicacion = 'SUBIR'
     WHERE id = p_property_id;
  END IF;

  UPDATE public.contacts SET ciclo_vida = 'Cliente' WHERE id = p_contact_id;
END;
$$;

-- ── 5. asociarLeadAInmueble -> crm_asociar_lead_inmueble ────────────────────
-- p_tipo ya viene validado por el .validator() de TS a uno de
-- Propietario/Comprador/Inquilino -> el ciclo resultante es siempre
-- 'Cliente' (la rama 'Prospecto' del código original era inalcanzable con
-- esa validación previa; se documenta en vez de replicar código muerto).
CREATE OR REPLACE FUNCTION public.crm_asociar_lead_inmueble(
  p_contact_id UUID,
  p_property_id UUID,
  p_tipo TEXT,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_es_alquiler BOOLEAN;
  v_tipo_relacion TEXT;
BEGIN
  IF p_contact_id IS NULL OR p_property_id IS NULL OR p_tipo IS NULL THEN
    RAISE EXCEPTION 'contactId, propertyId y tipo son obligatorios';
  END IF;
  IF p_tipo NOT IN ('Propietario', 'Comprador', 'Inquilino') THEN
    RAISE EXCEPTION 'Tipo de relación inválido';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;

  SELECT p.es_alquiler INTO v_es_alquiler FROM public.properties p WHERE p.id = p_property_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El inmueble no existe';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  v_tipo_relacion := CASE WHEN p_tipo = 'Propietario' AND v_es_alquiler THEN 'Arrendador' ELSE p_tipo END;

  IF NOT EXISTS (
    SELECT 1 FROM public.contact_roles cr
     WHERE cr.contact_id = p_contact_id AND cr.property_id = p_property_id AND cr.tipo = v_tipo_relacion
  ) THEN
    INSERT INTO public.contact_roles (contact_id, property_id, agente_id, tipo, estado)
    SELECT p_contact_id, p_property_id, cu.agent_id, v_tipo_relacion, 'Prospecto'
      FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id;
  END IF;

  UPDATE public.contacts SET ciclo_vida = 'Cliente' WHERE id = p_contact_id;
END;
$$;

-- ── 6. updateClienteSeguimiento -> crm_actualizar_seguimiento_cliente ───────
-- Los valores de negocio (ciclo_vida vía tipoCicloVida, trabajado="Descartado"
-- si el tipo incluye "anular") se calculan en TS igual que antes -- son
-- mapeos de texto puros, no lógica de seguridad -- y llegan ya resueltos.
CREATE OR REPLACE FUNCTION public.crm_actualizar_seguimiento_cliente(
  p_contact_id UUID,
  p_trabajado TEXT,
  p_ciclo_vida TEXT,
  p_tipo_rol TEXT,
  p_nota TEXT,
  p_agente_id UUID,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_up_count INT := 0;
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'Cliente requerido';
  END IF;
  IF p_trabajado IS NULL AND p_nota IS NULL AND p_tipo_rol IS NULL AND p_ciclo_vida IS NULL THEN
    RAISE EXCEPTION 'Nada que actualizar';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  IF p_tipo_rol IN ('Comprador', 'Inquilino') THEN
    IF NOT EXISTS (SELECT 1 FROM public.contact_agents ca WHERE ca.contact_id = p_contact_id) THEN
      RAISE EXCEPTION 'Este lead debe tener un comercial asignado antes de ser cualificado.';
    END IF;
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  IF p_tipo_rol IN ('Propietario', 'Comprador', 'Inquilino')
     AND NOT EXISTS (
       SELECT 1 FROM public.contact_roles cr
        WHERE cr.contact_id = p_contact_id AND cr.tipo = p_tipo_rol
     ) THEN
    INSERT INTO public.contact_roles (contact_id, agente_id, tipo, estado)
    VALUES (p_contact_id, p_agente_id, p_tipo_rol, 'Prospecto');
  END IF;

  IF p_trabajado IS NOT NULL OR p_ciclo_vida IS NOT NULL THEN
    UPDATE public.contacts
       SET trabajado = COALESCE(p_trabajado, trabajado),
           ciclo_vida = COALESCE(p_ciclo_vida, ciclo_vida)
     WHERE id = p_contact_id;
    GET DIAGNOSTICS v_up_count = ROW_COUNT;
    IF v_up_count = 0 THEN
      RAISE EXCEPTION 'El contacto no existe';
    END IF;
  END IF;

  IF p_nota IS NOT NULL THEN
    INSERT INTO public.seguimiento (contact_id, agente_id, tipo, texto, fecha)
    VALUES (p_contact_id, p_agente_id, 'Nota', p_nota, now());
  END IF;
END;
$$;

-- ── 7. createCliente -> crm_crear_cliente ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_crear_cliente(
  p_nombre TEXT,
  p_ciclo_vida TEXT,
  p_email TEXT,
  p_telefono TEXT,
  p_dni TEXT,
  p_motivo TEXT,
  p_solicitud TEXT,
  p_observaciones TEXT,
  p_categoria TEXT[],
  p_profesion TEXT,
  p_contrato_trabajo TEXT,
  p_mascota TEXT,
  p_avalista TEXT,
  p_created_at TIMESTAMPTZ,
  p_agente_ids UUID[],
  p_crea_relacion BOOLEAN,
  p_tipo_relacion TEXT,
  p_actor_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
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
    categoria, profesion, contrato_trabajo, mascota, avalista, created_at
  ) VALUES (
    p_nombre, p_ciclo_vida,
    COALESCE(p_email, ''), COALESCE(p_telefono, ''), COALESCE(p_dni, ''),
    COALESCE(p_motivo, ''), COALESCE(p_solicitud, ''), COALESCE(p_observaciones, ''),
    COALESCE(p_categoria, '{}'), COALESCE(p_profesion, ''), COALESCE(p_contrato_trabajo, ''),
    COALESCE(p_mascota, ''), COALESCE(p_avalista, ''), COALESCE(p_created_at, now())
  )
  RETURNING id INTO v_id;

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
$$;

-- ── 8. createProspectoManual -> crm_crear_prospecto_manual ──────────────────
CREATE OR REPLACE FUNCTION public.crm_crear_prospecto_manual(
  p_nombre TEXT,
  p_telefono TEXT,
  p_email TEXT,
  p_tipo TEXT,
  p_calle TEXT,
  p_numero TEXT,
  p_localidad TEXT,
  p_precio NUMERIC,
  p_superficie NUMERIC,
  p_habitaciones NUMERIC,
  p_es_alquiler BOOLEAN,
  p_categoria TEXT,
  p_agente_ids UUID[],
  p_actor_id UUID
)
RETURNS TABLE (contact_id UUID, property_id UUID)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact_id UUID;
  v_property_id UUID;
BEGIN
  IF p_nombre IS NULL OR btrim(p_nombre) = '' THEN
    RAISE EXCEPTION 'Nombre del propietario requerido';
  END IF;
  IF p_tipo IS NULL OR btrim(p_tipo) = '' THEN
    RAISE EXCEPTION 'Tipo de inmueble requerido';
  END IF;
  IF p_calle IS NULL OR btrim(p_calle) = '' THEN
    RAISE EXCEPTION 'Calle requerida';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  INSERT INTO public.contacts (nombre, ciclo_vida, canal_origen, telefono, email)
  VALUES (
    p_nombre, 'Prospecto', 'Manual',
    COALESCE(p_telefono, ''), COALESCE(p_email, '')
  )
  RETURNING id INTO v_contact_id;

  INSERT INTO public.properties (
    calle, tipo, estatus, publicacion, es_alquiler, categoria,
    numero, localidad, precio, metros_construidos, habitaciones, agente_id
  ) VALUES (
    p_calle, p_tipo, 'Prospección', 'PROSPECTO', p_es_alquiler, p_categoria,
    COALESCE(p_numero, ''), COALESCE(p_localidad, ''), p_precio, p_superficie, p_habitaciones,
    p_agente_ids[1]
  )
  RETURNING id INTO v_property_id;

  IF p_agente_ids IS NOT NULL AND array_length(p_agente_ids, 1) > 0 THEN
    INSERT INTO public.contact_agents (contact_id, agent_id)
    SELECT v_contact_id, aid FROM unnest(p_agente_ids) AS aid;
  END IF;

  INSERT INTO public.contact_roles (contact_id, property_id, agente_id, tipo)
  VALUES (v_contact_id, v_property_id, p_agente_ids[1], 'Propietario');

  RETURN QUERY SELECT v_contact_id, v_property_id;
END;
$$;

-- ── Grants: solo service_role para las 8 ────────────────────────────────────
REVOKE ALL ON FUNCTION public.crm_crear_visita(TIMESTAMPTZ,TEXT,TEXT,UUID,UUID,UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_crear_visita(TIMESTAMPTZ,TEXT,TEXT,UUID,UUID,UUID,UUID) TO service_role;

REVOKE ALL ON FUNCTION public.crm_actualizar_visita_estado(UUID,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_actualizar_visita_estado(UUID,TEXT,UUID) TO service_role;

REVOKE ALL ON FUNCTION public.crm_asignar_agentes_cliente(UUID,UUID[],UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_asignar_agentes_cliente(UUID,UUID[],UUID) TO service_role;

REVOKE ALL ON FUNCTION public.crm_activar_prospecto(UUID,UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_activar_prospecto(UUID,UUID,UUID) TO service_role;

REVOKE ALL ON FUNCTION public.crm_asociar_lead_inmueble(UUID,UUID,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_asociar_lead_inmueble(UUID,UUID,TEXT,UUID) TO service_role;

REVOKE ALL ON FUNCTION public.crm_actualizar_seguimiento_cliente(UUID,TEXT,TEXT,TEXT,TEXT,UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_actualizar_seguimiento_cliente(UUID,TEXT,TEXT,TEXT,TEXT,UUID,UUID) TO service_role;

REVOKE ALL ON FUNCTION public.crm_crear_cliente(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT[],TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID[],BOOLEAN,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_crear_cliente(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT[],TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ,UUID[],BOOLEAN,TEXT,UUID) TO service_role;

REVOKE ALL ON FUNCTION public.crm_crear_prospecto_manual(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,NUMERIC,BOOLEAN,TEXT,UUID[],UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_crear_prospecto_manual(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,NUMERIC,BOOLEAN,TEXT,UUID[],UUID) TO service_role;

DO $postflight$
DECLARE
  v_anon_puede BOOLEAN;
BEGIN
  SELECT
    has_function_privilege('anon', 'public.crm_crear_visita(timestamptz,text,text,uuid,uuid,uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.crm_actualizar_visita_estado(uuid,text,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.crm_asignar_agentes_cliente(uuid,uuid[],uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.crm_activar_prospecto(uuid,uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.crm_asociar_lead_inmueble(uuid,uuid,text,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.crm_actualizar_seguimiento_cliente(uuid,text,text,text,text,uuid,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.crm_crear_cliente(text,text,text,text,text,text,text,text,text[],text,text,text,text,timestamptz,uuid[],boolean,text,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.crm_crear_prospecto_manual(text,text,text,text,text,text,text,numeric,numeric,numeric,boolean,text,uuid[],uuid)', 'EXECUTE')
  INTO v_anon_puede;

  IF v_anon_puede THEN
    RAISE EXCEPTION 'Postflight: alguna de las 8 funciones sigue siendo ejecutable por anon';
  END IF;

  RAISE NOTICE 'Postflight OK: las 8 funciones quedan restringidas a service_role';
END $postflight$;

COMMIT;
