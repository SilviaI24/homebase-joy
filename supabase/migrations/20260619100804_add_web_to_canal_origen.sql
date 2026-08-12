
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_canal_origen_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_canal_origen_check
  CHECK (canal_origen = ANY (ARRAY[
    'SilvIA-Voz',
    'SilvIA-WhatsApp',
    'SilvIA-Email',
    'SilvIA-Valorador',
    'Idealista',
    'Presencial',
    'Referido',
    'Manual',
    'Web'
  ]));

ALTER TABLE contacts_test DROP CONSTRAINT IF EXISTS contacts_test_canal_origen_check;
ALTER TABLE contacts_test ADD CONSTRAINT contacts_test_canal_origen_check
  CHECK (canal_origen = ANY (ARRAY[
    'SilvIA-Voz',
    'SilvIA-WhatsApp',
    'SilvIA-Email',
    'SilvIA-Valorador',
    'Idealista',
    'Presencial',
    'Referido',
    'Manual',
    'Web'
  ]));
