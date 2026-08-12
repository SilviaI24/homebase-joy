
ALTER TABLE properties
  ADD CONSTRAINT properties_publicacion_check
  CHECK (publicacion IN ('', 'PROSPECTO', 'SUBIR', 'PUBLICADO'));
