# Homebase CRM

CRM inmobiliario para gestión de propiedades, contactos, leads y operaciones.

## Stack

- **Frontend:** TanStack Start + TanStack Router + TanStack Query + Vite (target: Cloudflare Workers)
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

- `listAllInmuebles` ya no lo usan Cartera, buscadores/autocompletar,
  operaciones, visitas, bandeja ni el dashboard (M-01-bis, 20 ago 2026) —
  cada uno migrado a la consulta paginada/agregada que le correspondía.
  Sigue en `comerciales.index.lazy.tsx`: necesita filas completas agrupadas
  por agente + un feed de actividad sobre todo el histórico, no un agregado
  simple — rediseñarlo bien es su propia sesión, no una continuación directa
  de lo anterior.
