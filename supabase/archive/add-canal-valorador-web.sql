-- Add 'Valorador-Web' to contacts.canal_origen allowed values
-- and retroactively tag existing web-sourced prospectos

ALTER TABLE contacts
  DROP CONSTRAINT IF EXISTS contacts_canal_origen_check;

ALTER TABLE contacts
  ADD CONSTRAINT contacts_canal_origen_check
    CHECK (canal_origen IN (
      'SilvIA-Voz', 'SilvIA-WhatsApp', 'SilvIA-Email', 'SilvIA-Valorador',
      'Idealista', 'Presencial', 'Referido', 'Manual', 'Valorador-Web'
    ));

-- Tag contacts that were created from the valorador web form
-- (Prospecto contacts linked as Propietario to a PROSPECTO property, with no canal)
UPDATE contacts
SET canal_origen = 'Valorador-Web'
WHERE ciclo_vida = 'Prospecto'
  AND canal_origen IS NULL
  AND id IN (
    SELECT DISTINCT cr.contact_id
    FROM contact_roles cr
    JOIN properties p ON cr.property_id = p.id
    WHERE cr.tipo = 'Propietario'
      AND p.publicacion = 'PROSPECTO'
  );
