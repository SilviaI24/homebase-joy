-- Postflight destructivo-controlado para la branch QA `rbac-p0`.
-- Crea fixtures dentro de una transacción y termina siempre con ROLLBACK.
-- No ejecutar en producción.

BEGIN;

DO $$
DECLARE
  v_user_id UUID;
  v_agent_id UUID;
  v_owner_id UUID;
  v_buyer_id UUID;
  v_property_id UUID;
  v_operation_id UUID;
  v_result RECORD;
  v_count INTEGER;
BEGIN
  SELECT crm.user_id, crm.agent_id
    INTO v_user_id, v_agent_id
    FROM public.crm_usuarios AS crm
    JOIN public.agents AS a ON a.id = crm.agent_id AND a.activo = TRUE
   WHERE crm.activo = TRUE
   ORDER BY crm.created_at, crm.user_id
   LIMIT 1;

  IF v_user_id IS NULL OR v_agent_id IS NULL THEN
    RAISE EXCEPTION 'POSTFLIGHT: no existe ningún usuario CRM vinculado a un agente activo';
  END IF;

  INSERT INTO public.contacts (nombre, telefono, ciclo_vida, canal_origen)
  VALUES ('QA propietario cierre', 'QA-OWNER', 'Prospecto', 'Manual')
  RETURNING id INTO v_owner_id;

  INSERT INTO public.contacts (nombre, telefono, ciclo_vida, canal_origen)
  VALUES ('QA comprador cierre', 'QA-BUYER', 'Prospecto', 'Manual')
  RETURNING id INTO v_buyer_id;

  INSERT INTO public.properties (
    ref, tipo, categoria, es_alquiler, calle, precio, estatus, agente_id
  )
  VALUES (
    concat('QA-CIERRE-', left(gen_random_uuid()::TEXT, 8)),
    'Piso', 'Venta', FALSE, 'Calle QA cierre', 200000, 'Activo', v_agent_id
  )
  RETURNING id INTO v_property_id;

  INSERT INTO public.operations (
    tipo, estado, property_id, agente_id, vendedor_id, comprador_id,
    precio_operacion, comision_pct
  )
  VALUES (
    'Venta', 'En negociación', v_property_id, v_agent_id, v_owner_id,
    v_buyer_id, 195000, 3
  )
  RETURNING id INTO v_operation_id;

  SELECT *
    INTO v_result
    FROM public.cerrar_operacion_crm(v_operation_id, v_user_id, v_agent_id);

  IF v_result.estado <> 'Cerrada' OR v_result.ya_estaba_cerrada THEN
    RAISE EXCEPTION 'POSTFLIGHT: la operación no quedó cerrada correctamente';
  END IF;

  IF v_result.property_estatus <> 'Vendido' OR v_result.contact_role_id IS NULL THEN
    RAISE EXCEPTION 'POSTFLIGHT: inmueble o pipeline no quedaron sincronizados';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.properties
     WHERE id = v_property_id
       AND estatus = 'Vendido'
       AND precio_final = 195000
       AND fecha_escritura IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT: el estado final del inmueble es incorrecto';
  END IF;

  SELECT count(*)
    INTO v_count
    FROM public.contact_roles
   WHERE property_id = v_property_id
     AND estado = 'Cerrado'
     AND (
       (contact_id = v_owner_id AND tipo = 'Propietario') OR
       (contact_id = v_buyer_id AND tipo = 'Comprador')
     );

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'POSTFLIGHT: se esperaban 2 roles cerrados y se encontraron %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contacts
     WHERE id IN (v_owner_id, v_buyer_id)
       AND ciclo_vida <> 'Histórico'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT: el ciclo de vida final de las partes es incorrecto';
  END IF;

  SELECT count(*)
    INTO v_count
    FROM public.seguimiento
   WHERE operation_id = v_operation_id;

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'POSTFLIGHT: se esperaban 2 entradas de seguimiento y se encontraron %', v_count;
  END IF;

  -- La repetición debe ser idempotente y no crear más seguimiento.
  SELECT *
    INTO v_result
    FROM public.cerrar_operacion_crm(v_operation_id, v_user_id, v_agent_id);

  IF NOT v_result.ya_estaba_cerrada THEN
    RAISE EXCEPTION 'POSTFLIGHT: el segundo cierre no se reconoció como idempotente';
  END IF;

  SELECT count(*)
    INTO v_count
    FROM public.seguimiento
   WHERE operation_id = v_operation_id;

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'POSTFLIGHT: el segundo cierre duplicó el seguimiento';
  END IF;

  RAISE NOTICE 'POSTFLIGHT OK: cierre atómico e idempotente validado';
END;
$$;

DO $$
DECLARE
  v_user_id UUID;
  v_agent_id UUID;
  v_owner_id UUID;
  v_tenant_id UUID;
  v_property_id UUID;
  v_operation_id UUID;
  v_result RECORD;
  v_error TEXT;
