
-- 1. Eliminar constraints actuales primero
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_ciclo_vida_check;
ALTER TABLE contacts_test DROP CONSTRAINT IF EXISTS contacts_test_ciclo_vida_check;

-- 2. Migrar datos Activo/Reservado → Cliente
UPDATE contacts SET ciclo_vida = 'Cliente' WHERE ciclo_vida IN ('Activo', 'Reservado');

-- 3. Añadir nuevas constraints
ALTER TABLE contacts ADD CONSTRAINT contacts_ciclo_vida_check
  CHECK (ciclo_vida = ANY (ARRAY['Lead','Prospecto','Cliente','Histórico','Descartado']));
ALTER TABLE contacts_test ADD CONSTRAINT contacts_test_ciclo_vida_check
  CHECK (ciclo_vida = ANY (ARRAY['Lead','Prospecto','Cliente','Histórico','Descartado']));

-- 4. Añadir campo tipo a visits
ALTER TABLE visits ADD COLUMN IF NOT EXISTS tipo text
  CHECK (tipo = ANY (ARRAY[
    'Mostrar inmueble','Valoración','Sesión fotográfica','Seguimiento'
  ]));
