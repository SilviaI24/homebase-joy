-- H-05 (auditoría Codex, 14 ago 2026) — parte 2: el ACTOR real en audit_log.
--
-- Estado previo: la migración 20260819145003_extend_audit_log_to_crm_tables.sql
-- puso el trigger registrar_audit() en contacts, properties, contact_roles,
-- visits, seguimiento y operations. Registra bien el qué/cuándo/antes-después,
-- pero usuario_id queda NULL: las funciones de servidor del CRM escriben con
-- service_role vía PostgREST y ahí auth.uid() no existe.
--
-- ── Por qué un RPC y no un SET LOCAL desde la función de servidor ───────────
-- getSupa() (src/lib/supabase.server.ts) es supabase-js contra PostgREST, es
-- decir HTTP: cada .update()/.insert()/.rpc() es una petición distinta y
-- PostgREST envuelve CADA petición en su propia transacción, sobre una conexión
-- cualquiera del pool. Un "SET LOCAL app.actor_id" enviado en una llamada previa
-- NO sobrevive a la siguiente llamada — y peor: si sobreviviera por reutilización
-- de conexión, atribuiría el actor equivocado a la escritura de otro request.
-- Atribuir mal es peor que dejar NULL, así que el actor viaja como PARÁMETRO
-- dentro de la MISMA llamada que escribe: un RPC que hace
-- set_config('app.actor_id', p_actor_id::text, TRUE)  ← TRUE = local a la
-- transacción, se descarta solo al terminar el request, y luego el UPDATE.
-- Mismo patrón que ya usa cerrar_operacion_crm() con app.crm_atomic_close.
--
-- Deliberadamente NO se crea un helper suelto tipo crm_set_actor(uuid): llamarlo
-- por separado desde PostgREST sería inútil (otra transacción) y además dejaría
-- una primitiva para falsificar el actor sin escribir nada. El actor solo se fija
-- dentro del mismo cuerpo que hace la escritura.
--
-- Alcance de esta migración: mecanismo + PRIMER dominio (contacts.ciclo_vida).
-- El resto de *.functions.ts se convierte después, uno a uno; hasta entonces esas
-- escrituras siguen registrando usuario_id NULL exactamente como hoy (sin
-- regresión: registrar_audit() mantiene auth.uid() como fallback).

BEGIN;

-- ── Preflight ──────────────────────────────────────────────────────────────
-- No sobreescribir a ciegas: si el cuerpo vivo de registrar_audit() no es el
-- que esta migración espera (alguien lo cambió por fuera), abortar y mostrarlo.
DO $preflight$
DECLARE
  v_src TEXT;
BEGIN
  SELECT p.prosrc
    INTO v_src
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'registrar_audit'
     AND p.pronargs = 0;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'Preflight: public.registrar_audit() no existe; esta migración depende de ella';
  END IF;

  IF position('app.actor_id' IN v_src) > 0 THEN
    RAISE NOTICE 'Preflight: registrar_audit() ya resuelve app.actor_id; se recrea de forma idempotente';
  ELSIF position('auth.uid()' IN v_src) = 0
     OR position('INSERT INTO public.audit_log (tabla, accion, fila_id, usuario_id, datos_antes, datos_despues)' IN v_src) = 0 THEN
    RAISE EXCEPTION 'Preflight: el cuerpo vivo de registrar_audit() no coincide con el esperado, revisar antes de sobreescribir. Cuerpo actual: %', v_src;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.contacts'::regclass
       AND tgname = 'audit_contacts'
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Preflight: falta el trigger audit_contacts en public.contacts';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'contacts'
       AND column_name = 'ciclo_vida_anterior'
  ) THEN
    RAISE EXCEPTION 'Preflight: falta la columna contacts.ciclo_vida_anterior';
  END IF;
END;
$preflight$;

