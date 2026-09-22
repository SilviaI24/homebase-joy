-- El teléfono del propietario es obligatorio para la firma real en Docuten
-- (signature_type "OTP" se envía por SMS) pero hasta ahora no se pedía ni
-- guardaba en ningún punto del flujo de contrato de exclusividad —
-- descubierto probando en producción el 22 sep 2026: sin él, Docuten no
-- puede completar la firma y redirige a una pantalla de "Identifícate" que
-- parece un error genérico. Se añade como tercer campo editable, mismo
-- criterio que dni/domicilio (COALESCE con NULLIF para no borrar un valor
-- ya guardado si se manda vacío).
CREATE OR REPLACE FUNCTION public.crm_actualizar_datos_firma_propietario(
  p_actor_id uuid,
  p_propietario_id uuid,
  p_dni text,
  p_domicilio text,
  p_telefono text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  UPDATE public.propietarios
  SET dni       = COALESCE(NULLIF(btrim(p_dni), ''), dni),
      domicilio = COALESCE(NULLIF(btrim(p_domicilio), ''), domicilio),
      telefono  = COALESCE(NULLIF(btrim(p_telefono), ''), telefono)
  WHERE id = p_propietario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Propietario no encontrado';
  END IF;
END;
$function$;
