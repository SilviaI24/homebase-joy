import { createServerFn } from "@tanstack/react-start";
import OpenAI from "openai";
import { Resend } from "resend";
import { getSupa } from "./supabase.server";
import { cleanRef, toSentenceCase } from "./format";
import { requireAuth } from "@/lib/auth.server";

// ── Config ────────────────────────────────────────────────────────────────────

const MODEL           = "gpt-4.1-mini";
const MAX_TOKENS      = 1024;
const MAX_HISTORY     = 8;
const MAX_TOOL_ROUNDS = 3;
const MAX_VENTA       = 35;
const MAX_ALQUILER    = 15;
const MAX_LEADS       = 25;

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Eres SilvIA, IA inmobiliaria de El Sol Grupo (Asturias, España).
Ayudas a los agentes a gestionar leads, hacer matching y tomar decisiones.
Puedes ejecutar acciones reales en el CRM: cualificar leads, añadir notas, crear visitas, vincular leads a inmuebles y enviar WhatsApp.
Cuando el agente te pida hacer algo, hazlo directamente con las herramientas disponibles — no preguntes innecesariamente, actúa.
Si necesitas el ID de un contacto o inmueble, búscalo primero con la herramienta adecuada.
Responde siempre en español. Sé directa y concisa. Usa solo datos del contexto CRM adjunto. No inventes datos.
Al hacer matching lead↔propiedad cita ref y precio. Si detectas riesgo (propiedad >90d sin movimiento, lead sin seguimiento) menciónalo.

REGLA CRÍTICA — ASIGNACIÓN PREVIA A CUALIFICACIÓN:
Antes de cualificar un lead (cambiar su ciclo de vida de Lead a otro estado), el lead DEBE tener un comercial asignado.
Si el lead no aparece como "asignado:SÍ" en el contexto, usa asignar_comercial primero.
Nunca cualifiques un lead sin comercial asignado — el sistema lo bloqueará.

