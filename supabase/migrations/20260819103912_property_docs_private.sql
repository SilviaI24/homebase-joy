-- C-02 (auditoría Codex, 14 ago 2026): property-docs contenía documentación
-- de inmueble (contratos de autorización de venta, referencias catastrales...)
-- en un bucket público desde su creación (12 jun 2026), con 516 objetos.
--
-- Este cambio ya se aplicó directamente en producción el 19 ago 2026 vía SQL
-- (execute_sql). Este archivo documenta ese cambio para que la carpeta de
-- migraciones siga siendo la fuente de verdad — ver también C-04 de la misma
-- auditoría, que señala justo el problema de aplicar cambios sin versionarlos.
--
-- El código (src/lib/inmuebles.functions.ts: uploadPropertyAttachment /
-- getPropertyDocumentUrl) ya se actualizó en el mismo commit para servir estos
-- documentos por URL firmada de 120s en vez de URL pública. property-images
-- sigue público a propósito (fotos comerciales usadas en la web/WordPress).

UPDATE storage.buckets SET public = false WHERE id = 'property-docs';
