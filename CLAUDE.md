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
- Nombres de archivos de server functions: `src/lib/<dominio>.functions.ts`. Si un
  dominio crece demasiado (M-03), se divide en `src/lib/<dominio>-<subdominio>.functions.ts`
  (p. ej. `mutations-cliente.functions.ts`, `clientes-ciclo-vida.functions.ts`) — el
  archivo `<dominio>.functions.ts` original queda como barrel si tiene muchos
  consumidores (`export { x } from "./dominio-subdominio.functions"`), o se recorta
  directamente si sus pocos consumidores se pueden actualizar sin riesgo.
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

- **web-lead:** Edge Function que recibe los formularios de contacto de fichas
  de inmueble (venta/alquiler) de la web pública. Hasta el 11 sep 2026 no
  tenía copia local en ningún repo — ahora versionada en
  `supabase/functions/web-lead/` (deploy con `--no-verify-jwt`, la web la
  llama sin JWT de Supabase). Ver README de la función para el bug que esto
  causó y el detalle del payload.

## Autenticación server-side (implementado)

- `@supabase/ssr` instalado
- `src/lib/supabase.client.ts` usa `createBrowserClient` → sesión guardada en cookies (necesario para el servidor)
- `src/lib/auth.server.ts` exporta `requireAuthClient()` — lee la cookie de sesión, verifica con
  Supabase, lanza 401 si no hay sesión válida, y devuelve también el cliente Supabase autenticado
  (corregido 12 sep 2026: existía un `requireAuth()` casi idéntico, sin ese cliente, que quedó
  huérfano — nada lo llamaba, `crm-auth.server.ts` usa `requireAuthClient()` desde siempre; se retiró)
- Todos los handlers en `createServerFn` llaman `requirePermission()`/`requirePermissions()`
  (`crm-auth.server.ts`), que internamente exige sesión vía `requireAuthClient()` antes de evaluar el permiso
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

- **Auditoría estructural, Fase 2 (búsqueda + accesibilidad) — 12 sep 2026:**
  - **Búsqueda unificada:** existían dos funciones de escape incompletas
    (`escapeLike` en inmuebles.functions.ts, `escapeLikeCliente` en
    clientes-format.ts) que solo escapaban `%`/`_` (comodines de LIKE) pero
    no `,`/`(`/`)` — caracteres estructurales del parser de filtros `.or()`
    de PostgREST. Buscar "Mayor, 3" o "López (hijo)" devolvía un error 400
    en vez de resultados, en 5 puntos de búsqueda distintos (Contactos,
    Cartera, bandeja de conversaciones IA). Unificadas en
    `escapeSearchTerm()` (`src/lib/format.ts`), que hace ambas cosas.
    `searchContactos` (seguimiento.functions.ts) no escapaba nada en
    absoluto — corregido también. `safeSearchTerm` de SilvIA
    (silvia.functions.ts), que ya cubría el problema de comas/paréntesis,
    ahora reutiliza la misma función para que solo haya un criterio.
  - **Accesibilidad — `htmlFor`/`id` en formularios:** ningún `<label>` del
    proyecto vinculaba su input (confirmado por grep, cero `htmlFor` en
    todo `src/`) — un lector de pantalla no anunciaba el nombre del campo
    al enfocarlo. Corregido en el componente compartido `Field`
    (`src/components/create-dialogs/shared.tsx`, usado por los 3 diálogos
    de alta — Cliente/Inmueble/Visita, ~23 usos): genera un `id` con
    `useId()` y lo inyecta en el input hijo vía `cloneElement` solo cuando
    hay un único control real (no en el grupo de chips de categorías, que
    queda como etiqueta visual). También corregido a mano en
    `src/components/comerciales/Dialogs.tsx` (3 diálogos duplicados que no
    usan `Field`): `NuevaVisitaDialog`/`NuevoClienteDialog` con
    `htmlFor`/`id` explícitos, y `NuevaCaptacionDialog` — que no tenía
    ningún `<label>`, solo `placeholder` — con `aria-label` en cada campo.

