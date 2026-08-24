# Homebase CRM

CRM inmobiliario para gestión de propiedades, contactos, leads y operaciones.

## Stack

- **Frontend:** TanStack Start + TanStack Router + TanStack Query + Vite. Despliegue real: **Vercel**
  (`vercel.json`, `nitro({ preset: "vercel" })` en `vite.config.ts`) — Cloudflare Workers fue el plan
  original pero no es lo que corre hoy; corregido aquí el 21 ago 2026 tras detectarlo con M-06.
- **Backend:** Supabase (PostgreSQL + Storage + Edge Functions + Auth)
- **IA:** SilvIA — agente de cualificación de leads vía WhatsApp/Email/Voz
- **Automatización:** Make (team 1698831) + pg_cron

## Supabase

- **Project ID:** `fyrfkbcabmitbfuqeccq`
- **Client anon:** `src/lib/supabase-browser.ts` — usa `VITE_SUPABASE_ANON_KEY` (solo auth del usuario)
- **Server:** `src/lib/supabase.server.ts` → `getSupa()` — usa `SUPABASE_SERVICE_KEY`, nunca en cliente
- **RLS:** todas las tablas tienen RLS con policy `service_role_all TO service_role`. La anon key NO lee datos.
- **Auth:** email/password, único administrador inicial `ai@elsolgrupo.com`. Roles: solo `ADMIN` y `OPERATIVO`
  (sin distinción por departamento — decisión de David, 19 ago 2026; `FINANCIERO` existe en el catálogo pero
  sin cuentas activas, su acceso vive en un command center aparte, repo distinto, aún sin diseñar).

## Convenciones de código

- Toda mutación de DB va en `createServerFn` con `getSupa()` — nunca en componentes con la anon key
- Nombres de archivos de server functions: `src/lib/<dominio>.functions.ts`
- `ciclo_vida` CHECK: `('Lead', 'Prospecto', 'Cliente', 'Histórico', 'Descartado')` — nunca escribir `'Activo'` ni `'Reservado'`
- `properties.estatus` CHECK: `('Activo', 'Reservado', 'Vendido', 'Alquilado', 'Baja', 'Prospección')`
- `properties.publicacion` CHECK: `('', 'PROSPECTO', 'SUBIR', 'PUBLICADO')`

## Seguridad — reglas inamovibles

- `SUPABASE_SERVICE_KEY` solo en `.env.local`, nunca en git
- `WABA_ACCESS_TOKEN` solo en `.env.local`, nunca en git
- Todas las API keys (OpenAI, Resend, WABA, Airtable) solo en `.env.local`
- Make team ID `1698831` — no modificar sin aprobación explícita previa

## Migraciones de base de datos

Migraciones versionadas activas desde 2026-07-04. Supabase CLI instalado como devDependency.

**Crear una migración nueva:**
```bash
npx supabase migration new nombre_descriptivo
# → crea supabase/migrations/<timestamp>_nombre_descriptivo.sql
# Editar el archivo, luego:
npx supabase db push
```

**Verificar estado:**
```bash
npx supabase migration list   # local vs remote
npx supabase db push --dry-run
```

- `supabase/migrations/` — fuente de verdad de esquema, ordenadas por timestamp
- `supabase/archive/` — scripts sueltos pre-migración, solo referencia
- `supabase/functions/` — Edge Functions
- `schema.sql` — snapshot de referencia (no es la fuente de verdad; las migraciones lo son)

**Para DDL urgente** (fix de producción): usar `apply_migration` del MCP, luego crear el archivo local correspondiente manualmente.

## Automatizaciones

- **sync-properties:** Edge Function desplegada exclusivamente desde
  `elsol-client-hub/supabase/functions/sync-properties/index.ts` (v32).
  **No se despliega desde homebase-joy.** No existe copia local de esta función.

  **Modos** (parámetro `mode` en el body):
  - `meta` — sync incremental de las últimas 25 h (cron diario 19:00 UTC)
  - `images` — subida de imágenes de propiedades Activo (cron diario 19:30 UTC)
  - `meta_full` — sync completo paginado con cursor (cron domingos 18:00 y 18:30 UTC)

  **Autenticación:** el header `x-cron-secret` se valida mediante RPC
  `verify_cron_secret(p_value)` → Vault. El secreto nunca viaja como respuesta;
  solo se devuelve `true`/`false`. Rotación futura: actualizar `cron_secret` en
  Vault sin cambiar código ni variables de entorno.

