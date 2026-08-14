-- Ampliar CHECK constraint de agents.rol para incluir roles de acceso completo
ALTER TABLE public.agents DROP CONSTRAINT IF EXISTS agents_rol_check;
ALTER TABLE public.agents ADD CONSTRAINT agents_rol_check
  CHECK (rol IN ('AGENTE', 'SENIOR', 'MANAGER', 'ADMIN', 'FINANCIERO'));
