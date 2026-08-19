-- Retira el cron job legacy sync-airtable-properties-daily (jobid 1).
--
-- Contexto:
--   jobid 1 fue creado en 20260703091247 con schedule "0 6 * * *" y cuerpo vacío.
--   Fue reschedulado manualmente a "0 19 * * *", hora que comparte con jobid 4
--   (sync-properties, mode=meta). Las dos llamadas son redundantes: jobid 4 cubre
--   exactamente la misma sincronización con un modo explícito.
--
--   Cobertura de sync-properties tras la retirada:
--     jobid 4  sync-properties         0 19 * * *    mode=meta (incremental diario)
--     jobid 5  sync-properties-images  30 19 * * *   mode=images (diario)
--     jobid 6  sync-properties-full-1  0 18 * * 0    mode=meta_full (domingos)
--     jobid 7  sync-properties-full-2  30 18 * * 0   mode=meta_full continuación
--
-- IMPORTANTE: NO aplicar a producción sin autorización explícita de David.
-- Aplicar SOLO via MCP apply_migration o dashboard, nunca con db push a producción.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-airtable-properties-daily') THEN
    PERFORM cron.unschedule('sync-airtable-properties-daily');
    RAISE NOTICE 'sync-airtable-properties-daily retirado correctamente';
  ELSE
    RAISE NOTICE 'sync-airtable-properties-daily no existe; sin acción';
  END IF;
END $$;

-- Verificación: jobid 4, 5, 6, 7 siguen activos
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM cron.job
  WHERE jobname IN (
    'sync-properties',
    'sync-properties-images',
    'sync-properties-full-1',
    'sync-properties-full-2'
  )
    AND active = true;

  IF v_count <> 4 THEN
    RAISE EXCEPTION
      'Postflight: se esperaban 4 jobs de sync-properties activos, hay %', v_count;
  END IF;

  RAISE NOTICE 'Postflight OK: % jobs de sync-properties activos', v_count;
END $$;