NOMENCLATURA DE CICLO DE VIDA:
- Lead: interesado en comprar o alquilar (demanda), aún sin cualificar
- Prospecto: interesado en vender o poner en alquiler (oferta)
- Cliente: ha firmado contrato con El Sol Grupo
- Histórico: operación cerrada
- Descartado: sin interés o duplicado`;

// ── Helpers internos ──────────────────────────────────────────────────────────

// Mapeo de estado display → estado BD (visits)
const ESTADO_IN: Record<string, string> = {
  Pendiente:  "Programada",
  Confirmada: "Programada",
  Completado: "Realizada",
  Anulada:    "Cancelada",
};

function formatNota(nota: string, actual: string): string {
  const ts = new Date().toLocaleString("es-ES", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  const linea = `[${ts}] ${toSentenceCase(nota.trim())}`;
  const prev = actual.trim();
  return prev ? `${prev}\n${linea}` : linea;
}

// Resuelve el UUID de una propiedad a partir de su ref (limpia o con sufijo)
async function resolvePropertyId(supa: ReturnType<typeof getSupa>, ref: string): Promise<string | null> {
  const clean = cleanRef(ref.trim());
  const { data } = await supa
    .from("properties")
    .select("id")
    .ilike("ref", `${clean}%`)
    .limit(1)
    .single();
  return data?.id ?? null;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "buscar_lead",
      description: "Busca un lead/contacto en la BD por nombre o teléfono. Devuelve id, nombre, teléfono y estado. Úsalo antes de cualquier acción cuando no tengas el contactId.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nombre completo o número de teléfono" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cualificar_lead",
      description: "Cambia el rol de un lead a Comprador, Inquilino o Prospecto y actualiza su ciclo de vida.",
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "string", description: "ID del contacto (UUID)" },
          tipo: { type: "string", enum: ["Comprador", "Inquilino", "Prospecto"] },
        },
        required: ["contactId", "tipo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "archivar_lead",
      description: "Descarta un lead marcándolo como Descartado. Usar cuando el lead no tiene interés o es un duplicado.",
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "string" },
        },
        required: ["contactId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "agregar_nota",
      description: "Añade una nota al historial de observaciones de un contacto/lead. Queda registrada con fecha y hora sin borrar el historial previo.",
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "string" },
          nota: { type: "string", description: "Texto de la nota a añadir" },
        },
        required: ["contactId", "nota"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crear_visita",
      description: "Crea una visita a un inmueble. Busca el inmueble por su ref automáticamente.",
      parameters: {
        type: "object",
        properties: {
          inmueble_ref: { type: "string", description: "Referencia del inmueble (ej: A9755)" },
          fecha:        { type: "string", description: "Fecha en formato YYYY-MM-DD o YYYY-MM-DD HH:MM" },
          tipo:         { type: "string", enum: ["Mostrar inmueble", "Valoración", "Sesión fotográfica", "Seguimiento"], description: "Tipo de visita" },
          contactId:    { type: "string", description: "ID del contacto que visita (opcional)" },
          comentarios:  { type: "string", description: "Notas o comentarios de la visita (opcional)" },
        },
        required: ["inmueble_ref", "fecha", "tipo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "vincular_lead_inmueble",
      description: "Vincula un lead a un inmueble concreto con el rol indicado (Comprador o Inquilino). Actualiza su ciclo de vida automáticamente.",
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "string" },
          inmueble_ref: { type: "string", description: "Referencia del inmueble (ej: A9755)" },
          tipo: { type: "string", enum: ["Comprador", "Inquilino", "Propietario"] },
        },
        required: ["contactId", "inmueble_ref", "tipo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_inmueble",
      description: "Busca un inmueble en la BD por nombre de calle, ref o zona. Devuelve id, ref, calle, estatus y precio. Úsalo cuando no encuentres el inmueble en el contexto CRM.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Nombre de calle, ref o zona del inmueble" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "actualizar_estatus_inmueble",
      description: "Cambia el estatus de un inmueble: Activo, Reservado, Vendido, Alquilado, Pendiente o Baja.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "string", description: "ID del inmueble (UUID)" },
          estatus:    { type: "string", enum: ["Activo", "Reservado", "Vendido", "Alquilado", "Pendiente", "Baja"] },
        },
        required: ["propertyId", "estatus"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "asignar_comercial",
      description: "Asigna un lead a un comercial. OBLIGATORIO antes de cualificar un lead. Si el lead ya tiene comercial asignado, informa de ello.",
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "string", description: "ID del contacto/lead (UUID)" },
          agenteId:  { type: "string", description: "ID del agente/comercial (UUID)" },
        },
        required: ["contactId", "agenteId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_email",
      description: "Envía un correo electrónico a un destinatario en nombre de El Sol Grupo.",
      parameters: {
        type: "object",
        properties: {
          destinatario: { type: "string", description: "Dirección de email del destinatario" },
          asunto:       { type: "string", description: "Asunto del correo" },
          cuerpo:       { type: "string", description: "Cuerpo del correo en texto plano" },
        },
        required: ["destinatario", "asunto", "cuerpo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "enviar_whatsapp",
      description: "Envía un mensaje de WhatsApp al número de teléfono indicado.",
      parameters: {
        type: "object",
        properties: {
          telefono: { type: "string", description: "Número (9 dígitos ES o formato internacional)" },
          mensaje: { type: "string", description: "Texto del mensaje" },
        },
        required: ["telefono", "mensaje"],
      },
    },
  },
];

// ── Tool executor ─────────────────────────────────────────────────────────────

async function ejecutarHerramienta(name: string, args: Record<string, string>): Promise<string> {
  const supa = getSupa();

  // ── buscar_lead ──────────────────────────────────────────────────────────────
  if (name === "buscar_lead") {
    const q = (args.query ?? "").toLowerCase().trim();
    if (!q) return "Consulta vacía.";
    const { data, error } = await supa
      .from("contacts")
      .select("id, nombre, telefono, email, ciclo_vida")
      .or(`nombre.ilike.%${q}%,telefono.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(5);
    if (error) return `Error al buscar: ${error.message}`;
    if (!data?.length) return `No se encontró ningún contacto con "${args.query}".`;
    return data
      .map((c: any) => `id=${c.id} | ${c.nombre} | tel=${c.telefono ?? "—"} | ${c.ciclo_vida}`)
      .join("\n");
  }

  // ── cualificar_lead ──────────────────────────────────────────────────────────
  if (name === "cualificar_lead") {
    const { contactId, tipo } = args;
    if (!contactId) return "Error: contactId requerido.";
    if (!["Comprador", "Inquilino", "Prospecto"].includes(tipo)) return "Error: tipo inválido.";

    // Verificar que el lead tiene comercial asignado antes de cualificar
    const { data: asignacion } = await supa
      .from("contact_agents")
      .select("agent_id")
      .eq("contact_id", contactId)
      .limit(1)
      .maybeSingle();

    if (!asignacion) {
      return "No se puede cualificar: este lead no tiene comercial asignado. Usa asignar_comercial primero y luego vuelve a cualificar.";
    }

    const cicloMap: Record<string, string> = {
      Comprador: "Cliente", Inquilino: "Cliente", Prospecto: "Prospecto",
    };
    const { error } = await supa
      .from("contacts")
      .update({ ciclo_vida: cicloMap[tipo], trabajado: "Contactado" })
      .eq("id", contactId);
    if (error) return `Error al actualizar: ${error.message}`;

    // Crear contact_role si no existe
    if (tipo === "Comprador" || tipo === "Inquilino") {
      const { data: ex } = await supa
        .from("contact_roles")
        .select("id")
        .eq("contact_id", contactId)
        .eq("tipo", tipo)
        .limit(1);
      if (!ex?.length) {
        await supa.from("contact_roles").insert([{ contact_id: contactId, tipo, estado: "Prospecto" }]);
      }
    }
    return `Lead cualificado como ${tipo} y ciclo de vida actualizado a "${cicloMap[tipo]}".`;
  }

  // ── archivar_lead ────────────────────────────────────────────────────────────
  if (name === "archivar_lead") {
    const { contactId } = args;
    if (!contactId) return "Error: contactId requerido.";
    const { error } = await supa
      .from("contacts")
      .update({ ciclo_vida: "Descartado", trabajado: "Descartado" })
      .eq("id", contactId);
    if (error) return `Error al archivar: ${error.message}`;
    return "Lead archivado como Descartado.";
  }

  // ── añadir_nota ──────────────────────────────────────────────────────────────
  if (name === "agregar_nota") {
    const { contactId, nota } = args;
    if (!contactId) return "Error: contactId requerido.";
    if (!nota?.trim()) return "Error: nota vacía.";

    // Obtener observaciones actuales para añadir sin borrar el historial
    const { data: contact, error: fetchErr } = await supa
      .from("contacts")
      .select("observaciones")
      .eq("id", contactId)
      .single();
    if (fetchErr) return `Error al obtener contacto: ${fetchErr.message}`;

    const nuevasObs = formatNota(nota, contact?.observaciones ?? "");
    const { error } = await supa
      .from("contacts")
      .update({ observaciones: nuevasObs })
      .eq("id", contactId);
    if (error) return `Error al guardar nota: ${error.message}`;
    return "Nota añadida correctamente con fecha y hora.";
  }

  // ── crear_visita ─────────────────────────────────────────────────────────────
  if (name === "crear_visita") {
    const { inmueble_ref, fecha, contactId, comentarios } = args;
    if (!inmueble_ref) return "Error: inmueble_ref requerido.";
    if (!fecha) return "Error: fecha requerida.";

    const propertyId = await resolvePropertyId(supa, inmueble_ref);
    if (!propertyId) return `No se encontró ningún inmueble con ref "${inmueble_ref}".`;

    const row: Record<string, unknown> = {
      fecha,
      estado: ESTADO_IN["Pendiente"],
      property_id: propertyId,
      tipo: args.tipo ?? "Mostrar inmueble",
    };
    if (contactId) row.contact_id = contactId;
    if (comentarios?.trim()) row.notas = toSentenceCase(comentarios.trim());

    const { data: inserted, error } = await supa
      .from("visits")
      .insert([row])
      .select("id")
      .single();
    if (error) return `Error al crear visita: ${error.message}`;

    return `Visita creada para el ${fecha} en inmueble ${inmueble_ref} (id: ${inserted.id}).`;
  }

  // ── vincular_lead_inmueble ───────────────────────────────────────────────────
  if (name === "vincular_lead_inmueble") {
    const { contactId, inmueble_ref, tipo } = args;
    if (!contactId) return "Error: contactId requerido.";
    if (!inmueble_ref) return "Error: inmueble_ref requerido.";
    if (!["Comprador", "Inquilino", "Propietario"].includes(tipo)) return "Error: tipo inválido.";

    const propertyId = await resolvePropertyId(supa, inmueble_ref);
    if (!propertyId) return `No se encontró ningún inmueble con ref "${inmueble_ref}".`;

    // Eliminar rol previo del mismo tipo para evitar duplicados
    await supa
      .from("contact_roles")
      .delete()
      .eq("contact_id", contactId)
      .eq("property_id", propertyId)
      .eq("tipo", tipo);

    const { error } = await supa.from("contact_roles").insert({
      contact_id: contactId,
      property_id: propertyId,
      tipo,
      estado: "Prospecto",
    });
    if (error) return `Error al vincular: ${error.message}`;

    // Actualizar ciclo_vida del contacto
    const ciclo = ["Comprador", "Inquilino", "Propietario"].includes(tipo) ? "Cliente" : "Prospecto";
    const { error: cicloErr } = await supa.from("contacts").update({ ciclo_vida: ciclo }).eq("id", contactId);
    if (cicloErr) return `Vinculado pero error al actualizar ciclo_vida: ${cicloErr.message}`;

    return `Lead vinculado al inmueble ${inmueble_ref} como ${tipo}.`;
  }

  // ── buscar_inmueble ──────────────────────────────────────────────────────────
  if (name === "buscar_inmueble") {
    const q = (args.query ?? "").trim();
    if (!q) return "Consulta vacía.";
    const { data, error } = await supa
      .from("properties")
      .select("id, ref, calle, barrio, localidad, tipo, estatus, precio, precio_final")
      .or(`calle.ilike.%${q}%,ref.ilike.%${q}%,barrio.ilike.%${q}%,localidad.ilike.%${q}%`)
      .neq("estatus", "Baja")
      .limit(5);
    if (error) return `Error al buscar: ${error.message}`;
    if (!data?.length) return `No se encontró ningún inmueble con "${q}".`;
    return data.map((p: any) => {
      const precio = p.precio_final ?? p.precio;
      return `id=${p.id} | ${cleanRef(p.ref ?? "?")} | ${p.calle ?? "?"} | ${[p.barrio, p.localidad].filter(Boolean).join(", ")} | ${p.tipo} | ${precio ? Math.round(precio / 1000) + "k" : "?"} | ${p.estatus}`;
    }).join("\n");
  }

  // ── actualizar_estatus_inmueble ───────────────────────────────────────────────
  if (name === "actualizar_estatus_inmueble") {
    const { propertyId, estatus } = args;
    if (!propertyId) return "Error: propertyId requerido.";
    const valid = ["Activo", "Reservado", "Vendido", "Alquilado", "Pendiente", "Baja"];
    if (!valid.includes(estatus)) return `Error: estatus inválido. Valores permitidos: ${valid.join(", ")}.`;

    // Campos de fecha a actualizar según el nuevo estatus
    const extra: Record<string, unknown> = {};
    const today = new Date().toISOString().slice(0, 10);
    if (estatus === "Reservado") extra.fecha_reserva = today;
    if (estatus === "Vendido" || estatus === "Alquilado") extra.fecha_escritura = today;

    const { error } = await supa
      .from("properties")
      .update({ estatus, ...extra })
      .eq("id", propertyId);
    if (error) return `Error al actualizar: ${error.message}`;
    return `Inmueble actualizado a "${estatus}" correctamente.`;
  }

  // ── asignar_comercial ────────────────────────────────────────────────────────
  if (name === "asignar_comercial") {
    const { contactId, agenteId } = args;
    if (!contactId) return "Error: contactId requerido.";
    if (!agenteId)  return "Error: agenteId requerido.";

    const { data: existing } = await supa
      .from("contact_agents")
      .select("agent_id")
      .eq("contact_id", contactId)
      .eq("agent_id", agenteId)
      .maybeSingle();

    if (existing) return "Este lead ya está asignado a ese comercial.";

    const { error } = await supa
      .from("contact_agents")
      .insert({ contact_id: contactId, agent_id: agenteId });

    if (error) return `Error al asignar: ${error.message}`;
    return "Lead asignado al comercial correctamente. Ahora puedes cualificarlo.";
  }

  // ── enviar_email ─────────────────────────────────────────────────────────────
  if (name === "enviar_email") {
    const { destinatario, asunto, cuerpo } = args;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario ?? "")) return "Error: dirección de email inválida.";
    if (!asunto?.trim()) return "Error: asunto vacío.";
    if (!cuerpo?.trim()) return "Error: cuerpo vacío.";

    const key = process.env.RESEND_API_KEY;
    if (!key) return "Error: RESEND_API_KEY no configurada.";

    const resend = new Resend(key);
    const html = cuerpo.trim().split("\n").map((l) => `<p>${l}</p>`).join("");

    const { error } = await resend.emails.send({
      from: "SilvIA · El Sol Grupo <onboarding@resend.dev>",
      to: destinatario,
      subject: asunto,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:auto">${html}<hr style="margin-top:32px;border:none;border-top:1px solid #eee"/><p style="color:#999;font-size:12px">El Sol Grupo · CRM Inmobiliario</p></div>`,
    });

    if (error) return `Error al enviar email: ${error.message}`;
    return `Email enviado a ${destinatario}.`;
  }

  // ── enviar_whatsapp ──────────────────────────────────────────────────────────
  if (name === "enviar_whatsapp") {
    const { telefono, mensaje } = args;
    if (!telefono) return "Error: teléfono requerido.";
    if (!mensaje?.trim()) return "Error: mensaje vacío.";

    const phoneNumberId = process.env.WABA_PHONE_NUMBER_ID;
    const token = process.env.WABA_ACCESS_TOKEN;
    if (!phoneNumberId || !token) return "Error: credenciales WABA no configuradas.";

    let to = telefono.replace(/\D/g, "");
    if (to.length === 9 && (to.startsWith("6") || to.startsWith("7") || to.startsWith("9"))) {
      to = "34" + to;
    }
    if (to.length < 10) return `Error: número de teléfono inválido (${telefono}).`;

    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: mensaje },
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as any;
      const msg = body?.error?.message ?? `HTTP ${res.status}`;
      const code = body?.error?.code;
      return `Error WhatsApp${code ? ` [${code}]` : ""}: ${msg}`;
    }
    return `WhatsApp enviado a ${telefono}.`;
  }

  return `Herramienta desconocida: ${name}`;
}

