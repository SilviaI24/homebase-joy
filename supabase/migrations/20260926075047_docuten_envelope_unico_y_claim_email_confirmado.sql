-- Auditoría de entrega (25 sep 2026) — firmas y alta en el Portal.

-- 1. Un sobre de Docuten = un documento archivado. El 22 sep llegaron 3
--    entregas del webhook en el mismo segundo y se archivaron 3 contratos
--    firmados (2 borrados a mano). docuten-webhook ya hace el paso a 'signed'
--    con un UPDATE condicional; este índice es la segunda barrera, y además
--    garantiza que getContratoExclusividadEstado (.maybeSingle()) no reciba
--    varias filas. Verificado antes de crearlo: 0 duplicados hoy.
CREATE UNIQUE INDEX IF NOT EXISTS documentos_docuten_envelope_id_unico
  ON public.documentos (docuten_envelope_id)
  WHERE docuten_envelope_id IS NOT NULL;

-- 2. claim_propietario_invitation enlaza la cuenta que inicia sesión con la
--    ficha de propietario pendiente que tenga su email. No comprobaba que el
--    email estuviera confirmado (el comentario de AuthContext.tsx decía que
--    sí): si "Confirm email" se desactivara en Supabase Auth, cualquiera que
--    se registrase con el email de un propietario pendiente se quedaría con
--    su ficha. Una invitación aceptada (inviteUserByEmail) ya deja
--    email_confirmed_at relleno, así que el flujo normal no cambia.
CREATE OR REPLACE FUNCTION public.claim_propietario_invitation()
RETURNS TABLE(propietario_id uuid, propietario_nombre text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _email TEXT := lower(auth.jwt() ->> 'email');
  _row RECORD;
BEGIN
  IF _uid IS NULL OR _email IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = _uid AND u.email_confirmed_at IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  SELECT p.id, p.nombre INTO _row
  FROM public.propietarios p
  WHERE lower(p.email) = _email AND p.user_id IS NULL
  ORDER BY p.created_at
  LIMIT 1;

  IF _row IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.propietarios SET user_id = _uid WHERE id = _row.id;

  RETURN QUERY SELECT _row.id, _row.nombre;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_propietario_invitation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_propietario_invitation() TO authenticated;
