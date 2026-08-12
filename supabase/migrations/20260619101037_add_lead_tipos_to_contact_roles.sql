
ALTER TABLE contact_roles DROP CONSTRAINT IF EXISTS contact_roles_tipo_check;
ALTER TABLE contact_roles ADD CONSTRAINT contact_roles_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'lead_compra',
    'lead_alquiler',
    'Comprador',
    'Inquilino',
    'Propietario',
    'Arrendador'
  ]));

ALTER TABLE contact_roles_test DROP CONSTRAINT IF EXISTS contact_roles_test_tipo_check;
ALTER TABLE contact_roles_test ADD CONSTRAINT contact_roles_test_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'lead_compra',
    'lead_alquiler',
    'Comprador',
    'Inquilino',
    'Propietario',
    'Arrendador'
  ]));
