-- Nueva capability para el botón "Dar acceso al portal" en la ficha de
-- cliente del CRM. Marcada sensible=true (mismo criterio que whatsapp.send):
-- crea acceso externo para un tercero y envía un email en nombre de la
-- oficina, no es una simple lectura/escritura interna.
INSERT INTO public.crm_permisos (clave, dominio, accion, descripcion, sensible)
VALUES ('contacts.portal_invite', 'contacts', 'portal_invite', 'Dar acceso al portal del propietario', true)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO public.crm_permisos_rol (rol_base, permiso_clave, permitido)
VALUES
  ('ADMIN', 'contacts.portal_invite', true),
  ('OPERATIVO', 'contacts.portal_invite', true),
  ('FINANCIERO', 'contacts.portal_invite', false)
ON CONFLICT (rol_base, permiso_clave) DO NOTHING;
