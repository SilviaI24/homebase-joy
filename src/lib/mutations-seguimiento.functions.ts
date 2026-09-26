// M-03: extraído de mutations.functions.ts.
import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toSentenceCase } from "./format";
import { requirePermission, requirePermissions } from "@/lib/crm-auth.server";
import { strOpt, tipoCicloVida } from "./mutations-shared";
import { FUENTES, MOTIVOS_DESCARTE, type Fuente, type MotivoDescarte } from "./contactos-format";

export const ESTADOS_SEGUIMIENTO = ["Pendiente", "Contactado", "Descartado"] as const;
export type EstadoSeguimiento = (typeof ESTADOS_SEGUIMIENTO)[number];

export type SeguimientoPayload = {
  clienteId: string;
  estado?: EstadoSeguimiento;
  nota?: string;
  observacionesActuales?: string;
  tipo?: string;
};

// Mismo vocabulario que reconoce tipoCicloVida() en mutations-shared.ts —
// aquí se usa para RECHAZAR un `tipo` desconocido en vez de dejar que
// tipoCicloVida() lo mapee en silencio a "Lead" por defecto (eso degradaba
// un Cliente a Lead ante cualquier valor mal escrito).
const TIPO_PATRONES_VALIDOS = ["anular", "prospecc"];
const TIPO_EXACTOS_VALIDOS = [
  "propietario",
  "comprador",
  "inquilino",
  "interesado alquiler",
  "interesado propiedades",
];
function esTipoSeguimientoValido(tipo: string): boolean {
  const t = tipo.toLowerCase();
  return TIPO_PATRONES_VALIDOS.some((p) => t.includes(p)) || TIPO_EXACTOS_VALIDOS.includes(t);
}

