-- H-05, parte 4: los 3 dominios de escritura restantes en clientes.functions.ts
-- (deleteContacto, restaurarContactoDeHistorico, gestionarRol+recalcularEtapa).
-- Mismo patrón que las migraciones anteriores: actor como parámetro, fijado con
-- set_config(...,TRUE) dentro del mismo RPC que escribe, SECURITY INVOKER,
-- restringido a service_role.

BEGIN;

-- ── 1. deleteContacto → crm_eliminar_contacto ───────────────────────────────
CREATE OR REPLACE FUNCTION public.crm_eliminar_contacto(
  p_contact_id UUID,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
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

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  DELETE FROM public.contact_roles WHERE contact_id = p_contact_id;
  DELETE FROM public.contact_agents WHERE contact_id = p_contact_id;
  DELETE FROM public.contacts WHERE id = p_contact_id;
END;
$$;

COMMENT ON FUNCTION public.crm_eliminar_contacto(UUID, UUID) IS
  'Borra un contacto y sus relaciones dejando el actor real en audit_log.usuario_id (H-05).';

-- ── 2. restaurarContactoDeHistorico → crm_restaurar_contacto_historico ──────
CREATE OR REPLACE FUNCTION public.crm_restaurar_contacto_historico(
  p_contact_id UUID,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ciclo_vida TEXT;
  v_anterior TEXT;
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

  SELECT c.ciclo_vida, c.ciclo_vida_anterior INTO v_ciclo_vida, v_anterior
    FROM public.contacts c WHERE c.id = p_contact_id FOR UPDATE;

  IF NOT FOUND OR v_ciclo_vida IS DISTINCT FROM 'Histórico' THEN
    RAISE EXCEPTION 'El contacto no está en histórico';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  UPDATE public.contacts
     SET ciclo_vida = COALESCE(v_anterior, 'Lead'),
         ciclo_vida_anterior = NULL
   WHERE id = p_contact_id;
END;
$$;

COMMENT ON FUNCTION public.crm_restaurar_contacto_historico(UUID, UUID) IS
  'Restaura un contacto desde Histórico a su etapa previa, actor real en audit_log (H-05).';

-- ── 3. gestionarRol + recalcularEtapa → crm_gestionar_rol ───────────────────
-- Replica exactamente la regla de recalcularEtapa (clientes.functions.ts):
-- Activo/Reservado -> Cliente; si no, Prospección -> Prospecto; si no,
-- Vendido/Alquilado -> Histórico; si no, algún rol de cliente -> Cliente;
-- si no, Lead. Descartado nunca se recalcula.
CREATE OR REPLACE FUNCTION public.crm_gestionar_rol(
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
  v_actor_agente_id UUID;
  v_tipo TEXT := p_tipo;
  v_es_alquiler BOOLEAN;
  v_existing_id UUID;
  v_ciclo_actual TEXT;
  v_ciclo_nuevo TEXT;
BEGIN
  IF p_contact_id IS NULL OR p_property_id IS NULL THEN
    RAISE EXCEPTION 'contactId y propertyId requeridos';
  END IF;
  IF v_tipo IS NOT NULL AND v_tipo NOT IN ('Propietario', 'Arrendador', 'Comprador', 'Inquilino') THEN
    RAISE EXCEPTION 'Tipo de relación inválido';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;

  SELECT cu.agent_id INTO v_actor_agente_id
    FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  IF v_tipo = 'Propietario' THEN
    SELECT p.es_alquiler INTO v_es_alquiler FROM public.properties p WHERE p.id = p_property_id;
    IF v_es_alquiler THEN v_tipo := 'Arrendador'; END IF;
  END IF;

  SELECT cr.id INTO v_existing_id
    FROM public.contact_roles cr
   WHERE cr.contact_id = p_contact_id AND cr.property_id = p_property_id
   LIMIT 1;

  IF v_tipo IS NULL THEN
    IF v_existing_id IS NOT NULL THEN
      DELETE FROM public.contact_roles WHERE id = v_existing_id;
    END IF;
  ELSIF v_existing_id IS NOT NULL THEN
    UPDATE public.contact_roles
       SET tipo = v_tipo, agente_id = v_actor_agente_id
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.contact_roles (contact_id, property_id, agente_id, tipo, estado)
    VALUES (p_contact_id, p_property_id, v_actor_agente_id, v_tipo, 'Prospecto');
  END IF;

  -- recalcularEtapa, en línea
  SELECT c.ciclo_vida INTO v_ciclo_actual FROM public.contacts c WHERE c.id = p_contact_id;
  IF v_ciclo_actual IS DISTINCT FROM 'Descartado' THEN
    SELECT
      CASE
        WHEN bool_or(p.estatus IN ('Activo', 'Reservado')) THEN 'Cliente'
        WHEN bool_or(p.estatus = 'Prospección') THEN 'Prospecto'
        WHEN bool_or(p.estatus IN ('Vendido', 'Alquilado')) THEN 'Histórico'
        WHEN bool_or(cr.tipo IN ('Propietario', 'Arrendador', 'Comprador', 'Inquilino')) THEN 'Cliente'
        ELSE 'Lead'
      END
      INTO v_ciclo_nuevo
      FROM public.contact_roles cr
      LEFT JOIN public.properties p ON p.id = cr.property_id
     WHERE cr.contact_id = p_contact_id;

    v_ciclo_nuevo := COALESCE(v_ciclo_nuevo, 'Lead');
    IF v_ciclo_nuevo IS DISTINCT FROM v_ciclo_actual THEN
      UPDATE public.contacts SET ciclo_vida = v_ciclo_nuevo WHERE id = p_contact_id;
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.crm_gestionar_rol(UUID, UUID, TEXT, UUID) IS
  'Crea/actualiza/borra un contact_role y recalcula ciclo_vida, actor real en audit_log (H-05).';

-- ── Grants: solo service_role para las 3 ────────────────────────────────────
REVOKE ALL ON FUNCTION public.crm_eliminar_contacto(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_eliminar_contacto(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.crm_restaurar_contacto_historico(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_restaurar_contacto_historico(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.crm_gestionar_rol(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gestionar_rol(UUID, UUID, TEXT, UUID) TO service_role;

DO $postflight$
BEGIN
  IF has_function_privilege('anon', 'public.crm_eliminar_contacto(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.crm_restaurar_contacto_historico(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.crm_gestionar_rol(uuid,uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Postflight: alguna de las 3 funciones sigue siendo ejecutable por anon';
  END IF;
  RAISE NOTICE 'Postflight OK: las 3 funciones quedan restringidas a service_role';
END $postflight$;

COMMIT;
