-- Amplía (no reemplaza) los CHECK de documentos.estado y
-- solicitudes_servicio.tipo para aceptar el vocabulario que ya usa el
-- frontend del Portal, encontrado desincronizado el 16 sep 2026 (ambas
-- tablas están a 0 filas en producción, nadie había completado estos
-- flujos hasta el final). Decisión de David: ampliar la base, no recortar
-- el frontend.
--
-- documentos.estado: pendiente/firmado/rechazado/archivado (existentes) +
-- revision (Onboarding.tsx) + aprobado (AdminPropietarios.tsx, botón
-- "Aprobar" y subida admin) — sin estos dos, la subida de onboarding y la
-- aprobación de documentos fallaban siempre con violación del CHECK.
ALTER TABLE public.documentos DROP CONSTRAINT documentos_estado_check;
ALTER TABLE public.documentos ADD CONSTRAINT documentos_estado_check
  CHECK (estado = ANY (ARRAY['pendiente','firmado','rechazado','archivado','revision','aprobado']::text[]));

-- solicitudes_servicio.tipo: limpieza/mantenimiento/fotografia/valoracion/
-- juridico/otro (existentes) + mudanza/reparacion/asesoria_financiera/
-- seguros/telecomunicaciones (los que ofrece el desplegable "Nueva
-- solicitud" del propietario, Solicitudes.tsx) — sin estos, 5 de las 8
-- opciones del desplegable fallaban siempre al enviarlas.
ALTER TABLE public.solicitudes_servicio DROP CONSTRAINT solicitudes_servicio_tipo_check;
ALTER TABLE public.solicitudes_servicio ADD CONSTRAINT solicitudes_servicio_tipo_check
  CHECK (tipo = ANY (ARRAY['limpieza','mantenimiento','fotografia','valoracion','juridico','otro','mudanza','reparacion','asesoria_financiera','seguros','telecomunicaciones']::text[]));
