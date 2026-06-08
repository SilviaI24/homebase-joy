import { createServerFn } from "@tanstack/react-start";
import { airtableFetch, BASE_ID, TABLES } from "./airtable.server";
import { getCategoria, isAlquiler, type Categoria } from "./inmuebles.functions";
import { toTitleCase, toTitleCaseArr, toSentenceCase } from "./format";

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
  habitaciones: number | null;
  superficie: number | null;
};

export type ClienteMatch = {
  inmueble: MiniInmueble;
  razones: string[];
  score: number;
};

export const SEGMENTOS = [
  "Propietario",
  "Comprador",
  "Inquilino",
  "Prospecto",
  "Lead",
  "Descartado",
] as const;
export type Segmento = (typeof SEGMENTOS)[number];

export const ESTADOS_COMERCIALES = [
  "Cerrado",
  "Activo",
  "En curso",
  "Frío",
  "Descartado",
] as const;
export type EstadoComercial = (typeof ESTADOS_COMERCIALES)[number];

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
  matches: ClienteMatch[];
  // Clasificación derivada
  segmento: Segmento;
  segmentoMotivo: string;
  estadoComercial: EstadoComercial;
  diasDesdeAlta: number | null;
  inmueblesVinculados: MiniInmueble[];
  duplicados: number;
  preferencias: ClientePrefs;
};

export type ClientePrefs = {
  presupuesto: { min: number | null; max: number | null };
  habitaciones: number | null;
  zonas: string[];
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

function parseIntSafe(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.match(/\d+/);
    if (m) return parseInt(m[0], 10);
  }
  return null;
}

function mapInmuebleMini(r: { id: string; fields: Record<string, unknown> }): MiniInmueble {
  const f = r.fields;
  const tipo = String(f["Tipo de inmueble (desplegable)"] ?? "");
  return {
    id: r.id,
    ref: String(f["Ref"] ?? ""),
    calle: toTitleCase(String(f["Calle"] ?? "").trim()),
    numero: String(f["Numero"] ?? ""),
    barrio: toTitleCase(String(f["Barrio"] ?? "")),
    localidad: toTitleCase(String(f["Localidad"] ?? "")),
    estatus: String(f["Estatus"] ?? ""),
    tipo,
    categoria: getCategoria(tipo),
    esAlquiler: isAlquiler(tipo),
    precio: typeof f["Precio"] === "number" ? (f["Precio"] as number) : null,
    precioFinal: typeof f["Precio Final "] === "number" ? (f["Precio Final "] as number) : null,
    imagen: pickAttachment(f["Imágenes"]),
    habitaciones: parseIntSafe(f["Habitaciones / dormitorios"]),
    superficie: parseIntSafe(f["Superficie"]),
  };
}

