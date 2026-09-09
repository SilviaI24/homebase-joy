// M-03: extraído de mutations.functions.ts.
import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toTitleCase } from "./format";
import { requirePermission, requirePermissions } from "@/lib/crm-auth.server";
import { strOpt, numOpt, arrOpt } from "./mutations-shared";

export type AssignClientePayload = {
  clienteId: string;
  agentesIds: string[];
};

export const assignClienteAgentes = createServerFn({ method: "POST" })
  .validator((d: AssignClientePayload) => {
    if (!d?.clienteId) throw new Error("Cliente requerido");
    if (!Array.isArray(d.agentesIds)) throw new Error("Agentes inválidos");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("contacts.update");
    const supa = getSupa();
    // H-05: vía RPC (borra + inserta en la misma transacción) para que el
    // actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_asignar_agentes_cliente", {
      p_contact_id: data.clienteId,
      p_agente_ids: data.agentesIds.length ? data.agentesIds : null,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ActivarProspectoPayload = {
  contactId: string;
  propertyId?: string;
};

export type CreateProspectoManualPayload = {
  nombre: string;
  telefono?: string;
  email?: string;
  tipo: string;
  calle: string;
  numero?: string;
  localidad?: string;
  precio?: number;
  superficie?: number;
  habitaciones?: number;
  agentesIds?: string[];
};

export const createProspectoManual = createServerFn({ method: "POST" })
  .validator((d: CreateProspectoManualPayload) => {
    if (!d?.nombre?.trim()) throw new Error("Nombre del propietario requerido");
    if (!d?.tipo?.trim()) throw new Error("Tipo de inmueble requerido");
    if (!d?.calle?.trim()) throw new Error("Calle requerida");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermissions(
      "contacts.create",
      "properties.create",
      "properties.publish",
      "contact_roles.create",
    );
    const supa = getSupa();
    const requestedAgents = arrOpt(data.agentesIds);
    const agentIds = requestedAgents?.length ? requestedAgents : crm.agentId ? [crm.agentId] : [];
    const isAlq = /^\s*alquiler/i.test(data.tipo);

    // H-05: vía RPC (contacto + inmueble + agentes + rol, todo en una
    // transacción) para que el actor real quede en audit_log.usuario_id. Ya
    // no hace falta el rollback manual (H-02) que había antes -- si
    // cualquier paso falla, la transacción entera se revierte sola.
    const { data: rows, error } = await supa.rpc("crm_crear_prospecto_manual", {
      p_nombre: toTitleCase(data.nombre.trim()),
      p_telefono: strOpt(data.telefono)?.trim() ?? null,
      p_email: strOpt(data.email)?.trim().toLowerCase() ?? null,
      p_tipo: data.tipo.trim(),
      p_calle: toTitleCase(data.calle.trim()),
      p_numero: strOpt(data.numero) ?? null,
      p_localidad: strOpt(data.localidad) ? toTitleCase(data.localidad!) : null,
      p_precio: numOpt(data.precio) ?? null,
      p_superficie: numOpt(data.superficie) ?? null,
      p_habitaciones: numOpt(data.habitaciones) ?? null,
      p_es_alquiler: isAlq,
      p_categoria: isAlq ? "Alquiler" : "Venta",
      p_agente_ids: agentIds.length ? agentIds : null,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    const row = (rows as unknown as Array<{ contact_id: string; property_id: string }>)[0];

    return { contactId: row.contact_id, propertyId: row.property_id };
  });

export const activarProspecto = createServerFn({ method: "POST" })
  .validator((d: ActivarProspectoPayload) => {
    if (!d?.contactId) throw new Error("contactId requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermissions(
      "contacts.update",
      "contact_roles.read",
      "properties.update",
      "properties.publish",
    );
    const supa = getSupa();

    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id. Ya
    // no hace falta el rollback manual (H-02) que había antes -- al ser una
    // sola transacción, si el UPDATE de contacts falla el de properties se
    // revierte solo.
    const { error } = await supa.rpc("crm_activar_prospecto", {
      p_contact_id: data.contactId,
      p_property_id: data.propertyId ?? null,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });
