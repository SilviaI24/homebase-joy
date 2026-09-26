-- Cierra el acceso público a 3 funciones SECURITY DEFINER sin chequeo interno
-- de permisos, detectadas ejecutables por anon/authenticated vía PostgREST RPC
-- (hallazgo de auditoría, 9 sep 2026). La app ya las llama solo desde el
-- servidor con getSupa() (service_role) y permisos comprobados por
-- requirePermission() — este REVOKE no le quita acceso a nada que use la app,
-- solo cierra la vía directa por HTTP con la clave anon pública.
--
-- listar_contactos_duplicados(): exponía PII (nombre/teléfono/email) de
--   contactos duplicados a cualquiera sin sesión.
-- fusionar_contactos(a, b): permitía fusionar/borrar cualquier contacto
--   pasando dos UUIDs arbitrarios sin autenticación.
-- archivar_leads_inactivos(meses): permitía archivar en masa contactos
--   activos sin autenticación (solo la usa el cron, no la app).

REVOKE EXECUTE ON FUNCTION public.listar_contactos_duplicados() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fusionar_contactos(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.archivar_leads_inactivos(integer) FROM anon, authenticated;
