-- ─────────────────────────────────────────────────────────────────────────────
-- Retirada de neighborhood_market_data — sustituida por estadisticas_barrio
--
-- Aplica el punto 5 de REGLA_CALIDAD_METRICAS_AGREGADAS_2026-08-20.md:
-- "cuando una tabla nueva sustituye a una vieja, retírala explícitamente —
-- nunca dejes dos fuentes de verdad conviviendo en silencio".
--
-- ── Por qué se retira ────────────────────────────────────────────────────────
-- `public.neighborhood_market_data` + `refresh_neighborhood_market_data()`
-- (creadas el 29 jul 2026) incumplen cuatro de las cinco comprobaciones de la
-- regla, verificado contra producción el 20 ago 2026:
--   1. No normaliza el barrio: agrupa por el texto tal cual, así que 'Centro' y
--      'CENTRO' son dos filas distintas del mismo barrio.
--   2. Mezcla €/m² de venta y de alquiler en la misma columna `avg_price_m2`
--      (convivían 3.536 y 15 €/m² como si fueran la misma magnitud).
--   3. Publica medias con `HAVING COUNT(*) >= 2`: dos inmuebles bastan para que
--      una media salga a pantalla del propietario.
--   4. Publica `avg_days_on_market`, la métrica que el diseño (§4.1) prohíbe:
--      solo el 1,3 % de los inmuebles 'Vendido' tiene fecha de cierre real, y
--      la columna se rellenaba con "días desde fecha_inicio", que no es el
--      tiempo de venta de nada.
-- Además solo agregaba sobre `estatus = 'Activo'` (~80 filas), frente a las
-- 2.103 de Activo+Reservado+Vendido que usa `refresh_estadisticas_barrio()`.
--
-- ── Qué hace esta migración ──────────────────────────────────────────────────
--   a) Da de baja el cron `refresh-neighborhood-market-data` (19:30 UTC), que
--      dejaría de tener sentido: nadie lee ya la tabla que repuebla.
--   b) Marca tabla y función como DEPRECADAS con COMMENT explícito y fecha.
--   c) Retira el acceso de lectura de `authenticated`, para que ninguna pantalla
--      pueda volver a leer por error una tabla congelada y sin refresco.
--
-- ── Por qué NO se hace DROP ──────────────────────────────────────────────────
-- `src/components/MarketIntelligence.tsx` ya migró a `estadisticas_barrio` (mismo
-- commit), y es el único consumidor de lectura en todo el código (verificado por
-- grep en elsol-client-hub y en homebase-joy). PERO sigue existiendo un escritor:
-- la Edge Function `supabase/functions/sync-market-data/index.ts` llama a
-- `refresh_neighborhood_market_data()` por RPC y cuenta las filas de la tabla.
-- Un DROP la rompería en caliente, y el despliegue de Edge Functions en este
-- repo es automático al hacer push a main. El DROP definitivo (tabla + función +
-- Edge Function + su entrada en types.ts) queda como paso separado y consciente,
-- no como efecto colateral de esta migración.
--
-- Re-ejecutable: todo va con guardas IF EXISTS / DO.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. Preflight: no dejar el portal sin ninguna fuente de datos ─────────────
-- Esta migración solo tiene sentido si la sustituta ya existe. Si se aplicara
-- sola (por ejemplo vía MCP, sin la migración 20260820085828), el portal se
-- quedaría sin ninguna de las dos fuentes.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'estadisticas_barrio'
  ) THEN
    RAISE EXCEPTION
      'Preflight: public.estadisticas_barrio no existe. Aplicar primero la migración 20260820085828_estadisticas_barrio.sql; si no, el portal se queda sin datos de mercado.';
  END IF;
END $$;

-- ── 1. Baja del cron de refresco ─────────────────────────────────────────────
-- Mismo patrón que homebase-joy/supabase/migrations/20260817085435_retire_legacy_cron.sql:
-- se comprueba cron.job antes de tocar nada y no se falla si ya no está.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-neighborhood-market-data') THEN
    PERFORM cron.unschedule('refresh-neighborhood-market-data');
    RAISE NOTICE 'cron refresh-neighborhood-market-data retirado correctamente';
  ELSE
    RAISE NOTICE 'cron refresh-neighborhood-market-data no existe; sin acción';
  END IF;
END $$;

-- ── 2. Marcado de deprecación ────────────────────────────────────────────────