BEGIN
  SELECT crm.user_id, crm.agent_id
    INTO v_user_id, v_agent_id
    FROM public.crm_usuarios AS crm
    JOIN public.agents AS a ON a.id = crm.agent_id AND a.activo = TRUE
   WHERE crm.activo = TRUE
   ORDER BY crm.created_at, crm.user_id
   LIMIT 1;

  INSERT INTO public.contacts (nombre, telefono, ciclo_vida, canal_origen)
  VALUES ('QA arrendador cierre', 'QA-LANDLORD', 'Cliente', 'Manual')
  RETURNING id INTO v_owner_id;

  INSERT INTO public.contacts (nombre, telefono, ciclo_vida, canal_origen)
  VALUES ('QA inquilino cierre', 'QA-TENANT', 'Cliente', 'Manual')
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.properties (
    ref, tipo, categoria, es_alquiler, calle, precio, estatus, publicacion, agente_id
  )
  VALUES (
    concat('QA-ALQUILER-', left(gen_random_uuid()::TEXT, 8)),
    'Piso', 'Alquiler', TRUE, 'Calle QA alquiler', 950, 'Reservado', 'PUBLICADO', v_agent_id
  )
  RETURNING id INTO v_property_id;

  -- Este segundo rol abierto debe mantener al inquilino como Cliente tras cerrar
  -- la relación correspondiente al alquiler.
  INSERT INTO public.contact_roles (
    contact_id, agente_id, tipo, estado
  ) VALUES (
    v_tenant_id, v_agent_id, 'Comprador', 'Activo'
  );

  INSERT INTO public.operations (
    tipo, estado, property_id, agente_id, vendedor_id, comprador_id,
    precio_operacion, comision_pct
  )
  VALUES (
    'Alquiler', 'En negociación', v_property_id, v_agent_id, v_owner_id,
    v_tenant_id, 925, 5
  )
  RETURNING id INTO v_operation_id;

  SELECT *
    INTO v_result
    FROM public.cerrar_operacion_crm(v_operation_id, v_user_id, v_agent_id);

  IF v_result.estado <> 'Cerrada' OR v_result.property_estatus <> 'Alquilado' THEN
    RAISE EXCEPTION 'POSTFLIGHT: el alquiler no quedó cerrado correctamente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.properties
     WHERE id = v_property_id
       AND estatus = 'Alquilado'
       AND publicacion = ''
       AND precio_final = 925
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT: el estado final del alquiler es incorrecto';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.contact_roles
     WHERE property_id = v_property_id
       AND contact_id = v_owner_id
       AND tipo = 'Arrendador'
       AND estado = 'Cerrado'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.contact_roles
     WHERE property_id = v_property_id
       AND contact_id = v_tenant_id
       AND tipo = 'Inquilino'
       AND estado = 'Cerrado'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT: los roles del alquiler son incorrectos';
  END IF;

  IF (SELECT ciclo_vida FROM public.contacts WHERE id = v_owner_id) <> 'Histórico' THEN
    RAISE EXCEPTION 'POSTFLIGHT: el arrendador debería quedar Histórico';
  END IF;

  IF (SELECT ciclo_vida FROM public.contacts WHERE id = v_tenant_id) <> 'Cliente' THEN
    RAISE EXCEPTION 'POSTFLIGHT: el inquilino con otro rol abierto debería seguir como Cliente';
  END IF;

  -- Una operación cerrada debe ser completamente inmutable.
  BEGIN
    UPDATE public.operations SET notas = 'mutación no permitida' WHERE id = v_operation_id;
    RAISE EXCEPTION 'POSTFLIGHT: se pudo modificar una operación cerrada';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error NOT LIKE 'Una operación cerrada es inmutable%' THEN
      RAISE;
    END IF;
  END;

  -- El sync stale no debe reactivar ni republicar un inmueble final.
  UPDATE public.properties
     SET estatus = 'Activo', publicacion = 'PUBLICADO', precio_final = 1
   WHERE id = v_property_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.properties
     WHERE id = v_property_id
       AND estatus = 'Alquilado'
       AND publicacion = ''
       AND precio_final = 925
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT: el guard no preservó el estado final del inmueble';
  END IF;

  -- No se puede insertar una operación ya cerrada saltándose la RPC.
  BEGIN
    INSERT INTO public.operations (tipo, estado, agente_id)
    VALUES ('Servicio', 'Cerrada', v_agent_id);
    RAISE EXCEPTION 'POSTFLIGHT: se pudo insertar directamente una operación cerrada';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error NOT LIKE 'El cierre debe ejecutarse mediante cerrar_operacion_crm%' THEN
      RAISE;
    END IF;
  END;

  IF has_function_privilege(
    'anon', 'public.cerrar_operacion_crm(uuid,uuid,uuid)', 'EXECUTE'
  ) OR has_function_privilege(
    'authenticated', 'public.cerrar_operacion_crm(uuid,uuid,uuid)', 'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role', 'public.cerrar_operacion_crm(uuid,uuid,uuid)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT: grants incorrectos en cerrar_operacion_crm';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'operations'
       AND policyname = 'staff ve y escribe operations'
  ) THEN
    RAISE EXCEPTION 'POSTFLIGHT: la policy legacy de operations sigue activa';
  END IF;

  RAISE NOTICE 'POSTFLIGHT OK: alquiler, guards y grants validados';
END;
$$;

ROLLBACK;
