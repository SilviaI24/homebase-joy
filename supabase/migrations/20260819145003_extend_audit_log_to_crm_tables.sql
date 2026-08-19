-- H-05 (auditoría Codex, 14 ago 2026): audit_log ya existía y ya cubría
-- documentos, propietarios, roles_usuario y transacciones_docuten (tablas del
-- Portal), pero no cubría las tablas propias del CRM de oficina: contacts,
-- properties, contact_roles, visits, seguimiento y operations. Se añade aquí
-- el mismo trigger (registrar_audit(), ya existente y genérico) a esas 6.
--
-- Limitación conocida, no resuelta en esta migración: las funciones de
-- servidor del CRM escriben con service_role (sin sesión de usuario), así que
-- auth.uid() será NULL en usuario_id para estas filas. Registra el qué/cuándo/
-- antes-después correctamente; el quién requiere pasar el actor explícitamente
-- desde cada función de servidor (cambio más grande, pendiente — no forzarlo
-- aquí para no tocar cada *.functions.ts a la vez).

BEGIN;

CREATE TRIGGER audit_contacts
  AFTER INSERT OR UPDATE OR DELETE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.registrar_audit();

CREATE TRIGGER audit_properties
  AFTER INSERT OR UPDATE OR DELETE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.registrar_audit();

CREATE TRIGGER audit_contact_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.contact_roles
  FOR EACH ROW EXECUTE FUNCTION public.registrar_audit();

CREATE TRIGGER audit_visits
  AFTER INSERT OR UPDATE OR DELETE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.registrar_audit();

CREATE TRIGGER audit_seguimiento
  AFTER INSERT OR UPDATE OR DELETE ON public.seguimiento
  FOR EACH ROW EXECUTE FUNCTION public.registrar_audit();

CREATE TRIGGER audit_operations
  AFTER INSERT OR UPDATE OR DELETE ON public.operations
  FOR EACH ROW EXECUTE FUNCTION public.registrar_audit();

COMMIT;
