-- ─────────────────────────────────────────────────────────────────────────────
-- DROP definitivo de neighborhood_market_data + refresh_neighborhood_market_data
--
-- Segunda mitad (y última) de la retirada iniciada en
-- 20260820095539_retirar_neighborhood_market_data.sql, que dejó tabla y función
-- marcadas DEPRECADAS, sin cron y sin lectores, pero SIN DROP porque todavía
-- existía un escritor: la Edge Function `supabase/functions/sync-market-data/`.
--
-- ── Qué cambió desde entonces (verificado el 2026-08-21) ─────────────────────
--   1. El directorio `supabase/functions/sync-market-data/` se ha eliminado de
--      este repo (mismo commit que esta migración). Era el único invocador vivo
--      declarado en el código.
--   2. `supabase functions list` contra producción confirma que
--      `sync-market-data` NUNCA llegó a estar desplegada en
--      fyrfkbcabmitbfuqeccq: las funciones activas son valorador, web-lead,
--      sync-properties, ingest-lead, invite-propietario, portal-iniciar-firma,
--      docuten-dispatch, docuten-webhook y las cuatro notify-*. Es decir, el
--      endpoint https://<proj>.supabase.co/functions/v1/sync-market-data ya
--      devuelve 404 hoy, antes de este DROP: ningún llamador HTTP externo
--      (Make.com incluido) puede estar ejecutándola con éxito.
--   3. `grep` en elsol-client-hub y en homebase-joy: ninguna lectura ni
--      escritura de la tabla fuera de las propias migraciones y de la entrada
--      generada en `src/integrations/supabase/types.ts`. El único lector de
--      pantalla (`src/components/MarketIntelligence.tsx`) migró a
--      `estadisticas_barrio` el 2026-08-20.
--   4. `cron.job` no contiene ninguna entrada que las referencie (comprobado el
--      2026-08-20 al dar de baja `refresh-neighborhood-market-data`, y
--      re-comprobado por el preflight de esta migración).
--
-- ── Duda residual, cubierta por el preflight ────────────────────────────────
-- No se puede auditar Make.com (team 1698831) desde aquí. Si algún escenario
-- llamara la RPC `refresh_neighborhood_market_data` DIRECTAMENTE por PostgREST
-- (/rest/v1/rpc/...) en vez de a través de la Edge Function, tras este DROP
-- recibiría 404. Consecuencia real: ese escenario fallaría, pero su único
-- efecto era repoblar una tabla que nadie lee y cuyas cifras están declaradas
-- incorrectas (ver la migración del 2026-08-20). La acción correcta en ese caso
-- es borrar el escenario, no revivir la tabla.
--
-- ── Pérdida de datos ────────────────────────────────────────────────────────
-- La tabla es 100 % derivada de `public.properties` (agregados por barrio) y
-- está congelada desde el 2026-08-20. No hay dato original que se pierda: es
-- recalculable, y de hecho ya está recalculado —mejor— en
-- `public.estadisticas_barrio`. El preflight registra el número de filas
-- descartadas en el log de la migración.
--
-- ── Seguridad: efecto sobre roles ───────────────────────────────────────────
--   · anon          : sin cambios (nunca tuvo acceso a la tabla).
--   · authenticated : sin cambios respecto al estado actual — ya perdió el
--                     SELECT el 2026-08-20. Pierde además el EXECUTE implícito
--                     sobre la función (PUBLIC lo tiene por defecto en Postgres),
--                     que es precisamente lo que se quiere cerrar.
--   · service_role  : pierde el acceso a dos objetos que ya no debe usar.
--   · Ningún rol gana acceso a nada. No se crea ni modifica ninguna policy.
--
-- Sin CASCADE a propósito: si en producción existiera algún objeto dependiente
-- no declarado en las migraciones, Postgres debe abortar en vez de arrastrarlo.
-- Re-ejecutable: todo con IF EXISTS / guardas DO.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. Preflight A: la sustituta tiene que estar viva ────────────────────────
DO $$
DECLARE
  v_filas BIGINT;
