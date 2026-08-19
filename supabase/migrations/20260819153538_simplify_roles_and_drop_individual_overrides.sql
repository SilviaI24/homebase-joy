-- Simplificación del modelo de permisos (decisión de David, 19 ago 2026):
-- el objetivo original de restricción por departamento ya no es necesario.
-- El "alcance de datos" (propios/equipo/todos) ya se había eliminado en
-- crm_rbac_drop_scope. Quedan dos decisiones más para dejarlo tan simple
-- como el negocio necesita hoy:
--
--   1. Renombrar COMERCIAL_ADMINISTRATIVO -> OPERATIVO: el nombre sonaba a
--      distinción departamental cuando en realidad es un único nivel para
--      todo el personal de oficina no-admin.
--   2. Eliminar las excepciones individuales por persona (crm_permisos_usuario
--      + su protección de último-admin): con solo dos niveles activos
--      (ADMIN y OPERATIVO) y sin restricción departamental, un sistema de
--      excepciones por persona es más superficie de la que hace falta —
--      "más sólido" aquí es menos mecanismos especiales que recordar y
--      auditar. FINANCIERO se deja definido pero sin cuentas activas: su
--      acceso real vivirá en un proyecto aparte (command center) todavía
--      sin diseñar.
--
-- crm_auditoria_permisos se deja intacta a propósito: existe pero no la
-- escribe nada (0 filas) — no es parte de este cambio, es un hallazgo
-- aparte para otra sesión.

BEGIN;

-- 1. Primero aflojar los CHECK para que admitan 'OPERATIVO' — si se
-- actualizan los datos antes, el CHECK viejo (que todavía no conoce
-- 'OPERATIVO') rechaza la propia migración.
ALTER TABLE public.crm_usuarios DROP CONSTRAINT crm_usuarios_rol_base_check;
ALTER TABLE public.crm_usuarios ADD CONSTRAINT crm_usuarios_rol_base_check
  CHECK (rol_base = ANY (ARRAY['ADMIN', 'FINANCIERO', 'COMERCIAL_ADMINISTRATIVO', 'OPERATIVO']));

ALTER TABLE public.crm_permisos_rol DROP CONSTRAINT crm_permisos_rol_rol_base_check;
ALTER TABLE public.crm_permisos_rol ADD CONSTRAINT crm_permisos_rol_rol_base_check
  CHECK (rol_base = ANY (ARRAY['ADMIN', 'FINANCIERO', 'COMERCIAL_ADMINISTRATIVO', 'OPERATIVO']));

-- 2. Ahora sí, renombrar los datos.
UPDATE public.crm_usuarios
  SET rol_base = 'OPERATIVO'
  WHERE rol_base = 'COMERCIAL_ADMINISTRATIVO';

UPDATE public.crm_permisos_rol
  SET rol_base = 'OPERATIVO'
  WHERE rol_base = 'COMERCIAL_ADMINISTRATIVO';

-- 3. Cerrar el CHECK al conjunto final, ya sin el nombre viejo.
ALTER TABLE public.crm_usuarios DROP CONSTRAINT crm_usuarios_rol_base_check;
ALTER TABLE public.crm_usuarios ADD CONSTRAINT crm_usuarios_rol_base_check
  CHECK (rol_base = ANY (ARRAY['ADMIN', 'FINANCIERO', 'OPERATIVO']));

ALTER TABLE public.crm_permisos_rol DROP CONSTRAINT crm_permisos_rol_rol_base_check;
ALTER TABLE public.crm_permisos_rol ADD CONSTRAINT crm_permisos_rol_rol_base_check
  CHECK (rol_base = ANY (ARRAY['ADMIN', 'FINANCIERO', 'OPERATIVO']));

-- 4. Eliminar el mecanismo de excepciones individuales. crm_preserve_admin_control()
-- solo existe para proteger esta tabla — se elimina junto con ella. El trigger
-- se elimina automáticamente al hacer DROP TABLE.
DROP TABLE public.crm_permisos_usuario;
DROP FUNCTION public.crm_preserve_admin_control();

COMMIT;