function mapClienteBase(r: { id: string; fields: Record<string, unknown> }): Omit<Cliente, "activo" | "motivoActivo" | "inmueblesActivos" | "matches" | "segmento" | "segmentoMotivo" | "estadoComercial" | "diasDesdeAlta" | "inmueblesVinculados" | "duplicados" | "preferencias"> {
  const f = r.fields;
  const atts = Array.isArray(f["Attachments"]) ? (f["Attachments"] as Array<{ url: string; filename: string; type: string }>) : [];
  return {
    id: r.id,
    nombre: toTitleCase(asStr(f["Nombre"]).trim()),
    email: asStr(f["Email"]),
    telefono: asStr(f["Teléfono"]),
    dni: asStr(f["DNI"]),
    tipo: asStr(f["Tipo de cliente"]),
    fecha: (f["Fecha"] as string) ?? null,
    motivo: toSentenceCase(asStr(f["Motivo de la llamada"])),
    observaciones: toSentenceCase(asStr(f["Observaciones"])),
    solicitud: toSentenceCase(asStr(f["Solicitud de llamada"])),
    seccion: toTitleCase(asStr(f["Seccion"])),
    conversaciones: toSentenceCase(asStr(f["Conversaciones"])),
    feedback: toSentenceCase(asStr(f["Feedback Comercial"])),
    profesion: toTitleCase(asStr(f["Profesión"])),
    contratoTrabajo: toTitleCase(asStr(f["Dispones de contrato de trabajo"])),
    mascota: toTitleCase(asStr(f["¿Tiene mascota?"])),
    avalista: toTitleCase(asStr(f["¿Dispones de avalista en caso de ser necesario?"])),
    categoria: asArr(f["Categoría"]),
    trabajado: toTitleCase(asStr(f["Trabajado"])),
    propiedadIds: asIds(f["Propiedad asociada"]),
    propiedadRefs: asArr(f["Ref (from Propiedad asociada)"]),
    propiedadCalles: toTitleCaseArr(asArr(f["Calle (from Propiedad asociada)"])),
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
  // Solo últimos 3 meses por Fecha. Si Fecha está vacía se descarta.
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  const formula = `IS_AFTER({Fecha}, '${cutoffISO}')`;

  const [clienteRecords, inmuebles] = await Promise.all([
    (async () => {
      const records: Array<{ id: string; fields: Record<string, unknown> }> = [];
      let offset: string | undefined;
      do {
        const params = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
        if (offset) params.set("offset", offset);
        const page = (await airtableFetch(`/v0/${BASE_ID}/${TABLES.clientes}?${params}`)) as {
          records: Array<{ id: string; fields: Record<string, unknown> }>;
          offset?: string;
        };
        records.push(...page.records);
        offset = page.offset;
      } while (offset && records.length < 50000);
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
    let matches: ClienteMatch[] = [];
    if (!activo) {
      const wantsAlquiler =
        base.tipo === "Interesado alquiler" ||
        /alquiler/i.test(base.solicitud) ||
        /alquiler/i.test(base.motivo);
      const wantsVenta =
        base.tipo === "Interesado Propiedades" ||
        base.tipo === "Comprador" ||
        /\b(compra|venta|comprar)\b/i.test(base.solicitud) ||
        /\b(compra|venta|comprar)\b/i.test(base.motivo);
      const pool = wantsAlquiler ? activosAlquiler : wantsVenta ? activosVenta : [];
      const linkedSet = new Set(linkedInmuebles.map((i) => i.id));
      const cats = base.categoria.map((c) => c.toLowerCase());
      matches = pool
        .filter((i) => !linkedSet.has(i.id))
        .map<ClienteMatch>((i) => {
          const razones: string[] = [];
          let score = 0;
          razones.push(i.esAlquiler ? "Alquiler" : "Venta");
          score += 2;
          if (cats.length === 0) {
            razones.push("Sin filtro de categoría");
          } else if (cats.includes(i.categoria.toLowerCase())) {
            razones.push(`Categoría: ${i.categoria}`);
            score += 3;
          } else {
            score -= 5;
          }
          return { inmueble: i, razones, score };
        })
        .filter((m) => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
    }

    // --- Clasificación derivada ----------------------------------------
    const tipoNorm = base.tipo.trim();
    const txt = `${base.solicitud} ${base.motivo}`.toLowerCase();
    const reAlquiler = /alquil/;
    const reCompra = /\b(compra|venta|comprar|adquirir)\b/;
    const tieneLinkPropiedad =
      base.propiedadIds.length > 0 || base.propiedadAlquilerIds.length > 0;
    const tieneLinkComprador = base.inmuebleCompradorIds.length > 0;

    let segmento: Segmento = "Lead";
    let segmentoMotivo = "Sin clasificación explícita";
    if (tipoNorm === "Anular prospección") {
      segmento = "Descartado";
      segmentoMotivo = "Marcado como anular prospección";
    } else if (tipoNorm === "Propietario" || tieneLinkPropiedad) {
      segmento = "Propietario";
      segmentoMotivo = tipoNorm === "Propietario" ? "Tipo: Propietario" : "Tiene inmueble vinculado como propietario";
    } else if (tipoNorm === "Prospecciones") {
      segmento = "Prospecto";
      segmentoMotivo = "Tipo: Prospección";
    } else if (tipoNorm === "Interesado alquiler" || reAlquiler.test(txt)) {
      segmento = "Inquilino";
      segmentoMotivo = tipoNorm === "Interesado alquiler" ? "Tipo: Interesado alquiler" : "Solicitud menciona alquiler";
    } else if (tipoNorm === "Comprador" || tipoNorm === "Interesado Propiedades" || tieneLinkComprador || reCompra.test(txt)) {
      segmento = "Comprador";
      segmentoMotivo = tipoNorm ? `Tipo: ${tipoNorm}` : "Solicitud de compra/venta";
    }

    // Estado comercial
    const cerrado = linkedInmuebles.some((i) => i.estatus === "Vendido" || i.estatus === "Alquilado");
    const tieneActivo = inmueblesActivos.length > 0;
    const fechaMs = base.fecha ? new Date(base.fecha).getTime() : 0;
    const diasDesdeAlta = fechaMs ? Math.max(0, Math.floor((Date.now() - fechaMs) / 86400000)) : null;
    let estadoComercial: EstadoComercial = "Frío";
    if (segmento === "Descartado") estadoComercial = "Descartado";
    else if (cerrado) estadoComercial = "Cerrado";
    else if (tieneActivo) estadoComercial = "Activo";
    else if (diasDesdeAlta != null && diasDesdeAlta <= 30) estadoComercial = "En curso";

    return {
      ...base,
      activo,
      motivoActivo,
      inmueblesActivos,
      matches: cerrado ? [] : matches,
      segmento,
      segmentoMotivo,
      estadoComercial,
      diasDesdeAlta,
      inmueblesVinculados: linkedInmuebles,
    };
  });

  clientes.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));

  // Dedupe: prioriza DNI, luego email, teléfono o nombre normalizado.
  // Como ya están ordenados por fecha desc, el primero que entra es el más reciente.
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const seen = new Set<string>();
  const unique: Cliente[] = [];
  for (const c of clientes) {
    const key =
      (c.dni && `dni:${norm(c.dni)}`) ||
      (c.email && `mail:${norm(c.email)}`) ||
      (c.telefono && `tel:${c.telefono.replace(/\D/g, "")}`) ||
      (c.nombre && `nom:${norm(c.nombre)}`) ||
      `id:${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  return { clientes: unique };
});
