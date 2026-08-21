-- H-06 (auditoría Codex, 14 ago 2026) quedó resuelto antes incluso de
-- escribirse: el commit 676d5a7 (15 ago 2026) ya separó el cálculo de
-- lectura de la persistencia en getLeadInsightsFn, eliminando la escritura
-- de contacts.meta_score como efecto lateral de un GET. Verificado el 21
-- ago 2026: ningún código de este repo ni de elsol-client-hub escribe ni
-- lee meta_score hoy (solo aparece en los tipos de TypeScript
-- autogenerados de elsol-client-hub). Los valores que quedan en la columna
-- son de agosto 2026, congelados, y no reflejan nada actual.
--
-- Regla aplicada (REGLA_CALIDAD_METRICAS_AGREGADAS_2026-08-20.md, punto 5):
-- retirar explícitamente lo que queda sustituido en vez de dejarlo vivo en
-- silencio. Aquí se aplica la versión no destructiva (solo comentario):
-- retirar la columna por completo (DROP COLUMN + su índice) es una
-- decisión más grande -- borra datos y afecta a los tipos generados del
-- otro repo -- y queda pendiente de decisión explícita, no se hace aquí.

COMMENT ON COLUMN public.contacts.meta_score IS
  'OBSOLETA desde 2026-08-15 (commit 676d5a7). Ya no se escribe: el score '
  'de cualificación se calcula en lectura, en getLeadInsightsFn, y no se '
  'persiste. Los valores almacenados son históricos (ago 2026) y no deben '
  'usarse para ordenar ni filtrar leads. Candidata a DROP COLUMN completo '
  '-- pendiente de decisión.';