// ── CRM context cache (2 min TTL) ─────────────────────────────────────────────

const CACHE_TTL = 2 * 60 * 1000;
let _crmCache: { data: string; ts: number } | null = null;

async function buildCrmContext(): Promise<string> {
  if (_crmCache && Date.now() - _crmCache.ts < CACHE_TTL) return _crmCache.data;

  const supa = getSupa();
  const today = new Date();

  const [propResult, leadsResult, visitsResult, agentsResult] = await Promise.all([
    supa
      .from("properties")
      .select("ref, calle, barrio, localidad, tipo, habitaciones, precio, precio_final, estatus, es_alquiler, fecha_inicio")
      .in("estatus", ["Activo", "Reservado", "Pendiente"])
      .order("fecha_inicio", { ascending: false }),

    supa
      .from("contacts")
      .select("id, nombre, telefono, solicitud, motivo, ciclo_vida, created_at, contact_agents(agents(id, nombre))")
      .in("ciclo_vida", ["Lead", "Prospecto"])
      .order("created_at", { ascending: false })
      .limit(MAX_LEADS),

    supa
      .from("visits")
      .select("fecha, estado, notas")
      .in("estado", ["Pendiente", "Confirmada", "Programada"])
      .gte("fecha", today.toISOString().slice(0, 10))
      .order("fecha", { ascending: true })
      .limit(10),

    supa
      .from("agents")
      .select("id, nombre")
      .eq("activo", true),
  ]);

  const props  = propResult.data  ?? [];
  const leads  = leadsResult.data ?? [];
  const visits = visitsResult.data ?? [];
  const agents = agentsResult.data ?? [];

  const venta    = props.filter((p: any) => !p.es_alquiler).slice(0, MAX_VENTA);
  const alquiler = props.filter((p: any) => p.es_alquiler).slice(0, MAX_ALQUILER);

  function dias(iso: string | null): string {
    if (!iso) return "?";
    return String(Math.floor((today.getTime() - new Date(iso).getTime()) / 86400000));
  }
  function precio(p: any): string {
    const v = p.precio_final ?? p.precio;
    return v ? `${Math.round(v / 1000)}k` : "?";
  }

  function zona(p: any): string {
    const parts = [p.barrio, p.localidad].filter(Boolean);
    return parts.join(", ") || "?";
  }

  function calle(p: any): string {
    return (p.calle ?? "").slice(0, 20) || "?";
  }

  const ventaLines = venta.map((p: any) =>
    `${cleanRef(p.ref ?? "?")}|${calle(p)}|${zona(p)}|${p.tipo ?? "?"}|${p.habitaciones ?? "?"}h|${precio(p)}|${p.estatus}|${dias(p.fecha_inicio)}d`
  ).join("\n");

  const alqLines = alquiler.map((p: any) =>
    `${cleanRef(p.ref ?? "?")}|${calle(p)}|${zona(p)}|${p.tipo ?? "?"}|${p.habitaciones ?? "?"}h|${precio(p)}/m|${p.estatus}`
  ).join("\n");

  // contactId incluido para que la IA pueda actuar sin necesitar buscar_lead
  const leadsLines = leads.map((c: any) => {
    const sol = (c.solicitud || c.motivo || "").slice(0, 70);
    const tel = (c.telefono ?? "").replace(/\s/g, "") || "—";
    const agente = (c.contact_agents?.[0]?.agents?.nombre as string | undefined);
    const asignado = agente ? `asignado:${agente}` : "asignado:NO";
    return `${c.id}|${c.nombre}|${tel}|${sol}|${asignado}`;
  }).join("\n");

  const agentsLines = agents.map((a: any) => `${a.id}|${a.nombre}`).join("\n");

  const visitLines = visits.map((v: any) =>
    `${v.fecha?.slice(0, 10)}|${v.estado}|${(v.notas ?? "").slice(0, 40)}`
  ).join("\n");

  const sections = [
    `=VENTA(${venta.length})= ref|calle|zona|tipo|hab|precio|estatus|días\n${ventaLines || "Sin datos"}`,
    `=ALQUILER(${alquiler.length})= ref|calle|zona|tipo|hab|precio/m|estatus\n${alqLines || "Sin datos"}`,
    `=LEADS(${leads.length})= contactId|nombre|tel|solicitud|asignación\n${leadsLines || "Sin datos"}`,
    `=COMERCIALES(${agents.length})= agenteId|nombre\n${agentsLines || "Sin datos"}`,
  ];
  if (visits.length) sections.push(`=VISITAS PRÓXIMAS(${visits.length})=\n${visitLines}`);

  const result = sections.join("\n\n");
  _crmCache = { data: result, ts: Date.now() };
  return result;
}

