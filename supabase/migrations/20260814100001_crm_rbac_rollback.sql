-- RBAC rollback: reverses 20260814100000_crm_rbac_initial.sql
-- Apply ONLY to the rbac-p0 branch. NEVER to production.
-- After this runs, revert code with: git revert HEAD..origin/feat/auth-rbac-p0

BEGIN;

-- 1. Drop triggers first (depend on functions)
DROP TRIGGER IF EXISTS trg_auditoria_no_truncate ON public.crm_auditoria_permisos;
DROP TRIGGER IF EXISTS trg_auditoria_immutable    ON public.crm_auditoria_permisos;
DROP TRIGGER IF EXISTS trg_crm_last_admin          ON public.crm_usuarios;
DROP TRIGGER IF EXISTS trg_crm_usuarios_updated_at ON public.crm_usuarios;

-- 2. Drop SECURITY DEFINER functions
DROP FUNCTION IF EXISTS public.crm_auditoria_immutable();
DROP FUNCTION IF EXISTS public.crm_check_last_admin();
DROP FUNCTION IF EXISTS public.crm_set_updated_at();

-- 3. Drop tables in FK-safe order (children before parents)
DROP TABLE IF EXISTS public.crm_auditoria_permisos;
DROP TABLE IF EXISTS public.crm_silvia_intenciones;
DROP TABLE IF EXISTS public.crm_permisos_usuario;
DROP TABLE IF EXISTS public.crm_permisos_rol;
DROP TABLE IF EXISTS public.crm_permisos;
DROP TABLE IF EXISTS public.crm_equipo_miembros;
DROP TABLE IF EXISTS public.crm_equipos;
DROP TABLE IF EXISTS public.crm_usuarios;

COMMIT;

-- Verify: the following query should return 0 rows after rollback.
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name LIKE 'crm_%';