## Autenticación server-side (implementado)

- `@supabase/ssr` instalado
- `src/lib/supabase.client.ts` usa `createBrowserClient` → sesión guardada en cookies (necesario para el servidor)
- `src/lib/auth.server.ts` exporta `requireAuth()` — lee la cookie de sesión, verifica con Supabase, lanza 401 si no hay sesión válida
- Todos los 33 handlers en `createServerFn` llaman `await requireAuth()` como primera línea
- Variables necesarias en `.env.local`: `SUPABASE_URL` y `SUPABASE_ANON_KEY` (sin prefijo VITE_)
- **Nota:** usuarios con sesión antigua (localStorage) necesitan re-login una vez para que se genere la cookie

## Métricas agregadas (promedios, medianas, comparativas de barrio…)

Antes de escribir cualquier vista/función que agregue datos operativos para
mostrarla a alguien, seguir la regla escrita en
`elsol-client-hub/REGLA_CALIDAD_METRICAS_AGREGADAS_2026-08-20.md` (normalizar
claves de agrupación en texto libre, no mezclar categorías/unidades
incompatibles, exigir mínimo de muestra documentado con datos reales, no
publicar lo que el dato de origen no sostiene todavía, retirar explícitamente
lo que quede sustituido). Nace de arreglar `neighborhood_market_data` en
elsol-client-hub — leer ese caso como ejemplo de referencia.

## Migraciones compartidas entre repos (importante, aprendido el 20 ago 2026)

`homebase-joy` y `elsol-client-hub` apuntan al **mismo proyecto Supabase**
(`fyrfkbcabmitbfuqeccq`). El seguimiento de qué migración se aplicó vive en
la base de datos compartida, no en cada repo — así que **cada vez que se
aplica una migración desde un repo, hay que copiar ese mismo archivo al otro
repo también**, o su `supabase db push` deja de funcionar (ver
`esgi-dual-repo-architecture` en memoria para el detalle completo de por qué).
No asumir que "esto es solo del CRM" o "esto es solo del Portal" exime de
copiarlo — el historial de migraciones es del proyecto, no de la app.

## Pendiente

- **H-07 (ESLint) — completado del todo el 24 ago 2026**: 253→0 errores.
  Fase 1 (23 ago): autofix seguro de formato (166 de los 253, sin cambio de
  lógica). Fase 2 (24 ago): tipados los 86 `@typescript-eslint/no-explicit-any`
  restantes con la forma real de cada fila de Supabase (patrón repetido:
  supabase-js sin tipos de `Database` generados infiere las relaciones
  anidadas como array por defecto; en runtime PostgREST devuelve un objeto
  único — se corrige con un cast explícito documentado, nunca con `any`
  ciego) y arreglados los 9 `react-hooks/exhaustive-deps` (la mayoría eran
  patrones `x ?? []` sin memoizar invalidando un `useMemo` dependiente, no
  bugs reales). Quedan 9 `react-refresh/only-export-components` (patrón
  estándar de shadcn/ui, no un bug) y el `prefer-const` de
  `password-reset.ts` ahora con su `eslint-disable` explícito junto al
  comentario que ya explicaba el porqué. La cifra "2.316" de la auditoría
  del 14 ago ya no aplica. CI corre `npm audit --audit-level=high` y
  `eslint` **ambos bloqueantes** (el lint ya no necesita `continue-on-error`
  — el backlog que lo justificaba está limpio).
- M-01-bis completado el 21 ago 2026: `listAllInmuebles`/`allInmueblesLiteQuery`
  ya no los usa nada (Cartera, buscadores/autocompletar, operaciones, visitas,
  bandeja, dashboard y ahora también Comerciales — este último reutilizando
  `listComerciablesInmuebles` para las tarjetas por agente y una función nueva,
  `listInmueblesActividadReciente`, para el feed de actividad). Código muerto
  detectado de paso, sin retirar todavía: `listAllInmuebles`, `allInmueblesQuery`,
  `listInmuebles`, `listAlquileres` — sin consumidores desde antes de esta sesión.
