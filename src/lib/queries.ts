import { queryOptions } from "@tanstack/react-query";
import { listAllInmuebles } from "@/lib/inmuebles.functions";
import { listClientes } from "@/lib/clientes.functions";
import { listVisitas } from "@/lib/visitas.functions";


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

export const visitasQuery = queryOptions({
  queryKey: ["visitas-all"],
  queryFn: () => listVisitas(),
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
});