export const updateClienteSeguimiento = createServerFn({ method: "POST" })
  .validator((d: SeguimientoPayload) => {
    if (!d?.clienteId) throw new Error("Cliente requerido");
    if (!d.estado && !d.nota && !d.tipo) throw new Error("Nada que actualizar");
    if (d.estado && !ESTADOS_SEGUIMIENTO.includes(d.estado)) {
      throw new Error(`Estado de seguimiento inválido: "${d.estado}"`);
    }
    if (d.tipo && !esTipoSeguimientoValido(d.tipo)) {
      throw new Error(`Tipo de seguimiento no reconocido: "${d.tipo}"`);
    }
    return d;
  })
  .handler(async ({ data }) => {
    const roleTypes = ["Propietario", "Comprador", "Inquilino"];
    const { crm } = await requirePermission("contacts.update");
    if (data.tipo && roleTypes.includes(data.tipo)) {
      await requirePermission("contact_roles.create");
    }
    if (data.nota?.trim()) {
      await requirePermission("seguimiento.create");
    }
    const supa = getSupa();

    // trabajado/ciclo_vida se resuelven aquí igual que antes (mapeos de
    // texto puros, sin acceso a datos) -- el RPC hace la comprobación de
    // "comercial asignado", la escritura y la nota de seguimiento, todo en
    // una transacción, con el actor real fijado antes de escribir (H-05).
    let trabajado = strOpt(data.estado) ?? null;
    let cicloVida: string | null = null;
    if (data.tipo) {
      cicloVida = tipoCicloVida(data.tipo);
      if (data.tipo.toLowerCase().includes("anular")) trabajado = "Descartado";
    }
    const tipoRol = data.tipo && roleTypes.includes(data.tipo) ? data.tipo : null;
    const nota = strOpt(data.nota);

    const { error } = await supa.rpc("crm_actualizar_seguimiento_cliente", {
      p_contact_id: data.clienteId,
      p_trabajado: trabajado,
      p_ciclo_vida: cicloVida,
      p_tipo_rol: tipoRol,
      p_nota: nota ? toSentenceCase(nota) : null,
      p_agente_id: crm.agentId,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const TIPOS_INTERES = ["Compra", "Alquiler", "Prospeccion"] as const;
export type TipoInteres = (typeof TIPOS_INTERES)[number];

// Etiqueta de triage previa a la cualificación oficial (el flujo de arriba,
// que exige comercial para Comprador/Inquilino) -- sin gates, se puede fijar
// en cualquier momento desde la Bandeja. No toca trabajado ni ciclo_vida:
// "cualificado" (a efectos del filtro estricto del Kanban de Leads, ver
// listLeads) es la conjunción de asignado + interés indicado, no un campo
// propio -- trabajado sigue siendo solo el estado de la cola de llamadas del
// comercial (decisión de David, 22 sep 2026, tras probar en vivo que fijarlo
// aquí sacaba el lead de "Pendientes" antes de que nadie lo hubiera llamado).
export const marcarTipoInteresLead = createServerFn({ method: "POST" })
  .validator((d: { contactId: string; tipoInteres: TipoInteres }) => {
    if (!d?.contactId) throw new Error("contactId requerido");
    if (!TIPOS_INTERES.includes(d?.tipoInteres)) throw new Error("Tipo de interés inválido");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("contacts.update");
    const supa = getSupa();
    const { error } = await supa.rpc("crm_marcar_tipo_interes_lead", {
      p_contact_id: data.contactId,
      p_tipo_interes: data.tipoInteres,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const descartarLead = createServerFn({ method: "POST" })
  .validator((d: { contactId: string; motivo: MotivoDescarte }) => {
    if (!d?.contactId) throw new Error("contactId requerido");
    if (!MOTIVOS_DESCARTE.some((m) => m.value === d?.motivo)) {
      throw new Error("Motivo de descarte no válido");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("contacts.update");
    const supa = getSupa();
    const { error } = await supa.rpc("crm_descartar_lead", {
      p_contact_id: data.contactId,
      p_motivo: data.motivo,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// null = "no sabemos de dónde vino" (se puede corregir una fuente mal puesta).
export const marcarFuenteLead = createServerFn({ method: "POST" })
  .validator((d: { contactId: string; fuente: Fuente | null }) => {
    if (!d?.contactId) throw new Error("contactId requerido");
    if (d.fuente !== null && !FUENTES.includes(d.fuente)) throw new Error("Fuente no válida");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("contacts.update");
    const supa = getSupa();
    const { error } = await supa.rpc("crm_marcar_fuente_lead", {
      p_contact_id: data.contactId,
      p_fuente: data.fuente,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const asociarLeadAInmueble = createServerFn({ method: "POST" })
  .validator((d: { contactId: string; propertyId: string; tipo: string }) => {
    if (!d?.contactId) throw new Error("contactId requerido");
    if (!d?.propertyId) throw new Error("propertyId requerido");
    if (!d?.tipo) throw new Error("tipo requerido");
    if (!["Propietario", "Comprador", "Inquilino", "Interesado"].includes(d.tipo)) {
      throw new Error("Tipo de relación inválido");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermissions(
      "contacts.update",
      "contact_roles.create",
      "properties.read",
    );
    const supa = getSupa();
    // H-05: vía RPC (resuelve es_alquiler/tipoRelacion, inserta el rol si no
    // existe, y actualiza ciclo_vida, todo en una transacción) para que el
    // actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_asociar_lead_inmueble", {
      p_contact_id: data.contactId,
      p_property_id: data.propertyId,
      p_tipo: data.tipo,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const checkDuplicates = createServerFn({ method: "GET" })
  .validator((d: { email?: string; telefono?: string }) => d)
  .handler(async ({ data }) => {
    await requirePermission("contacts.read");
    const supa = getSupa();
    const email = data.email?.trim().toLowerCase();
    const telefono = data.telefono?.trim();
    if (!email && !telefono) return { duplicates: [] };

    // Dos .eq() en vez de un .or() con el texto del cliente interpolado a
    // mano: el .or() dejaba inyectar condiciones arbitrarias (p. ej. un
    // email "x,dni.not.is.null") y además rompía con teléfonos que llevan
    // coma o paréntesis. .eq() pasa el valor como parámetro, sin ese riesgo.
    type DuplicadoRow = {
      id: string;
      nombre: string;
      email: string | null;
      telefono: string | null;
      ciclo_vida: string;
    };
    const cols = "id, nombre, email, telefono, ciclo_vida";
    const byId = new Map<string, DuplicadoRow>();
    // C3 (auditoría de altas, 26 sep 2026): la comparación exacta no veía
    // "Ana@Mail.com" frente a "ana@mail.com" ni "+34 600 11 22 33" frente a
    // "600112233" — el aviso de duplicado no salía y se creaba el contacto
    // repetido. Ahora se normalizan ambos lados.
    if (email) {
      // ilike sin comodines = igualdad sin distinguir mayúsculas en el lado
      // guardado (el introducido ya va en minúsculas). Se escapan % y _
      // para que un email con "_" no actúe como comodín.
      const patron = email.replace(/[\\%_]/g, (c) => `\\${c}`);
      const { data: rows } = await supa
        .from("contacts")
        .select(cols)
        .ilike("email", patron)
        .limit(3)
        .returns<DuplicadoRow[]>();
      for (const row of rows ?? []) byId.set(row.id, row);
    }
    if (telefono) {
      // crm_contacto_por_telefono (la misma que usa SilvIA para reconocer a
      // quien escribe) compara en SQL los 9 últimos dígitos de ambos lados:
      // ignora espacios, guiones, paréntesis y el prefijo +34/0034. Devuelve
      // el contacto más relevante (no descartado, más reciente); basta para
      // el aviso. Exige al menos 9 dígitos, así que no salta con un número
      // a medio escribir.
      const { data: contactId } = await supa.rpc("crm_contacto_por_telefono", {
        p_telefono: telefono,
      });
      if (typeof contactId === "string" && !byId.has(contactId)) {
        const { data: row } = await supa
          .from("contacts")
          .select(cols)
          .eq("id", contactId)
          .maybeSingle<DuplicadoRow>();
        if (row) byId.set(row.id, row);
      }
    }
    return { duplicates: Array.from(byId.values()).slice(0, 3) };
  });

const SILVIA_PAUSA_HORAS = 12;

export const sendWhatsAppReply = createServerFn({ method: "POST" })
  .validator((d: { contactId: string; message: string }) => {
    if (!d?.contactId?.trim()) throw new Error("Contacto requerido");
    if (!d?.message?.trim()) throw new Error("Mensaje requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("whatsapp.send");
    const phoneNumberId = process.env.WABA_PHONE_NUMBER_ID;
    const token = process.env.WABA_ACCESS_TOKEN;
    if (!phoneNumberId || !token)
      throw new Error("Integración WhatsApp no disponible en este entorno");

    const supa = getSupa();
    // El teléfono se resuelve aquí, en el servidor, a partir del contacto —
    // ya no se acepta libre desde el cliente. Antes se podía enviar desde la
    // línea oficial de WABA a cualquier número sin vincularlo a un contacto
    // real ni dejar rastro (auditoría 9 sep 2026).
    const { data: contacto, error: contactoError } = await supa
      .from("contacts")
      .select("telefono")
      .eq("id", data.contactId)
      .maybeSingle();
    if (contactoError) throw new Error(contactoError.message);
    if (!contacto?.telefono) throw new Error("El contacto no tiene teléfono registrado");

    // Normalize to E.164 without +: strip non-digits, then ensure country code
    let to = contacto.telefono.replace(/\D/g, "");
    // If it's a 9-digit Spanish number without country code, prepend 34
    if (to.length === 9 && (to.startsWith("6") || to.startsWith("7") || to.startsWith("9"))) {
      to = "34" + to;
    }

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: data.message },
    };

    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
    };

    if (!res.ok) {
      const msg = body?.error?.message ?? `Error HTTP ${res.status}`;
      const code = body?.error?.code ?? "";
      throw new Error(code ? `[${code}] ${msg}` : msg);
    }

    // Deja rastro del envío — mismo RPC que createSeguimiento (H-05: actor
    // real en audit_log). Un fallo aquí no debe deshacer un WhatsApp que ya
    // salió de verdad, así que se registra en un solo log en vez de lanzar.
    const { error: logError } = await supa.rpc("crm_crear_seguimiento", {
      p_contact_id: data.contactId,
      p_tipo: "WhatsApp",
      p_texto: data.message,
      p_agente_id: crm.agentId ?? null,
      p_actor_id: crm.userId,
    });
    if (logError) {
      console.error("crm_crear_seguimiento (whatsapp):", logError.message);
    }

    // Una persona ha tomado la conversación: SilvIA (whatsapp-silvia) se calla
    // con este contacto durante SILVIA_PAUSA_HORAS para no pisarse con ella, y
    // el mensaje queda en el mismo hilo que ve SilvIA. Igual que arriba, un
    // fallo aquí no deshace un mensaje ya enviado.
    const ahora = new Date();
    const { data: conv } = await supa
      .from("conversaciones")
      .select("id")
      .eq("contact_id", data.contactId)
      .eq("canal", "WhatsApp")
      .gte("updated_at", new Date(ahora.getTime() - 24 * 3600 * 1000).toISOString())
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle();
    const [{ error: msgError }, { error: pausaError }] = await Promise.all([
      supa.from("whatsapp_mensajes").insert({
        wamid: body.messages?.[0]?.id ?? null,
        contact_id: data.contactId,
        conversacion_id: conv?.id ?? null,
        direccion: "saliente",
        autor: "comercial",
        texto: data.message,
        estado_envio: "enviado",
      }),
      supa
        .from("contacts")
        .update({
          silvia_pausada_hasta: new Date(
            ahora.getTime() + SILVIA_PAUSA_HORAS * 3600 * 1000,
          ).toISOString(),
        })
        .eq("id", data.contactId),
    ]);
    if (msgError || pausaError) {
      console.error("whatsapp manual (hilo/pausa):", msgError?.message ?? pausaError?.message);
    }

    return { ok: true, messageId: body.messages?.[0]?.id };
  });
