import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { requirePermission, requirePermissions } from "@/lib/crm-auth.server";

// ── Delete ────────────────────────────────────────────────────────────────────

export const deleteContacto = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => {
    if (!d?.id) throw new Error("id requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("contacts.delete_hard");
    const supa = getSupa();
    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_eliminar_contacto", {
      p_contact_id: data.id,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Mutaciones manuales ───────────────────────────────────────────────────────

export const actualizarCicloVida = createServerFn({ method: "POST" })
  .validator((d: { contactId: string; cicloVida: string }) => {
    if (!d?.contactId || !d?.cicloVida) throw new Error("contactId y cicloVida requeridos");
    if (!["Lead", "Prospecto", "Cliente", "Histórico", "Descartado"].includes(d.cicloVida)) {
      throw new Error("Etapa de contacto inválida");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("contacts.update");
    const supa = getSupa();

    // H-05: el cambio va por RPC en lugar de un .update() directo para que el
    // actor real quede en audit_log.usuario_id. El RPC fija app.actor_id como
    // GUC local a su propia transacción y luego escribe, todo en la misma
    // llamada HTTP — un SET LOCAL suelto desde aquí no sobreviviría al salto de
    // petición (PostgREST abre una transacción por request). El RPC también se
    // encarga de guardar ciclo_vida_anterior al archivar (M-05), que antes se
    // resolvía con una lectura previa desde aquí.
    const { error } = await supa.rpc("crm_actualizar_ciclo_vida", {
      p_contact_id: data.contactId,
      p_ciclo_vida: data.cicloVida,
      p_actor_id: crm.userId,
    });
    if (error) {
      console.error("crm_actualizar_ciclo_vida:", error.message);
      throw new Error("No se pudo actualizar la etapa del contacto");
    }
    return { ok: true };
  });

// M-05: "sacar" un contacto de Histórico devolviéndolo a la etapa real de la
// que vino (no siempre Lead) — complemento de actualizarCicloVida.
export const restaurarContactoDeHistorico = createServerFn({ method: "POST" })
  .validator((d: { contactId: string }) => {
    if (!d?.contactId) throw new Error("contactId requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("contacts.update");
    const supa = getSupa();
    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_restaurar_contacto_historico", {
      p_contact_id: data.contactId,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const gestionarRol = createServerFn({ method: "POST" })
  .validator((d: { contactId: string; propertyId: string; tipo: string | null }) => {
    if (!d?.contactId || !d?.propertyId) throw new Error("contactId y propertyId requeridos");
    if (
      d.tipo !== null &&
      !["Propietario", "Arrendador", "Comprador", "Inquilino"].includes(d.tipo)
    ) {
      throw new Error("Tipo de relación inválido");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermissions(
      "contact_roles.create",
      "contact_roles.update",
      "properties.read",
    );
    if (data.tipo === null) await requirePermission("contact_roles.delete");
    const supa = getSupa();
    // H-05: vía RPC (crea/actualiza/borra el rol y recalcula ciclo_vida, todo
    // en la misma transacción) para que el actor real quede en
    // audit_log.usuario_id — antes eran 4 llamadas .from() sueltas.
    const { error } = await supa.rpc("crm_gestionar_rol", {
      p_contact_id: data.contactId,
      p_property_id: data.propertyId,
      p_tipo: data.tipo,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
