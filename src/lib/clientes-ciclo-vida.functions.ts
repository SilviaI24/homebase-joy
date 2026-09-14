import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { requirePermission } from "@/lib/crm-auth.server";
import { ETAPAS } from "@/lib/clientes.functions";

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
    if (!(ETAPAS as readonly string[]).includes(d.cicloVida)) {
      throw new Error("Etapa de contacto inválida");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("contacts.update");
    // Archivar (mover a Histórico) es la única transición de ciclo_vida con
    // un permiso propio en el catálogo (contacts.archive) — hasta esta
    // auditoría no se comprobaba, así que desactivarlo en la pantalla de
    // permisos no bloqueaba nada.
    if (data.cicloVida === "Histórico") {
      await requirePermission("contacts.archive");
    }
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

// gestionarRol (crear/actualizar/borrar un rol contacto↔inmueble vía el RPC
// crm_gestionar_rol) se retiró el 14 sep 2026 — nunca tuvo consumidor en la
// UI (confirmado por grep) y el caso real de uso, crear el rol al asociar un
// contacto a un inmueble, ya lo cubre asociarLeadAInmueble
// (mutations-seguimiento.functions.ts). Decisión de David: no se deja como
// código a la espera de una UI futura ("sólida pero sencilla, sin
// evolutivos") — si en el futuro hace falta editar o quitar un rol ya
// asignado, se construye entonces. El RPC crm_gestionar_rol en la base de
// datos no se tocó (retirarlo es un cambio de esquema aparte).
