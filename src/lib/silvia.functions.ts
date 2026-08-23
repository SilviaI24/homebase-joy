import { createServerFn } from "@tanstack/react-start";
import OpenAI from "openai";
import { cleanRef } from "./format";
import { requirePermissions } from "./crm-auth.server";
import { getSupa } from "./supabase.server";

const DEFAULT_MODEL = "gpt-4.1-mini";
const MAX_TOKENS = 4096;
const MAX_HISTORY = 12;
const MAX_HISTORY_CHARS = 12_000;
const MAX_TOOL_ROUNDS = 5;
const MAX_VENTA = 35;
const MAX_ALQUILER = 15;
const MAX_LEADS = 25;
const MAX_USER_MSG_LEN = 2000;
const CACHE_TTL = 2 * 60 * 1000;

const SYSTEM_PROMPT = `Eres SilvIA, asistente inmobiliaria de El Sol Grupo (Asturias, España).
Ayudas a los agentes a consultar información del CRM, localizar contactos e inmuebles, hacer matching y preparar el siguiente paso.

Estás en MODO SOLO CONSULTA:
- No puedes crear, editar, eliminar, enviar ni confirmar nada.
- No afirmes que has ejecutado una acción.
- Si el agente pide una escritura, explica brevemente que debe realizarla desde la pantalla correspondiente del CRM.
- Puedes usar las herramientas de búsqueda para resolver referencias ambiguas.

Responde siempre en español, de forma directa y concisa. Usa solo datos del contexto CRM o de las herramientas. No inventes datos. Al hacer matching, cita referencia y precio cuando estén disponibles.`;

const READ_ONLY_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "buscar_lead",
      description: "Busca un contacto en el CRM por nombre, teléfono o email. Solo consulta datos.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Nombre, teléfono o email que se desea localizar",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_inmueble",
      description:
        "Busca un inmueble en el CRM por referencia, calle, barrio o localidad. Solo consulta datos.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Referencia, calle, barrio o localidad",
          },
        },
        required: ["query"],
      },
    },
  },
];

type ChatMessage = { role: "user" | "assistant"; content: string };
type CrmContextCache = { data: string; ts: number };
type DirectLookup = { tool: "buscar_lead" | "buscar_inmueble"; query: string };

let crmContextCache: CrmContextCache | null = null;

function safeSearchTerm(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .slice(0, 120)
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ");
}

function inferDirectLookup(message: string): DirectLookup | null {
  const propertyMarker = /\b(inmueble|propiedad|piso|casa|chalet|local|garaje)\b/i;
  const contactMarker = /\b(lead|contacto|cliente|persona)\b/i;
  const propertyMatch = propertyMarker.exec(message);
  const contactMatch = contactMarker.exec(message);
  const emailOrPhone = message.match(/[\w.+-]+@[\w.-]+\.\w+|\+?\d[\d\s-]{6,}/);

  const match = propertyMatch ?? contactMatch;
  const tool: DirectLookup["tool"] = propertyMatch ? "buscar_inmueble" : "buscar_lead";
  let query = match
    ? message.slice((match.index ?? 0) + match[0].length)
    : (emailOrPhone?.[0] ?? "");
  query = query
    .replace(/^\s*(?:con|de|llamad[oa]|que se llama|por)?\s*/i, "")
    .replace(/^\s*(?:ref(?:erencia)?\.?|n[úu]mero)\s*/i, "")
    .replace(/[?.!]+$/g, "");

  query = safeSearchTerm(query);
  return query.length >= 2 ? { tool, query } : null;
}

function throwOnQueryError(label: string, error: { message: string } | null): void {
  if (error) throw new Error(`SilvIA ${label}: ${error.message}`);
}

