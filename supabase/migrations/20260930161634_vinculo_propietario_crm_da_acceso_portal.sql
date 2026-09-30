-- Vincular un propietario a un inmueble desde el CRM también se lo muestra en
-- el Portal si ese contacto ya tiene ficha de propietario (30 sep 2026).
--
-- Hasta hoy, "Asociar propietario" (y el alta de inmueble con propietario)
-- solo escribía contact_roles; el Portal lee propietario_inmueble, que solo
-- rellenaba "Dar acceso al portal". Un propietario que ya usa el Portal no
-- veía el nuevo inmueble hasta que alguien repetía la invitación (visto en la
-- demo del 30 sep con Constitución 140). Con un trigger vale para todas las
-- rutas que crean el rol (crm_asociar_lead_inmueble, crm_crear_inmueble,
-- crm_gestionar_rol...), sin tocar cada una.
--
-- Solo afecta a contactos que YA tienen ficha en `propietarios` (invitados al
-- Portal alguna vez): no crea accesos nuevos ni envía nada. El camino inverso
-- (desvincular) ya lo cubre desvincularPropietarioInmueble.
-- Relleno de vínculos existentes: comprobado antes de escribir esto, 0 filas.

CREATE OR REPLACE FUNCTION public.on_contact_role_propietario_portal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo IN ('Propietario', 'Arrendador') AND NEW.property_id IS NOT NULL THEN
    INSERT INTO public.propietario_inmueble (propietario_id, property_id)
    SELECT p.id, NEW.property_id
    FROM public.propietarios p
    WHERE p.contact_id = NEW.contact_id
    ON CONFLICT (propietario_id, property_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_contact_role_propietario_portal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_contact_role_propietario_portal ON public.contact_roles;
CREATE TRIGGER trg_contact_role_propietario_portal
  AFTER INSERT OR UPDATE OF tipo, property_id ON public.contact_roles
  FOR EACH ROW EXECUTE FUNCTION public.on_contact_role_propietario_portal();
