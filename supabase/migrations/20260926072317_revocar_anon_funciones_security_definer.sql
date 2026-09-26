-- Auditoría de entrega (25 sep 2026): funciones SECURITY DEFINER ejecutables
-- por anon/authenticated.
--
-- Las crm_* confían en un p_actor_id que envía quien llama, y un propietario
-- puede ver ids de comerciales (documentos.subido_por, linea_actividad.actor_id).
-- Con la anon key se podía activar un propietario, aprobar documentos o
-- cambiar el teléfono al que Docuten manda el SMS de firma. Solo las llama el
-- servidor del CRM (service_role). Supabase concede EXECUTE explícito a
-- anon/authenticated al crear cada función, por eso el REVOKE ... FROM PUBLIC
-- de 20260917152303 no bastaba.
REVOKE EXECUTE ON FUNCTION public.crm_activar_propietario(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crm_actualizar_estado_documento(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crm_actualizar_datos_firma_propietario(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.crm_actualizar_datos_firma_propietario(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_activar_propietario(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_actualizar_estado_documento(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_actualizar_datos_firma_propietario(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_actualizar_datos_firma_propietario(uuid, uuid, text, text, text) TO service_role;

-- Funciones del Portal que solo tienen sentido con sesión (usan auth.uid() o
-- se evalúan en policies TO authenticated — ninguna policy TO anon/public las
-- usa, verificado en pg_policies): fuera anon.
REVOKE EXECUTE ON FUNCTION public._agente_user_id_de_property(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._propietario_user_id_de_property(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_crear_invitacion_propietario(text, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_propietario_invitation() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.es_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.es_propietario_inmueble(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.propietario_actualizar_datos_firma(text, text) FROM PUBLIC, anon;

-- Funciones de trigger: Postgres no comprueba EXECUTE al disparar un trigger,
-- así que nadie necesita poder llamarlas directamente.
REVOKE EXECUTE ON FUNCTION public.crm_check_last_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_documento_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_solicitud_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_tarea_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_tarea_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.registrar_audit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_agent_user_id() FROM PUBLIC, anon, authenticated;

-- search_path fijo en la función nueva de la Fase 2 (aviso del advisor).
ALTER FUNCTION public.fuente_desde_canal_origen(text) SET search_path = public;
