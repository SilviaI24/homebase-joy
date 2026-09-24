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
  `elsol-client-hub/supabase/functions/sync-properties/index.ts` (v33, 23 sep
  2026 — antes v32; ojo, el propio `CLAUDE.md` de elsol-client-hub sigue
  citando "v25" en varios sitios, desactualizado).
  **No se despliega desde homebase-joy.** No existe copia local de esta función.

  **Modos** (parámetro `mode` en el body):
  - `meta` — sync incremental de las últimas 25 h (cron **cada hora**, subido
    desde 1×/día el 23 sep 2026: un inmueble marcado Reservado en Airtable
    podía seguir viéndose disponible en la web casi 24h. Ver
    `20260923120218_acelerar_cron_sync_properties_meta.sql`)
  - `images` — subida de imágenes de propiedades Activo (cron diario 19:30
    UTC). Emparejamiento por nombre de archivo con cola por ocurrencia
    (Airtable no da id de adjunto utilizable en esta base — `asset_id` nunca
    se puebla) + guardarraíl "la portada nunca es un plano/PDF si hay foto
    real" (`esPortadaElegible`), 23 sep 2026 — ver auditoría de orden de
    imágenes.
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

- **Circuito del lead, Fase 1 — 24 sep 2026.** Propuesta aprobada por David
  (Artifact "Del lead al cliente"): la Bandeja es la entrada única de leads y
  de ella solo se sale **cualificado** (pasa a Contactos) o **descartado con
  motivo**. Contexto que la motivó, medido en producción: los leads reales
  siguen entrando en Airtable desde la única importación de julio (27 leads
  nuevos en el CRM jul–sep); los 23 del formulario web (`canal_origen='Web'`)
  sí estaban en el CRM pero la Bandeja no los mostraba; 0 descartados; los
  1.180 "Cliente" eran en realidad 618 propietarios, 526 interesados en compra
  y 72 en alquiler, ninguno con operación.
  - Bandeja: "Web" en `BANDEJA_CANALES` y en el filtro de canal. "Archivar" →
    **"Descartar"** con motivo de una lista cerrada (`MOTIVOS_DESCARTE` en
    `contactos-format.ts`; códigos estables en `contacts.motivo_descarte`,
    con CHECK, más `descartado_at`). RPC `crm_descartar_lead` (solo
    Lead/Prospecto; escribe `ciclo_vida`/`trabajado='Descartado'` y un evento
    `lead_descartado` en `linea_actividad` — la etiqueta negativa que
    necesita un futuro modelo). Pestaña "Archivados" → "Descartados".
  - Contactos: sin pestaña de Leads (retirados `listLeads`, `leadsQueryOpts`,
    `LeadsBoard.tsx` y sus helpers). Pestañas por interés: **Interesados
    compra / Interesados alquiler / Propietarios** (incluye `Prospecto` como
    "En captación"), Descartados, Histórico, Duplicados. Recuentos por rol
    real (una persona con dos roles cuenta en las dos pestañas, igual que
    aparece en las dos listas). "Cliente" pasa a ser un distintivo: solo con
    un rol `estado='Cerrado'` (operación cerrada). `ciclo_vida='Cliente'` NO
    se renombra en BD — solo significa "tiene rol comercial".
  - Restaurar (`crm_restaurar_contacto_historico`) también deshace un
    descarte (limpia motivo/trabajado, evento `lead_restaurado`).
  - Enlaces antiguos a `?tab=leads` apuntan a `/bandeja`; `?tab=clientes`
    cae en la pestaña por defecto (`.catch` en el esquema de búsqueda).
  - De paso: `dashboard_header_stats()` (Fase 0 del 23 sep) es `SECURITY
    DEFINER` y quedó ejecutable por `anon` — cerrado a `service_role`. Y el
    archivo de esa migración se llamaba `20260923150000` pero la BD la
    registró como `20260923145251`: renombrado en ambos repos.
  Migración `20260924080757_bandeja_descartar_lead_con_motivo.sql` (copiada a
  elsol-client-hub). RPC probadas contra producción en transacción revertida
  (descartar, doble descarte rechazado, motivo inválido rechazado,
  restaurar). tsc/eslint limpios, 168/168 tests, build OK. **No verificado en
  pantalla** (requiere login). Fases 2–4 (campo "fuente", puesta al día desde
  Airtable con fecha de corte, lector de silvia@, ML sobre el CSV de
  conversaciones) pendientes de las decisiones del Artifact.

