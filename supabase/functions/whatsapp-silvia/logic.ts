// Lógica pura de whatsapp-silvia: sin Deno ni red, para poder probarla con
// vitest desde el repo. Solo Web Crypto (global en Deno y en Node ≥ 20).

export type MensajeEntrante = {
  wamid: string;
  telefono: string; // wa_id: dígitos con prefijo de país, sin "+"
  nombrePerfil: string | null;
  tipo: string;
  texto: string | null;
  timestamp: Date;
  phoneNumberId: string | null;
};

// Meta firma el cuerpo EXACTO recibido con el App Secret:
// X-Hub-Signature-256: sha256=<hex>. Se compara en tiempo constante.
export async function firmaMetaValida(
  cuerpo: string,
  cabecera: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!cabecera?.startsWith("sha256=") || !appSecret) return false;
  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = new Uint8Array(
    await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(cuerpo)),
  );
  const esperado = Array.from(firma, (b) => b.toString(16).padStart(2, "0")).join("");
  const recibido = cabecera.slice("sha256=".length).toLowerCase();
  if (recibido.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ recibido.charCodeAt(i);
  return diff === 0;
}

type WebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string };
          interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
        }>;
      };
    }>;
  }>;
};

// Solo mensajes de clientes; los avisos de estado (entregado/leído) se ignoran.
export function extraerMensajes(payload: unknown): MensajeEntrante[] {
  const out: MensajeEntrante[] = [];
  for (const entry of (payload as WebhookPayload)?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      if (!v?.messages?.length) continue;
      const nombres = new Map(
        (v.contacts ?? []).map((c) => [c.wa_id ?? "", c.profile?.name?.trim() || null]),
      );
      for (const m of v.messages) {
        if (!m.id || !m.from) continue;
        const texto =
          m.text?.body ??
          m.button?.text ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          null;
        out.push({
          wamid: m.id,
          telefono: m.from.replace(/\D/g, ""),
          nombrePerfil: nombres.get(m.from) ?? null,
          tipo: m.type ?? "desconocido",
          texto: texto?.trim() || null,
          timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
          phoneNumberId: v.metadata?.phone_number_id ?? null,
        });
      }
    }
  }
  return out;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

// Petición explícita de no recibir más mensajes. Deliberadamente estricta: un
// "no me interesa ese piso" no es una baja de WhatsApp.
export function esPeticionDeBaja(texto: string | null): boolean {
  if (!texto) return false;
  const t = sinTildes(texto.toLowerCase())
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (["baja", "stop", "darme de baja", "dar de baja", "de baja"].includes(t)) return true;
  return /\b(darme de baja|no (me )?(escrib|mand|envi)\w* mas|no quiero (recibir|mas mensajes))\b/.test(
    t,
  );
}

// Una conversación de WhatsApp = mensajes separados por menos de 24 h (la
// misma ventana en la que WhatsApp permite responder sin plantilla).
export const VENTANA_CONVERSACION_MS = 24 * 60 * 60 * 1000;

export function sigueAbierta(ultimoMensaje: string | null | undefined, ahora: Date): boolean {
  if (!ultimoMensaje) return false;
  return ahora.getTime() - new Date(ultimoMensaje).getTime() < VENTANA_CONVERSACION_MS;
}

export function lineaTranscripcion(
  autor: "Cliente" | "SilvIA" | "Comercial",
  texto: string,
  cuando: Date,
): string {
  const hh = cuando.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
  return `[${hh}] ${autor}: ${texto}`;
}

