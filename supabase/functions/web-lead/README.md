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
