import { createServerFn } from "@tanstack/react-start";
import { airtableFetch, BASE_ID, TABLES } from "./airtable.server";
import { toTitleCase, toTitleCaseArr, toSentenceCase } from "./format";

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

const ESTADOS_VISITA = [
  "Pendiente",
  "Confirmada",
  "Completado",
  "Anulada",
  "Borrada",
] as const;
export type EstadoVisita = (typeof ESTADOS_VISITA)[number] | string;

function asArr(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).map((x) => String(x ?? "")).filter(Boolean) : [];
}

function mapVisita(r: { id: string; fields: Record<string, unknown> }): VisitaFull {
  const f = r.fields;
  return {
    id: r.id,
    fecha: (f["Fecha y Hora"] as string) ?? null,
    estado: String(f["Estado"] ?? ""),
    comentarios: toSentenceCase(String(f["Comentarios"] ?? "")),
    actividad: toTitleCase(
      Array.isArray(f["Actividad"])
        ? (f["Actividad"] as string[]).join(", ")
        : String(f["Actividad"] ?? ""),
    ),
    inmuebleIds: asArr(f["Inmuebles"]),
    inmuebleCalles: toTitleCaseArr(asArr(f["Calle del Inmueble"])),
    inmuebleNumeros: asArr(f["Numero"]),
    clientesNombres: toTitleCaseArr(asArr(f["Nombre Clientes"])),
    clientesTelefonos: asArr(f["Teléfono Clientes"]),
    agentesIds: asArr(f["Agentes"]),
    agentesMails: asArr(f["Mail (from Agentes)"]),
  };
}

export const listVisitas = createServerFn({ method: "GET" }).handler(async () => {
  // Trae visitas del año en curso y anterior, ordenadas por fecha desc.
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;
  const formula = `OR(YEAR({Fecha y Hora})=${currentYear},YEAR({Fecha y Hora})=${prevYear})`;
  const records: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({
      pageSize: "100",
      filterByFormula: formula,
    });
    if (offset) params.set("offset", offset);
    const page = (await airtableFetch(
      `/v0/${BASE_ID}/${TABLES.visitas}?${params}`,
    )) as {
      records: Array<{ id: string; fields: Record<string, unknown> }>;
      offset?: string;
    };
    records.push(...page.records);
    offset = page.offset;
  } while (offset && records.length < 3000);

  const visitas = records.map(mapVisita);
  visitas.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  return { visitas };
});
