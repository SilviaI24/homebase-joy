import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { requirePermission } from "@/lib/crm-auth.server";
import { escapeSearchTerm } from "./format";

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

type SeguimientoQueryRow = {
  id: string;
  tipo: string | null;
  texto: string | null;
  fecha: string | null;
  created_at: string;
  contact_id: string;
  agente_id: string | null;
  contacts: { nombre: string | null } | null;
  agents: { id: string; nombre: string | null } | null;
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

  // Supabase-js sin tipos de Database generados infiere las relaciones
  // contacts/agents como array por defecto; en runtime PostgREST devuelve un
  // objeto único (FK many-to-one) — se corrige con el cast explícito.
  const rows = (data ?? []) as unknown as SeguimientoQueryRow[];

  return {
    seguimientos: rows.map(
      (r): SeguimientoRow => ({
        id: r.id,
        tipo: (r.tipo ?? "Nota") as SeguimientoTipo,
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

export type GetSeguimientosByContactoPayload = { contactId: string };

// Rediseño de navegación (17 sep 2026): historial de un único contacto para
// la pestaña "Actividad" de su ficha — a diferencia de listSeguimientos
// (global, hasta 300 filas, para la vista de equipo que tenía /seguimiento),
// aquí se filtra en SQL por contact_id, sin necesidad de traer el resto.
export const getSeguimientosByContacto = createServerFn({ method: "GET" })
  .validator((d: GetSeguimientosByContactoPayload) => {
    if (!d?.contactId) throw new Error("Contacto requerido");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermission("seguimiento.read");
    const supa = getSupa();

    const { data: rows, error } = await supa
      .from("seguimiento")
      .select("id, tipo, texto, fecha, created_at, contact_id, agente_id, agents(id, nombre)")
      .eq("contact_id", data.contactId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw new Error(`getSeguimientosByContacto: ${error.message}`);

    type Row = {
      id: string;
      tipo: string | null;
      texto: string | null;
      fecha: string | null;
      created_at: string;
      contact_id: string;
      agente_id: string | null;
      agents: { id: string; nombre: string | null } | null;
    };
    const typed = (rows ?? []) as unknown as Row[];

    return {
      seguimientos: typed.map((r) => ({
        id: r.id,
        tipo: (r.tipo ?? "Nota") as SeguimientoTipo,
        texto: r.texto ?? "",
        fecha: r.fecha ?? null,
        created_at: r.created_at,
        agenteNombre: r.agents?.nombre ?? null,
      })),
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

export type SearchClientesPickerParams = { q: string; limit: number };

// Búsqueda server-side por texto (nombre/teléfono), con límite — para los
// pickers de cliente/propietario en NewVisitaDialog/NewInmuebleDialog.
// Antes cargaban clientesQueryOpts completo (listClientes(): todos los
// contactos Cliente/Prospecto, con el motor de matching corriendo fila por
// fila) al navegador y filtraban/recortaban a 80/30 en memoria — mismo
// antipatrón que ya resolvió searchInmuebles para el picker de inmuebles
// del mismo diálogo (auditoría 12 sep 2026). Sin mínimo de caracteres (a
// diferencia de searchContactos): sin filtro, se listan los más recientes,
// igual que hace searchInmuebles.
export const searchClientesPicker = createServerFn({ method: "GET" })
  .validator((d: Partial<SearchClientesPickerParams>): SearchClientesPickerParams => {
    const q = typeof d?.q === "string" ? d.q.trim() : "";
    const limit = Math.min(80, Math.max(1, Number(d?.limit) || 30));
    return { q, limit };
  })
  .handler(
    async ({ data }): Promise<{ clientes: { id: string; nombre: string; telefono: string }[] }> => {
      await requirePermission("contacts.read");
      const supa = getSupa();
      let query = supa
        .from("contacts")
        .select("id, nombre, telefono")
        .in("ciclo_vida", ["Cliente", "Prospecto"])
        .order("created_at", { ascending: false })
        .limit(data.limit);

      if (data.q) {
        const needle = escapeSearchTerm(data.q);
        query = query.or(`nombre.ilike.%${needle}%,telefono.ilike.%${needle}%`);
      }

      const { data: rows, error } = await query;
      if (error) throw new Error("Error al buscar clientes");
      const typed = (rows ?? []) as Array<{
        id: string;
        nombre: string | null;
        telefono: string | null;
      }>;
      return {
        clientes: typed.map((r) => ({
          id: r.id,
          nombre: r.nombre ?? "",
          telefono: r.telefono ?? "",
        })),
      };
    },
  );

export type SearchContactosPayload = { q: string };

export const searchContactos = createServerFn({ method: "GET" })
  .validator((d: SearchContactosPayload) => d)
  .handler(async ({ data }) => {
    await requirePermission("contacts.read");
    if (!data.q || data.q.trim().length < 2) return { contacts: [] };
    const supa = getSupa();
    // Sin escapar antes (auditoría 12 sep 2026): un "%" o "_" literal en el
    // término de búsqueda actuaba como comodín de LIKE y devolvía contactos
    // arbitrarios en vez de los que de verdad coinciden.
    const needle = escapeSearchTerm(data.q);
    const { data: rows, error } = await supa
      .from("contacts")
      .select("id, nombre")
      .ilike("nombre", `%${needle}%`)
      .limit(8);
    if (error) throw new Error(error.message);
    return { contacts: (rows ?? []) as { id: string; nombre: string }[] };
  });