- **Auditoría estructural, Fase 1 (limpieza + bugs de datos) — 12 sep 2026:**
  - **Código muerto retirado** (confirmado sin consumidores por grep, no por
    inspección): `listConversacionesIa`/`iaConversationsQuery` (además la
    consulta más cara del repo — barrido completo de `contacts` sin filtro
    SQL), `buscarInmuebles`, `getContactoActividad`, `getInmueblesByIds`,
    `sectionTotals` (mal calculada y sin consumidor — 3 `COUNT(*)` exactos
    desperdiciados en cada carga de Cartera), el campo `changelog` de
    principio a fin (columna que no existe en el esquema, siempre `[]`),
    `src/lib/airtable.server.ts` completo, `requireAuth()` (duplicado
    huérfano de `requireAuthClient()`), `src/lib/config.server.ts`
    (boilerplate de plantilla, nunca conectado), `geocodeInmuebles`
    (código muerto ya señalado dos veces antes sin retirar), y 3
    componentes de UI sin importador (`EmptyState`/`ErrorState`,
    `RecordatoriosEstancados`, `ui/alert-dialog` de shadcn). Verificado con
    `npx knip` además de grep manual.
  - **Bugs de datos corregidos:**
    - `createVisita` guardaba solo el primer inmueble/cliente/agente de una
      selección múltiple — ahora crea una visita por inmueble seleccionado.
    - Ficha de inmueble en alquiler no mostraba propietario (el filtro solo
      pedía rol "Propietario", no "Arrendador").
    - `listLeads` no pedía `imagenes` en el select (sí lo hace `listClientes`)
      — los inmuebles vinculados a un Lead nunca tenían miniatura.
    - `addImagenToInmueble` hacía un read-modify-write en TypeScript (dos
      subidas concurrentes podían pisarse). Nueva función SQL
      `crm_agregar_imagen_inmueble` hace el append dentro del propio
      `UPDATE` (atómico por fila vía MVCC).
    - `computeSegmentoCounts` (KPIs de Propietario/Comprador/Inquilino en
      Contactos) no paginaba — paginado igual que `listClientes` para no
      subcontar en cuanto los "Cliente" superen el tope de filas de
      PostgREST.
    - `updateOperacionEstado`: quitado un `requirePermission("operations.close")`
      que nunca tenía efecto real (la línea siguiente ya bloqueaba siempre
      ese caso) y el `fecha_cierre = null` incondicional que borraba el
      historial de cierre ante cualquier cambio de estado, no solo al cerrar.
  - **Sin tocar, con criterio explícito documentado en el propio código o
    aquí:**
    - `gestionarRol` (`clientes-ciclo-vida.functions.ts`): permiso-gateado,
      convertido a H-05 el 24 ago, pero sin ningún consumidor en la UI hoy.
      No se retira porque no está claro si es una función a la espera de
      su UI o ya superada por `asociarLeadAInmueble` — pendiente de
      decisión.
    - `getStatsData`/`getLeadInsightsFn`: usan límites explícitos generosos
      (5.000/2.000/3.000 filas) en vez de paginar — no producen datos
      incorrectos hoy (4.149 contactos totales), pero dejarán de ser
      ciertos en cuanto el volumen los supere. La forma correcta a medio
      plazo es una función SQL de agregación (como ya existe
      `dashboard_inmuebles_stats()`), no paginar en TypeScript — más trabajo
      del que entra en esta fase.
    - H-05 sigue incompleto en `createOperacion`/`updateOperacionEstado`
      (siguen con `.insert()`/`.update()` directos, no RPC con actor) pese a
      que la entrada de H-05 más abajo lo da por completado al 100% — el
      100% real es "todo excepto estos dos". Convertirlos requiere
      replicar en PL/pgSQL la lógica de construcción de fila dinámica de
      `createOperacion`; se deja para una fase aparte por su tamaño.