BEGIN
  IF to_regclass('public.estadisticas_barrio') IS NULL THEN
    RAISE EXCEPTION
      'Preflight: public.estadisticas_barrio no existe. Aplicar primero 20260820085828_estadisticas_barrio.sql; sin ella el portal se queda sin datos de mercado.';
  END IF;

  EXECUTE 'SELECT count(*) FROM public.estadisticas_barrio' INTO v_filas;
  IF v_filas = 0 THEN
    RAISE EXCEPTION
      'Preflight: public.estadisticas_barrio existe pero esta vacia. No retirar la tabla vieja hasta que la nueva tenga datos.';
  END IF;

  RAISE NOTICE 'Preflight OK: estadisticas_barrio con % fila(s)', v_filas;
END $$;

-- ── 0b. Preflight B: nadie en la base depende de lo que vamos a borrar ───────
-- Cubre lo que un grep del repo no puede ver: vistas, claves ajenas, cuerpos de
-- otras funciones, jobs de pg_cron y webhooks de base de datos (los triggers que
-- Supabase crea sobre supabase_functions.http_request).
DO $$
DECLARE
  v_oid       OID := to_regclass('public.neighborhood_market_data');
  v_deps      TEXT;
  v_funcs     TEXT;
  v_crons     TEXT;
  v_triggers  TEXT;
BEGIN
  IF v_oid IS NOT NULL THEN
    -- Vistas / vistas materializadas construidas sobre la tabla
    SELECT string_agg(DISTINCT dependiente.relname, ', ')
      INTO v_deps
    FROM pg_depend d
    JOIN pg_rewrite r      ON r.oid = d.objid
    JOIN pg_class dependiente ON dependiente.oid = r.ev_class
    WHERE d.refclassid = 'pg_class'::regclass
      AND d.refobjid   = v_oid
      AND dependiente.oid <> v_oid;

    IF v_deps IS NOT NULL THEN
      RAISE EXCEPTION
        'Preflight: hay vista(s) apoyadas en neighborhood_market_data (%). Migrarlas o retirarlas antes del DROP.', v_deps;
    END IF;

    -- Claves ajenas apuntando a la tabla
    SELECT string_agg(DISTINCT conrelid::regclass::text || '.' || conname, ', ')
      INTO v_deps
    FROM pg_constraint
    WHERE contype = 'f' AND confrelid = v_oid;

    IF v_deps IS NOT NULL THEN
      RAISE EXCEPTION
        'Preflight: hay clave(s) ajena(s) hacia neighborhood_market_data (%). Resolverlas antes del DROP.', v_deps;
    END IF;
  END IF;

  -- Otras funciones que mencionen la tabla o la función en su cuerpo
  SELECT string_agg(DISTINCT n.nspname || '.' || p.proname, ', ')
    INTO v_funcs
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND p.prolang <> (SELECT oid FROM pg_language WHERE lanname = 'c')
    AND p.proname <> 'refresh_neighborhood_market_data'
    AND (p.prosrc ILIKE '%neighborhood_market_data%');

  IF v_funcs IS NOT NULL THEN
    RAISE EXCEPTION
      'Preflight: funcion(es) que aun referencian neighborhood_market_data (%). Revisar antes del DROP.', v_funcs;
  END IF;

  -- Jobs de pg_cron
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE $q$
      SELECT string_agg(DISTINCT jobname, ', ')
      FROM cron.job
      WHERE command ILIKE '%neighborhood_market_data%'
         OR command ILIKE '%sync-market-data%'
    $q$ INTO v_crons;

    IF v_crons IS NOT NULL THEN
      RAISE EXCEPTION
        'Preflight: cron job(s) que aun invocan lo que se va a borrar (%). Darlos de baja antes del DROP.', v_crons;
    END IF;
  END IF;

  -- Webhooks de base de datos: los triggers que crea Supabase pasan la URL de la
  -- Edge Function como argumento, así que basta con buscar el slug en la
  -- definición de cualquier trigger no interno (no se filtra por
  -- supabase_functions.http_request para no depender de que exista ese objeto).
  SELECT string_agg(DISTINCT t.tgrelid::regclass::text || '.' || t.tgname, ', ')
    INTO v_triggers
  FROM pg_trigger t
  WHERE NOT t.tgisinternal
    AND pg_get_triggerdef(t.oid) ILIKE '%sync-market-data%';

  IF v_triggers IS NOT NULL THEN
    RAISE EXCEPTION
      'Preflight: webhook/trigger apuntando a sync-market-data (%). Retirarlo antes del DROP.', v_triggers;
  END IF;

  RAISE NOTICE 'Preflight OK: sin vistas, claves ajenas, funciones, crons ni webhooks dependientes';
