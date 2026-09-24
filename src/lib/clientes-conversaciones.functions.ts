import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toTitleCase, toSentenceCase, escapeSearchTerm } from "./format";
import { requirePermission } from "@/lib/crm-auth.server";
import { s } from "./clientes-format";
import type { Cliente, Etapa } from "./clientes.functions";
import { FUENTES } from "./contactos-format";

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
> & {
  motivoDescarte: string | null;
  fuente: string | null;
  pideLlamada: boolean;
  numConversaciones: number;
  requisitosAlquiler: RequisitosAlquiler;
};

// Lo que antes pedía el formulario de Airtable de alquiler; ahora lo pregunta
// SilvIA en la conversación y lo guarda en la ficha (whatsapp-silvia).
export type RequisitosAlquiler = {
  contrato: string;
  avalista: string;
  mascota: string;
  profesion: string;
};

// Bandeja: la entrada única de leads (circuito aprobado por David, 24 sep
// 2026). Conserva las conversaciones aunque el contacto deje de ser Lead.
// `contacts.canal_origen` es la fuente canónica desde la normalización del
// 14 sep 2026 (migración normalizar_trabajado_y_canal_origen_bandeja). "Web"
// son los formularios de elsolgrupo.com (Edge Function web-lead): ya
// entraban al CRM, pero hasta el 24 sep la Bandeja no los mostraba.
const BANDEJA_CANALES = ["WhatsApp", "Voz", "Email", "Web", "Legado"] as const;
const CANAL_FILTROS = ["Todos", "WhatsApp", "Voz", "Email", "Web"] as const;
const FUENTE_FILTROS = ["Todas", "Sin fuente", ...FUENTES] as const;
const ESTADO_TABS = ["Pendientes", "Cualificados", "Descartados", "Antiguos", "Todos"] as const;
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
  motivo_descarte: string | null;
  fuente: string | null;
  pide_llamada: boolean | null;
  ultimo_contacto_at: string | null;
  num_conversaciones: Array<{ count: number }> | null;
  ultima_conv: Array<{ resumen: string | null; transcripcion: string | null }> | null;
  contrato_trabajo: string | null;
  avalista: string | null;
  mascota: string | null;
  profesion: string | null;
  contact_agents: Array<{ agent_id: string | null }> | null;
};

