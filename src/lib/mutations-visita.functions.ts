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

// Nota: idéntico a ESTADO_IN_MAP_UPDATE de abajo (usado por updateVisitaEstado)
// -- son solo la validación de "estado de visita permitido", duplicada en el
// archivo original antes de esta extracción. No se unifica aquí a propósito
// (misma cautela que moneyShort en dashboard-format/bandeja-format: no tocar
// duplicación preexistente sin decidirlo explícitamente).
const ESTADO_IN_MAP: Record<string, string> = {
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
    if (!Object.prototype.hasOwnProperty.call(ESTADO_IN_MAP, estadoRaw)) {
      throw new Error("Estado de visita inválido");
    }
    const com = strOpt(data.comentarios);
    const cli = arrOpt(data.clientesIds);
    const ag = arrOpt(data.agentesIds);

    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
    const { data: visitaId, error } = await supa.rpc("crm_crear_visita", {
      p_fecha: data.fecha,
      p_estado: ESTADO_IN_MAP[estadoRaw] ?? "Programada",
      p_notas: com ? toSentenceCase(com) : null,
      p_property_id: data.inmueblesIds[0],
      p_contact_id: cli?.length ? cli[0] : null,
      p_agente_id: ag?.length ? ag[0] : null,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { id: visitaId as string };
  });

const ESTADO_IN_MAP_UPDATE: Record<string, string> = {
  Programada: "Programada",
  Realizada: "Realizada",
  Cancelada: "Cancelada",
};

export const updateVisitaEstado = createServerFn({ method: "POST" })
  .validator((d: { visitaId: string; estado: string }) => {
    if (!d?.visitaId) throw new Error("visitaId requerido");
    if (!d?.estado) throw new Error("estado requerido");
    if (!Object.prototype.hasOwnProperty.call(ESTADO_IN_MAP_UPDATE, d.estado)) {
      throw new Error("Estado de visita inválido");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("visits.update");
    const supa = getSupa();
    const dbEstado = ESTADO_IN_MAP_UPDATE[data.estado] ?? data.estado;
    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_actualizar_visita_estado", {
      p_visita_id: data.visitaId,
      p_estado: dbEstado,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
