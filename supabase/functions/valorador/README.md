# Edge Function: valorador

## URL de producción
```
POST https://fyrfkbcabmitbfuqeccq.supabase.co/functions/v1/valorador
```

## Deploy (primera vez)

```bash
# 1. Instalar Supabase CLI (macOS)
brew install supabase/tap/supabase

# 2. Login
supabase login

# 3. Desplegar la función (sin verificar JWT para que la web pueda llamarla sin auth)
supabase functions deploy valorador \
  --project-ref fyrfkbcabmitbfuqeccq \
  --no-verify-jwt
```

## Payload esperado (POST JSON)

Acepta nombres de campo en español (Airtable) o snake_case. Todos los campos son opcionales excepto los de contacto.

```json
{
  // Datos del inmueble
  "Calle": "Calle Mayor",
  "Numero": "12",
  "Barrio": "El Centro",
  "Localidad": "Gijón",
  "Tipo de inmueble (desplegable)": "Piso",
  "Superficie": "90",
  "Habitaciones / dormitorios": "3",
  "Baño": "2",
  "Planta": "4",
  "Garaje": "si",
  "Ascensor": "si",
  "Trastero": "no",
  "Terraza": "si",
  "Armarios empotrados": "si",
  "Estado": "Buen estado",
  "Año de construcción": "2005",
  "Precio": 180000,
  "Orientación": ["Sur", "Este"],

  // Datos del propietario (lead)
  "nombre": "Juan García",
  "telefono": "612345678",
  "email": "juan@email.com"
}
```

O en snake_case:
```json
{
  "calle": "Calle Mayor",
  "tipo": "Piso",
  "superficie": "90",
  "habitaciones": "3",
  "garaje": "si",
  "nombre": "Juan García",
  "telefono": "612345678",
  "email": "juan@email.com"
}
```

## Respuesta

```json
{ "ok": true, "property_id": "uuid...", "contact_id": "uuid..." }
```

## Qué crea en Supabase

| Tabla | Campo | Valor |
|---|---|---|
| `properties` | `estatus` | `"Prospección"` |
| `properties` | `publicacion` | `"SUBIR"` |
| `properties` | `es_alquiler` | `false` |
| `contacts` | `ciclo_vida` | `"Prospecto"` |
| `contact_roles` | `tipo` | `"Propietario"` |

## Actualizar después de cambios

```bash
supabase functions deploy valorador --project-ref fyrfkbcabmitbfuqeccq --no-verify-jwt
```
