-- La restricción original de documentos.categoria (esgi_phase2_new_tables,
-- 20260721) solo permitía 'contrato','escritura','nota_encargo','dni',
-- 'certificado','otro' y nunca se actualizó cuando el checklist de
-- onboarding (src/config/onboarding.ts) y la subida manual del panel admin
-- (AdminPropietarios.tsx) añadieron nuevas categorías. En la práctica esto
-- bloqueaba con un 500/"Error al subir" la subida de IBI y Acta de
-- comunidad (2 de los 4 documentos obligatorios de tipo "upload" del
-- onboarding) y casi todas las categorías del upload manual del admin —
-- detectado probando el onboarding real el 18 sep 2026.
ALTER TABLE public.documentos DROP CONSTRAINT documentos_categoria_check;

ALTER TABLE public.documentos ADD CONSTRAINT documentos_categoria_check CHECK (categoria IN (
  -- Categorías originales
  'contrato', 'escritura', 'nota_encargo', 'dni', 'certificado', 'otro',
  -- Checklist de onboarding (src/config/onboarding.ts, ChecklistKey)
  'ibi', 'acta_comunidad', 'cargas_hipoteca', 'certificado_energetico',
  'herencia', 'divorcio', 'menores',
  -- Subida manual desde el panel admin del Portal (AdminPropietarios.tsx)
  'informe_mercado', 'nota_simple', 'oferta_recibida', 'contrato_arras'
));