- **Mini-dashboard en cabecera (Fase 0) + linea_actividad instrumentada
  (Fase 1) — 23 sep 2026.** Origen: David pidió un widget con contactos por
  canal, leads recientes y propiedad más demandada, "preparado para machine
  learning y posibilidades futuras". Antes de diseñar nada se auditó qué
  infraestructura de datos ya existía — hallazgo clave: `linea_actividad`
  (property_id/contact_id/operation_id/actor_id/tipo_evento/metadata) ya
  existe, construida para el feed de actividad en tiempo real del Portal
  (ESGI phase 2), pero el CRM nunca escribía en ella — el feed "Actividad
  reciente" de Comerciales (`listInmueblesActividadReciente`) reconstruye la
  actividad a mano comparando fechas de `properties`, un heurístico propio en
  vez de leer la tabla que ya está hecha para esto. Propuesta completa
  (con mockup y justificación de cada decisión) en un Artifact compartido con
  David antes de tocar código.
  - **Fase 0 (hecha):** `dashboard_header_stats()` — función SQL dedicada
    (no reutiliza `dashboard_contactos_stats()` a propósito: esa calcula
    pipeline+agentes+12 meses de series, mucho más caro de lo que necesita
    un widget montado en 3 páginas). Devuelve contactos por canal, leads
    30d/90d (sin porcentaje de variación: el periodo 90-180 días incluye un
    volcado histórico masivo que distorsiona cualquier comparación hasta el
    absurdo) y la propiedad Activo/Reservado con más interesados+visitas de
    los últimos 90 días. Nuevo componente `HeaderStats.tsx`, montado en
    Dashboard, Contactos y Cartera (decisión explícita de David: "también en
    contactos, cartera").
  - **Fase 1 (empezada):** 5 eventos de mayor valor para un futuro modelo,
    instrumentados en las RPC ya existentes (`crm_crear_cliente` → lead
    creado, `crm_crear_visita` → visita agendada, `crm_actualizar_visita_estado`
    → visita realizada/cancelada, `crm_actualizar_inmueble` → inmueble
    reservado, `cerrar_operacion_crm` → operación cerrada). Reutiliza el
    CHECK de `tipo_evento` que ya existe (`'visita'`, `'cambio_estado'`,
    `'contacto'`...) en vez de ampliarlo — el matiz de cada evento concreto
    va en `descripcion`/`metadata`, para no tener que coordinar un cambio de
    constraint compartido con `elsol-client-hub` solo por esto. El feed de
    "Actividad reciente" de Comerciales **no se ha migrado todavía** a leer
    de `linea_actividad` — sigue en su heurístico actual hasta que haya
    suficiente historial real acumulado (ver Fase 2). Migración:
    `20260923150000_fase0_header_stats_fase1_linea_actividad.sql`, copiada
    también a `elsol-client-hub` (regla de migraciones compartidas).
  - **Fase 2 (proyectada, no construida — deliberadamente):** con 17 filas
    en `linea_actividad` el día de este cambio, no hay nada que entrenar
    todavía — mismo criterio que ya se aplica en
    `REGLA_CALIDAD_METRICAS_AGREGADAS_2026-08-20.md` (no publicar lo que el
    dato de origen no sostiene). El plan, para cuando haya 3-6 meses de
    volumen real:
    1. Migrar el feed de "Actividad reciente" de Comerciales a leer de
       `linea_actividad` en vez de su heurístico actual.
    2. **Score de lead v2**: sustituir el heurístico rule-based actual de
       `getLeadInsightsFn` (regex de canal + franjas de días sin contacto)
       por un modelo entrenado sobre conversión real Lead→Cliente, usando
       `linea_actividad` como historial de eventos por contacto.
    3. **Predicción de "tiempo hasta reservarse/venderse"** por tipo/zona,
       con `estadisticas_barrio` como variable de contexto (precio de
       mercado de la zona) y los eventos `visita`/`cambio_estado` de
       `linea_actividad` como serie temporal de entrada.
    4. **Alerta de demanda anómala** ("esta zona tiene N× los interesados
       habituales") — extensión directa de `dashboard_header_stats()`,
       comparando la ventana de 90 días contra su propio histórico una vez
       haya suficientes ventanas completas para definir "habitual".
    Umbral explícito antes de construir cualquiera de los 4: mínimo de
    muestra documentado con datos reales (mismo criterio que la regla de
    métricas agregadas), no una fecha de calendario.
  Verificado: `dashboard_header_stats()` probado contra producción antes de
  montar el frontend (devuelve datos reales, no placeholder). tsc/eslint
  limpios, 160/160 tests, build OK. No verificado visualmente en la app real
  (requiere login).

- **Google Calendar → Agenda del CRM (lectura) — 23 sep 2026.** Decisión de
  David: el equipo sigue agendando en Google Calendar, pero el objetivo es que
  acabe trabajando en el CRM. La integración CRM → Google (15 sep, commit
  `01a68b2`) nunca se activó: **faltan `GOOGLE_CALENDAR_CLIENT_ID`/
  `_CLIENT_SECRET`/`_REDIRECT_URI` en Vercel y `.env.local`** (0 agentes
  conectados, verificado en producción). Añadido el sentido contrario, solo
  lectura: `listCitasGoogleMes` (`google-calendar.functions.ts`) lee el
  calendario principal de cada agente conectado para el mes visible y la
  Agenda (`/agenda`) las muestra junto a las visitas con estilo discontinuo
  ("Solo en Google"), excluyendo las que ya son visita (`visits.google_event_id`),
  las canceladas y las invitaciones rechazadas; las privadas/confidenciales
  salen como "Ocupado" sin detalle. Sin scope nuevo (`calendar.events` ya
  permite leer). **Puente hacia el CRM:** cada cita tiene "Registrar como
  visita" (`NewVisitaDialog` con `googleEvento`) → `createVisita` enlaza la
  visita al evento existente en vez de crear otro en Google (sin duplicados),
  forzando como agente al dueño del calendario. KPI "Sin registrar (Google)"
  en la Agenda para ver cuánto trabajo sigue fuera del CRM. No se modifica
  nunca un evento de Google que el CRM no haya creado o enlazado.
  **Aviso de rechazo del invitado (mismo día):** si un invitado de la cita
  (normalmente el cliente; no salas/recursos, no el propio comercial) la
  rechaza en Google, la Agenda lo marca ("Rechazada por …") tanto en citas
  "Solo en Google" como en visitas del CRM ya enlazadas (`rechazosVisitas`,
  vía el nuevo `VisitaFull.googleEventId`) — registrar la cita no pierde el
  aviso. No aplica a visitas creadas desde el CRM: ese evento no invita al
  cliente (`eventBody` sin `attendees`). Verificado: tsc/eslint limpios,
  160/160 tests, build OK. **No verificado en pantalla** (requiere login y
  credenciales de Google aún sin crear).

- **Auditoría del pipeline Airtable → ESGI → web pública (portada de fotos +
  inmuebles reservados visibles) — 23 sep 2026.** Origen: la oficina reportó
  fotos de portada erróneas (planos/baños en vez de la foto principal) y
  reservados que seguían viéndose disponibles en `elsolgrupo.com`. Auditado
  todo el recorrido (Airtable → `sync-properties` → `properties` → vista
  `properties_public` → web WordPress, esta última fuera de nuestro repo) y
  corregido lo que está de nuestro lado:
  - **Latencia de estatus/publicación:** el cron `sync-properties`
    (mode=meta), el único que toca `estatus`/`publicacion`, corría 1×/día
    (19:00 UTC) — un cambio a "Reservado" en Airtable podía tardar casi 24h
    en reflejarse. Subido a cada hora
    (`20260923120218_acelerar_cron_sync_properties_meta.sql`). La web (según
    confirman sus mantenedores) cachea/refresca 1×/día, así que el peor caso
    total sigue acotado por su lado, no por el nuestro — pendiente de que
    ellos decidan si aprietan también su refresco.
  - **`properties_public` sin filtro:** la vista no tenía `WHERE` — exponía
    TODOS los inmuebles (Reservado/Vendido/Baja incluidos) a `anon`,
    confiando por completo en que la web aplicase correctamente su propio
    filtro (`estatus=Activo AND publicacion=Publicado`, contrato confirmado
    por su equipo). Ahora filtra en origen
    (`20260923120424_filtrar_properties_public_activo_publicado.sql`) —
    defensa en profundidad, no depende de que su filtro no tenga nunca un bug
    ni de cuándo refresquen su caché.
  - **Portada de fotos incorrecta, causa raíz confirmada con datos reales:**
    `asset_id` (pensado para emparejar cada adjunto de Airtable de forma
    robusta) está en `null` en el 100% de los inmuebles Activo con fotos
    (52/52) — Airtable no devuelve un id de adjunto utilizable en esta base,
    así que el emparejamiento legacy por nombre de archivo es la única vía
    real. Ese emparejamiento usaba un único "ganador" por nombre normalizado:
    cuando dos adjuntos del mismo inmueble compartían nombre (reportajes con
    nomenclatura genérica de cámara, re-subidas), el array de `imagenes`
    salía con duplicados y huecos (caso real encontrado: Plaza de Villamanín,
    34 entradas para solo 17 archivos únicos). `runImages()`
    (`sync-properties/index.ts`, ahora v33) pasa a emparejar por una cola por
    nombre (1:1 por ocurrencia, no un único ganador), y añade un guardarraíl
    pragmático mientras Airtable siga vivo: la portada nunca es un PDF ni un
    archivo tipo plano/floor/planta si hay al menos una foto real disponible
    (`esPortadaElegible`). En el CRM, `mapBase()`/`mapDetalle()`
    (`inmuebles.functions.ts`) dejan de tomar "el primer elemento físico del
    array" como portada y pasan a ordenar explícitamente por `orden` — para
    que el reordenado manual del CRM (`ImagenesReorder`) sea fiable cuando
    Airtable deje de ser la fuente de verdad.
  - **Hallazgo de higiene, sin relación con lo anterior:** `sync-properties/index.ts`
    tenía ~150 líneas de cambios sin commitear en el working tree que sí
    estaban desplegadas en producción (v32 real vs. versión anterior en git)
    — alguien desplegó directamente sin pasar por git. Reconciliado en el
    mismo commit que estos fixes, para que el repo vuelva a reflejar lo que
    corre de verdad.
  - Todo esto es temporal a propósito: cuando se retire Airtable (semanas
    vista), se apagan los 4 cron jobs de `sync-properties` y el CRM pasa a
    ser el único escritor de `imagenes`/`estatus`/`publicacion` — el
    guardarraíl de portada y el emparejamiento por cola dejan de ser
    necesarios en ese momento (el problema de origen, Airtable, desaparece).
  Verificado: tsc limpio, eslint limpio (0 errores nuevos; los `any`
  preexistentes de `supabase/functions/` son deuda ya documentada, sin
  relación con este cambio), 80/80 tests, en homebase-joy. El cambio de
  `sync-properties`/vista se verificó directamente contra producción
  (`properties_public` pasó de devolver 5.973 filas a exactamente las 46
  Activo+Publicado reales). No desplegado/probado aún contra Airtable real
  tras el fix de duplicados — se autoverificará en el próximo cron `images`
  (diario, 19:30 UTC) al reescribir el manifiesto de cada inmueble afectado.

- **Vista previa de documentos + progreso de onboarding en la ficha del
  inmueble, y bloqueo de "Generar contrato" tras firmar — 22 sep 2026.**
  Encontrado justo después de la primera firma real completa: el PDF firmado
  vive en la tabla `documentos` (onboarding del Portal), que nunca se cruzaba
  con la pestaña "Documentos" de la ficha del inmueble (esa pestaña solo lee
  `properties.documentos`, una lista manual de URLs — dos sistemas de
  documentos totalmente separados). Añadido:
  - `DocumentosOnboardingPanel.tsx` en la pestaña "Documentos" — lista de
    solo lectura de la tabla `documentos` para este inmueble (aprobar/
    rechazar sigue viviendo solo en la ficha de cliente, donde está ligado
    a la activación del acceso).
  - **Vista previa real del documento** (`DocumentoPreviewDialog.tsx`,
    reutilizado en 3 sitios: este panel nuevo, el "Ver contrato firmado" del
    panel de contrato, y la lista de documentos que ya existía en
    `RevisionPropietarioPanel` de la ficha de cliente — antes esa lista
    mostraba el nombre del documento sin forma de verlo, así que aprobar era
    a ciegas). Nuevas funciones `getDocumentoOnboardingUrl` (signed URL,
    bucket `client-documents`, 120s TTL, mismo patrón que
    `getPropertyDocumentUrl`) y `listDocumentosOnboarding`.
  - `PropietariosOnboardingPanel.tsx` en la ficha del inmueble — reutiliza
    tal cual `RevisionPropietarioPanel` (ahora exportado desde
    `ClientesPanel.tsx`) por cada propietario vinculado, sin duplicar la
    lógica de progreso/aprobación/activación.
  - `getContratoExclusividadEstado`: "Generar contrato" pasa a "Ver contrato
    firmado" (abre la vista previa) en cuanto hay uno con `estado='signed'`
    en `transacciones_docuten` — evita regenerar uno nuevo por error (coste
    real en Docuten). Queda un enlace secundario discreto "Generar uno
    nuevo" para el caso raro de tener que rehacerlo a propósito.
  - **Segunda pasada, mismo día:** con el contrato firmado, el panel se
    colapsa (editar duración/comisión/cláusulas/DNI ya no tiene ningún
    efecto sobre un contrato ya generado, así que se deja de mostrar el
    formulario entero) a solo "Ver contrato firmado" / "Generar uno nuevo" /
    **"Rechazar contrato"** — nueva acción (`rechazarContratoFirmado`) para
    cuando el PDF firmado resulta erróneo: pasa la transacción a
    `estado='rejected'` y el documento archivado a `estado='rechazado'`, con
    confirmación inline (mismo patrón que "Eliminar inmueble" en
    `ManagementPanel.tsx`) antes de ejecutarla.
  - **Tercera pasada, mismo día:** `RevisionPropietarioPanel` seguía
    mostrando DNI/domicilio/teléfono en la ficha del inmueble, duplicado con
    el panel de datos del contrato de la misma página — nuevo prop
    `mostrarDatosFirma` (default `true`, sigue mostrándose en la ficha de
    cliente; `false` desde la ficha de inmueble). En su lugar, cada
    propietario muestra "Propietario vinculado: [nombre]" + **"Desvincular"**
    (nueva acción `desvincularPropietarioInmueble`, con confirmación) para
    el caso de haber enlazado el contacto equivocado — borra el rol
    (`contact_roles`) y el enlace de Portal (`propietario_inmueble`) para
    ese inmueble concreto, sin tocar la ficha de `propietarios` ni su acceso
    al Portal (puede seguir vinculado a otros inmuebles).
  - **Cuarta pasada, mismo día:** David vio la duplicidad al probarlo — el
    panel "Propietario" de arriba de la ficha (Nombre/Teléfono/Email) y el de
    "Onboarding del propietario" decían ambos "quién es el propietario". Se
    movió "vinculado/Desvincular" al panel de arriba (`PropietarioPanel.tsx`,
    nuevo `VinculadosList` — misma queryKey `propietarios-inmueble` que
    `ContratoExclusividadPanel`, comparten caché de React Query sin duplicar
    la petición), y se quitó del todo del panel de onboarding, que ahora solo
    muestra el progreso/documentos/activación, sin repetir de quién se trata.
  Verificado: tsc/eslint limpios, 160/160 tests, build OK. No verificado
  visualmente en la app real — requiere login.
- **Fila de la pestaña "Histórico" de Cartera no navegaba a la ficha — 22
  sep 2026.** Detectado probando el inmueble de prueba de Docuten (ver
  siguiente entrada): a diferencia de `InmuebleCard` (pestañas Venta/Alquiler,
  envuelta en `<Link>`), las filas de `HistoricoTab` (`cartera.index.tsx`,
  estatus Vendido/Alquilado/Baja) eran `<tr>` planas sin `onClick` ni
  navegación — el listado se veía pero no era clicable, bug preexistente sin
  relación con el inmueble de prueba. Corregido con el mismo patrón accesible
  que ya usa `ClienteRow` (Contactos): `role="button"`, `tabIndex`, `onClick`
  + `onKeyDown` (Enter/Espacio) navegando a `/inmuebles/$id`. Verificado:
  tsc/eslint limpios, 160/160 tests, build OK.
- **Bug de datos encontrado y corregido — 21 sep 2026: 143 inmuebles reales
  mal vinculados a un propietario de prueba.** Origen (explicado por David):
  pidió en una sesión anterior poder ver el Portal "tal como lo vería un
  cliente final" con acceso a todo — se implementó vinculando su propio
  usuario de auth (el mismo con el que hace login como ADMIN en el CRM,
  `ai@elsolgrupo.com`) como propietario de **todos** los inmuebles de la
  cartera en `propietario_inmueble`, en vez de una vista de admin propiamente
  dicha. Efecto real: de las 144 filas totales de esa tabla, 143 apuntaban a
  ese propietario de prueba — casi ningún inmueble real tenía su propietario
  auténtico registrado ahí (tabla usada por `listPropietariosInmueble`,
  `portal-iniciar-firma` y el propio Portal — no confundir con `contact_roles`,
  que es la que alimenta el panel "Propietario" de la ficha del CRM y no tenía
  este problema). Sin datos huérfanos que limpiar de paso (verificado:
  0 `documentos`/`transacciones_docuten` del usuario de prueba en esos
  inmuebles reales). Corregido: borradas las 143 filas mal vinculadas,
  dejando solo la única real que había. El propietario de prueba (contacto
  "David Jimenez", `propietarios.id = f168963f-2f68-4a8a-b6c2-31bc44f92160`,
  con Portal ya activo desde antes) se reutilizó y se vinculó **solo** a un
  inmueble nuevo creado expresamente para pruebas (`properties.id =
  9385c414-1bb2-47b0-b04d-ad7a98fd40af`, calle "PRUEBA INTERNA — Piso de
  prueba Docuten", `estatus='Baja'` y sin `airtable_id` para que
  `sync-properties` nunca lo toque ni aparezca publicado).
- **Selector de propietario en la ficha del inmueble — 21 sep 2026.**
  `PropietarioPanel.tsx` era de solo lectura: si el inmueble no tenía
  propietario vinculado en `contact_roles`, no había ninguna forma de
  asignarlo desde ahí (síntoma que llevó a encontrar el bug de arriba). Nuevo
  `AsociarPropietarioButton.tsx` (mismo patrón que `AsociarInmuebleButton.tsx`,
  su espejo desde la ficha de contacto — Popover + búsqueda server-side vía
  `searchClientesPickerQuery` + `asociarLeadAInmueble`), montado en el
  header del panel.
- **David — variable de entorno pendiente de añadir:** `CRM_INTERNAL_SECRET`
  en `.env.local` (cualquier cadena aleatoria, con el mismo valor puesto
  también en Supabase Dashboard → Edge Functions → Secrets de la función
  `portal-iniciar-firma` en elsol-client-hub). La usa
  `previewContratoExclusividad` (`src/lib/mutations-cliente.functions.ts`)
  para autenticar la llamada a esa Edge Function en modo vista previa desde
  el nuevo diálogo "Generar contrato" de la ficha del inmueble
  (`GenerarContratoDialog.tsx`, 21 sep 2026). Sin ella, el diálogo falla al
  pedir la vista previa del PDF. Ver el `CLAUDE.md` de `elsol-client-hub`,
  sección "Flujo 'Generar contrato' desde la ficha del inmueble", para el
  detalle completo de este flujo.
- **David — variable de entorno pendiente de añadir:** `PORTAL_URL` en
  `.env.local` (URL base real de `elsol-client-hub` en producción). La usa
  `invitarPropietarioPortal` (`src/lib/mutations-cliente.functions.ts`) para
  construir el link de invitación (`${PORTAL_URL}/reset-password?invite=1`).
  Sin ella, el botón "Dar acceso al portal" crea el acceso pero falla al
  enviar el email — mensaje de error explícito, no falla en silencio.
- **Acceso al Portal desde la ficha de cliente + notificación en el CRM —
  16 sep 2026 (enfoque A, sin sobre-arquitectura):**
  - Botón "Dar acceso al portal" en `ClienteDetallePanel`
    (`src/components/contactos/ClientesPanel.tsx`), visible solo si el
    contacto tiene email y al menos un inmueble vinculado como
    Propietario/Arrendador. Llama a la nueva RPC
    `crm_invitar_propietario_portal` (actor explícito validado contra
    `crm_usuarios`, idempotente — reutiliza la ficha de `propietarios` si el
    contacto ya tenía una) y luego a `supabase.auth.admin.inviteUserByEmail`
    directamente desde `getSupa()` — sin pasar por el Edge Function
    `invite-propietario` del Portal, porque esa función exige un JWT de
    usuario real (`roles_usuario`) y una llamada por service role no lo
    lleva. Nueva capability `contacts.portal_invite` (sensible=true, mismo
    criterio que `whatsapp.send`; ADMIN/OPERATIVO permitido, FINANCIERO no).
  - Notificaciones del Portal (solicitudes de servicio nuevas, documentos
    subidos por el propietario pendientes de revisión) añadidas a la campana
    de notificaciones ya existente (`getNotifications`,
    `src/lib/notifications.functions.ts` + `AppShell.tsx`) — dos tipos
    nuevos (`solicitud_portal`, `documento_portal`), mismo patrón que los 4
    tipos que ya había, sin tabla ni infraestructura nueva. El email que ya
    enviaban `notify-document-upload`/`notify-service-request` (Edge
    Functions del Portal) no se ha tocado — la notificación en el CRM es un
    canal adicional, no un sustituto.
  - Verificado: tsc limpio, eslint limpio, 80/80 tests (actualizado el test
    de conteo de capacidades RBAC a 32), build de producción OK. **No
    verificado visualmente en la app real** (requiere login) — el botón y
    la campana no se han probado en pantalla.
  - **PORTAL_URL:** confirmado añadido a `.env.local` por David el mismo 16 sep.

- **Revisión de documentación y activación desde el CRM — 17 sep 2026:**
  David aclaró que los comerciales trabajan siempre desde homebase-joy, nunca
  desde el panel admin del propio Portal (`AdminPropietarios.tsx`, que se deja
  intacto como camino secundario) — así que la revisión de documentos +
  activación del acceso tenían que estar aquí también, no solo el botón de
  invitar. Nuevo panel "Revisión de documentación" en `ClienteDetallePanel`
  (visible solo si el contacto ya tiene fila en `propietarios`): mismo
  DNI/domicilio que puede rellenar el comercial si el propietario no usa la
  app, lista de documentos del onboarding con Aprobar/Rechazar, estado del
  contrato Docuten, y "Activar acceso completo" (pasa `estado_onboarding` a
  `activo` — la máquina de estados no cambia, solo se puede disparar desde
  aquí además de desde el Portal). 4 funciones nuevas en
  `mutations-cliente.functions.ts` (`getRevisionPropietario`,
  `guardarDatosFirmaPropietario`, `actualizarEstadoDocumentoPropietario`,
  `activarPropietarioCrm`), reutilizando la capability `contacts.portal_invite`
  ya existente — sin capability nueva. Tercer tipo de notificación en la
  campana, `propietario_en_revision`, cuando un propietario llega a
  `estado_onboarding='en_revision'`. Detalle completo del porqué (y de la
  personalización real del contrato con `pdf-lib`) en el `CLAUDE.md` de
  `elsol-client-hub`, sección "Contrato de exclusividad personalizado +
  revisión desde el CRM". Verificado: tsc limpio, eslint limpio, 80/80 tests
  (sin cambio de conteo RBAC), build OK. No verificado visualmente.

- **Lint inservible en local por dos causas de contaminación, resuelto el 14
  sep 2026:** `npx eslint .` tardaba 7+ min y reportaba 35.216 problemas
  falsos — `eslint.config.js` no excluía `.vercel/output/` (bundles
  minificados de `npm run build` local, no existe en CI) ni
  `.claude/worktrees/` (copias de trabajo temporales que crea el propio
  entorno de ejecución de Claude Code, una de ellas — sin relación con este
  hallazgo — tenía además un commit útil sin mergear, `fix(lint): ignorar
  .vercel/output en eslint`, rescatado por cherry-pick antes de borrar el
  worktree). Con ambas exclusiones: 4s, 329 problemas reales. **Deuda de
  lint real que quedó al descubierto, sin tocar en esta pasada** (fuera de
  alcance, delegada aparte): 299 errores de formato + 21
  `@typescript-eslint/no-explicit-any`, todos en `supabase/` (scripts de
  `supabase/archive/scripts-riesgo-alto/` y las Edge Functions
  `web-lead`/`valorador`) — nada en `src/`, el cierre de H-07 del 24 ago
  nunca cubrió ese directorio. tsc limpio, 80/80 tests tras el fix de
  `eslint.config.js`.
  **Deuda cerrada del todo, mismo 14 sep 2026 — 320→0 errores:** los 299 de
  formato con `npx eslint . --fix` (verificado con diff que solo tocaba
  espaciado/saltos de línea — reflow de expresiones largas al ancho de
  prettier, sin cambio de tokens — en 8 archivos: los 5 scripts de
  `scripts-riesgo-alto/` + `web-lead`/`valorador`). Los 21
  `no-explicit-any` — todos en el helper de paginación de Airtable
  (`fetchAll`/`fetchAirtable`/`fetchAllAirtable`, repetido en los 5
  scripts de `scripts-riesgo-alto/`) y en los arrays de filas a
  insertar/upsertar de `fix-fk-links.ts`/`migrate-from-airtable.ts` —
  tipados con el mismo criterio que H-07 (forma real del dato, nunca
  `any` ciego): nuevo tipo `AirtableRecord = { id, fields: Record<string,
  unknown> }` por script (se mantiene la duplicación deliberada de estos
  scripts archivados, sin extraer a un módulo compartido), y un cast `as
  string` explícito en los 3 sitios que hacían `new Date(f["..."])`
  directamente sobre un campo de fecha de Airtable. Sin cambio de
  comportamiento. Quedan los 9 warnings preexistentes de
  `react-refresh/only-export-components` (patrón shadcn/ui, no un bug,
  ya señalado en el cierre de H-07). tsc limpio, eslint 0 errores, 80/80
  tests, build OK.
- **Panel "Leads recientes sin asignar" en el Dashboard, 12 sep 2026:**
  Complemento del punto anterior (Kanban de Leads por agente): David pidió
  poder notar un lead nuevo sin asignar en el día a día, sin mezclarlo con
  el histórico (2.797 de los 2.808 Leads totales no tienen agente, sin
  peso específico). `getLeadInsightsFn` ya traía los 120 Lead/Prospecto más
  recientes y ya calculaba `tieneAgente` por cada uno (solo se usaba como
  factor menor del score de "calor") — se añadió `sinAsignar` al resultado
  (los mismos 120, filtrados por `!tieneAgente`, top 5, sin reordenar
  porque `scored` ya viene por fecha de creación descendente). Nuevo
  `SinAsignarPanel` en `DashboardPanels.tsx`, mismo estilo que
  `LeadsCalientesPanel`/`SinSeguimientoPanel`, sin enlace "Ver todos" (el
  de los otros dos lleva al Kanban de Leads, que es por agente y no
  mostraría nada aquí). Dashboard: los 3 paneles de insights pasan de
  `grid-cols-2` a `grid-cols-3`.
  Verificado contra producción antes de aplicar (solo lectura): de los 120
  Lead/Prospecto más recientes, 119 no tienen agente — los 5 más recientes
  son del 6-11 sep 2026, confirma que el panel muestra actividad real del
  día a día, no ruido histórico. tsc limpio, eslint limpio, 79/79 tests,
  build OK.

- **Kanban de Leads de Contactos filtrado por agente en servidor, 12 sep
  2026 (la decisión de UX que había quedado pendiente de la auditoría):**
  Datos reales antes de tocar nada: 2.808 Leads en total, pero solo 11
  tienen algún agente asignado (9/1/1 entre 3 agentes) — el 99.6% no tiene
  agente. El Kanban de un comercial traía los 2.808 completos (joins +
  motor de matching) para quedarse, tras filtrar en el navegador, con como
  mucho 9. No hacía falta paginar el tablero (con 9 de máximo, un Kanban no
  necesita página 2) — hacía falta mover el filtro de agente a SQL.
  `listLeads` ahora exige `agenteId` (vacío = lista vacía sin consultar) y
  resuelve primero los `contact_id` asignados a ese agente
  (`contact_agents`) antes de traer los contactos — sin `!inner` en la
  query principal, porque eso habría recortado el array de agentes
  embebido a solo el que hace match y `AsignarLeadButton` necesita ver
  TODOS los agentes ya asignados a cada lead. `leadsQueryOpts` pasó de
  constante a función `leadsQueryOpts(agenteId)`; el loader de
  `/contactos` ya no la prefetchea (agenteId depende de localStorage, no
  disponible en el loader) — se pide dentro de `LeadsTab` una vez resuelto
  el comercial. Alcance decidido por David: sin añadir "Sin asignar" al
  selector de agente (los 2.797 Leads sin agente quedan fuera de esta
  pasada, es una decisión de producto aparte).
  Verificado contra producción antes de aplicar (solo lectura): la consulta
  nueva devuelve exactamente 9 filas para el agente con más Leads. tsc
  limpio, eslint limpio, 79/79 tests, build OK.

- **Auditoría estructural — mismatch total/tabCounts en bandeja IA, 12 sep
  2026 (último pendiente del informe original, ya resuelto):**
  `listConversacionesIaPage` descartaba en JS, después de traer la página,
  los registros legado (sin `canal_origen`) que mencionan "Idealista" — pero
  `count` y los 4 `baseCount()` de los badges de pestaña se calculaban en
  SQL sin ese descarte, así que anunciaban más filas de las que realmente se
  veían. Movido el criterio a `silviaOrFilter` (SQL): el legado ahora
  también exige `motivo`/`solicitud`/`conversaciones` sin "idealista", con
  `or(campo.is.null, campo.not.ilike...)` en motivo/solicitud porque pueden
  ser NULL (`NULL NOT ILIKE 'x'` da NULL, no `true` — sin ese envoltorio se
  habrían descartado filas cuyo único texto vive en otro campo). Verificado
  en vivo contra producción antes de aplicar: 3.641 filas con el criterio
  correcto vs. 4.134 con el bug — 493 de diferencia real, no un caso de
  borde teórico. El filtro post-fetch en JS quedó redundante y se retiró.
  Verificado: tsc limpio, eslint limpio, 79/79 tests, build OK.

- **Auditoría estructural — motor de matching desduplicado, 12 sep 2026:**
  El bloque de mapeo contacto→Cliente (roles → inmuebles vinculados,
  preferencias de texto libre, motor de matching completo con pool/score)
  estaba copiado casi carácter a carácter en `listClientes`, `listLeads` y
  `getClienteById` (~400 líneas triplicadas) — causa directa de que
  `listLeads` se hubiera olvidado de pedir `imagenes` en su select mientras
  las otras dos copias ya lo tenían (bug ya corregido en la Fase 1). Unificado
  en `buildCliente(row, matchCtx?)` (`clientes.functions.ts`): `matchCtx` es
  opcional — `listLeads` no lo pasa (Leads no calculan matching, igual que
  antes: `matches: []`, preferencias vacías), `listClientes`/`getClienteById`
  sí. También se hoistearon `CLOSED_ESTATUS`/`INACTIVE_ESTATUS` (redeclaradas
  4 veces con el mismo contenido) a constantes de módulo. Archivo:
  1.346→1.136 líneas (-16%). Verificado: tsc limpio, eslint limpio, 79/79
  tests, build de producción OK — comportamiento idéntico por diseño (mismo
  bug si lo hay, en un solo sitio en vez de tres).

- **Auditoría estructural, Fase 3 (rendimiento) — 12 sep 2026, parcial:**
  - **4 roundtrips evitables fusionados con `Promise.all`** (antes: esperar
    la primera consulta para lanzar la segunda que no dependía de ella):
    `getInmueble` (ficha de inmueble + propietarios), `getClienteById`
    (ficha de cliente + propiedades activas para el motor de matching),
    `listConversacionesIaPage` (query paginada + 4 conteos de pestaña). El
    4º (`listInmueblesPage`) se resolvió solo al retirar `sectionTotals` en
    la Fase 1 (ver más abajo) — ya no hacía falta la segunda consulta.
  - **Dashboard cargaba `listClientes()`/`listLeads()` completos (joins de
    inmuebles + motor de matching corriendo fila por fila) solo para leer
    `.length`.** Nueva función ligera `getDashboardContactCounts()` (2
    `COUNT(*)` exactos) — `clientesQueryOpts`/`leadsQueryOpts` se mantienen
    intactos para sus otros consumidores (pickers, Kanban de Leads en
    Contactos), que sí necesitan el detalle completo.
  - **Pickers de cliente/propietario en `NewVisitaDialog`/`NewInmuebleDialog`
    cargaban `clientesQueryOpts` completo** y filtraban/recortaban a 80/30
    en memoria — mismo antipatrón que `searchInmuebles` ya resolvió para el
    picker de inmuebles del mismo diálogo. Nueva función
    `searchClientesPicker` (búsqueda server-side por nombre/teléfono, sin
    mínimo de caracteres, mismo patrón que `searchInmuebles`).
  - **Sin tocar, fuera de esta fase:** la pestaña "Leads" de Contactos
    (`leadsQueryOpts`) sigue cargando todos los Leads sin paginar — a
    diferencia del Dashboard, ahí el detalle completo sí se usa (tarjetas
    del Kanban), así que no es un simple "sustituir por conteo": paginar un
    Kanban es un cambio de UX, no un fix mecánico, queda pendiente de
    decisión. El motor de matching triplicado en `clientes.functions.ts`
    (listClientes/listLeads/getClienteById) tampoco se tocó en esta pasada.
    El "Bandeja: total/tabCounts no coinciden con las filas mostradas"
    (filtro de Idealista aplicado post-fetch, no en el `count`) sigue
    abierto — se dejó pasar al fusionar el roundtrip de
    `listConversacionesIaPage` para no mezclar el fix de rendimiento con
    uno de corrección de datos.

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
    - **`gestionarRol` — retirada el 14 sep 2026** (decisión de David: "sólida
      pero sencilla, sin evolutivos"). Permiso-gateada, convertida a H-05 el
      24 ago, pero nunca tuvo consumidor en la UI (confirmado por grep) —
      quedaba como pregunta abierta si era una función a la espera de su UI
      o ya superada por `asociarLeadAInmueble`. No lo segundo del todo:
      `gestionarRol` también sabía actualizar/quitar un rol ya asignado y el
      tipo "Arrendador", capacidades que `asociarLeadAInmueble` (única
      consumida, solo crea) no tiene — pero como nadie las usa hoy, no se
      mantiene código a la espera de una UI futura. Si en el futuro hace
      falta editar o quitar un rol contacto↔inmueble ya creado, se
      construye entonces. El RPC `crm_gestionar_rol` en la base de datos no
      se tocó (retirarlo es un cambio de esquema aparte, sin decidir).
      tsc limpio, 80/80 tests.
    - **`getStatsData` resuelto el 12 sep 2026** (migración
      `dashboard_contactos_stats_function`): pasó de 4 consultas con
      `LIMIT 5.000`/`2.000` agregadas en TypeScript a una sola función SQL
      (`dashboard_contactos_stats()`, mismo estilo que
      `dashboard_inmuebles_stats()`) que agrega sobre las tablas completas.
      Verificado contra producción con consultas independientes: la suma
      del pipeline (4.151) y de canales coincide exactamente con
      `COUNT(*)` real de `contacts`, y la suma de `agentes` (22) coincide
      con `contact_agents` de agentes activos.
    - **`getLeadInsightsFn` — nota corregida el 14 sep 2026**: esta entrada
      describía un límite explícito de 3.000 filas que ya no existe en el
      código (`.limit(120)` desde el mismo 12 sep, ver "Panel Leads
      recientes sin asignar" más arriba) — quedó desactualizada al no
      reflejar ese cambio, escrito el mismo día. No hay bug de escala vivo
      hoy: el límite a 120 es intencional (los Lead/Prospecto más
      recientes, no un cálculo global), así que llevar el scoring
      heurístico a SQL no aplica como "mismo patrón que getStatsData" —
      sería reimplementar reglas de negocio (regex de canal, franjas de
      días sin contacto) en PL/pgSQL, un proyecto de alcance propio, no
      una desduplicación mecánica. Sin acción pendiente salvo que se pida
      explícitamente.
    - **H-05 completado del todo el 12 sep 2026** (antes quedaban fuera
      `createOperacion`/`updateOperacionEstado`, con `.insert()`/`.update()`
      directos sin actor real): migración `h05_completar_operaciones` —
      `crm_crear_operacion` (misma fórmula de `comision_total` que el TS
      original, agente por defecto el de la propia sesión si no se indica
      uno) y `crm_actualizar_estado_operacion` (repite en SQL
      `assertRegularOperacionTransition` y el atajo de no escribir nada si
      el estado no cambia — esa función de TS se queda con sus tests, solo
      que el handler ya no la llama directamente). Verificado en
      producción con datos reales: actor correcto en `audit_log`,
      "Cerrada" rechazado, repetir el mismo estado no duplica fila de
      audit.

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
     resuelto por David el 14 sep 2026, fuera del alcance de este repo.** La
     agencia lo atribuía a un cambio de permisos sobre la clave de servicio
     que usa la web; lo workaroundearon cambiando a otra clave `service_role`
     sin restricciones. Verificado en su momento que RLS/GRANTs de
     `service_role` en Postgres estaban bien (todas las tablas relevantes
     tienen `service_role_all`/GRANT completo) — no había ninguna migración
     ni commit con esa fecha que lo explicara; la hipótesis era un cambio de
     alcance en el sistema nuevo de claves de Supabase (`sb_secret_...`,
     distinto del `service_role` JWT clásico), editado desde el Dashboard
     (Project Settings → API Keys), sin rastro en migraciones ni git. David
     restauró los permisos de la clave original ahí — confirmado resuelto,
     sin detalle técnico de qué encontró exactamente (edición manual fuera
     de este repo). Los leads de valorador perdidos durante la ventana del
     fallo (Excel de la agencia) los gestionó David manualmente, no por
     importación.
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
  detectado de paso, sin retirar todavía en ese momento: `listAllInmuebles`,
  `allInmueblesQuery`, `listInmuebles`, `listAlquileres` — sin consumidores
  desde antes de esta sesión. **Nota 12 sep 2026:** confirmado por grep que
  las 4 funciones ya no existen en el código — se retiraron en algún punto
  posterior sin actualizar esta entrada; esta nota quedaba obsoleta.
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
- **CI (`.github/workflows/ci.yml`) creado el 21 ago 2026 — resuelto el 14
  sep 2026:** el push llevaba desde entonces bloqueado porque el PAT
  embebido en el remoto no tenía el scope `workflow` que GitHub exige para
  archivos bajo `.github/workflows/`. David añadió el scope al token
  (editado, no regenerado — mismo valor, sin tocar remotos). Confirmado
  con `git fetch`/`push` sin error y `main` puesto al día en `origin`
  (10 commits de esta sesión, `86832bd..e003c01`, más los siguientes de
  tipografía de marca).
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
    tests, build OK.
  - **M-03 completado del todo — `DetailView` dividido (12 sep 2026):**
    el propio formulario principal de `inmuebles.$id.tsx` (~827 líneas,
    ~30 campos de estado) era el único pendiente real, dejado intacto en
    la ronda anterior por falta de una frontera de extracción clara. Al
    releerlo: el estado en sí (los ~30 `useState` + 2 `useEffect` + la
    mutación + `buildPayload`/`dirty`) tiene que seguir viviendo en
    `DetailView`, pero casi todos los bloques de JSX que lo consumen sí
    reciben todo por props explícitas, igual que los paneles ya
    extraídos antes. Divididos a `src/components/inmueble-detail/`:
    `HeroImagePanel`, `DescripcionPanel`, `CaracteristicasPanel` (con
    `EditSpecField`/`OrientacionDetailSelect`, antes inline),
    `HistorialPanel`, `PropietarioPanel`, `SaveBar`. Resultado:
    `inmuebles.$id.tsx` 1.163→662 líneas (-43%), `DetailView` en sí
    ~827→~483 líneas (-42%). De paso, código muerto retirado: un import
    de `NewVisitaDialog` sin usar en este archivo desde la división
    anterior. Verificado igual que el resto: tsc limpio, 79/79 tests,
    eslint sin errores, build OK.
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
  1.25:1, no se toca. **12 sep 2026:** primer consumidor de la paleta —
  se propusieron 3 mocks reales en un artifact (sidebar en carbón / panel
  de Dashboard en marfil / cabecera con el par completo) antes de tocar
  código; David eligió el panel. `LeadsCalientesPanel` (`DashboardPanels.tsx`)
  pasa a `bg-marfil`/`border-carbon`, el único de los 3 paneles de insights
  — a propósito, para que el énfasis no se diluya siendo el estilo por
  defecto de los tres. Contraste verificado por cálculo antes de aplicar:
  texto principal 17.1:1, texto secundario 4.7:1 sobre marfil, ambos pasan
  AA. El icono dorado (2.96:1, token `--gold`) y el badge "Sin asignar"
  (2.39:1, token `--warning`) quedaban bajo el mínimo no-textual, ya lo
  estaban sobre `--card` antes de este cambio (3.43:1 y 2.75:1) — deuda
  preexistente, no introducida por marfil/carbón.
  **14 sep 2026 — badge "Sin asignar" resuelto de raíz:** el problema no era
  solo de este panel — el patrón `text-warning bg-warning/10` fallaba igual
  (o peor) en ~9 componentes más de toda la app (StatusBadge, LeadsBoard,
  ConversationCard, AgendaWorkspace, OperacionesPanels, seguimiento/permisos,
  AppShell, KpiCard) porque `--warning` (oklch L=0.68) estaba
  inconsistentemente más claro que sus hermanos `--success`/`--info` (L=0.48/
  0.50) del mismo trío semántico. Oscurecido a `oklch(0.55 0.17 75)` (ver
  comentario junto al token en `styles.css`): 4.96:1 sobre `--card`, 4.52:1
  sobre `--background`, 4.28:1 sobre `--marfil` (antes 2.95/2.68/2.54). Modo
  oscuro sin tocar, ya pasaba (8.3-8.65:1). Gap conocido sin resolver: en
  tema oscuro, `--warning` sobre `--marfil` queda en 2.0:1 porque marfil/
  carbón son valores fijos que no cambian con el tema (decisión de diseño ya
  aprobada) — no compete a este fix. No verificado visualmente en la app
  real (requiere login) — solo por cálculo WCAG + tsc/eslint/tests/build.
  **14 sep 2026 — icono dorado (`--gold`) también resuelto de raíz:** mismo
  patrón que `--warning` — no era solo el icono de este panel, el mismo
  `bg-gold/15 text-gold` fallaba en `StatusBadge`, el contador de KPI de
  `DashboardPanels` y `permisos.index.tsx` (2.53-2.88:1 sobre marfil/card).
  Oscurecido `oklch(0.65 0.18 52)` → `oklch(0.58 0.18 52)`: icono vs marfil
  3.93:1 (antes 2.96), badge-tint vs marfil/card 3.25/3.71:1 (antes
  2.53/2.88), KPIs grandes vs card 4.55:1 (antes 3.43). El texto de
  navegación sobre `--sidebar` (fondo oscuro fijo) baja de 5.90 a 4.45:1 —
  sigue sobrando con margen. `--ring` no se toca aunque hoy comparte el
  mismo valor literal — token distinto (anillo de foco), fuera de esta
  auditoría. Modo oscuro sin tocar, ya pasaba (6.4-6.7:1). Mismo gap
  conocido que `--warning`: en tema oscuro, `--gold` sobre `--marfil` (fijo)
  queda en 2.64:1 — consecuencia de la decisión ya aprobada de que
  marfil/carbón no cambian con el tema. No verificado visualmente en la app
  real (requiere login) — solo por cálculo WCAG + tsc/eslint/tests/build.
  **14 sep 2026 — tamaño de letra 9-11px, completado en dos pasadas:**
  primero el subconjunto seguro (182 líneas en 37 archivos: eyebrows/labels
  de sección, `<label>` de formulario, celdas de tabla sin ancho fijo,
  mensajes de error/éxito/advertencia, texto libre sin pastilla —
  `text-[9|10|11px]` → `text-xs`, sin tocar nada más). Después el resto —
  chips/badges/contadores de dimensión fija (76 líneas en 24 archivos) —
  con el ajuste de contenedor emparejado en la misma línea (`size-N` sube
  un escalón, `min-w`/`h` en píxeles +2-4px, padding de pastilla sube un
  escalón) para no dejarlos apretados. Aplicado con agentes en paralelo
  (mismo split de archivos sin solape en ambas pasadas), restringidos a la
  lista exacta de líneas ya identificadas por la auditoría — no se
  re-escaneó buscando casos nuevos, y lo dudoso se dejó sin tocar
  (columnas de ancho fijo, celdas de calendario/gráfico, un puñado de
  casos ambiguos). tsc/eslint/tests/build verificados en cada pasada; no
  verificado visualmente en la app real (requiere login).
  **14 sep 2026 — tipografía de marca resuelta:** 2 propuestas comparadas
  con contenido real del CRM en un Artifact antes de aplicar (Opción A,
  "editorial cálida": `Fraunces` en titulares/KPIs — Opción B habría
  mantenido Space Grotesk y cambiado solo el cuerpo a Manrope). David
  eligió A. `--font-display` pasa de Space Grotesk a Fraunces (variable,
  pesos 500/600/700); DM Sans se mantiene sin cambios en el cuerpo. El
  `letter-spacing: -0.01em` del bloque `h1-h6`/`.font-display` (pensado
  para lo geométrico de Space Grotesk) se quitó por apretar de más las
  curvas de una serif. Verificado visualmente en el login (única pantalla
  pública sin sesión) — Fraunces carga y renderiza sin errores de consola.
- **M-06 (observabilidad/Lovable) — limpieza cosmética hecha, error-tracking
  archivado para fase futura**: `.lovable/` eliminado, nombre de
  `package.json` corregido, doc de despliegue corregida (era Vercel, no
  Cloudflare Workers), worktree viejo de Lovable borrado (23 ago). Elegir
  proveedor de error-tracking (la interfaz en `error-reporting.ts` ya está
  preparada para conectarlo) y definir alertas críticas quedaba pendiente
  como decisión de producto/coste de David — **decidido el 14 sep 2026: no
  se atiende en esta fase** (equipo de 5 personas, no se justifica montar
  observabilidad automatizada todavía). Se archiva como evolutivo en el
  informe de entrega del proyecto, no como pendiente abierto de este repo.
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