-- Los COMMENT van dentro de un DO guardado para que la migración siga siendo
-- re-ejecutable incluso después del DROP definitivo (paso posterior).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'neighborhood_market_data'
  ) THEN
    EXECUTE $c$
      COMMENT ON TABLE public.neighborhood_market_data IS
      'DEPRECADA el 2026-08-20, sustituida por public.estadisticas_barrio. '
      'Motivos: mezclaba €/m2 de venta y de alquiler en avg_price_m2, no '
      'normalizaba el nombre del barrio, publicaba medias con solo 2 inmuebles y '
      'exponia avg_days_on_market, metrica que los datos de origen no sostienen '
      '(1,3 % de los vendidos tiene fecha de cierre real). Su cron de refresco '
      'esta dado de baja, asi que su contenido esta CONGELADO: no leer estas '
      'cifras. Se conserva sin DROP solo porque la Edge Function sync-market-data '
      'todavia la escribe.'
    $c$;
  ELSE
    RAISE NOTICE 'neighborhood_market_data ya no existe; nada que deprecar';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'refresh_neighborhood_market_data'
  ) THEN
    EXECUTE $c$
      COMMENT ON FUNCTION public.refresh_neighborhood_market_data() IS
      'DEPRECADA el 2026-08-20. Sustituida por public.refresh_estadisticas_barrio(). '
      'Ya no la lanza ningun cron. Su unico invocador vivo es la Edge Function '
      'sync-market-data, pendiente de retirar. No anadir nuevos usos.'
    $c$;
  ELSE
    RAISE NOTICE 'refresh_neighborhood_market_data ya no existe; nada que deprecar';
  END IF;
END $$;

-- ── 3. Cierre del acceso de lectura ──────────────────────────────────────────
-- Efecto sobre roles, explícito:
--   · authenticated : PIERDE el SELECT que tenía vía la policy
--                     "auth_users_read_market_data" (FOR SELECT USING (true)).
--                     Ninguna pantalla lo necesita ya: MarketIntelligence.tsx lee
--                     estadisticas_barrio, donde authenticated sí tiene SELECT.
--   · anon          : sin cambios, nunca tuvo acceso.
--   · service_role  : sin cambios, salta RLS. Es el rol con el que corre la Edge
--                     Function sync-market-data, que por eso sigue funcionando.
-- Con RLS activo y sin ninguna policy, la tabla queda ilegible salvo para
-- service_role. Reversible: recrear la policy si hiciera falta.
--
-- Se eliminan por barrido en vez de por nombre: esta tabla acumula policies de
-- tres orígenes distintos ("Anyone authenticated can view market data" y
-- "Admins can manage market data" de 20260320131849, "auth_users_read_market_data"
-- de esgi-migrations/20260729000001, más las que ese script ya intentaba limpiar),
-- y no hay certeza de qué nombres sobrevivieron en producción.

DO $$
DECLARE
  r RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'neighborhood_market_data'
  ) THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'neighborhood_market_data'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.neighborhood_market_data', r.policyname
    );
    RAISE NOTICE 'policy % eliminada de neighborhood_market_data', r.policyname;
  END LOOP;

  EXECUTE 'REVOKE ALL ON TABLE public.neighborhood_market_data FROM anon';
  EXECUTE 'REVOKE ALL ON TABLE public.neighborhood_market_data FROM authenticated';
END $$;

-- ── 4. Postflight ────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_viejo INT;
  v_nuevo INT;
  v_policies INT;
BEGIN
  SELECT count(*) INTO v_viejo
  FROM cron.job WHERE jobname = 'refresh-neighborhood-market-data';

  SELECT count(*) INTO v_nuevo
  FROM cron.job WHERE jobname = 'refresh-estadisticas-barrio' AND active;

  SELECT count(*) INTO v_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'neighborhood_market_data';

  IF v_viejo <> 0 THEN
    RAISE EXCEPTION 'Postflight: el cron refresh-neighborhood-market-data sigue programado';
  END IF;

  IF v_nuevo <> 1 THEN
    RAISE EXCEPTION
      'Postflight: se esperaba 1 cron refresh-estadisticas-barrio activo, hay %. No dejar el portal sin fuente de datos.', v_nuevo;
  END IF;

  IF v_policies <> 0 THEN
    RAISE EXCEPTION
      'Postflight: neighborhood_market_data conserva % policy(s) de lectura', v_policies;
  END IF;

  RAISE NOTICE 'Postflight OK: cron viejo retirado, refresh-estadisticas-barrio activo, tabla vieja deprecada y sin lectores';
END $$;
