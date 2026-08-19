-- M-04 (auditoría Codex, 14 ago 2026): "contact_roles mezcla tipos de lead y
-- roles finales". Confirmado: 10 filas siguen con tipo='lead_compra' o
-- 'lead_alquiler' (valores de junio 2026, anteriores a la reconstrucción del
-- CRM). Ningún código actual escribe ni lee esos valores — se verificó antes
-- de esta migración. El estado (Prospecto/Cerrado) ya era correcto; solo se
-- normaliza el nombre del tipo al mismo que usan el resto de filas con ese
-- mismo estado.

BEGIN;

UPDATE public.contact_roles SET tipo = 'Comprador' WHERE tipo = 'lead_compra';
UPDATE public.contact_roles SET tipo = 'Inquilino' WHERE tipo = 'lead_alquiler';

ALTER TABLE public.contact_roles DROP CONSTRAINT contact_roles_tipo_check;
ALTER TABLE public.contact_roles ADD CONSTRAINT contact_roles_tipo_check
  CHECK (tipo = ANY (ARRAY['Comprador', 'Inquilino', 'Propietario', 'Arrendador']));

COMMIT;
