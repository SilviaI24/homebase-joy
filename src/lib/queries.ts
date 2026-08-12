import { queryOptions } from "@tanstack/react-query";
import { listAllInmuebles, listAgentes, listProspectos } from "@/lib/inmuebles.functions";
import { listClientes, listLeads } from "@/lib/clientes.functions";
import { listVisitas } from "@/lib/visitas.functions";
import { getNotifications } from "@/lib/notifications.functions";
import { listSeguimientos } from "@/lib/seguimiento.functions";
import { listOperaciones } from "@/lib/operaciones.functions";

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
