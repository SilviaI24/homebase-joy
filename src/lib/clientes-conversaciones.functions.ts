import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toTitleCase, toSentenceCase, escapeSearchTerm } from "./format";
import { requirePermission } from "@/lib/crm-auth.server";
import { s } from "./clientes-format";
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
  | "tipoInteres"
  | "etapa"
  | "agentesIds"
  | "matches"
>;

// Bandeja de IA: conserva las conversaciones de los agentes de WhatsApp y voz
// aunque el contacto deje de ser Lead. `contacts.canal_origen` es la fuente
// canónica — desde la normalización del 14 sep 2026 (ver migración
// normalizar_trabajado_y_canal_origen_bandeja) ya no hace falta adivinar por
// texto: todo lo que pertenece a esta bandeja tiene canal_origen en
// BANDEJA_CANALES, sin excepción.
const BANDEJA_CANALES = ["WhatsApp", "Voz", "Email", "Legado"] as const;
const ESTADO_TABS = ["Pendientes", "Cualificados", "Archivados", "Antiguos", "Todos"] as const;
const VENTANA_PENDIENTES_DIAS = 30;

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
  tipo_interes: string | null;
  contact_agents: Array<{ agent_id: string | null }> | null;
};

// Paginated SilvIA bandeja — contacts con canal_origen en BANDEJA_CANALES.
// Tab filter mapea a contacts.trabajado (+ recencia en Pendientes/Antiguos);
// canal filter refina por canal_origen exacto.
export const listConversacionesIaPage = createServerFn({ method: "GET" })
  .validator(
    (d: { page?: number; pageSize?: number; tab?: string; q?: string; canal?: string }) => {
      const page = Math.max(1, Number(d?.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(d?.pageSize) || 50));
      const tab = ESTADO_TABS.includes((d?.tab ?? "") as (typeof ESTADO_TABS)[number])
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
      const corte = new Date(
        Date.now() - VENTANA_PENDIENTES_DIAS * 24 * 60 * 60 * 1000,
      ).toISOString();

      let query = supa
        .from("contacts")
        .select(
          `id, nombre, email, telefono, ciclo_vida, canal_origen, created_at,
           motivo, solicitud, conversaciones, seccion, categoria, trabajado, tipo_interes,
           contact_agents(agent_id)`,
          { count: "exact" },
        )
        .in("canal_origen", BANDEJA_CANALES)
        .order("created_at", { ascending: false });

      // Canal filter: cada botón es un valor exacto (ya normalizado, sin
      // ambigüedad de mayúsculas ni heurística de texto).
      if (data.canal === "WhatsApp" || data.canal === "Voz" || data.canal === "Email") {
        query = query.eq("canal_origen", data.canal);
      }
      // "Todos" → sin filtro adicional de canal (incluye Legado)

      // Tab filter: trabajado + ventana de recencia.
      if (data.tab === "Cualificados") {
        query = query.eq("trabajado", "Contactado");
      } else if (data.tab === "Archivados") {
        query = query.eq("trabajado", "Descartado");
      } else if (data.tab === "Pendientes") {
        query = query.is("trabajado", null).gte("created_at", corte);
      } else if (data.tab === "Antiguos") {
        query = query.is("trabajado", null).lt("created_at", corte);
      }
      // "Todos" → sin filtro de trabajado

      // Apply search filter
      if (data.q) {
        const needle = escapeSearchTerm(data.q);
        query = query.or(
          `nombre.ilike.%${needle}%,telefono.ilike.%${needle}%,email.ilike.%${needle}%,motivo.ilike.%${needle}%,conversaciones.ilike.%${needle}%`,
        );
      }

      // Tab counts (todos los contactos de Bandeja, sin filtro de canal ni
      // búsqueda) — en el mismo Promise.all que la query paginada principal
      // en vez de esperarla primero: son independientes entre sí (auditoría
      // 12 sep 2026, ahorra un roundtrip en cada carga/paginación/filtro).
      const baseCount = () =>
        supa
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .in("canal_origen", BANDEJA_CANALES);

      const [{ data: rows, error, count }, todosRes, cualRes, archRes, pendRes, antiguosRes] =
        await Promise.all([
          query.range(from, to),
          baseCount(),
          baseCount().eq("trabajado", "Contactado"),
          baseCount().eq("trabajado", "Descartado"),
          baseCount().is("trabajado", null).gte("created_at", corte),
          baseCount().is("trabajado", null).lt("created_at", corte),
        ]);
      if (error) throw new Error("Error al cargar conversaciones");

      const typedRows = (rows ?? []) as unknown as ConversacionIaQueryRow[];

      const clientes: ConversacionIa[] = typedRows.map((row) => ({
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
        tipoInteres: row.tipo_interes,
        etapa: (row.ciclo_vida ?? "Lead") as Etapa,
        agentesIds: (row.contact_agents ?? [])
          .map((a) => a.agent_id)
          .filter((id): id is string => Boolean(id)),
        matches: [],
      }));

      return {
        clientes,
        total: count ?? 0,
        tabCounts: {
          Todos: todosRes.count ?? 0,
          Cualificados: cualRes.count ?? 0,
          Archivados: archRes.count ?? 0,
          Pendientes: pendRes.count ?? 0,
          Antiguos: antiguosRes.count ?? 0,
        },
      };
    },
  );
