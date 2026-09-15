// M-03: extraído de mutations.functions.ts.
import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toSentenceCase } from "./format";
import { requirePermission } from "@/lib/crm-auth.server";
import { strOpt, arrOpt } from "./mutations-shared";

export type CreateVisitaPayload = {
  fecha: string;
  estado?: string;
  comentarios?: string;
  inmueblesIds: string[];
  clientesIds?: string[];
  agentesIds?: string[];
};

// Validación de "estado de visita permitido", compartida por createVisita y
// updateVisitaEstado (antes duplicada como ESTADO_IN_MAP/ESTADO_IN_MAP_UPDATE,
// idénticas byte a byte — unificado 14 sep 2026).
const ESTADO_VISITA_VALIDOS: Record<string, string> = {
  Programada: "Programada",
  Realizada: "Realizada",
  Cancelada: "Cancelada",
};

export const createVisita = createServerFn({ method: "POST" })
  .validator((d: CreateVisitaPayload) => {
    if (!d?.fecha) throw new Error("Fecha requerida");
    if (!Array.isArray(d.inmueblesIds) || d.inmueblesIds.length === 0)
      throw new Error("Selecciona al menos un inmueble");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("visits.create");
    const supa = getSupa();
    const estadoRaw = strOpt(data.estado) ?? "Programada";
    if (!Object.prototype.hasOwnProperty.call(ESTADO_VISITA_VALIDOS, estadoRaw)) {
      throw new Error("Estado de visita inválido");
    }
    const com = strOpt(data.comentarios);
    const cli = arrOpt(data.clientesIds);
    const ag = arrOpt(data.agentesIds);
    const notas = com ? toSentenceCase(com) : null;
    const contactId = cli?.length ? cli[0] : null;
    const agenteId = ag?.length ? ag[0] : null;

    // El diálogo permite seleccionar varios inmuebles a la vez ("Seleccionados:
    // N"), pero cada fila de `visits` es un inmueble por visita — antes solo
    // se guardaba data.inmueblesIds[0] y el resto se descartaba en silencio
    // (auditoría 12 sep 2026). Se crea una visita por inmueble seleccionado,
    // con el mismo cliente/agente/fecha/notas en todas.
    const ids: string[] = [];
    for (const propertyId of data.inmueblesIds) {
      // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
      const { data: visitaId, error } = await supa.rpc("crm_crear_visita", {
        p_fecha: data.fecha,
        p_estado: ESTADO_VISITA_VALIDOS[estadoRaw] ?? "Programada",
        p_notas: notas,
        p_property_id: propertyId,
        p_contact_id: contactId,
        p_agente_id: agenteId,
        p_actor_id: crm.userId,
      });
      if (error) throw new Error(error.message);
      ids.push(visitaId as string);
    }
    return { id: ids[0], ids };
  });

export type UpdateVisitaPayload = {
  visitaId: string;
  fecha: string;
  inmuebleId: string;
  clienteId?: string | null;
  agenteId?: string | null;
  notas?: string;
};

export const updateVisita = createServerFn({ method: "POST" })
  .validator((d: UpdateVisitaPayload) => {
    if (!d?.visitaId) throw new Error("visitaId requerido");
    if (!d?.fecha) throw new Error("Fecha requerida");
    if (!d?.inmuebleId) throw new Error("Selecciona un inmueble");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("visits.update");
    const supa = getSupa();
    const notas = strOpt(data.notas);
    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_actualizar_visita", {
      p_visita_id: data.visitaId,
      p_fecha: data.fecha,
      p_property_id: data.inmuebleId,
      p_contact_id: data.clienteId || null,
      p_agente_id: data.agenteId || null,
      p_notas: notas ? toSentenceCase(notas) : null,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteVisita = createServerFn({ method: "POST" })
  .validator((d: { visitaId: string }) => {
    if (!d?.visitaId) throw new Error("visitaId requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("visits.delete");
    const supa = getSupa();
    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_eliminar_visita", {
      p_visita_id: data.visitaId,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateVisitaEstado = createServerFn({ method: "POST" })
  .validator((d: { visitaId: string; estado: string }) => {
    if (!d?.visitaId) throw new Error("visitaId requerido");
    if (!d?.estado) throw new Error("estado requerido");
    if (!Object.prototype.hasOwnProperty.call(ESTADO_VISITA_VALIDOS, d.estado)) {
      throw new Error("Estado de visita inválido");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("visits.update");
    const supa = getSupa();
    const dbEstado = ESTADO_VISITA_VALIDOS[data.estado] ?? data.estado;
    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_actualizar_visita_estado", {
      p_visita_id: data.visitaId,
      p_estado: dbEstado,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
