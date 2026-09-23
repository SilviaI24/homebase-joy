-- Reduce la latencia de sincronización de estatus/publicación (Airtable → ESGI)
-- de hasta 24h a hasta 1h. Contexto: un inmueble marcado "Reservado" en
-- Airtable podía seguir apareciendo como disponible en la web casi un día
-- entero, porque el cron `sync-properties` (mode=meta), el único que toca
-- estatus/publicacion, solo corría una vez al día (19:00 UTC). El job ya es
-- incremental (filtra por LAST_MODIFIED_TIME de Airtable, normalmente
-- 0-50 registros por ejecución), así que correr cada hora no añade coste
-- relevante de API de Airtable. Solución temporal mientras Airtable siga
-- siendo la fuente de verdad — se retira junto con el resto de sync-properties
-- cuando el CRM pase a producción.
--
-- No se toca el job "sync-properties-images" (mode=images, 30 19 * * *):
-- sigue 1x/día a propósito, por la cuota de descargas (MAX_UPLOADS_PER_RUN).

DO $$
DECLARE
  v_jobid bigint;
  v_schedule_antes text;
BEGIN
  SELECT jobid, schedule INTO v_jobid, v_schedule_antes
  FROM cron.job
  WHERE jobname = 'sync-properties';

  IF v_jobid IS NULL THEN
    RAISE EXCEPTION 'No se encontró el cron job "sync-properties" (mode=meta). No se aplica el cambio.';
  END IF;

  PERFORM cron.alter_job(v_jobid, schedule => '0 * * * *');

  RAISE NOTICE 'cron job "sync-properties" (id %): schedule % -> 0 * * * *', v_jobid, v_schedule_antes;
END $$;

DO $$
DECLARE
  v_schedule text;
BEGIN
  SELECT schedule INTO v_schedule FROM cron.job WHERE jobname = 'sync-properties';
  IF v_schedule IS DISTINCT FROM '0 * * * *' THEN
    RAISE EXCEPTION 'Postflight: el schedule de "sync-properties" quedó en % en vez de "0 * * * *".', v_schedule;
  END IF;
END $$;
