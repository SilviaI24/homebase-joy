-- 1. Añadir user_id a agents (FK nullable a auth.users)
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_user_id_unique
  ON public.agents (user_id) WHERE user_id IS NOT NULL;

-- 2. Función que sincroniza agents.user_id cuando un usuario de auth coincide por email
CREATE OR REPLACE FUNCTION public.sync_agent_user_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.agents
  SET user_id = NEW.id
  WHERE email = NEW.email
    AND user_id IS NULL;
  RETURN NEW;
END;
$$;

-- 3. Trigger en auth.users: se dispara al crear o confirmar usuario
DROP TRIGGER IF EXISTS on_auth_user_created_sync_agent ON auth.users;
CREATE TRIGGER on_auth_user_created_sync_agent
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_agent_user_id();

-- 4. Sincronización inicial: vincula agentes que ya tienen cuenta en auth.users
UPDATE public.agents a
SET user_id = u.id
FROM auth.users u
WHERE a.email = u.email
  AND a.user_id IS NULL;
