-- Helper RLS: comprueba si el usuario autenticado pertenece al personal autorizado del CRM.
-- Se utiliza únicamente como condición USING/CHECK en políticas RLS; no concede acceso por sí misma.
-- anon no tiene permiso de ejecución (REVOKE ALL FROM PUBLIC).
-- authenticated sin rol en roles_usuario devuelve false.
CREATE OR REPLACE FUNCTION public.es_staff_crm()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.roles_usuario AS ru
    WHERE ru.user_id = (SELECT auth.uid())
      AND ru.rol IN ('admin', 'agente')
  );
$$;

COMMENT ON FUNCTION public.es_staff_crm() IS
  'Helper RLS: devuelve true si auth.uid() pertenece al personal del CRM (rol admin o agente). '
  'Solo se usa como expresión USING/CHECK en políticas RLS. '
  'No concede acceso por sí misma. '
  'anon no tiene permiso de ejecución (REVOKE ALL FROM PUBLIC).';

REVOKE ALL
  ON FUNCTION public.es_staff_crm()
  FROM PUBLIC;

-- Revocar grant explícito a anon que Supabase crea por defecto en funciones SECURITY DEFINER
REVOKE EXECUTE
  ON FUNCTION public.es_staff_crm()
  FROM anon;

GRANT EXECUTE
  ON FUNCTION public.es_staff_crm()
  TO authenticated;