- **Aviso de la agencia de la web, 11 sep 2026 — dos fallos, uno resuelto,
  uno pendiente de David:**
  1. **web-lead daba 500 en todo envío desde el 19 ago 2026 — resuelto.**
     La migración `20260819155547_normalize_legacy_lead_role_types.sql`
     retiró `lead_compra`/`lead_alquiler` del CHECK de `contact_roles.tipo`
     tras verificar que "ningún código actual" los usaba — verificación que
     no pudo ver `web-lead` porque no tenía copia local en ningún repo (ver
     `supabase/functions/web-lead/`, creada esa misma sesión). Corregido
     mapeando `es_alquiler ? "Inquilino" : "Comprador"` y desplegado.
  2. **Lecturas/escrituras de la web fallando desde el domingo 6 sep 15:31 —
     sin resolver, fuera del alcance de este repo.** La agencia lo atribuye a
     un cambio de permisos sobre la clave de servicio que usa la web; lo
     workaroundearon cambiando a otra clave `service_role` sin restricciones.
     Verificado que RLS/GRANTs de `service_role` en Postgres están bien (todas
     las tablas relevantes tienen `service_role_all`/GRANT completo) — no hay
     ninguna migración ni commit con esa fecha que lo explique. La hipótesis
     más probable es un cambio de alcance en el sistema nuevo de claves de
     Supabase (`sb_secret_...`, distinto del `service_role` JWT clásico), que
     se edita desde el Dashboard (Project Settings → API Keys) y no deja
     rastro en migraciones ni git. David eligió revisar y restaurar los
     permisos de la clave original en vez de generar una nueva — pendiente de
     hacerlo en el Dashboard. Los leads de valorador perdidos durante la
     ventana del fallo (Excel de la agencia) los gestiona David manualmente,
     no por importación.
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
- **M-03 (módulos grandes) — avance sustancial el 24 ago 2026**:
  - Fase 1 (helpers puros, sin riesgo): extraídos de 4 archivos a módulos
    propios — `dashboard-format.ts` (de `index.tsx`), `inmueble-detail-format.ts`,
    `visitas-format.ts`, `bandeja-format.ts`. Hallazgo sin corregir a
    propósito: `moneyShort` está triplicada con redondeos distintos (2 vs 1
    decimal, con/sin `null`) — no se unifica sin decidir cuál es la correcta.
  - Fase 2 (componentes con estado, riesgo real): `inmuebles.$id.tsx` — el
    peor caso, 2.257 líneas — se dividió en 5 archivos bajo
    `src/components/inmueble-detail/`: `SkeletonLine`, `DocumentosPanel`,
    `ManagementPanel`, `MercadoYVisitasPanel` (Tiempo en mercado + Visitas),
    `PhotoComponents`. Todos recibían ya sus datos por props explícitas
    (sin closures compartidos con `DetailView`), lo que hizo la extracción
    mecánica y verificable: tsc sin imports faltantes ni sobrantes, 79/79
    tests, build limpio. Quedó en **1.187 líneas (-47%)**.
  - **Los 9 archivos grandes restantes — completados el 9 sep 2026**:
    `comerciales.index.lazy.tsx` y `visitas.index.tsx` ya estaban divididos
    de una sesión previa (en `src/components/comerciales/` y
    `src/components/visitas/`). El resto, esta sesión:
    - `clientes.functions.ts` (1.817→1.399, -23%): se terminó una extracción
      que había quedado a medias (4 archivos nuevos creados pero sin
      conectar) — `clientes-ciclo-vida.functions.ts`,
      `clientes-conversaciones.functions.ts`, `clientes-duplicados.functions.ts`,
      `clientes-format.ts`.
    - `contactos.index.tsx` (1.556→617, -60%): `contactos-format.ts` +
      `src/components/contactos/` (`LeadsBoard`, `ClientesPanel`,
      `DuplicadosPanel`).
    - `CreateDialogs.tsx` (1.488→7, queda como barrel — lo importan 7
      archivos): `inmueble-schema.ts` + `src/components/create-dialogs/`
      (`shared`, `NewClienteDialog`, `NewInmuebleDialog`, `NewVisitaDialog`).
    - `index.tsx`/Dashboard (1.260→918, -27%): `src/components/dashboard/DashboardPanels.tsx`
      (8 paneles de presentación pura). El propio `Dashboard` (con sus
      `useMemo` sobre las queries) se dejó intacto — no hay frontera de
      extracción adicional sin acoplarse a los datos de la página.
    - `bandeja.index.tsx` (1.117→392, -65%): lógica de detección de
      inmuebles mencionados movida a `bandeja-format.ts`;
      `src/components/bandeja/` (`MencionadoCard`, `AsistenteSilviaPanel`,
      `ConversationCard`). Durante la extracción se detectaron y corrigieron
      2 fallos propios antes de commitear (un regex de acentos corrompido al
      copiarlo y una llamada a `formatFecha` sustituida por error) —
      verificados con tsc antes de que llegaran a la rama.
    - `mutations.functions.ts` (618→28, queda como barrel — lo importan 15
      archivos): dividido por dominio en `mutations-shared.ts` +
      `mutations-cliente/inmueble/visita/prospecto/seguimiento.functions.ts`.
      Hallazgo sin corregir a propósito: `ESTADO_IN_MAP` (en `createVisita`)
      y `ESTADO_IN_MAP_UPDATE` (en `updateVisitaEstado`) son literalmente
      idénticos — duplicación preexistente, documentada con comentario en
      vez de unificada sin que nadie lo pida.
    - `operaciones.index.tsx` (749→468, -38%): `operaciones-format.ts` +
      `src/components/operaciones/OperacionesPanels.tsx` (`ContactPicker`,
      `OperacionRow`).

    Todo verificado en cada paso: tsc limpio, eslint sin avisos, 79/79
    tests, build OK. **Único pendiente real de M-03**: el propio
    `DetailView` dentro de `inmuebles.$id.tsx` (~850 líneas, formulario
    principal con ~30 campos de estado) — sigue siendo el candidato de
    mayor riesgo, se deja intacto a propósito (sin frontera de extracción
    limpia sin tocar closures compartidos).
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
  (peor caso 4.61:1, mínimo exigido 4.5:1). **9 sep 2026:** paleta de marca
  completada — se derivaron `--marfil` (`oklch(0.95 0.017 75)` / `#F5EDE2`)
  y `--carbon` (`oklch(0.20 0.012 60)` / `#1A1511`) de los tokens ya en uso
  y se propusieron en un artifact con contrastes WCAG calculados antes de
  aplicarlos (aprobado por David). Hallazgo de paso: `--gold`
  (`oklch(0.65 0.18 52)` / `#E06700`) ya ES en la práctica el naranja de
  marca `#E8820C` de la auditoría — diferencia de contraste de solo
  1.25:1, no se toca. Los 2 tokens nuevos son aditivos, sin consumidor
  todavía — dónde aplicarlos en la UI queda pendiente como decisión aparte.
  Sigue abierto: tipografía de marca (más allá de Space Grotesk/DM Sans ya
  en uso) y el tamaño de letra de 9-11px en varias pantallas (legibilidad,
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
  (`20260821073707_mark_meta_score_obsoleta.sql`) y, el 9 sep 2026, borrada
  del todo con decisión de David (`20260909115916_drop_meta_score_column.sql`,
  aplicada y verificada en producción; tipos TypeScript de elsol-client-hub
  regenerados — la regeneración también puso al día ~15 funciones RPC de
  H-05 que llevaban semanas sin reflejarse ahí, drift preexistente).
