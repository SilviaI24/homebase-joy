# Edge Function: whatsapp-silvia

SilvIA de WhatsApp dentro del CRM. Sustituye al escenario de Make
"Silvia - 03.1 WhatsApp Assistant", que dejó de funcionar cuando OpenAI retiró
la API de Assistants (el escenario nunca se migró a Responses).

## Qué hace, por cada mensaje que envía Meta

1. Comprueba la firma `X-Hub-Signature-256` con el App Secret de Meta. Sin
   secreto configurado rechaza todo (falla cerrada).
2. Responde `200` al momento y procesa detrás (`EdgeRuntime.waitUntil`): Meta
   reintenta si tarda.
3. Guarda el mensaje en `whatsapp_mensajes`. El `wamid` es único: un reintento
   de Meta no se procesa dos veces.
4. Busca el contacto por teléfono (`crm_contacto_por_telefono`, 9 últimos
   dígitos) o lo crea como Lead con `canal_origen='WhatsApp'`.
5. Abre o continúa la conversación en `conversaciones` (misma conversación
   mientras no pasen 24 h entre mensajes) y va escribiendo la transcripción.
6. No responde si el contacto pidió la baja (`contacts.whatsapp_baja`) o si
   un comercial le escribió hace menos de 12 h desde la Bandeja
   (`contacts.silvia_pausada_hasta`, lo fija `sendWhatsAppReply`).
7. Si el mensaje es una petición de baja, la registra y lo confirma.
8. Pide la respuesta a OpenAI (API Responses) con el **prompt guardado** de
   SilvIA (`SILVIA_PROMPT_ID`) y estas herramientas:
   - `buscar_inmueble` → `silvia_buscar_inmuebles`: la ÚNICA fuente de
     cartera (búsqueda aproximada por referencia/calle/barrio/localidad,
     filtro venta/alquiler, lista lo disponible si no hay texto; solo
     Activo+Publicado y Reservado; incluye la descripción).
   - **Sin `file_search`, a propósito:** el vector store "Inmuebles" del
     proyecto de OpenAI guarda copias diarias antiguas de cada ficha; en la
     primera prueba real SilvIA ofreció un piso alquilado desde hacía
     semanas (AT1073).
   - `registrar_datos_lead` → nombre, interés, "pide que le llamen" y resumen,
     directos a la ficha y a la conversación (la Bandeja lo refleja solo).
   La memoria de la conversación es `previous_response_id`, guardado en
   `conversaciones.ai_thread_id`.
9. Envía la respuesta por WhatsApp y la guarda en el hilo.

## Modos

`WHATSAPP_SILVIA_MODO=activo` envía de verdad. Cualquier otro valor (o sin
definir) **genera y guarda la respuesta pero no la envía**
(`estado_envio='simulado'`). Por defecto no sale nada.

## Secretos (Supabase → Edge Functions → Secrets)

Los pone David; esta función solo los lee.

| Nombre | Qué es |
|---|---|
| `WHATSAPP_APP_SECRET` | App Secret de la app de Meta (Configuración de la app → Básica) |
| `WHATSAPP_VERIFY_TOKEN` | Palabra cualquiera; la misma que se escribe en Meta al configurar el webhook |
| `WABA_ACCESS_TOKEN`, `WABA_PHONE_NUMBER_ID` | Los mismos que ya usa el CRM para responder desde la Bandeja |
| `OPENAI_API_KEY_SILVIA` | Clave del proyecto de OpenAI donde viven el prompt y el vector store |
| `WHATSAPP_SILVIA_MODO` | `activo` para enviar; sin definir = simulación |
| `SILVIA_PROMPT_ID` | Opcional: por defecto el prompt actual |

## Deploy

```bash
npx supabase functions deploy whatsapp-silvia --project-ref fyrfkbcabmitbfuqeccq --no-verify-jwt
```

`--no-verify-jwt` es imprescindible: Meta no envía JWT de Supabase; la
autenticación es la firma de Meta.

URL: `https://fyrfkbcabmitbfuqeccq.supabase.co/functions/v1/whatsapp-silvia`

## Activarlo en Meta (lo hace David)

Meta for Developers → la app → WhatsApp → Configuración → Webhook:
URL de devolución de llamada = la URL de arriba; token de verificación =
`WHATSAPP_VERIFY_TOKEN`; suscribirse al campo `messages`.

**Volver atrás:** poner otra vez la URL anterior en ese mismo campo.

## Limitaciones conocidas

- Audios, imágenes y documentos no se interpretan: se guardan y se pide al
  cliente que escriba.
- Dos mensajes muy seguidos pueden recibir dos respuestas (no hay cola por
  contacto todavía).
- Fuera de la ventana de 24 h de WhatsApp solo se puede escribir con
  plantillas aprobadas; esta función solo responde a mensajes entrantes, así
  que siempre está dentro de la ventana.
