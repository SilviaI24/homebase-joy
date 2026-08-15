# Homebase CRM

CRM inmobiliario para gestión de propiedades, contactos, leads y operaciones.

## Stack

- **Frontend:** TanStack Start + TanStack Router + TanStack Query + Vite (target: Cloudflare Workers)
- **Backend:** Supabase (PostgreSQL + Storage + Edge Functions + Auth)
- **IA:** SilvIA — agente de cualificación de leads vía WhatsApp/Email/Voz
- **Automatización:** Make (team 1698831) + pg_cron

## Supabase

- **Project ID:** `fyrfkbcabmitbfuqeccq`
- **Client anon:** `src/lib/supabase.client.ts` — usa `VITE_SUPABASE_ANON_KEY` (solo auth del usuario)
- **Server:** `src/lib/supabase.server.ts` → `getSupa()` — usa `SUPABASE_SERVICE_KEY`, nunca en cliente
- **RLS:** todas las tablas tienen RLS con policy `service_role_all TO service_role`. La anon key NO lee datos.
- **Auth:** email/password, único administrador inicial `ai@elsolgrupo.com`. Roles por departamento: pendiente Phase 2.

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

- **sync-properties:** Edge Function diaria a las 06:00 UTC (pg_cron). Trae propiedades + imágenes desde Airtable.
  - Trigger manual: `curl -X POST https://fyrfkbcabmitbfuqeccq.supabase.co/functions/v1/sync-properties -H "x-cron-secret: <CRON_SECRET>"`
  - CRON_SECRET está en Supabase Vault (nombre: `cron_secret`)

## Autenticación server-side (implementado)

- `@supabase/ssr` instalado
- `src/lib/supabase.client.ts` usa `createBrowserClient` → sesión guardada en cookies (necesario para el servidor)
- `src/lib/auth.server.ts` exporta `requireAuth()` — lee la cookie de sesión, verifica con Supabase, lanza 401 si no hay sesión válida
- Todos los 33 handlers en `createServerFn` llaman `await requireAuth()` como primera línea
- Variables necesarias en `.env.local`: `SUPABASE_URL` y `SUPABASE_ANON_KEY` (sin prefijo VITE_)
- **Nota:** usuarios con sesión antigua (localStorage) necesitan re-login una vez para que se genere la cookie

## Pendiente

- Roles por departamento con RLS por `agente_id` (Phase 3)