- **Bugs de datos de origen corregidos el 21 ago 2026** (migraciones
  `20260821064713_fix_metros_y_alquiler_mismarcado.sql` +
  `20260821065045_fix_estatus_bloqueado_por_trigger.sql`, aplicadas y
  verificadas contra producción): `metros_construidos` con separador de
  miles perdido (235 filas puestas a NULL, salvo Garaje/Trastero donde
  valores pequeños son legítimos) y 1.953 alquileres mensuales guardados
  con `es_alquiler=false` (corregidos a `true`; los que tenían
  `estatus='Vendido'` pasan a `'Alquilado'`). Precios <20€ (27 filas,
  placeholders) se dejaron sin tocar a propósito. Ver
  `REGLA_CALIDAD_METRICAS_AGREGADAS_2026-08-20.md` (elsol-client-hub) para
  el criterio aplicado.
- **CI (`.github/workflows/ci.yml`) creado el 21 ago 2026, commit local
  `045a9ab` sin subir todavía:** el push falló porque el PAT embebido en el
  remoto no tiene el scope `workflow` que GitHub exige para archivos bajo
  `.github/workflows/`. Hay que subirlo a mano o añadir ese scope al token.
- **Trigger a tener en cuenta al escribir migraciones futuras que tocan
  `properties.estatus`:** `trg_crm_preserve_closed_property_state` impide
  cambiar `estatus`/`precio_final`/`fecha_escritura`/`publicacion` una vez
  que `estatus` está en `Vendido`/`Alquilado`, salvo que la sesión active
  `SET LOCAL app.crm_property_final_override = 'on'` antes del `UPDATE` (y
  ojo: `SET LOCAL` fuera de un `BEGIN` explícito degrada a `SET` de sesión
  con un warning — Supabase CLI no envuelve cada migración en un `BEGIN`
  visible, así que confirmar con una consulta de postflight, no solo con la
  ausencia de errores).