-- ── 1. registrar_audit(): actor explícito con auth.uid() como fallback ──────
-- Orden de preferencia: app.actor_id (lo pone el RPC que escribe, service_role)
-- → auth.uid() (escrituras que sí llegan con sesión, p. ej. el Portal).
-- El cast va protegido: un GUC mal formado nunca debe tumbar la escritura
-- auditada; en ese caso se degrada a auth.uid()/NULL como hasta ahora.
CREATE OR REPLACE FUNCTION public.registrar_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
BEGIN
  BEGIN
    v_actor := nullif(current_setting('app.actor_id', TRUE), '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_actor := NULL;
  END;

  v_actor := coalesce(v_actor, auth.uid());

  INSERT INTO public.audit_log (tabla, accion, fila_id, usuario_id, datos_antes, datos_despues)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    CASE TG_OP WHEN 'DELETE' THEN OLD.id ELSE NEW.id END,
    v_actor,
    CASE TG_OP WHEN 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE TG_OP WHEN 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN NULL;  -- AFTER trigger, return value ignored
END;
$$;

COMMENT ON FUNCTION public.registrar_audit() IS
  'Trigger de auditoría. usuario_id = app.actor_id (GUC local que fija el RPC que escribe con service_role) y si no, auth.uid().';

-- ── 2. Primer dominio convertido: contacts.ciclo_vida ──────────────────────
-- Sustituye al UPDATE directo de actualizarCicloVida (src/lib/clientes.functions.ts).
-- Replica su comportamiento exacto: al archivar guarda la etapa previa en
-- ciclo_vida_anterior para que restaurarContactoDeHistorico sepa a dónde volver.
-- updated_at lo sigue poniendo el trigger t_contacts_updated_at, no se toca aquí.
CREATE OR REPLACE FUNCTION public.crm_actualizar_ciclo_vida(
  p_contact_id UUID,
  p_ciclo_vida TEXT,
  p_actor_id UUID
)
RETURNS TABLE (
  contact_id UUID,
  ciclo_vida TEXT,
  ciclo_vida_anterior TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actual TEXT;
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'El contacto es obligatorio';
  END IF;

  IF p_ciclo_vida IS NULL
     OR p_ciclo_vida NOT IN ('Lead', 'Prospecto', 'Cliente', 'Histórico', 'Descartado') THEN
    RAISE EXCEPTION 'Etapa de contacto inválida';
  END IF;

  -- El actor no es decorativo: si no se puede acreditar quién hace el cambio,
  -- no se hace el cambio. Se exige perfil CRM activo, igual que cerrar_operacion_crm.
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.crm_usuarios AS cu
     WHERE cu.user_id = p_actor_id
       AND cu.activo IS TRUE
  ) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  SELECT c.ciclo_vida
    INTO v_actual
    FROM public.contacts AS c
   WHERE c.id = p_contact_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El contacto no existe';
  END IF;

  -- Local a esta transacción (tercer argumento TRUE): lo lee registrar_audit()
  -- en el trigger AFTER del UPDATE de abajo y se descarta al cerrar el request.
  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  UPDATE public.contacts AS c
     SET ciclo_vida = p_ciclo_vida,
         ciclo_vida_anterior = CASE
           WHEN p_ciclo_vida = 'Histórico'
                AND v_actual IS NOT NULL
                AND v_actual <> 'Histórico'
             THEN v_actual
           ELSE c.ciclo_vida_anterior
         END
   WHERE c.id = p_contact_id;

  RETURN QUERY
  SELECT c.id, c.ciclo_vida, c.ciclo_vida_anterior
    FROM public.contacts AS c
   WHERE c.id = p_contact_id;
END;
$$;

COMMENT ON FUNCTION public.crm_actualizar_ciclo_vida(UUID, TEXT, UUID) IS
  'Cambia contacts.ciclo_vida dejando el actor real en audit_log.usuario_id. Solo service_role (funciones de servidor del CRM).';

-- Solo las funciones de servidor (service_role). anon/authenticated no deben
-- poder mover el ciclo de vida de un contacto ni, de rebote, escribir un actor
-- en audit_log. Se revoca antes de conceder para que sea idempotente.
REVOKE ALL ON FUNCTION public.crm_actualizar_ciclo_vida(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_actualizar_ciclo_vida(UUID, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.crm_actualizar_ciclo_vida(UUID, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.crm_actualizar_ciclo_vida(UUID, TEXT, UUID) TO service_role;

-- ── Postflight ─────────────────────────────────────────────────────────────
DO $postflight$
DECLARE
  v_src TEXT;
BEGIN
  SELECT p.prosrc
    INTO v_src
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'registrar_audit'
     AND p.pronargs = 0;

  IF v_src IS NULL OR position('app.actor_id' IN v_src) = 0 THEN
    RAISE EXCEPTION 'Postflight: registrar_audit() no quedó leyendo app.actor_id';
  END IF;

  IF position('auth.uid()' IN v_src) = 0 THEN
    RAISE EXCEPTION 'Postflight: registrar_audit() perdió el fallback auth.uid()';
  END IF;

  IF has_function_privilege('anon', 'public.crm_actualizar_ciclo_vida(uuid,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.crm_actualizar_ciclo_vida(uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Postflight: crm_actualizar_ciclo_vida sigue siendo ejecutable por anon/authenticated';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.crm_actualizar_ciclo_vida(uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Postflight: service_role no puede ejecutar crm_actualizar_ciclo_vida';
  END IF;

  RAISE NOTICE 'Postflight OK: actor explícito activo y RPC restringido a service_role';
END;
$postflight$;

COMMIT;
