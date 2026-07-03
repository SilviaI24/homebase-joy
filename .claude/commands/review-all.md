---
description: Corre los 6 subagentes de revisión en un solo paso, en el orden seguro para evitar conflictos de edición.
---

Revisá los cambios actuales (`git diff` y `git diff --staged`; si no hay diff, pedime qué archivos revisar) usando los 6 subagentes de este proyecto, en este orden exacto:

1. **En paralelo, ahora mismo:** lanzá `code-auditor`, `supabase-schema-guardian` y `token-efficiency-reviewer` sobre el mismo diff. No comparten archivos entre sí, así que no hay riesgo de que se pisen.
2. **Recién cuando los tres anteriores terminaron**, lanzá en secuencia (nunca en paralelo entre ellos, porque los tres pueden tocar los mismos archivos `.tsx`): primero `performance-reviewer`, después `style-mentor` viendo ya el resultado del anterior, y por último `ui-ux-reviewer` viendo el resultado de los dos previos.
3. Al terminar los 6, armá un único reporte consolidado con estas secciones:
   - **Corregido** (agrupado por agente, archivo:línea y qué se cambió)
   - **Crítico / requiere decisión** (agrupado por agente)
   - **Advertencias y sugerencias** (agrupado por agente)
   - Si algún agente no encontró nada, decilo explícitamente en vez de omitirlo.

No me pidas confirmación entre cada agente — encadená los 6 pasos vos mismo y mostrame el reporte consolidado al final.
