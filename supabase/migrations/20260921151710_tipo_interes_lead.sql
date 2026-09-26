-- Tipo de interés general del lead (compra/alquiler/prospección), asignable
-- desde la Bandeja incluso antes de la cualificación oficial (el botón
-- "Cualificar" de ConversationCard, que promueve ciclo_vida y crea
-- contact_roles) y antes de tener comercial asignado -- ver auditoría del 21
-- sep 2026: hoy eso es imposible porque crm_actualizar_seguimiento_cliente
-- exige comercial para Comprador/Inquilino (necesita agent_id para el INSERT
-- en contact_roles). tipo_interes vive en contacts, no en contact_roles, y
-- no crea ningún rol ni toca ciclo_vida -- es una etiqueta de triage previa,
-- desacoplada a propósito de esa promoción más comprometida.
--
-- La función también marca trabajado='Contactado': es la definición de
-- "cualificado" que ya usa el resto del pipeline (pestaña "Cualificados" de
-- la Bandeja, columnas del Kanban de Leads) -- indicar el interés desde la
-- Bandeja es la señal de que el comercial ya revisó y trió la conversación,
-- mismo criterio que aplica hoy el botón "Cualificar" (que también fija
-- trabajado junto al tipo). Sin esto, marcar el interés nunca haría que el
-- lead cumpliera la condición de "cualificado" del filtro estricto del
-- Kanban (ver crm-decisiones más abajo), quedando huérfano.

BEGIN;

ALTER TABLE public.contacts
  ADD COLUMN tipo_interes TEXT
  CONSTRAINT contacts_tipo_interes_check
  CHECK (tipo_interes IN ('Compra', 'Alquiler', 'Prospeccion'));

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
     SET tipo_interes = p_tipo_interes,
         trabajado = 'Contactado'
   WHERE id = p_contact_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El contacto no existe';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_marcar_tipo_interes_lead(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_marcar_tipo_interes_lead(UUID, TEXT, UUID) TO service_role;

COMMIT;
