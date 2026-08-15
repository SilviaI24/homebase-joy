
-- 1. Habilitar extensiones
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. CRON_SECRET: aprovisionar manualmente via Supabase Vault ANTES de ejecutar.
--    Dashboard → Settings → Vault → New secret
--      name:  cron_secret
--      value: <cadena aleatoria segura, ej: openssl rand -base64 32>
--
--    El valor NUNCA debe escribirse en este archivo ni en ningún otro archivo de
--    código. La migración falla si el secreto no existe en Vault al ejecutarse.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    RAISE EXCEPTION
      'Preflight: cron_secret no existe en Vault. Crearlo manualmente antes de aplicar esta migración.'
      USING ERRCODE = 'P0001';
  END IF;
END $$;

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
