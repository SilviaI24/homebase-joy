-- Cierre atómico de operaciones del CRM.
--
-- Esta migración se prepara para la branch QA `rbac-p0`. No debe aplicarse en
-- producción hasta completar el postflight y recibir aprobación explícita.

BEGIN;

-- La tabla estaba vacía en el inventario ESGI. Si aparecen cierres legacy antes
-- de aplicar esta migración, se detiene para reconciliarlos en vez de asumir que
-- cumplen las nuevas invariantes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.operations WHERE estado = 'Cerrada') THEN
    RAISE EXCEPTION 'Preflight: existen operaciones cerradas que deben reconciliarse antes de instalar la RPC';
  END IF;
END;
$$;

-- Columnas ya previstas por la reconciliación ESGI. Los IF NOT EXISTS hacen la
-- migración compatible con entornos locales cuyo historial todavía no las tenga.
ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS contact_role_id UUID
    REFERENCES public.contact_roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.seguimiento
  ADD COLUMN IF NOT EXISTS operation_id UUID
    REFERENCES public.operations(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.operations'::regclass
       AND conname = 'operations_comision_pct_check'
  ) THEN
    ALTER TABLE public.operations
      ADD CONSTRAINT operations_comision_pct_check
      CHECK (comision_pct IS NULL OR comision_pct BETWEEN 0 AND 100)
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.operations
  VALIDATE CONSTRAINT operations_comision_pct_check;

CREATE INDEX IF NOT EXISTS idx_operations_contact_role_id
  ON public.operations(contact_role_id)
  WHERE contact_role_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_seguimiento_operation_id
  ON public.seguimiento(operation_id)
  WHERE operation_id IS NOT NULL;

-- El CRM actual accede a operations exclusivamente desde funciones server-only.
-- Esta policy legacy exponía también precios/comisiones y permitía escrituras
-- directas desde authenticated, fuera del RBAC nuevo.
DROP POLICY IF EXISTS "staff ve y escribe operations" ON public.operations;

-- Impide que un UPDATE directo (incluido uno hecho con service_role desde una
-- función de servidor) salte la sincronización atómica. La RPC habilita esta
-- transición únicamente dentro de su propia transacción.
CREATE OR REPLACE FUNCTION public.crm_guard_operation_closed_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado = 'Cerrada' THEN
      RAISE EXCEPTION 'Una operación cerrada es inmutable y no puede eliminarse';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'Cerrada'
       AND current_setting('app.crm_atomic_close', TRUE) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'El cierre debe ejecutarse mediante cerrar_operacion_crm';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.estado = 'Cerrada' THEN
    RAISE EXCEPTION 'Una operación cerrada es inmutable y no puede modificarse';
  END IF;

  IF NEW.estado = 'Cerrada'
     AND current_setting('app.crm_atomic_close', TRUE) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'El cierre debe ejecutarse mediante cerrar_operacion_crm';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_guard_operation_closed_state() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_crm_guard_operation_closed_state ON public.operations;
CREATE TRIGGER trg_crm_guard_operation_closed_state
  BEFORE INSERT OR UPDATE OR DELETE ON public.operations
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_guard_operation_closed_state();

-- Airtable sigue alimentando properties durante la transición. Este guard evita
-- que el upsert nocturno revierta los campos finales de una operación ya cerrada.
-- Los demás metadatos del inmueble continúan sincronizándose con normalidad.
CREATE OR REPLACE FUNCTION public.crm_preserve_closed_property_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.estatus IN ('Vendido', 'Alquilado')
     AND current_setting('app.crm_property_final_override', TRUE) IS DISTINCT FROM 'on' THEN
    NEW.estatus := OLD.estatus;
    NEW.precio_final := OLD.precio_final;
    NEW.fecha_escritura := OLD.fecha_escritura;
    NEW.publicacion := OLD.publicacion;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_preserve_closed_property_state() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_crm_preserve_closed_property_state ON public.properties;
CREATE TRIGGER trg_crm_preserve_closed_property_state
  BEFORE UPDATE OF estatus, precio_final, fecha_escritura, publicacion ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.crm_preserve_closed_property_state();