// Paginated SilvIA bandeja — contacts con canal_origen en BANDEJA_CANALES.
// Tab filter mapea a contacts.trabajado (+ recencia en Pendientes/Antiguos);
// canal filter refina por canal_origen exacto.
export const listConversacionesIaPage = createServerFn({ method: "GET" })
  .validator(
    (d: {
      page?: number;
      pageSize?: number;
      tab?: string;
      q?: string;
      canal?: string;
      fuente?: string;
    }) => {
      const page = Math.max(1, Number(d?.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(d?.pageSize) || 50));
      const tab = ESTADO_TABS.includes((d?.tab ?? "") as (typeof ESTADO_TABS)[number])
        ? (d!.tab as string)
        : "Pendientes";
      const q = typeof d?.q === "string" ? d.q.trim() : "";
      const canal = CANAL_FILTROS.includes((d?.canal ?? "") as (typeof CANAL_FILTROS)[number])
        ? (d!.canal as string)
        : "Todos";
      const fuente = FUENTE_FILTROS.includes((d?.fuente ?? "") as (typeof FUENTE_FILTROS)[number])
        ? (d!.fuente as string)
        : "Todas";
      return { page, pageSize, tab, q, canal, fuente };
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
           motivo_descarte, fuente, pide_llamada, ultimo_contacto_at,
           contrato_trabajo, avalista, mascota, profesion,
           num_conversaciones:conversaciones(count),
           ultima_conv:conversaciones(resumen, transcripcion),
           contact_agents(agent_id)`,
          { count: "exact" },
        )
        .in("canal_origen", BANDEJA_CANALES)
        // Solo la conversación más reciente: su resumen y transcripción son
        // lo que se muestra en la tarjeta (antes, solo el texto aplanado que
        // vino de Airtable).
        .order("fecha", { referencedTable: "ultima_conv", ascending: false })
        .limit(1, { referencedTable: "ultima_conv" });

      // Canal filter: cada botón es un valor exacto (ya normalizado, sin
      // ambigüedad de mayúsculas ni heurística de texto).
      if (data.canal !== "Todos") {
        query = query.eq("canal_origen", data.canal);
      }
      // "Todos" → sin filtro adicional de canal (incluye Legado)

      if (data.fuente === "Sin fuente") {
        query = query.is("fuente", null);
      } else if (data.fuente !== "Todas") {
        query = query.eq("fuente", data.fuente);
      }

      // Tab filter: trabajado + ventana de recencia. La recencia es la del
      // ÚLTIMO contacto (ultimo_contacto_at, lo mantiene un trigger desde
      // conversaciones), no la fecha de alta: un lead antiguo que vuelve a
      // llamar tiene que volver a verse en Pendientes.
      if (data.tab === "Cualificados") {
        query = query.eq("trabajado", "Contactado");
      } else if (data.tab === "Descartados") {
        query = query.eq("trabajado", "Descartado");
      } else if (data.tab === "Pendientes") {
        query = query.is("trabajado", null).gte("ultimo_contacto_at", corte);
      } else if (data.tab === "Antiguos") {
        query = query.is("trabajado", null).lt("ultimo_contacto_at", corte);
      }
      // Quien pidió que le devuelvan la llamada va primero en Pendientes.
      if (data.tab === "Pendientes") {
        query = query.order("pide_llamada", { ascending: false });
      }
      query = query.order("ultimo_contacto_at", { ascending: false, nullsFirst: false });
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

      const [
        { data: rows, error, count },
        todosRes,
        cualRes,
        descRes,
        pendRes,
        antiguosRes,
        llamadaRes,
      ] = await Promise.all([
        query.range(from, to),
        baseCount(),
        baseCount().eq("trabajado", "Contactado"),
        baseCount().eq("trabajado", "Descartado"),
        baseCount().is("trabajado", null).gte("ultimo_contacto_at", corte),
        baseCount().is("trabajado", null).lt("ultimo_contacto_at", corte),
        baseCount().is("trabajado", null).eq("pide_llamada", true),
      ]);
      if (error) throw new Error("Error al cargar conversaciones");

      const typedRows = (rows ?? []) as unknown as ConversacionIaQueryRow[];

      const clientes: ConversacionIa[] = typedRows.map((row) => {
        const ultima = row.ultima_conv?.[0];
        return {
          id: row.id,
          nombre: toTitleCase(s(row.nombre)),
          email: s(row.email),
          telefono: s(row.telefono),
          canalOrigen: s(row.canal_origen),
          fecha: (row.ultimo_contacto_at ?? row.created_at)?.slice(0, 10) ?? null,
          motivo: toSentenceCase(s(row.motivo) || s(ultima?.resumen)),
          solicitud: toSentenceCase(s(row.solicitud)),
          seccion: toTitleCase(s(row.seccion)),
          conversaciones: s(ultima?.transcripcion) || toSentenceCase(s(row.conversaciones)),
          categoria: Array.isArray(row.categoria) ? row.categoria : [],
          trabajado: toTitleCase(s(row.trabajado)),
          tipoInteres: row.tipo_interes,
          motivoDescarte: row.motivo_descarte,
          fuente: row.fuente,
          pideLlamada: Boolean(row.pide_llamada),
          numConversaciones: row.num_conversaciones?.[0]?.count ?? 0,
          requisitosAlquiler: {
            contrato: s(row.contrato_trabajo),
            avalista: s(row.avalista),
            mascota: s(row.mascota),
            profesion: s(row.profesion),
          },
          etapa: (row.ciclo_vida ?? "Lead") as Etapa,
          agentesIds: (row.contact_agents ?? [])
            .map((a) => a.agent_id)
            .filter((id): id is string => Boolean(id)),
          matches: [],
        };
      });

      return {
        clientes,
        total: count ?? 0,
        tabCounts: {
          Todos: todosRes.count ?? 0,
          Cualificados: cualRes.count ?? 0,
          Descartados: descRes.count ?? 0,
          Pendientes: pendRes.count ?? 0,
          Antiguos: antiguosRes.count ?? 0,
          PidenLlamada: llamadaRes.count ?? 0,
        },
      };
    },
  );
