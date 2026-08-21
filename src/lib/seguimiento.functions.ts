import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { requirePermission } from "@/lib/crm-auth.server";

export type SeguimientoTipo = "Llamada" | "WhatsApp" | "Email" | "Visita" | "Nota" | "SilvIA";

export type SeguimientoRow = {
  id: string;
  tipo: SeguimientoTipo;
  texto: string;
  fecha: string | null;
  created_at: string;
  contact_id: string;
  contactoNombre: string;
  agenteId: string | null;
  agenteNombre: string | null;
};

export const listSeguimientos = createServerFn({ method: "GET" }).handler(async () => {
  await requirePermission("seguimiento.read");
  const supa = getSupa();

  const { data, error } = await supa
    .from("seguimiento")
    .select(
      "id, tipo, texto, fecha, created_at, contact_id, agente_id, contacts(nombre), agents(id, nombre)",
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) throw new Error(`listSeguimientos: ${error.message}`);

  return {
    seguimientos: (data ?? []).map(
      (r: any): SeguimientoRow => ({
        id: r.id,
        tipo: r.tipo ?? "Nota",
        texto: r.texto ?? "",
        fecha: r.fecha ?? null,
        created_at: r.created_at,
        contact_id: r.contact_id,
        contactoNombre: r.contacts?.nombre ?? "Sin nombre",
        agenteId: r.agents?.id ?? null,
        agenteNombre: r.agents?.nombre ?? null,
      }),
    ),
  };
});

export type CreateSeguimientoPayload = {
  contactId: string;
  tipo: SeguimientoTipo;
  texto: string;
  agenteId?: string | null;
};

export const createSeguimiento = createServerFn({ method: "POST" })
  .validator((d: CreateSeguimientoPayload) => {
    const tipos: SeguimientoTipo[] = ["Llamada", "WhatsApp", "Email", "Visita", "Nota", "SilvIA"];
    if (!d?.contactId) throw new Error("Contacto requerido");
    if (!d.texto?.trim()) throw new Error("La nota no puede estar vacía");
    if (!tipos.includes(d.tipo)) throw new Error("Tipo de seguimiento inválido");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("seguimiento.create");
    const supa = getSupa();

    // H-05: vía RPC (no .insert() directo) para que el actor real quede en
    // audit_log.usuario_id — ver crm_crear_seguimiento en la migración
    // 20260821112057_h05_actor_operaciones_seguimiento.sql.
    const { error } = await supa.rpc("crm_crear_seguimiento", {
      p_contact_id: data.contactId,
      p_tipo: data.tipo,
      p_texto: data.texto.trim(),
      p_agente_id: data.agenteId ?? crm.agentId ?? null,
      p_actor_id: crm.userId,
    });
    if (error) {
      console.error("crm_crear_seguimiento:", error.message);
      throw new Error("No se pudo crear la nota de seguimiento");
    }

    return { ok: true };
  });

export type SearchContactosPayload = { q: string };

export const searchContactos = createServerFn({ method: "GET" })
  .validator((d: SearchContactosPayload) => d)
  .handler(async ({ data }) => {
    await requirePermission("contacts.read");
    if (!data.q || data.q.trim().length < 2) return { contacts: [] };
    const supa = getSupa();
    const { data: rows, error } = await supa
      .from("contacts")
      .select("id, nombre")
      .ilike("nombre", `%${data.q.trim()}%`)
      .limit(8);
    if (error) throw new Error(error.message);
    return { contacts: (rows ?? []) as { id: string; nombre: string }[] };
  });
