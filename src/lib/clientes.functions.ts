import { createServerFn } from "@tanstack/react-start";
import { airtableFetch, BASE_ID, TABLES } from "./airtable.server";
import { getCategoria, isAlquiler, type Categoria } from "./inmuebles.functions";

export type ClienteAttachment = { url: string; filename: string; type: string };

export type MiniInmueble = {
  id: string;
  ref: string;
  calle: string;
  numero: string;
  barrio: string;
  localidad: string;
  estatus: string;
  tipo: string;
  categoria: Categoria | "Otros";
  esAlquiler: boolean;
  precio: number | null;
  precioFinal: number | null;
  imagen: string | null;
};

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
  // Enriched
  activo: boolean;
  motivoActivo: string;
  inmueblesActivos: MiniInmueble[];
  matches: MiniInmueble[];
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

function pickAttachment(field: unknown): string | null {
  if (Array.isArray(field) && field.length > 0) {
    const att = field[0] as { url?: string; thumbnails?: { large?: { url?: string } } };
    return att.thumbnails?.large?.url ?? att.url ?? null;
  }
  return null;
}

function mapInmuebleMini(r: { id: string; fields: Record<string, unknown> }): MiniInmueble {
  const f = r.fields;
  const tipo = String(f["Tipo de inmueble (desplegable)"] ?? "");
  return {
    id: r.id,
    ref: String(f["Ref"] ?? ""),
    calle: String(f["Calle"] ?? "").trim(),
    numero: String(f["Numero"] ?? ""),
    barrio: String(f["Barrio"] ?? ""),
    localidad: String(f["Localidad"] ?? ""),
    estatus: String(f["Estatus"] ?? ""),
    tipo,
    categoria: getCategoria(tipo),
    esAlquiler: isAlquiler(tipo),
    precio: typeof f["Precio"] === "number" ? (f["Precio"] as number) : null,
    precioFinal: typeof f["Precio Final "] === "number" ? (f["Precio Final "] as number) : null,
    imagen: pickAttachment(f["Imágenes"]),
  };
}

function mapClienteBase(r: { id: string; fields: Record<string, unknown> }): Omit<Cliente, "activo" | "motivoActivo" | "inmueblesActivos" | "matches"> {
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

async function fetchAllInmueblesMini(): Promise<MiniInmueble[]> {
  const records: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let offset: string | undefined;
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;
  const formula = `OR(YEAR({Fecha de inicio})=${currentYear},YEAR({Fecha de inicio})=${prevYear})`;
  do {
    const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
    if (offset) params.set("offset", offset);
    const page = (await airtableFetch(`/v0/${BASE_ID}/${TABLES.inmuebles}?${params}`)) as {
      records: Array<{ id: string; fields: Record<string, unknown> }>;
      offset?: string;
    };
    records.push(...page.records);
    offset = page.offset;
  } while (offset && records.length < 2000);
  return records.map(mapInmuebleMini);
}

function categoriaMatches(clienteCats: string[], inmCat: string): boolean {
  if (clienteCats.length === 0) return true;
  return clienteCats.some((c) => c.toLowerCase() === inmCat.toLowerCase());
}

export const listClientes = createServerFn({ method: "GET" }).handler(async () => {
  const [clienteRecords, inmuebles] = await Promise.all([
    (async () => {
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
      return records;
    })(),
    fetchAllInmueblesMini(),
  ]);

  const byId = new Map(inmuebles.map((i) => [i.id, i]));
  const activosVenta = inmuebles.filter((i) => i.estatus === "Activo" && !i.esAlquiler);
  const activosAlquiler = inmuebles.filter((i) => i.estatus === "Activo" && i.esAlquiler);

  const clientes: Cliente[] = clienteRecords.map((r) => {
    const base = mapClienteBase(r);
    const linkedIds = new Set<string>([
      ...base.propiedadIds,
      ...base.inmuebleCompradorIds,
      ...base.propiedadAlquilerIds,
      ...base.inmueblesIds,
    ]);
    const linkedInmuebles = Array.from(linkedIds)
      .map((id) => byId.get(id))
      .filter((x): x is MiniInmueble => !!x);
    const inmueblesActivos = linkedInmuebles.filter(
      (i) => i.estatus === "Activo" || i.estatus === "Prospección",
    );

    // Activo: tipo Propietario/Prospecciones + algún inmueble activo o en prospección
    let activo = false;
    let motivoActivo = "";
    const esPropietario = base.tipo === "Propietario";
    const esProspeccion = base.tipo === "Prospecciones";
    if (esPropietario && inmueblesActivos.some((i) => i.estatus === "Activo")) {
      activo = true;
      motivoActivo = "Propietario con inmueble activo";
    } else if (esProspeccion && inmueblesActivos.some((i) => i.estatus === "Prospección")) {
      activo = true;
      motivoActivo = "Prospección activa";
    } else if (esPropietario && inmueblesActivos.length > 0) {
      activo = true;
      motivoActivo = "Propietario con inmueble en gestión";
    }

    // Match para potenciales: solo si no es activo
    let matches: MiniInmueble[] = [];
    if (!activo) {
      const wantsAlquiler = base.tipo === "Interesado alquiler";
      const wantsVenta = base.tipo === "Interesado Propiedades" || base.tipo === "Comprador";
      const pool = wantsAlquiler ? activosAlquiler : wantsVenta ? activosVenta : [];
      const linkedSet = new Set(linkedInmuebles.map((i) => i.id));
      matches = pool
        .filter((i) => !linkedSet.has(i.id) && categoriaMatches(base.categoria, i.categoria))
        .slice(0, 6);
    }

    return { ...base, activo, motivoActivo, inmueblesActivos, matches };
  });

  clientes.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
  return { clientes };
});
