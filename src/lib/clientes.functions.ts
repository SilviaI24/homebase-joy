import { createServerFn } from "@tanstack/react-start";
import { airtableFetch, BASE_ID, TABLES } from "./airtable.server";

export type ClienteAttachment = { url: string; filename: string; type: string };

export type Cliente = {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  dni: string;
  tipo: string;
  fecha: string | null;
  motivo: string;
  observaciones: string;
  solicitud: string;
  seccion: string;
  conversaciones: string;
  feedback: string;
  profesion: string;
  contratoTrabajo: string;
  mascota: string;
  avalista: string;
  categoria: string[];
  trabajado: string;
  propiedadIds: string[];
  propiedadRefs: string[];
  propiedadCalles: string[];
  inmuebleCompradorIds: string[];
  propiedadAlquilerIds: string[];
  inmueblesIds: string[];
  agentesIds: string[];
  agentesMails: string[];
  visitasIds: string[];
  attachments: ClienteAttachment[];
};

export const TIPOS_CLIENTE = [
  "Propietario",
  "Comprador",
  "Interesado Propiedades",
  "Interesado alquiler",
  "Prospecciones",
  "Anular prospección",
] as const;

function asStr(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.filter(Boolean).join(", ");
  return String(v);
}
function asIds(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}
function asArr(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]).map(String) : [];
}

function mapCliente(r: { id: string; fields: Record<string, unknown> }): Cliente {
  const f = r.fields;
  const atts = Array.isArray(f["Attachments"]) ? (f["Attachments"] as Array<{ url: string; filename: string; type: string }>) : [];
  return {
    id: r.id,
    nombre: asStr(f["Nombre"]).trim(),
    email: asStr(f["Email"]),
    telefono: asStr(f["Teléfono"]),
    dni: asStr(f["DNI"]),
    tipo: asStr(f["Tipo de cliente"]),
    fecha: (f["Fecha"] as string) ?? null,
    motivo: asStr(f["Motivo de la llamada"]),
    observaciones: asStr(f["Observaciones"]),
    solicitud: asStr(f["Solicitud de llamada"]),
    seccion: asStr(f["Seccion"]),
    conversaciones: asStr(f["Conversaciones"]),
    feedback: asStr(f["Feedback Comercial"]),
    profesion: asStr(f["Profesión"]),
    contratoTrabajo: asStr(f["Dispones de contrato de trabajo"]),
    mascota: asStr(f["¿Tiene mascota?"]),
    avalista: asStr(f["¿Dispones de avalista en caso de ser necesario?"]),
    categoria: asArr(f["Categoría"]),
    trabajado: asStr(f["Trabajado"]),
    propiedadIds: asIds(f["Propiedad asociada"]),
    propiedadRefs: asArr(f["Ref (from Propiedad asociada)"]),
    propiedadCalles: asArr(f["Calle (from Propiedad asociada)"]),
    inmuebleCompradorIds: asIds(f["Inmuebles/ comprador"]),
    propiedadAlquilerIds: asIds(f["Propiedad asociada alquiler"]),
    inmueblesIds: asIds(f["Inmuebles"]),
    agentesIds: asIds(f["Agentes (tabla agentes)"]),
    agentesMails: asArr(f["Mail (from Agentes)"]),
    visitasIds: asIds(f["Visitas calendario"]),
    attachments: atts.map((a) => ({ url: a.url, filename: a.filename, type: a.type })),
  };
}

export const listClientes = createServerFn({ method: "GET" }).handler(async () => {
  const records: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const page = (await airtableFetch(`/v0/${BASE_ID}/${TABLES.clientes}?${params}`)) as {
      records: Array<{ id: string; fields: Record<string, unknown> }>;
      offset?: string;
    };
    records.push(...page.records);
    offset = page.offset;
  } while (offset && records.length < 5000);
  const clientes = records.map(mapCliente);
  clientes.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  return { clientes };
});