END $$;

-- ── 1. DROP de la tabla ──────────────────────────────────────────────────────
DO $$
DECLARE
  v_filas BIGINT;
BEGIN
  IF to_regclass('public.neighborhood_market_data') IS NULL THEN
    RAISE NOTICE 'neighborhood_market_data ya no existe; nada que borrar';
  ELSE
    EXECUTE 'SELECT count(*) FROM public.neighborhood_market_data' INTO v_filas;
    RAISE NOTICE 'Borrando neighborhood_market_data (% fila(s) agregadas congeladas, recalculables desde properties)', v_filas;
    -- Sin CASCADE: que falle si aparece un dependiente inesperado.
    EXECUTE 'DROP TABLE public.neighborhood_market_data';
  END IF;
END $$;

-- ── 2. DROP de la función de refresco ────────────────────────────────────────
DROP FUNCTION IF EXISTS public.refresh_neighborhood_market_data();

-- ── 3. Postflight ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tabla   INT := 0;
  v_funcion INT;
  v_cron    INT;
BEGIN
  IF to_regclass('public.neighborhood_market_data') IS NOT NULL THEN
    v_tabla := 1;
  END IF;

  SELECT count(*) INTO v_funcion
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'refresh_neighborhood_market_data';

  IF v_tabla <> 0 THEN
    RAISE EXCEPTION 'Postflight: public.neighborhood_market_data sigue existiendo';
  END IF;

  IF v_funcion <> 0 THEN
    RAISE EXCEPTION 'Postflight: public.refresh_neighborhood_market_data() sigue existiendo';
  END IF;

  -- La sustituta debe seguir refrescándose sola: retirar la vieja no puede
  -- dejar el portal sin fuente de datos.
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*) FROM cron.job
      WHERE jobname = 'refresh-estadisticas-barrio' AND active
    $q$ INTO v_cron;

    IF v_cron <> 1 THEN
      RAISE EXCEPTION
        'Postflight: se esperaba 1 cron refresh-estadisticas-barrio activo, hay %.', v_cron;
    END IF;
  END IF;

  RAISE NOTICE 'Postflight OK: tabla y funcion retiradas; refresh-estadisticas-barrio sigue activo';
END $$;

-- ── 4. Después de aplicar esta migración ─────────────────────────────────────
--   a) Regenerar los tipos: `npx supabase gen types typescript --linked` →
--      `src/integrations/supabase/types.ts` debe dejar de declarar
--      `neighborhood_market_data` (línea ~955) y
--      `refresh_neighborhood_market_data` (línea ~2025). Mientras sigan ahí, el
--      autocompletado ofrece una tabla que ya no existe.
--   b) Copiar este archivo a `homebase-joy/supabase/migrations/` — los dos repos
--      comparten el proyecto fyrfkbcabmitbfuqeccq y el historial de migraciones
--      vive en la base, no en el repo.