- **H-05 (actor real en audit_log) — completado al 100% el 24 ago 2026**:
  `registrar_audit()` resuelve el actor como `app.actor_id` (GUC local que
  fija el RPC que escribe) con `auth.uid()` como fallback. Como `getSupa()`
  habla con Postgres vía PostgREST (una transacción por petición HTTP), un
  `SET LOCAL` suelto desde la función de servidor no sobrevive al salto de
  request — el actor viaja como parámetro dentro del mismo RPC que hace la
  escritura. Convertidos: `contacts.ciclo_vida`, `cerrar_operacion_crm`,
  `createSeguimiento`, `deleteContacto`, `restaurarContactoDeHistorico`,
  `gestionarRol` (+ `recalcularEtapa`, ahora en SQL), `addImagenToInmueble`,
  `deleteInmueble`, los 8 flujos de `mutations.functions.ts` (`createCliente`,
  `createVisita`, `updateVisitaEstado`, `assignClienteAgentes`,
  `createProspectoManual`, `activarProspecto`, `updateClienteSeguimiento`,
  `asociarLeadAInmueble`), y finalmente `createInmueble`/`updateInmueble`
  (los 2 que quedaban aplazados por su volumen de campos dinámicos —
  destrabados con `jsonb_populate_record(base, patch)`, el idiom de
  Postgres para "solo escribir las claves presentes en el JSON, conservar
  el resto de la fila base", sin SQL dinámico a mano). Beneficio colateral
  en varios de estos: al mover cada flujo a un solo RPC, las escrituras que
  antes eran varias llamadas HTTP con rollback manual en TypeScript (H-02)
  pasaron a ser atómicas de verdad — se retiró ese código de compensación.
  Verificado en producción contra datos reales (creados y borrados después
  de cada prueba), incluidos los guards de error y la cascada de ciclo_vida.
  **Hallazgo de paso:** `properties.changelog` no existe en el esquema real
  — el bloque que la usaba en `updateInmueble` era código muerto en la
  práctica desde siempre (try/catch que nunca disparaba), no se replicó.
  `geocodeInmuebles` no tiene consumidores en el frontend — código muerto
  detectado, no tocado. Decisión ya tomada: las escrituras sin actor humano
  (crons, recálculos automáticos) se dejan en
  NULL a propósito — no se inventa un actor "sistema".
- **M-03 (módulos grandes) — primer avance real el 24 ago 2026**: extraídos
  los helpers de formato puros (sin estado, sin JSX) de 4 de los archivos
  más grandes a módulos propios: `dashboard-format.ts` (de `index.tsx`),
  `inmueble-detail-format.ts` (de `inmuebles.$id.tsx`), `visitas-format.ts`
  (de `visitas.index.tsx`), `bandeja-format.ts` (de `bandeja.index.tsx`).
  Verificado tsc+tests+build tras cada extracción por separado. Hallazgo
  sin corregir a propósito: `moneyShort` está triplicada (index.tsx,
  comerciales.index.lazy.tsx, bandeja.index.tsx) con redondeos distintos
  (2 vs 1 decimal, con/sin `null`) — no se unifica sin decidir cuál es la
  correcta. **Queda pendiente el resto de M-03** (mover los componentes
  React con estado — `Field`, `Spec`, paneles, diálogos — a sus propios
  archivos): eso sí tiene riesgo real de cambiar comportamiento y merece
  una sesión con más margen de prueba, no un fix rápido.
- **UX-01 a UX-07 — auditados contra el código actual el 21 ago 2026**:
  ninguno resuelto al 100%, el mayor avance es UX-03 (paginación server-side
  ya en Contactos/Bandeja/Cartera). De ahí se corrigieron 5 puntos concretos
  el mismo día: teclado en fila clicable de Contactos, `aria-hidden`+`inert`
  en el drawer móvil cerrado, `aria-label` en miniaturas de galería, la
  métrica "Conversión" del dashboard renombrada a "Cierres/visitas" (mezclaba
  poblaciones no comparables), y `estatus`/`precio_final`/`fecha_escritura`
  sacados del autosave de 2s en la ficha de inmueble (solo se guardan con
  "Guardar ahora"). **23 ago 2026:** ruta `/seguimiento` ya añadida al menú
  CRM (estaba construida pero inalcanzable); favicon añadido (monograma "ES"
  ya usado en `AppShell`, sin inventar paleta de marca nueva); contraste WCAG
  AA verificado por cálculo — todos los pares de texto/fondo reales pasan
  (peor caso 4.61:1, mínimo exigido 4.5:1). Quedan abiertos: paleta/tipografía
  de marca completa (necesita valores exactos de marca — naranja #E8820C y
  tokens marfil/carbón mencionados en la auditoría, sin hex definido — no se
  adivina), y el tamaño de letra de 9-11px en varias pantallas (legibilidad,
  no contraste — no se toca sin revisar cada layout, riesgo de romper chips/
  badges ajustados a propósito).
- **M-06 (observabilidad/Lovable) — limpieza cosmética hecha, decisiones de
  producto pendientes**: `.lovable/` eliminado, nombre de `package.json`
  corregido, doc de despliegue corregida (era Vercel, no Cloudflare
  Workers), worktree viejo de Lovable borrado (23 ago). Sigue pendiente,
  decisión de David: elegir proveedor de error-tracking (la interfaz en
  `error-reporting.ts` ya está preparada para conectarlo) y definir alertas
  críticas — ninguna de las dos es un cambio de código, son decisiones de
  producto/coste.
- **M-07 (cabeceras de seguridad HTTP) — resuelto el 21 ago 2026**: CSP,
  HSTS, X-Frame-Options, Permissions-Policy, Cross-Origin-Opener-Policy
  aplicados en dos capas (`vercel.json` para `/assets/*` + `src/lib/security-headers.ts`
  en el entry del servidor para las respuestas SSR). El CSP completo va en
  modo `Report-Only` a propósito — TanStack Start hidrata con scripts
  inline, necesita `'unsafe-inline'` hasta implementar nonces por petición;
  promoverlo a enforce requiere antes verificarlo en un navegador real.
- **H-06 (GET con escritura global) — ya estaba resuelto desde el 15 ago
  2026** (commit `676d5a7`), antes incluso de que se cerrara la auditoría.
  De paso se detectó que `contacts.meta_score` quedó huérfana (nadie la
  escribe ni la lee) — marcada como obsoleta con un `COMMENT`
  (`20260821073707_mark_meta_score_obsoleta.sql`); el `DROP COLUMN`
  completo queda pendiente de decisión de David (borra datos y afecta tipos
  generados de elsol-client-hub).