CREATE OR REPLACE FUNCTION public.cerrar_operacion_crm(
  p_operacion_id UUID,
  p_actor_user_id UUID,
  p_actor_agente_id UUID DEFAULT NULL
)
RETURNS TABLE (
  operacion_id UUID,
  estado TEXT,
  property_id UUID,
  property_estatus TEXT,
  contact_role_id UUID,
  ya_estaba_cerrada BOOLEAN
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op public.operations%ROWTYPE;
  v_property public.properties%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_actor_agente_id UUID;
  v_owner_role TEXT;
  v_client_role TEXT;
  v_owner_role_id UUID;
  v_client_role_id UUID;
  v_target_property_status TEXT;
  v_actor_profile_agent_id UUID;
  v_role_count INTEGER;
BEGIN
  IF p_operacion_id IS NULL THEN
    RAISE EXCEPTION 'La operación es obligatoria';
  END IF;

  -- Serializa dos intentos simultáneos de cierre sobre la misma operación.
  SELECT op.*
    INTO v_op
    FROM public.operations AS op
   WHERE op.id = p_operacion_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La operación no existe';
  END IF;

  IF v_op.estado = 'Cerrada' THEN
    RETURN QUERY
    SELECT
      v_op.id,
      v_op.estado,
      v_op.property_id,
      p.estatus,
      v_op.contact_role_id,
      TRUE
    FROM (SELECT 1) AS one
    LEFT JOIN public.properties AS p ON p.id = v_op.property_id;
    RETURN;
  END IF;

  IF v_op.estado = 'Cancelada' THEN
    RAISE EXCEPTION 'Una operación cancelada no puede cerrarse; debe reabrirse primero';
  END IF;

  IF v_op.estado NOT IN ('Abierta', 'En negociación') THEN
    RAISE EXCEPTION 'El estado actual de la operación no permite cerrarla';
  END IF;

  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cierre es obligatorio';
  END IF;

  SELECT crm.agent_id
    INTO v_actor_profile_agent_id
    FROM public.crm_usuarios AS crm
   WHERE crm.user_id = p_actor_user_id
     AND crm.activo = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  IF p_actor_agente_id IS NOT NULL
     AND v_actor_profile_agent_id IS DISTINCT FROM p_actor_agente_id THEN
    RAISE EXCEPTION 'El agente indicado no corresponde al usuario autenticado';
  END IF;

  v_actor_agente_id := COALESCE(v_actor_profile_agent_id, v_op.agente_id);
  IF v_actor_agente_id IS NULL THEN
    RAISE EXCEPTION 'La operación necesita un agente responsable para poder cerrarse';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.agents AS a
     WHERE a.id = v_actor_agente_id
       AND a.activo IS TRUE
  ) THEN
    RAISE EXCEPTION 'El agente responsable no existe o está inactivo';
  END IF;

  IF v_op.tipo IN ('Venta', 'Alquiler') THEN
    IF v_op.property_id IS NULL THEN
      RAISE EXCEPTION 'La operación necesita un inmueble para poder cerrarse';
    END IF;
    IF v_op.vendedor_id IS NULL THEN
      RAISE EXCEPTION 'La operación necesita un propietario o arrendador';
    END IF;
    IF v_op.comprador_id IS NULL THEN
      RAISE EXCEPTION 'La operación necesita un comprador o inquilino';
    END IF;
    IF v_op.vendedor_id = v_op.comprador_id THEN
      RAISE EXCEPTION 'El propietario y el comprador o inquilino deben ser contactos distintos';
    END IF;
    IF v_op.precio_operacion IS NULL OR v_op.precio_operacion <= 0 THEN
      RAISE EXCEPTION 'La operación necesita un precio final mayor que cero';
    END IF;
    IF v_op.comision_pct IS NOT NULL
       AND (v_op.comision_pct < 0 OR v_op.comision_pct > 100) THEN
      RAISE EXCEPTION 'La comisión debe estar entre 0 y 100';
    END IF;

    SELECT p.*
      INTO v_property
      FROM public.properties AS p
     WHERE p.id = v_op.property_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El inmueble de la operación no existe';
    END IF;

    IF v_op.tipo = 'Venta' AND COALESCE(v_property.es_alquiler, FALSE) THEN
      RAISE EXCEPTION 'Un inmueble de alquiler no puede cerrarse como venta';
    END IF;
    IF v_op.tipo = 'Alquiler' AND NOT COALESCE(v_property.es_alquiler, FALSE) THEN
      RAISE EXCEPTION 'Un inmueble de venta no puede cerrarse como alquiler';
    END IF;

    v_owner_role := CASE WHEN v_op.tipo = 'Venta' THEN 'Propietario' ELSE 'Arrendador' END;
    v_client_role := CASE WHEN v_op.tipo = 'Venta' THEN 'Comprador' ELSE 'Inquilino' END;
    v_target_property_status := CASE WHEN v_op.tipo = 'Venta' THEN 'Vendido' ELSE 'Alquilado' END;

    IF v_property.estatus NOT IN ('Activo', 'Reservado') THEN
      RAISE EXCEPTION 'Solo puede cerrarse una operación con un inmueble activo o reservado';
    END IF;

    -- Orden determinista: evita carreras entre dos operaciones que compartan
    -- alguna de las partes mientras se recalculan sus roles y ciclo de vida.
    PERFORM c.id
      FROM public.contacts AS c
     WHERE c.id = ANY (ARRAY[v_op.vendedor_id, v_op.comprador_id]::UUID[])
     ORDER BY c.id
     FOR UPDATE;

    PERFORM cr.id
      FROM public.contact_roles AS cr
     WHERE cr.contact_id = ANY (ARRAY[v_op.vendedor_id, v_op.comprador_id]::UUID[])
     ORDER BY cr.id
     FOR UPDATE;

    SELECT count(*)
      INTO v_role_count
      FROM public.contact_roles AS cr
     WHERE cr.contact_id = v_op.vendedor_id
       AND cr.property_id = v_op.property_id
       AND cr.tipo = ANY (
         CASE
           WHEN v_op.tipo = 'Alquiler' THEN ARRAY['Arrendador', 'Propietario']::TEXT[]
           ELSE ARRAY['Propietario']::TEXT[]
         END
       )
       AND cr.estado IN ('Prospecto', 'Activo');

    IF v_role_count > 1 THEN
      RAISE EXCEPTION 'Hay varias relaciones abiertas de propietario para el mismo inmueble';
    END IF;

    SELECT count(*)
      INTO v_role_count
      FROM public.contact_roles AS cr
     WHERE cr.contact_id = v_op.comprador_id
       AND cr.property_id = v_op.property_id
       AND cr.tipo = v_client_role
       AND cr.estado IN ('Prospecto', 'Activo');

    IF v_role_count > 1 THEN
      RAISE EXCEPTION 'Hay varias relaciones abiertas de comprador o inquilino para el mismo inmueble';
    END IF;

    -- Propietario/arrendador: reutiliza primero la relación exacta. En alquiler
    -- acepta el rol legacy Propietario y lo normaliza a Arrendador.
    SELECT cr.id
      INTO v_owner_role_id
      FROM public.contact_roles AS cr
     WHERE cr.contact_id = v_op.vendedor_id
       AND cr.property_id = v_op.property_id
       AND cr.tipo = ANY (
         CASE
           WHEN v_op.tipo = 'Alquiler' THEN ARRAY['Arrendador', 'Propietario']::TEXT[]
           ELSE ARRAY['Propietario']::TEXT[]
         END
       )
       AND cr.estado IN ('Prospecto', 'Activo')
     ORDER BY cr.created_at DESC, cr.id
     LIMIT 1
     FOR UPDATE;

    IF v_owner_role_id IS NOT NULL THEN
      UPDATE public.contact_roles AS target_role
         SET tipo = v_owner_role,
             estado = 'Cerrado',
             agente_id = COALESCE(target_role.agente_id, v_actor_agente_id),
             fecha_conversion = COALESCE(target_role.fecha_conversion, v_now),
             fecha_cierre = v_now,
             updated_at = v_now
       WHERE target_role.id = v_owner_role_id;
    ELSE
      SELECT count(*)
        INTO v_role_count
        FROM public.contact_roles AS cr
       WHERE cr.contact_id = v_op.vendedor_id
         AND cr.property_id IS NULL
         AND cr.tipo = ANY (
           CASE
             WHEN v_op.tipo = 'Alquiler' THEN ARRAY['Arrendador', 'Propietario']::TEXT[]
             ELSE ARRAY['Propietario']::TEXT[]
           END
         )
         AND cr.estado IN ('Prospecto', 'Activo');

      IF v_role_count > 1 THEN
        RAISE EXCEPTION 'Hay varias relaciones genéricas abiertas de propietario';
      END IF;

      SELECT cr.id
        INTO v_owner_role_id
        FROM public.contact_roles AS cr
       WHERE cr.contact_id = v_op.vendedor_id
         AND cr.property_id IS NULL
         AND cr.tipo = ANY (
           CASE
             WHEN v_op.tipo = 'Alquiler' THEN ARRAY['Arrendador', 'Propietario']::TEXT[]
             ELSE ARRAY['Propietario']::TEXT[]
           END
         )
         AND cr.estado IN ('Prospecto', 'Activo')
       ORDER BY cr.created_at DESC, cr.id
       LIMIT 1
       FOR UPDATE;

      IF v_owner_role_id IS NULL THEN
        INSERT INTO public.contact_roles (
          contact_id, agente_id, property_id, tipo, estado,
          fecha_conversion, fecha_cierre, updated_at
        )
        VALUES (
          v_op.vendedor_id, v_actor_agente_id, v_op.property_id, v_owner_role,
          'Cerrado', v_now, v_now, v_now
        )
        RETURNING id INTO v_owner_role_id;
      ELSE
        UPDATE public.contact_roles
           SET property_id = v_op.property_id,
               tipo = v_owner_role,
               estado = 'Cerrado',
               agente_id = COALESCE(agente_id, v_actor_agente_id),
               fecha_conversion = COALESCE(fecha_conversion, v_now),
               fecha_cierre = v_now,
               updated_at = v_now
         WHERE id = v_owner_role_id;
      END IF;
    END IF;

    -- Comprador/inquilino: esta relación es el pipeline que operations referencia.
    SELECT cr.id
      INTO v_client_role_id
      FROM public.contact_roles AS cr
     WHERE cr.contact_id = v_op.comprador_id
       AND cr.property_id = v_op.property_id
       AND cr.tipo = v_client_role
       AND cr.estado IN ('Prospecto', 'Activo')
     ORDER BY cr.created_at DESC, cr.id
     LIMIT 1
     FOR UPDATE;

    IF v_client_role_id IS NOT NULL THEN
      UPDATE public.contact_roles AS target_role
         SET estado = 'Cerrado',
             agente_id = COALESCE(target_role.agente_id, v_actor_agente_id),
             fecha_conversion = COALESCE(target_role.fecha_conversion, v_now),
             fecha_cierre = v_now,
             updated_at = v_now
       WHERE target_role.id = v_client_role_id;
    ELSE
      SELECT count(*)
        INTO v_role_count
        FROM public.contact_roles AS cr
       WHERE cr.contact_id = v_op.comprador_id
         AND cr.property_id IS NULL
         AND cr.tipo = v_client_role
         AND cr.estado IN ('Prospecto', 'Activo');

      IF v_role_count > 1 THEN
        RAISE EXCEPTION 'Hay varias relaciones genéricas abiertas de comprador o inquilino';
      END IF;

      SELECT cr.id
        INTO v_client_role_id
        FROM public.contact_roles AS cr
       WHERE cr.contact_id = v_op.comprador_id
         AND cr.property_id IS NULL
         AND cr.tipo = v_client_role
         AND cr.estado IN ('Prospecto', 'Activo')
       ORDER BY cr.created_at DESC, cr.id
       LIMIT 1
       FOR UPDATE;

      IF v_client_role_id IS NULL THEN
        INSERT INTO public.contact_roles (
          contact_id, agente_id, property_id, tipo, estado,
          fecha_conversion, fecha_cierre, updated_at
        )
        VALUES (
          v_op.comprador_id, v_actor_agente_id, v_op.property_id, v_client_role,
          'Cerrado', v_now, v_now, v_now
        )
        RETURNING id INTO v_client_role_id;
      ELSE
        UPDATE public.contact_roles
           SET property_id = v_op.property_id,
               estado = 'Cerrado',
               agente_id = COALESCE(agente_id, v_actor_agente_id),
               fecha_conversion = COALESCE(fecha_conversion, v_now),
               fecha_cierre = v_now,
               updated_at = v_now
         WHERE id = v_client_role_id;
      END IF;
    END IF;

    UPDATE public.properties
       SET estatus = v_target_property_status,
           precio_final = v_op.precio_operacion,
           publicacion = '',
           fecha_escritura = CASE
             WHEN v_op.tipo = 'Venta' THEN COALESCE(fecha_escritura, v_now::DATE)
             ELSE fecha_escritura
           END,
           updated_at = v_now
     WHERE id = v_op.property_id;

    -- Un contacto solo pasa a Histórico cuando ya no conserva ningún otro rol
    -- abierto. Si sigue participando en otro proceso permanece como Cliente.
    UPDATE public.contacts AS c
       SET ciclo_vida = CASE
             WHEN EXISTS (
               SELECT 1
                 FROM public.contact_roles AS cr
                WHERE cr.contact_id = c.id
                  AND cr.estado IN ('Prospecto', 'Activo')
             ) THEN 'Cliente'
             ELSE 'Histórico'
           END,
           updated_at = v_now
     WHERE c.id IN (v_op.vendedor_id, v_op.comprador_id);
  END IF;

  PERFORM set_config('app.crm_atomic_close', 'on', TRUE);

  UPDATE public.operations
     SET estado = 'Cerrada',
         fecha_cierre = v_now,
         contact_role_id = COALESCE(v_client_role_id, contact_role_id),
         comision_total = CASE
           WHEN precio_operacion IS NOT NULL AND comision_pct IS NOT NULL
             THEN round((precio_operacion * comision_pct) / 100, 2)
           ELSE comision_total
         END,
         updated_at = v_now
   WHERE id = v_op.id;

  INSERT INTO public.seguimiento (
    contact_id, agente_id, tipo, texto, fecha, operation_id
  )
  SELECT DISTINCT
    party.contact_id,
    v_actor_agente_id,
    'Nota',
    concat(
      'Operación de ', lower(v_op.tipo), ' cerrada',
      CASE WHEN v_property.ref IS NOT NULL AND v_property.ref <> ''
        THEN concat(' · inmueble ', v_property.ref)
        ELSE ''
      END,
      CASE WHEN v_op.precio_operacion IS NOT NULL
        THEN concat(' · ', trim(to_char(v_op.precio_operacion, 'FM999999999990D00')), ' EUR')
        ELSE ''
      END,
      '.'
    ),
    v_now,
    v_op.id
  FROM unnest(ARRAY[v_op.vendedor_id, v_op.comprador_id]::UUID[]) AS party(contact_id)
  WHERE party.contact_id IS NOT NULL;

  INSERT INTO public.crm_auditoria_permisos (
    actor_id, tipo_evento, permiso_clave, motivo, metadata
  )
  VALUES (
    p_actor_user_id,
    'ACCION_EJECUTADA',
    'operations.close',
    'Cierre atómico de operación CRM',
    jsonb_build_object(
      'operation_id', v_op.id,
      'operation_type', v_op.tipo,
      'property_id', v_op.property_id,
      'property_status', v_target_property_status,
      'agent_id', v_actor_agente_id,
      'price', v_op.precio_operacion
    )
  );

  RETURN QUERY
  SELECT
    op.id,
    op.estado,
    op.property_id,
    p.estatus,
    op.contact_role_id,
    FALSE
  FROM public.operations AS op
  LEFT JOIN public.properties AS p ON p.id = op.property_id
  WHERE op.id = v_op.id;
END;
$$;

COMMENT ON FUNCTION public.cerrar_operacion_crm(UUID, UUID, UUID) IS
  'Cierra una operación CRM de forma atómica y sincroniza inmueble, pipeline, contactos y seguimiento.';

REVOKE ALL ON FUNCTION public.cerrar_operacion_crm(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cerrar_operacion_crm(UUID, UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.cerrar_operacion_crm(UUID, UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_operacion_crm(UUID, UUID, UUID) TO service_role;

COMMIT;