type RespuestaOpenAI = {
  id?: string;
  output?: Array<{
    type?: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

export function textoDeRespuesta(r: RespuestaOpenAI): string {
  return (r.output ?? [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text" && c.text)
    .map((c) => c.text!.trim())
    .join("\n\n")
    .trim();
}

export function llamadasAHerramientas(
  r: RespuestaOpenAI,
): Array<{ callId: string; nombre: string; args: Record<string, unknown> }> {
  return (r.output ?? [])
    .filter((o) => o.type === "function_call" && o.call_id && o.name)
    .map((o) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(o.arguments ?? "{}");
      } catch {
        args = {};
      }
      return { callId: o.call_id!, nombre: o.name!, args };
    });
}

// El modelo escribe Markdown; WhatsApp usa *negrita*, _cursiva_ y no tiene
// enlaces con texto ni títulos. Se adapta antes de enviar.
export function aFormatoWhatsApp(texto: string): string {
  return texto
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "_$1_")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1: $2")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/【[^】]*】/g, "")
    .trim();
}

// Sin file_search a propósito: el vector store "Inmuebles" guarda copias
// diarias antiguas de cada ficha y en la primera prueba real SilvIA ofreció
// un piso alquilado desde hacía semanas. La cartera se consulta SOLO en vivo.
export const HERRAMIENTAS_SILVIA = [
  {
    type: "function",
    name: "buscar_inmueble",
    description:
      "Única fuente fiable de la cartera de El Sol (disponibilidad, precio y características, en tiempo real). Úsala SIEMPRE antes de mencionar cualquier inmueble, precio o disponibilidad; no menciones inmuebles que no devuelva. Busca por referencia, calle (aunque esté mal escrita), barrio o localidad; con texto vacío lista lo disponible de esa operación. Devuelve solo inmuebles disponibles o reservados.",
    parameters: {
      type: "object",
      properties: {
        texto: {
          type: "string",
          description:
            "Referencia, calle, barrio o localidad tal como lo dice el cliente; vacío para listar lo disponible",
        },
        operacion: {
          type: ["string", "null"],
          enum: ["venta", "alquiler", null],
          description: "venta o alquiler si el cliente lo ha dicho",
        },
      },
      required: ["texto", "operacion"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "valorar_vivienda",
    description:
      "Calcula la orientación de precio de venta de una vivienda en Gijón con los datos de mercado de El Sol. Es la ÚNICA fuente de cifras de valoración: no des nunca un precio o rango que no venga de aquí.",
    parameters: {
      type: "object",
      properties: {
        barrio: { type: "string", description: "Barrio de Gijón tal como lo ha dicho el cliente" },
        metros: { type: "number", description: "Metros cuadrados aproximados" },
        ascensor: { type: "boolean", description: "Si el edificio tiene ascensor" },
        exterior: { type: "boolean", description: "Si la vivienda es exterior" },
      },
      required: ["barrio", "metros", "ascensor", "exterior"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "registrar_datos_lead",
    description:
      "Guarda en el CRM lo que has sabido del cliente. Llámala cada vez que sepas algún dato nuevo (nombre, qué busca, si pide que le llamen, o los datos de alquiler). Deja en null lo que no sepas.",
    parameters: {
      type: "object",
      properties: {
        nombre: { type: ["string", "null"], description: "Nombre del cliente si lo ha dicho" },
        interes: {
          type: ["string", "null"],
          enum: ["Compra", "Alquiler", "Prospeccion", null],
          description: "Compra, Alquiler, o Prospeccion si quiere vender/valorar su inmueble",
        },
        pide_llamada: { type: ["boolean", "null"], description: "true si pide que le llamen" },
        resumen: {
          type: ["string", "null"],
          description: "Resumen breve de lo que busca, para el comercial",
        },
        email: { type: ["string", "null"], description: "Email si lo ha dado" },
        inmueble_ref: {
          type: ["string", "null"],
          description:
            "Referencia del inmueble que le interesa, tal como la devolvió buscar_inmueble",
        },
        contrato_trabajo: {
          type: ["string", "null"],
          enum: ["Si", "No", null],
          description: "Alquiler: si tiene contrato de trabajo",
        },
        profesion: { type: ["string", "null"], description: "Alquiler: a qué se dedica" },
        mascota: {
          type: ["string", "null"],
          description: 'Alquiler: "No", o "Si" seguido de qué mascota (p. ej. "Si, un gato")',
        },
        avalista: {
          type: ["string", "null"],
          enum: ["Si", "No", null],
          description: "Alquiler: si dispone de avalista en caso de ser necesario",
        },
      },
      required: [
        "nombre",
        "interes",
        "pide_llamada",
        "resumen",
        "email",
        "inmueble_ref",
        "contrato_trabajo",
        "profesion",
        "mascota",
        "avalista",
      ],
      additionalProperties: false,
    },
    strict: true,
  },
];

// Frases fijas del prompt de SilvIA que deben salir palabra por palabra
// (David, 25 sep 2026: en la primera prueba con el prompt nuevo, la frase
// patrimonial salió resumida). Un test comprueba que siguen idénticas en
// PROMPT.md, para que no se desincronicen si se edita uno de los dos.
export const FRASES_LITERALES = [
  "Hola, soy Silvia de El Sol Grupo. Esta conversación será procesada para ofrecerte un servicio personalizado.",
  "Gracias por confiar en nosotros para gestionar tu propiedad. Sabemos que vender una vivienda es una decisión importante, no solo en lo económico, también porque forma parte de tu patrimonio y de tu vida.",
  "Nosotros trabajamos valoraciones con precisión solo en Gijón, porque es donde tenemos datos reales de mercado.",
  "Es una orientación muy real con datos actuales de mercado, pero hasta ver la vivienda en persona no podemos afinar del todo porque influyen detalles muy concretos.",
  "En El Sol trabajamos con datos reales de mercado para que puedas tomar decisiones con información fiable.",
  "Un especialista de El Sol te preparará una orientación ajustada a tu vivienda y se pondrá en contacto contigo.",
];

// Reglas del CRM: van en CADA turno, no solo en el primero. En la primera
// prueba real una conversación que venía de antes de añadirlas mandó el
// formulario de Airtable, porque su hilo de OpenAI no las contenía.
export const REGLAS_CRM = [
  "Instrucciones del CRM de El Sol (prioritarias):",
  "- No envíes formularios ni enlaces de Airtable: ya no se usan.",
  "- Antes de mencionar cualquier inmueble, precio o disponibilidad, usa buscar_inmueble; no menciones inmuebles que no devuelva.",
  "- Si busca alquiler, pregúntale tú, con naturalidad y como mucho dos cosas por mensaje, lo que el comercial necesita para valorar su solicitud: qué inmueble le interesa, nombre y apellidos, email, si tiene contrato de trabajo, profesión, si tiene mascota y si dispone de avalista en caso de ser necesario. Guarda cada dato con registrar_datos_lead en cuanto lo sepas.",
  "- Cuando tengas los datos, dile que el comercial responsable revisará su solicitud y contactará con él. No prometas visitas ni plazos.",
  "- No pidas el teléfono: ya lo tienes.",
  "- Frases fijas: cuando corresponda usar una de estas frases, escríbela EXACTAMENTE así, palabra por palabra, sin resumirla, acortarla ni cambiar ninguna palabra (solo puedes pasar de tú a usted si el cliente te trata de usted):",
  ...FRASES_LITERALES.map((f) => `  «${f}»`),
  "- Valoraciones (vender/valorar): la cifra la calcula SIEMPRE valorar_vivienda, nunca tú. Antes de llamarla necesitas calle y barrio (sin calle y barrio no hay orientación de precio), metros, si tiene ascensor y si es exterior. Da exactamente el rango que devuelve (rango_min y rango_max), con 'lo habitual', 'lo normal' o 'suele moverse entre'; puedes expresarlo en miles. Después de dar cifras añade siempre: 'Es una orientación muy real con datos actuales de mercado, pero hasta ver la vivienda en persona no podemos afinar del todo porque influyen detalles muy concretos.' Si valorar_vivienda no devuelve ok, no des ninguna cifra ni la estimes tú, y no expliques el motivo: di que un especialista le preparará una orientación ajustada a esa vivienda. Nunca expliques de dónde salen los precios por barrio ni que hay un cálculo automático.",
].join("\n");

// Lo que ya se sabe del contacto, solo al abrir una conversación (igual que
// le pasaba el escenario de Make: nombre y conversaciones previas).
export function contextoContacto(c: {
  nombre: string | null;
  tipo_interes: string | null;
  conversaciones: string | null;
}): string {
  return [
    "Contexto del CRM (no lo repitas literalmente):",
    `- Nombre en ficha: ${c.nombre && c.nombre !== "Sin nombre" ? c.nombre : "desconocido"}`,
    c.tipo_interes ? `- Interés registrado: ${c.tipo_interes}` : null,
    c.conversaciones ? `- Conversaciones anteriores:\n${c.conversaciones.slice(-3000)}` : null,
  ]
    .filter((x) => x !== null)
    .join("\n");
}
