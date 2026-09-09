// M-03: extraído de mutations.functions.ts.
import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toSentenceCase } from "./format";
import { requirePermission, requirePermissions } from "@/lib/crm-auth.server";
import { strOpt, tipoCicloVida } from "./mutations-shared";

export const ESTADOS_SEGUIMIENTO = ["Pendiente", "Contactado", "Descartado"] as const;
export type EstadoSeguimiento = (typeof ESTADOS_SEGUIMIENTO)[number];

export type SeguimientoPayload = {
  clienteId: string;
  estado?: EstadoSeguimiento;
  nota?: string;
  observacionesActuales?: string;
  tipo?: string;
};

export const updateClienteSeguimiento = createServerFn({ method: "POST" })
  .validator((d: SeguimientoPayload) => {
    if (!d?.clienteId) throw new Error("Cliente requerido");
    if (!d.estado && !d.nota && !d.tipo) throw new Error("Nada que actualizar");
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

export const asociarLeadAInmueble = createServerFn({ method: "POST" })
  .validator((d: { contactId: string; propertyId: string; tipo: string }) => {
    if (!d?.contactId) throw new Error("contactId requerido");
    if (!d?.propertyId) throw new Error("propertyId requerido");
    if (!d?.tipo) throw new Error("tipo requerido");
    if (!["Propietario", "Comprador", "Inquilino"].includes(d.tipo)) {
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
    const conditions: string[] = [];
    if (data.email?.trim()) conditions.push(`email.eq.${data.email.trim().toLowerCase()}`);
    if (data.telefono?.trim()) conditions.push(`telefono.eq.${data.telefono.trim()}`);
    if (!conditions.length) return { duplicates: [] };
    const { data: rows } = await supa
      .from("contacts")
      .select("id, nombre, email, telefono, ciclo_vida")
      .or(conditions.join(","))
      .limit(3);
    return { duplicates: rows ?? [] };
  });

export const sendWhatsAppReply = createServerFn({ method: "POST" })
  .validator((d: { phone: string; message: string }) => {
    if (!d?.phone?.trim()) throw new Error("Teléfono requerido");
    if (!d?.message?.trim()) throw new Error("Mensaje requerido");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermission("whatsapp.send");
    const phoneNumberId = process.env.WABA_PHONE_NUMBER_ID;
    const token = process.env.WABA_ACCESS_TOKEN;
    if (!phoneNumberId || !token)
      throw new Error("Integración WhatsApp no disponible en este entorno");

    // Normalize to E.164 without +: strip non-digits, then ensure country code
    let to = data.phone.replace(/\D/g, "");
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

    return { ok: true, messageId: body.messages?.[0]?.id };
  });
