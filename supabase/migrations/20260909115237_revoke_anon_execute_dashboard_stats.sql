-- Cierra el acceso público a dashboard_inmuebles_stats(), la 4ª función
-- SECURITY DEFINER encontrada ejecutable por anon/authenticated vía PostgREST
-- RPC (auditoría, 9 sep 2026 — mismo patrón que
-- 20260909112532_revoke_anon_execute_contactos_sensibles).
--
-- La migración original (20260820104857_dashboard_inmuebles_stats_function.sql)
-- hacía "REVOKE ALL ... FROM PUBLIC", pero en Supabase anon/authenticated
-- reciben el privilegio directo, no vía PUBLIC, así que ese REVOKE no cerró
-- nada. La app solo la llama desde el servidor con getSupa() (service_role) —
-- inmuebles.functions.ts:1218 — así que este REVOKE no le quita acceso a
-- nada que use la app; solo cierra la vía directa por HTTP con la clave
-- anon pública, que exponía comisión del mes/anual, valor de cartera y
-- pipeline de la agencia sin sesión.

REVOKE EXECUTE ON FUNCTION public.dashboard_inmuebles_stats() FROM anon, authenticated;
