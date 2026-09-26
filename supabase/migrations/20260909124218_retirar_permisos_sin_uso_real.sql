-- Auditoría 9 sep 2026: 7 de los 36 permisos del catálogo no correspondían
-- a ninguna funcionalidad real de la app (nadie los comprueba porque la
-- acción que gobernarían no existe): exportar contactos, borrar documento,
-- borrar visita, SilvIA ejecutando acciones, envío de email, pantalla de
-- configuración, log de auditoría. La pantalla de administración de
-- permisos los mostraba como si desactivarlos bloqueara algo, sin efecto
-- real. Decisión de David: si no hay una función sólida detrás, se retira
-- del catálogo en vez de simular un control que no existe.
--
-- CASCADE ya definido en crm_permisos_rol_permiso_clave_fkey (ON DELETE
-- CASCADE), así que este DELETE también limpia las filas correspondientes
-- de crm_permisos_rol.
DELETE FROM public.crm_permisos
WHERE clave IN (
  'contacts.export',
  'documents.delete',
  'visits.delete',
  'silvia.execute_actions',
  'email.send',
  'config.manage',
  'audit.read'
);