// ── Server function ───────────────────────────────────────────────────────────

type ChatMessage = { role: "user" | "assistant"; content: string };

export const askSilvia = createServerFn({ method: "POST" })
  .inputValidator((d: { messages: ChatMessage[] }) => {
    if (!Array.isArray(d?.messages) || !d.messages.length) throw new Error("Sin mensajes");
    const last = d.messages[d.messages.length - 1];
    if (last.role !== "user" || !last.content.trim()) throw new Error("Último mensaje inválido");
    return d;
  })
  .handler(async ({ data }) => {
  await requireAuth();
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY no configurada");

    const [client, crmContext] = await Promise.all([
      Promise.resolve(new OpenAI({ apiKey: key })),
      buildCrmContext(),
    ]);

    const systemMsg: OpenAI.Chat.Completions.ChatCompletionMessageParam = {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\n${crmContext}`,
    };

    const history = data.messages.slice(-MAX_HISTORY) as OpenAI.Chat.Completions.ChatCompletionMessageParam[];
    const conversationMsgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [...history];

    // Bucle agéntico — máximo MAX_TOOL_ROUNDS rondas de herramientas
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.chat.completions.create({
        model: MODEL,
        max_completion_tokens: MAX_TOKENS,
        tools: TOOLS,
        tool_choice: "auto",
        messages: [systemMsg, ...conversationMsgs],
      });

      const choice = response.choices[0];
      conversationMsgs.push(choice.message as OpenAI.Chat.Completions.ChatCompletionMessageParam);

      // Sin tool calls → respuesta final
      if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls?.length) {
        return { reply: choice.message.content ?? "" };
      }

      // Ejecutar todas las herramientas en paralelo
      const toolResults = await Promise.all(
        choice.message.tool_calls.map(async (tc: any) => {
          let args: Record<string, string> = {};
          try {
            args = JSON.parse(tc.function?.arguments ?? "{}") as Record<string, string>;
          } catch {
            return { tool_call_id: tc.id, result: "Error: argumentos JSON malformados." };
          }
          const result = await ejecutarHerramienta(tc.function?.name ?? "", args);
          return { tool_call_id: tc.id, result };
        })
      );

      for (const tr of toolResults) {
        conversationMsgs.push({
          role: "tool",
          tool_call_id: tr.tool_call_id,
          content: tr.result,
        } as OpenAI.Chat.Completions.ChatCompletionMessageParam);
      }
    }

    return { reply: "Acciones ejecutadas." };
  });
