-- Corrección tras probar en vivo (David, 22 sep 2026): "cualificado" no es un
-- campo propio -- es la conjunción de asignado (contact_agents) + interés
-- indicado (tipo_interes). crm_marcar_tipo_interes_lead ya no toca
-- trabajado: antes lo fijaba a 'Contactado' automáticamente, lo que
-- confundía "marcar interés" con "ya contactado", y sacaba el lead de la
-- pestaña "Pendientes" de la Bandeja antes de que nadie lo hubiera llamado.
-- trabajado sigue siendo, igual que siempre, el estado de la cola de
-- llamadas del comercial (Pendiente/Contactado/Descartado) -- ortogonal a
-- si sabemos qué quiere el lead y a quién pertenece.

BEGIN;

CREATE OR REPLACE FUNCTION public.crm_marcar_tipo_interes_lead(
  p_contact_id UUID,
  p_tipo_interes TEXT,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'Cliente requerido';
  END IF;
  IF p_tipo_interes NOT IN ('Compra', 'Alquiler', 'Prospeccion') THEN
    RAISE EXCEPTION 'Tipo de interés inválido';
  END IF;
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'El usuario que ejecuta el cambio es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.crm_usuarios cu WHERE cu.user_id = p_actor_id AND cu.activo IS TRUE) THEN
    RAISE EXCEPTION 'El usuario no tiene un perfil CRM activo';
  END IF;

  PERFORM set_config('app.actor_id', p_actor_id::TEXT, TRUE);

  UPDATE public.contacts
     SET tipo_interes = p_tipo_interes
   WHERE id = p_contact_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El contacto no existe';
  END IF;
END;
$$;

COMMIT;
