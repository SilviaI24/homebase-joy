import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toTitleCase, toTitleCaseArr, toSentenceCase } from "./format";
import { requirePermission } from "@/lib/crm-auth.server";

export type VisitaFull = {
  id: string;
  fecha: string | null;
  estado: string;
  comentarios: string;
  actividad: string;
  inmuebleIds: string[];
  inmuebleCalles: string[];
  inmuebleNumeros: string[];
  inmuebleBarrios: string[];
  clientesNombres: string[];
  clientesTelefonos: string[];
  agentesIds: string[];
  agentesMails: string[];
};

const ESTADOS_VISITA = ["Programada", "Realizada", "Cancelada"] as const;
export type EstadoVisita = (typeof ESTADOS_VISITA)[number] | string;

function mapEstadoOut(estado: string): string {
  return ESTADOS_VISITA.includes(estado as (typeof ESTADOS_VISITA)[number]) ? estado : "Programada";
}

type VisitaQueryRow = {
  id: string;
  fecha: string | null;
  estado: string | null;
  notas: string | null;
  properties: {
    id: string;
    calle: string | null;
    numero: string | null;
    barrio: string | null;
  } | null;
  contacts: { id: string; nombre: string | null; telefono: string | null } | null;
  agents: { id: string; email: string | null } | null;
};

export const listVisitas = createServerFn({ method: "GET" }).handler(async () => {
  await requirePermission("visits.read");
  const supa = getSupa();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supa
    .from("visits")
    .select(
      `
      id, fecha, estado, notas,
      properties(id, calle, numero, barrio),
      contacts(id, nombre, telefono),
      agents(id, email)
    `,
    )
    .gte("fecha", cutoffISO)
    .order("fecha", { ascending: false })
    .limit(3000);

  if (error) throw new Error(error.message);

  // Supabase-js sin tipos de Database generados infiere las relaciones como
  // array por defecto; en runtime PostgREST devuelve un objeto único (FK
  // many-to-one) — se corrige con el cast explícito.
  const rows = (data ?? []) as unknown as VisitaQueryRow[];
  const visitas: VisitaFull[] = rows.map((r) => ({
    id: r.id,
    fecha: r.fecha ?? null,
    estado: mapEstadoOut(r.estado ?? ""),
    comentarios: toSentenceCase(r.notas ?? ""),
    actividad: "",
    inmuebleIds: r.properties ? [r.properties.id] : [],
    inmuebleCalles: r.properties ? [toTitleCase(r.properties.calle ?? "")] : [],
    inmuebleNumeros: r.properties ? [r.properties.numero ?? ""] : [],
    inmuebleBarrios: r.properties ? [toTitleCase(r.properties.barrio ?? "")] : [],
    clientesNombres: r.contacts ? [toTitleCase(r.contacts.nombre ?? "")] : [],
    clientesTelefonos: r.contacts ? [r.contacts.telefono ?? ""] : [],
    agentesIds: r.agents ? [r.agents.id] : [],
    agentesMails: r.agents ? [r.agents.email ?? ""] : [],
  }));

  return { visitas };
});
