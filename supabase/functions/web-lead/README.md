# Edge Function: web-lead

Recibe los formularios de contacto de fichas de inmueble (venta y alquiler) de
la web pública y los guarda en Supabase como lead.

Hasta el 11 sep 2026 esta función **no tenía copia local en ningún repo**
(ni homebase-joy ni elsol-client-hub) — se desplegó y editó directamente en
Supabase. Eso fue lo que permitió que quedara desincronizada con un cambio de
esquema del 19 ago 2026 sin que ninguna auditoría de código la detectara (ver
"Bug corregido" más abajo). A partir de ahora se versiona aquí.

## URL de producción
```
POST https://fyrfkbcabmitbfuqeccq.supabase.co/functions/v1/web-lead
```

## Deploy

```bash
supabase functions deploy web-lead \
  --project-ref fyrfkbcabmitbfuqeccq \
  --no-verify-jwt
```

`--no-verify-jwt` es imprescindible: la web pública la llama sin JWT de
Supabase, solo con el body JSON.

## Payload esperado (POST JSON)

```json
{
  "nombre": "Juan García",
  "apellidos": "López",
  "email": "juan@email.com",
  "telefono": "612345678",
  "mensaje": "Me interesa esta vivienda",
  "property_id": "uuid del inmueble"
}
```

`nombre`, `email`, `telefono` y `property_id` son obligatorios.

## Qué crea en Supabase

| Tabla | Campo | Valor |
|---|---|---|
| `contacts` | `ciclo_vida` | `"Lead"` |
| `contacts` | `canal_origen` | `"Web"` |
| `contact_roles` | `tipo` | `"Comprador"` si `properties.es_alquiler = false`, `"Inquilino"` si `true` |
| `contact_roles` | `estado` | `"Prospecto"` |

Deduplica contacto por email o teléfono, y no duplica `contact_roles` para el
mismo par contacto+propiedad.

## Bug corregido (11 sep 2026)

Desde el 19 ago 2026 (migración
`20260819155547_normalize_legacy_lead_role_types.sql`), `contact_roles_tipo_check`
ya no admite `lead_compra`/`lead_alquiler` — solo `Comprador`, `Inquilino`,
`Propietario`, `Arrendador`. Esta función seguía insertando los valores
antiguos, así que **todo envío del formulario de la web daba 500** desde esa
fecha (violación del CHECK al insertar en `contact_roles`). Reportado por la
agencia que gestiona la web el 11 sep 2026. Corregido mapeando
`es_alquiler ? "Inquilino" : "Comprador"` — el mismo mapeo que ya usó esa
migración para normalizar las filas legacy.

## Bug corregido (14 sep 2026)

La agencia reportó 500 seguidos en la última semana de logs pese al fix del
11 sep. Causa distinta: la búsqueda de contacto existente
(`.or('email.eq.${email},telefono.eq.${telefono}')`) interpolaba los valores
del formulario sin escapar dentro de un filtro `.or()` de PostgREST. `,` y
`(`/`)` son caracteres estructurales de ese parser — un teléfono con formato
`+34 (912) 345 678`, o un email con una coma, rompían el filtro y PostgREST
devolvía 400, indistinguible aquí de cualquier otro error y respondido como
500 genérico. Mismo patrón de bug que la "búsqueda unificada" corregida el 12
sep en 5 puntos de `src/` (`escapeSearchTerm()` en `src/lib/format.ts`) — esa
pasada no llegó a `supabase/functions/` porque no era su alcance. Corregido
con la misma lógica (`,`/`(`/`)` → espacio), reimplementada localmente porque
esta función corre en un runtime Deno separado del bundle de la app y no
puede importar de `src/lib`.
