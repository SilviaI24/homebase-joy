
-- 1. Habilitar extensiones
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Guardar CRON_SECRET en Vault (cifrado en reposo)
SELECT vault.create_secret(
  'JJ-a2NsNpKa9GKOuwMaqZ4rsjTKgLTaD57hVPCGuGkQ',
  'cron_secret',
  'Secret para autenticar pg_cron → Edge Function sync-properties'
);

-- 3. Eliminar schedule previo si existe (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-airtable-properties-daily') THEN
    PERFORM cron.unschedule('sync-airtable-properties-daily');
  END IF;
END$$;

-- 4. Crear el job diario a las 06:00 UTC
--    Lee el secret desde Vault dinámicamente en cada ejecución
SELECT cron.schedule(
  'sync-airtable-properties-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://fyrfkbcabmitbfuqeccq.supabase.co/functions/v1/sync-properties',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-cron-secret', (
                   SELECT decrypted_secret
                   FROM   vault.decrypted_secrets
                   WHERE  name = 'cron_secret'
                   LIMIT  1
                 )
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 540000
  )::text;
  $$
);

-- 5. Verificar
SELECT jobid, jobname, schedule, active
FROM   cron.job
WHERE  jobname = 'sync-airtable-properties-daily';
