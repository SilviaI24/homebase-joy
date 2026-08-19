-- verify_cron_secret(p_value TEXT) → BOOLEAN
--
-- Verifica si el valor recibido coincide con el secreto cron almacenado en Vault.
-- El secreto NUNCA sale de la base de datos como respuesta — solo true/false.
--
-- Uso: POST /rest/v1/rpc/verify_cron_secret  body: {"p_value": "<header_value>"}
-- Caller: Edge Function sync-properties (service_role key)
--
-- Rotación futura: actualizar cron_secret en Vault → sin cambios de código.

CREATE OR REPLACE FUNCTION public.verify_cron_secret(p_value TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'cron_secret'
      AND decrypted_secret = p_value
  );
$$;

-- Solo service_role puede llamar esta función
REVOKE ALL ON FUNCTION public.verify_cron_secret(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_cron_secret(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.verify_cron_secret(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(TEXT) TO service_role;
