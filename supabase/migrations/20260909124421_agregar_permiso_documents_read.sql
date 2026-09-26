-- Auditoría 9 sep 2026: separa "ver la ficha del inmueble" (properties.read)
-- de "ver su documentación legal" (contratos, DNI, escrituras, bucket privado
-- property-docs). Antes properties.read solo, que tienen todos los perfiles
-- operativos, ya daba acceso a los documentos.
--
-- permitido=true en los 3 roles reproduce el comportamiento actual (nadie
-- pierde acceso con este cambio) — el toggle queda disponible en la
-- pantalla de permisos para que David lo restrinja por rol si lo decide.
INSERT INTO public.crm_permisos (clave, dominio, accion, descripcion, sensible)
VALUES (
  'documents.read',
  'documents',
  'read',
  'Ver/descargar documentación legal de un inmueble (contratos, DNI, escrituras)',
  true
);

INSERT INTO public.crm_permisos_rol (rol_base, permiso_clave, permitido)
VALUES
  ('ADMIN', 'documents.read', true),
  ('FINANCIERO', 'documents.read', true),
  ('OPERATIVO', 'documents.read', true);
