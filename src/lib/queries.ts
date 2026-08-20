import { queryOptions } from "@tanstack/react-query";
import {
  listAllInmuebles,
  listAllInmueblesLite,
  listComerciablesInmuebles,
  searchInmuebles,
  listAgentes,
  listProspectos,
  listInmueblesPage,
  type InmueblesPageParams,
  type SearchInmueblesParams,
} from "@/lib/inmuebles.functions";
import {
  listClientes,
  listLeads,
  listConversacionesIa,
  getLeadInsightsFn,
  listClientesPage,
  getClientesStats,
  getClienteById,
  listConversacionesIaPage,
  listContactosPage,
} from "@/lib/clientes.functions";
import { listVisitas } from "@/lib/visitas.functions";
import { getNotifications } from "@/lib/notifications.functions";
import { listSeguimientos } from "@/lib/seguimiento.functions";
import { listOperaciones } from "@/lib/operaciones.functions";
import { getStatsData } from "@/lib/clientes.functions";
import { getMyRole } from "@/lib/role.functions";

export const agentesQuery = queryOptions({
  queryKey: ["agentes"],
  queryFn: () => listAgentes(),
  staleTime: 10 * 60 * 1000,
  gcTime: 60 * 60 * 1000,
});

// Cache compartida por todas las rutas que necesitan inmuebles/alquileres.
// Una sola llamada a Airtable alimenta dashboard, inmuebles, alquileres y comerciales.
export const allInmueblesQuery = queryOptions({
  queryKey: ["all-inmuebles"],
  queryFn: () => listAllInmuebles(),
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
});

// Misma cobertura que allInmueblesQuery (todas las filas) pero con columnas
// recortadas al mínimo que consumen el dashboard y el hub de comerciales —
// ver listAllInmueblesLite en inmuebles.functions.ts.
export const allInmueblesLiteQuery = queryOptions({
  queryKey: ["all-inmuebles-lite"],
  queryFn: () => listAllInmueblesLite(),
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
});

// Solo inmuebles comercializables (Activo/Reservado) — filtro de estatus
// aplicado en SQL. Usado por la bandeja operativa para detectar menciones.
export const comerciablesInmueblesQuery = queryOptions({
  queryKey: ["comerciables-inmuebles"],
  queryFn: () => listComerciablesInmuebles(),
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
});

/** Búsqueda server-side de inmuebles por texto, con límite. */
export function searchInmueblesQuery(params: Partial<SearchInmueblesParams>) {
  return queryOptions({
    queryKey: ["inmuebles-search", params],
    queryFn: () => searchInmuebles({ data: params }),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export const clientesQueryOpts = queryOptions({
  queryKey: ["clientes"],
  queryFn: () => listClientes(),
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
});

export const leadsQueryOpts = queryOptions({
  queryKey: ["leads"],
  queryFn: () => listLeads(),
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
});

export const iaConversationsQuery = queryOptions({
  queryKey: ["ia-conversations"],
  queryFn: () => listConversacionesIa(),
  staleTime: 2 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
});

export const visitasQuery = queryOptions({
  queryKey: ["visitas-all"],
  queryFn: () => listVisitas(),
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
});

export const prospectoQuery = queryOptions({
  queryKey: ["prospectos"],
  queryFn: () => listProspectos(),
  staleTime: 10 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
});

export const notificationsQuery = queryOptions({
  queryKey: ["notificaciones"],
  queryFn: () => getNotifications(),
  staleTime: 10 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  refetchOnWindowFocus: false,
});

export const seguimientosQuery = queryOptions({
  queryKey: ["seguimientos"],
  queryFn: () => listSeguimientos(),
  staleTime: 2 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
});

export const operacionesQuery = queryOptions({
  queryKey: ["operaciones"],
  queryFn: () => listOperaciones(),
  staleTime: 2 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
});

export const statsQuery = queryOptions({
  queryKey: ["stats"],
  queryFn: () => getStatsData(),
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
});

export const insightsQuery = queryOptions({
  queryKey: ["lead-insights"],
  queryFn: () => getLeadInsightsFn(),
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
});

export const myRoleQuery = queryOptions({
  queryKey: ["my-role"],
  queryFn: () => getMyRole(),
  staleTime: 10 * 60 * 1000,
  gcTime: 60 * 60 * 1000,
});

// ── Paginated query factories ─────────────────────────────────────────────────

/** Paginated inmuebles query — one entry per (page + filters) combination. */
export function inmueblesPageQuery(params: Partial<InmueblesPageParams>) {
  return queryOptions({
    queryKey: ["inmuebles-page", params],
    queryFn: () => listInmueblesPage({ data: params }),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

/** Paginated contacts (ciclo_vida='Cliente') query. */
export function clientesPageQuery(params: {
  page?: number;
  pageSize?: number;
  seg?: string;
  q?: string;
}) {
  return queryOptions({
    queryKey: ["clientes-page", params],
    queryFn: () => listClientesPage({ data: params }),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

/** Global KPI counts for clientes (segmento totals). Cached 5 min. */
export const clientesStatsQuery = queryOptions({
  queryKey: ["clientes-stats"],
  queryFn: () => getClientesStats(),
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
});

/** Full cliente detail for Sheet panel. */
export function clienteDetailQuery(id: string | null) {
  return queryOptions({
    queryKey: ["cliente-detail", id],
    queryFn: () => getClienteById({ data: { id: id! } }),
    enabled: Boolean(id),
    staleTime: 1 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

/** Paginated Histórico/Descartado contacts query. */
export function contactosPageQuery(params: {
  page?: number;
  pageSize?: number;
  q?: string;
  etapa?: string;
}) {
  return queryOptions({
    queryKey: ["contactos-page", params],
    queryFn: () => listContactosPage({ data: params }),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

/** Paginated SilvIA conversations query. */
export function iaConversationsPageQuery(params: {
  page?: number;
  pageSize?: number;
  tab?: string;
  q?: string;
  canal?: string;
}) {
  return queryOptions({
    queryKey: ["ia-conversations-page", params],
    queryFn: () => listConversacionesIaPage({ data: params }),
    staleTime: 1 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}
