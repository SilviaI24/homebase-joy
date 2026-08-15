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
      properties(id, calle, numero),
      contacts(id, nombre, telefono),
      agents(id, email)
    `,
    )
    .gte("fecha", cutoffISO)
    .order("fecha", { ascending: false })
    .limit(3000);

  if (error) throw new Error(error.message);

  const visitas: VisitaFull[] = (data ?? []).map((r: any) => ({
    id: r.id,
    fecha: r.fecha ?? null,
    estado: mapEstadoOut(r.estado ?? ""),
    comentarios: toSentenceCase(r.notas ?? ""),
    actividad: "",
    inmuebleIds: r.properties ? [r.properties.id] : [],
    inmuebleCalles: r.properties ? [toTitleCase(r.properties.calle ?? "")] : [],
    inmuebleNumeros: r.properties ? [r.properties.numero ?? ""] : [],
    clientesNombres: r.contacts ? [toTitleCase(r.contacts.nombre ?? "")] : [],
    clientesTelefonos: r.contacts ? [r.contacts.telefono ?? ""] : [],
    agentesIds: r.agents ? [r.agents.id] : [],
    agentesMails: r.agents ? [r.agents.email ?? ""] : [],
  }));

  return { visitas };
});
