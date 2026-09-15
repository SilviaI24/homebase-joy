-- Instrucciones de mejora del CRM (sep 2026), punto "Interesado ligado a
-- inmueble": clasificación simplificada acordada con los comerciales -- el
-- contacto sigue siendo un Lead/Prospecto normal (no se toca ciclo_vida),
-- solo se añade un enlace contacto-inmueble de tipo 'Interesado' (uno solo,
-- sin separar compra/alquiler -- eso ya lo dice el propio inmueble).
--
-- De paso se corrige un bug real de crm_asociar_lead_inmueble: promovía
-- ciclo_vida a 'Cliente' sin condición, para cualquier tipo -- con
-- 'Interesado' eso estaría mal (todavía no ha comprado/alquilado/reservado
-- nada, sigue siendo un lead).
--
-- NOTA: la parte de "un inmueble, un único comprador/inquilino" (bloqueo
-- automático) NO se incluye aquí -- ver aviso aparte, los datos reales de
-- producción tienen varias filas 'Comprador'/'Inquilino' simultáneas y
-- activas para un mismo inmueble (compras/alquileres conjuntos, p. ej. una
-- pareja), así que un bloqueo a nivel de base de datos rompería ese caso
-- real. Queda pendiente de decidir con David antes de tocarlo.

BEGIN;

ALTER TABLE public.contact_roles DROP CONSTRAINT IF EXISTS contact_roles_tipo_check;
ALTER TABLE public.contact_roles
  ADD CONSTRAINT contact_roles_tipo_check
  CHECK (tipo = ANY (ARRAY['Comprador', 'Inquilino', 'Propietario', 'Arrendador', 'Interesado']));

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
  IF p_tipo NOT IN ('Propietario', 'Comprador', 'Inquilino', 'Interesado') THEN
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

  -- 'Interesado' es un lead mirando un inmueble concreto, no un cliente
  -- formalizado -- antes esta función promovía a 'Cliente' sin condición
  -- para cualquier tipo.
  IF v_tipo_relacion <> 'Interesado' THEN
    UPDATE public.contacts SET ciclo_vida = 'Cliente' WHERE id = p_contact_id;
  END IF;
END;
$$;

COMMIT;
