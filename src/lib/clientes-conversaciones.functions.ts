import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toTitleCase, toSentenceCase } from "./format";
import { requirePermission } from "@/lib/crm-auth.server";
import { s, escapeLikeCliente } from "./clientes-format";
import type { Cliente, Etapa } from "./clientes.functions";

export type ConversacionIa = Pick<
  Cliente,
  | "id"
  | "nombre"
  | "email"
  | "telefono"
  | "canalOrigen"
  | "fecha"
  | "motivo"
  | "solicitud"
  | "seccion"
  | "conversaciones"
  | "categoria"
  | "trabajado"
  | "etapa"
  | "agentesIds"
  | "matches"
>;

// Bandeja de IA: conserva las conversaciones de los agentes de WhatsApp y voz
// aunque el contacto deje de ser Lead. `contacts.canal_origen` es la fuente
// canónica; el texto solo se usa como compatibilidad con registros antiguos.
type ConversacionIaQueryRow = {
  id: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  ciclo_vida: string | null;
  canal_origen: string | null;
  created_at: string | null;
  motivo: string | null;
  solicitud: string | null;
  conversaciones: string | null;
  seccion: string | null;
  categoria: string[] | null;
  trabajado: string | null;
  contact_agents: Array<{ agent_id: string | null }> | null;
};

// Paginated SilvIA bandeja — contacts with canal_origen SilvIA-WhatsApp / SilvIA-Voz
// plus legacy records without canal_origen that contain conversation text.
// Tab filter maps to contacts.trabajado field; canal filter refines by channel.
export const listConversacionesIaPage = createServerFn({ method: "GET" })
  .validator(
    (d: { page?: number; pageSize?: number; tab?: string; q?: string; canal?: string }) => {
      const page = Math.max(1, Number(d?.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(d?.pageSize) || 50));
      const tab = ["Pendientes", "Cualificados", "Archivados", "Todos"].includes(d?.tab ?? "")
        ? (d!.tab as string)
        : "Pendientes";
      const q = typeof d?.q === "string" ? d.q.trim() : "";
      const canal = ["Todos", "WhatsApp", "Voz", "Email"].includes(d?.canal ?? "")
        ? (d!.canal as string)
        : "Todos";
      return { page, pageSize, tab, q, canal };
    },
  )
  .handler(
    async ({
      data,
    }): Promise<{
      clientes: ConversacionIa[];
      total: number;
      tabCounts: Record<string, number>;
    }> => {
      await requirePermission("contacts.read");
      const supa = getSupa();
      const from = (data.page - 1) * data.pageSize;
      const to = from + data.pageSize - 1;

      // Main SilvIA canal filter (OR: primary + legacy)
      const silviaOrPrimary =
        "canal_origen.ilike.silvia-whatsapp,canal_origen.ilike.silvia-voz,canal_origen.ilike.silvia-email";
      const silviaOrLegacy = "and(canal_origen.is.null,conversaciones.not.is.null)";
      const silviaOrFilter = `${silviaOrPrimary},${silviaOrLegacy}`;

      let query = supa
        .from("contacts")
        .select(
          `id, nombre, email, telefono, ciclo_vida, canal_origen, created_at,
           motivo, solicitud, conversaciones, seccion, categoria, trabajado,
           contact_agents(agent_id)`,
          { count: "exact" },
        )
        .order("created_at", { ascending: false });

      // Apply canal filter (determines if we use primary only or primary+legacy)
      if (data.canal === "WhatsApp") {
        query = query.ilike("canal_origen", "silvia-whatsapp");
      } else if (data.canal === "Voz") {
        query = query.ilike("canal_origen", "silvia-voz");
      } else if (data.canal === "Email") {
        query = query.ilike("canal_origen", "silvia-email");
      } else {
        query = query.or(silviaOrFilter);
      }

      // Apply tab filter via trabajado field
      if (data.tab === "Cualificados") {
        query = query.ilike("trabajado", "contactado");
      } else if (data.tab === "Archivados") {
        query = query.ilike("trabajado", "descartado");
      } else if (data.tab === "Pendientes") {
        // Include: trabajado IS NULL OR (trabajado != 'Descartado' AND trabajado != 'Contactado')
        query = query.or(
          "trabajado.is.null,and(trabajado.not.ilike.descartado,trabajado.not.ilike.contactado)",
        );
      }
      // "Todos" → no trabajado filter

      // Apply search filter
      if (data.q) {
        const needle = escapeLikeCliente(data.q);
        query = query.or(
          `nombre.ilike.%${needle}%,telefono.ilike.%${needle}%,email.ilike.%${needle}%,motivo.ilike.%${needle}%,conversaciones.ilike.%${needle}%`,
        );
      }

      const { data: rows, error, count } = await query.range(from, to);
      if (error) throw new Error("Error al cargar conversaciones");

      // Mismo select que listConversacionesIa -> mismo tipo de fila.
      const typedRows = (rows ?? []) as unknown as ConversacionIaQueryRow[];

      // Post-fetch: filter out legacy records that mention Idealista
      const validRows = typedRows.filter((row) => {
        const origen = (row.canal_origen ?? "").toLowerCase();
        const esPrimary =
          origen === "silvia-whatsapp" || origen === "silvia-voz" || origen === "silvia-email";
        if (esPrimary) return true;
        // Legacy: reject if idealista mention in text
        const texto = `${row.motivo ?? ""} ${row.solicitud ?? ""} ${row.conversaciones ?? ""}`;
        return !/idealista/i.test(texto);
      });

      const clientes: ConversacionIa[] = validRows.map((row) => ({
        id: row.id,
        nombre: toTitleCase(s(row.nombre)),
        email: s(row.email),
        telefono: s(row.telefono),
        canalOrigen: s(row.canal_origen),
        fecha: row.created_at ? row.created_at.slice(0, 10) : null,
        motivo: toSentenceCase(s(row.motivo)),
        solicitud: toSentenceCase(s(row.solicitud)),
        seccion: toTitleCase(s(row.seccion)),
        conversaciones: toSentenceCase(s(row.conversaciones)),
        categoria: Array.isArray(row.categoria) ? row.categoria : [],
        trabajado: toTitleCase(s(row.trabajado)),
        etapa: (row.ciclo_vida ?? "Lead") as Etapa,
        agentesIds: (row.contact_agents ?? [])
          .map((a) => a.agent_id)
          .filter((id): id is string => Boolean(id)),
        matches: [],
      }));

      // Tab counts (all SilvIA contacts, no canal-button or search filter)
      const baseCount = () =>
        supa.from("contacts").select("id", { count: "exact", head: true }).or(silviaOrFilter);

      const pendientesOr =
        "trabajado.is.null,and(trabajado.not.ilike.descartado,trabajado.not.ilike.contactado)";

      const [todosRes, cualRes, archRes, pendRes] = await Promise.all([
        baseCount(),
        baseCount().ilike("trabajado", "contactado"),
        baseCount().ilike("trabajado", "descartado"),
        baseCount().or(pendientesOr),
      ]);

      return {
        clientes,
        total: count ?? 0,
        tabCounts: {
          Todos: todosRes.count ?? 0,
          Cualificados: cualRes.count ?? 0,
          Archivados: archRes.count ?? 0,
          Pendientes: pendRes.count ?? 0,
        },
      };
    },
  );