async function executeReadOnlyTool(name: string, args: Record<string, unknown>): Promise<string> {
  const query = safeSearchTerm(args.query);
  if (query.length < 2) return "Indica al menos dos caracteres para buscar.";

  const supa = getSupa();

  if (name === "buscar_lead") {
    const { data, error } = await supa
      .from("contacts")
      .select("id, nombre, telefono, email, ciclo_vida, solicitud")
      .or(`nombre.ilike.%${query}%,telefono.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(5);

    if (error) return `No se pudo consultar contactos: ${error.message}`;
    if (!data?.length) return `No se encontró ningún contacto con “${query}”.`;

    return [
      `He encontrado ${data.length} contacto${data.length === 1 ? "" : "s"}:`,
      ...data.map((contact) => {
        const details = [
          contact.ciclo_vida || "Sin clasificar",
          contact.telefono || null,
          contact.email || null,
        ].filter(Boolean);
        const request = contact.solicitud ? `\n  Solicitud: ${contact.solicitud}` : "";
        return `- ${contact.nombre || "Sin nombre"} · ${details.join(" · ")}${request}`;
      }),
    ].join("\n");
  }

  if (name === "buscar_inmueble") {
    const { data, error } = await supa
      .from("properties")
      .select(
        "id, ref, calle, numero, barrio, localidad, tipo, estatus, precio, precio_final, habitaciones, metros_construidos",
      )
      .or(
        `ref.ilike.%${query}%,calle.ilike.%${query}%,barrio.ilike.%${query}%,localidad.ilike.%${query}%`,
      )
      .limit(8);

    if (error) return `No se pudo consultar inmuebles: ${error.message}`;
    if (!data?.length) return `No se encontró ningún inmueble con “${query}”.`;

    return [
      `He encontrado ${data.length} inmueble${data.length === 1 ? "" : "s"}:`,
      ...data.map((property) => {
        const price = property.precio_final ?? property.precio;
        const address = [property.calle, property.numero].filter(Boolean).join(" ");
        const zone = [property.barrio, property.localidad].filter(Boolean).join(", ");
        return [
          `- Ref. ${cleanRef(property.ref ?? "—")}`,
          address || "Dirección no disponible",
          zone || null,
          property.tipo || null,
          `${property.habitaciones ?? "—"} hab`,
          `${property.metros_construidos ?? "—"} m²`,
          price ? `${Number(price).toLocaleString("es-ES")} €` : "Precio no disponible",
          property.estatus || "Sin estado",
        ]
          .filter(Boolean)
          .join(" · ");
      }),
    ].join("\n");
  }

  return `Herramienta no disponible en modo consulta: ${name}`;
}

async function buildCrmContext(): Promise<string> {
  if (crmContextCache && Date.now() - crmContextCache.ts < CACHE_TTL) {
    return crmContextCache.data;
  }

  const supa = getSupa();
  const today = new Date();
  const [propResult, leadsResult, visitsResult, agentsResult] = await Promise.all([
    supa
      .from("properties")
      .select(
        "ref, calle, barrio, localidad, tipo, habitaciones, precio, precio_final, estatus, es_alquiler, fecha_inicio",
      )
      .in("estatus", ["Activo", "Reservado"])
      .order("fecha_inicio", { ascending: false })
      .limit(MAX_VENTA + MAX_ALQUILER + 60),
    supa
      .from("contacts")
      .select(
        "id, nombre, solicitud, motivo, ciclo_vida, created_at, contact_agents(agents(nombre))",
      )
      .in("ciclo_vida", ["Lead", "Prospecto"])
      .order("created_at", { ascending: false })
      .limit(MAX_LEADS),
    supa
      .from("visits")
      .select("fecha, estado, notas")
      .eq("estado", "Programada")
      .gte("fecha", today.toISOString())
      .order("fecha", { ascending: true })
      .limit(10),
    supa.from("agents").select("nombre").eq("activo", true),
  ]);

  throwOnQueryError("inmuebles", propResult.error);
  throwOnQueryError("contactos", leadsResult.error);
  throwOnQueryError("visitas", visitsResult.error);
  throwOnQueryError("agentes", agentsResult.error);

  const properties = propResult.data ?? [];
  const leads = leadsResult.data ?? [];
  const visits = visitsResult.data ?? [];
  const agents = agentsResult.data ?? [];
  const venta = properties.filter((property) => !property.es_alquiler).slice(0, MAX_VENTA);
  const alquiler = properties.filter((property) => property.es_alquiler).slice(0, MAX_ALQUILER);

  const daysSince = (iso: string | null): string => {
    if (!iso) return "?";
    return String(
      Math.max(0, Math.floor((today.getTime() - new Date(iso).getTime()) / 86_400_000)),
    );
  };
  const price = (property: (typeof properties)[number]): string => {
    const value = property.precio_final ?? property.precio;
    return value ? `${Math.round(Number(value) / 1000)}k` : "?";
  };
  const zone = (property: (typeof properties)[number]): string =>
    [property.barrio, property.localidad].filter(Boolean).join(", ") || "?";
  const street = (property: (typeof properties)[number]): string =>
    (property.calle ?? "").slice(0, 30) || "?";

  const ventaLines = venta
    .map(
      (property) =>
        `${cleanRef(property.ref ?? "?")}|${street(property)}|${zone(property)}|${property.tipo ?? "?"}|${property.habitaciones ?? "?"}h|${price(property)}|${property.estatus}|${daysSince(property.fecha_inicio)}d`,
    )
    .join("\n");
  const alquilerLines = alquiler
    .map(
      (property) =>
        `${cleanRef(property.ref ?? "?")}|${street(property)}|${zone(property)}|${property.tipo ?? "?"}|${property.habitaciones ?? "?"}h|${price(property)}/m|${property.estatus}`,
    )
    .join("\n");
  const leadLines = leads
    .map((contact) => {
      const request = (contact.solicitud || contact.motivo || "").slice(0, 100);
      const assignments = contact.contact_agents as unknown as Array<{
        agents: { nombre: string } | null;
      }> | null;
      const agentName = assignments?.[0]?.agents?.nombre;
      return `${contact.id}|${contact.nombre}|${contact.ciclo_vida}|${request || "sin solicitud"}|${agentName ? `asignado:${agentName}` : "asignado:NO"}`;
    })
    .join("\n");
  const visitLines = visits
    .map(
      (visit) =>
        `${visit.fecha}|${visit.estado}|${(visit.notas ?? "").slice(0, 80) || "sin notas"}`,
    )
    .join("\n");

  const sections = [
    `=VENTA(${venta.length})= ref|calle|zona|tipo|hab|precio|estatus|días\n${ventaLines || "Sin datos"}`,
    `=ALQUILER(${alquiler.length})= ref|calle|zona|tipo|hab|precio/m|estatus\n${alquilerLines || "Sin datos"}`,
    `=LEADS RECIENTES(${leads.length})= contactId|nombre|estado|solicitud|asignación\n${leadLines || "Sin datos"}`,
    `=EQUIPO ACTIVO(${agents.length})=\n${agents.map((agent) => agent.nombre).join(", ") || "Sin datos"}`,
  ];
  if (visits.length) {
    sections.push(`=VISITAS PROGRAMADAS(${visits.length})=\n${visitLines}`);
  }

  const data = sections.join("\n\n");
  crmContextCache = { data, ts: Date.now() };
  return data;
}

function validateMessages(input: { messages: ChatMessage[] }): {
  messages: ChatMessage[];
} {
  if (!Array.isArray(input?.messages) || input.messages.length === 0) {
    throw new Error("Sin mensajes");
  }

  const messages = input.messages.slice(-MAX_HISTORY);
  for (const message of messages) {
    if (
      (message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string" ||
      !message.content.trim()
    ) {
      throw new Error("Historial de conversación inválido");
    }
  }

  const last = messages[messages.length - 1];
  if (last.role !== "user") throw new Error("Último mensaje inválido");
  if (last.content.length > MAX_USER_MSG_LEN) {
    throw new Error(
      `Mensaje demasiado largo (${last.content.length}/${MAX_USER_MSG_LEN} caracteres)`,
    );
  }

  const totalCharacters = messages.reduce((total, message) => total + message.content.length, 0);
  if (totalCharacters > MAX_HISTORY_CHARS) {
    throw new Error("Historial demasiado largo; inicia una conversación nueva");
  }

  return { messages };
}

export const askSilvia = createServerFn({ method: "POST" })
  .validator(validateMessages)
  .handler(async ({ data }) => {
    await requirePermissions("silvia.use", "contacts.read", "properties.read", "visits.read");

    const latestMessage = data.messages[data.messages.length - 1]?.content ?? "";
    const directLookup = inferDirectLookup(latestMessage);
    if (directLookup) {
      return {
        reply: await executeReadOnlyTool(directLookup.tool, { query: directLookup.query }),
      };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        reply:
          "La consulta avanzada no está disponible ahora. Sí puedo buscar directamente en el CRM: prueba con “busca el lead Ana” o “busca el inmueble 11754”.",
      };
    }

    const client = new OpenAI({ apiKey });
    let crmContext: string;
    try {
      crmContext = await buildCrmContext();
    } catch (error) {
      console.error(
        "SilvIA: no se pudo preparar el contexto CRM",
        error instanceof Error ? error.message : "error desconocido",
      );
      return {
        reply:
          "No he podido preparar la consulta ahora. Inténtalo de nuevo o busca directamente un lead o un inmueble.",
      };
    }
    const systemMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\n${crmContext}`,
    };
    const conversation = [
      ...(data.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[]),
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      let response: OpenAI.Chat.Completions.ChatCompletion;
      try {
        response = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
          max_completion_tokens: MAX_TOKENS,
          tools: READ_ONLY_TOOLS,
          tool_choice: "auto",
          messages: [systemMessage, ...conversation],
        });
      } catch (error) {
        console.error(
          "SilvIA: proveedor de análisis no disponible",
          error instanceof Error ? error.message : "error desconocido",
        );
        return {
          reply:
            "La consulta avanzada no está disponible ahora. Las búsquedas directas del CRM siguen funcionando: prueba con “busca el lead Ana” o “busca el inmueble 11754”.",
        };
      }
      const choice = response.choices[0];
      if (!choice) throw new Error("SilvIA no devolvió ninguna respuesta");

      conversation.push(choice.message as OpenAI.Chat.Completions.ChatCompletionMessageParam);

      if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls?.length) {
        return { reply: choice.message.content ?? "" };
      }

      const toolResults = await Promise.all(
        choice.message.tool_calls.map(async (toolCall) => {
          if (toolCall.type !== "function") {
            return {
              toolCallId: toolCall.id,
              result: "Tipo de herramienta no soportado.",
            };
          }

          let args: Record<string, unknown>;
          try {
            args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
          } catch {
            return {
              toolCallId: toolCall.id,
              result: "Argumentos de búsqueda inválidos.",
            };
          }

          return {
            toolCallId: toolCall.id,
            result: await executeReadOnlyTool(toolCall.function.name, args),
          };
        }),
      );

      for (const toolResult of toolResults) {
        conversation.push({
          role: "tool",
          tool_call_id: toolResult.toolCallId,
          content: toolResult.result,
        });
      }
    }

    return {
      reply:
        "No he podido completar la consulta en el número máximo de pasos. Reformúlala con un contacto, referencia o zona concreta.",
    };
  });
