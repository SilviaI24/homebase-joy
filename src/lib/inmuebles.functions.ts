import { createServerFn } from "@tanstack/react-start";
import { airtableFetch, BASE_ID, TABLES } from "./airtable.server";
import { toTitleCase, toTitleCaseArr, toSentenceCase } from "./format";

export type Inmueble = {
  id: string;
  ref: string;
  calle: string;
  numero: string;
  localidad: string;
  barrio: string;
  precio: number | null;
  precioFinal: number | null;
  tipo: string;
  estatus: string;
  publicacion: string;
  estado: string;
  habitaciones: string;
  banos: string;
  superficie: string;
  imagen: string | null;
  descripcion: string;
  propietario: string;
  telefonoPropietario: string;
  fechaInicio: string | null;
  fechaReserva: string | null;
  fechaEscritura: string | null;
  agentesNombres: string[];
  observaciones: string;
};

export type InmuebleDetalle = Inmueble & {
  imagenes: string[];
  imagenesAttachments: Array<{ id: string; url: string }>;
  agentesIds: string[];
  agentesNombres: string[];
  propietarioIds: string[];
  emailPropietario: string;
  certificacionEnergetica: string;
  anoConstruccion: string;
  gastosComunidad: string;
  calefaccion: string;
  orientacion: string;
  garaje: string;
  trastero: string;
  ascensor: string;
  armariosEmpotrados: string;
  terraza: string;
  balcon: string;
  planta: string;
  referenciaCatastral: string;
  honorarios: string;
  tipoExclusiva: string;
  notaria: string;
  observaciones: string;
  llaves: string;
  fechaExclusiva: string | null;
  fechaFinExclusiva: string | null;
  fechaReserva: string | null;
  fechaEscritura: string | null;
};

export type Agente = { id: string; nombre: string; mail: string };

export const ESTATUS_OPCIONES = [
  "Activo",
  "Reservado",
  "Vendido",
  "Baja",
  "Prospección",
  "Alquilado",
] as const;

export const PUBLICACION_OPCIONES = ["SUBIR", "PUBLICADO"] as const;

type AirtableAttachment = {
  url?: string;
  type?: string;
  filename?: string;
  thumbnails?: {
    small?: { url?: string };
    large?: { url?: string };
    full?: { url?: string };
  };
};

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|avif|bmp|heic|heif)$/i;

function isImageAttachment(att: AirtableAttachment): boolean {
  if (att.type && att.type.startsWith("image/")) return true;
  if (att.filename && IMAGE_EXT_RE.test(att.filename)) return true;
  // Si no hay metadatos pero sí thumbnails, Airtable lo trata como imagen.
  if (att.thumbnails && (att.thumbnails.large || att.thumbnails.full || att.thumbnails.small)) {
    return true;
  }
  return false;
}

function attachmentUrl(att: AirtableAttachment): string | null {
  return (
    att.thumbnails?.large?.url ??
    att.thumbnails?.full?.url ??
    att.url ??
    att.thumbnails?.small?.url ??
    null
  );
}

function pickAttachment(field: unknown): string | null {
  if (!Array.isArray(field)) return null;
  for (const a of field) {
    const att = a as AirtableAttachment;
    if (!isImageAttachment(att)) continue;
    const url = attachmentUrl(att);
    if (url) return url;
  }
  return null;
}

function pickAllAttachments(field: unknown): string[] {
  return pickAttachmentsWithIds(field).map((a) => a.url);
}

function pickAttachmentsWithIds(field: unknown): Array<{ id: string; url: string }> {
  if (!Array.isArray(field)) return [];
  const out: Array<{ id: string; url: string }> = [];
  for (const a of field) {
    const att = a as AirtableAttachment & { id?: string };
    if (!isImageAttachment(att)) continue;
    const url = attachmentUrl(att);
    if (!url || !att.id) continue;
    out.push({ id: att.id, url });
  }
  return out;
}

function pickLookup(field: unknown): string {
  if (Array.isArray(field)) return field.filter(Boolean).join(", ");
  return field == null ? "" : String(field);
}

function pickIds(field: unknown): string[] {
  return Array.isArray(field) ? (field as string[]) : [];
}

function mapBase(r: { id: string; fields: Record<string, unknown> }): Inmueble {
  const f = r.fields;
  return {
    id: r.id,
    ref: String(f["Ref"] ?? ""),
    calle: toTitleCase(String(f["Calle"] ?? "").trim()),
    numero: String(f["Numero"] ?? ""),
    localidad: toTitleCase(String(f["Localidad"] ?? "")),
    barrio: toTitleCase(String(f["Barrio"] ?? "")),
    precio: typeof f["Precio"] === "number" ? (f["Precio"] as number) : null,
    precioFinal:
      typeof f["Precio Final "] === "number" ? (f["Precio Final "] as number) : null,
    tipo: String(f["Tipo de inmueble (desplegable)"] ?? ""),
    estatus: toTitleCase(String(f["Estatus"] ?? "")),
    publicacion: String(f["Publicación"] ?? ""),
    estado: toTitleCase(String(f["Estado"] ?? "")),
    habitaciones: String(f["Habitaciones / dormitorios"] ?? ""),
    banos: String(f["Baño"] ?? ""),
    superficie: String(f["Superficie"] ?? ""),
    imagen: pickAttachment(f["Imágenes"]),
    descripcion: toSentenceCase(String(f["Descripción"] ?? "")),
    propietario: toTitleCase(pickLookup(f["Nombre Propietario"])),
    telefonoPropietario: pickLookup(f["Teléfono Propietario"]),
    fechaInicio: (f["Fecha de inicio"] as string) ?? null,
    fechaReserva: (f["Fecha Reserva"] as string) ?? null,
    fechaEscritura: (f["Fecha Escritura"] as string) ?? null,
    agentesNombres: Array.isArray(f["Nombre Agente Asignado"])
      ? toTitleCaseArr((f["Nombre Agente Asignado"] as string[]).map(String).filter(Boolean))
      : [],
    observaciones: String(f["Observaciones"] ?? ""),
  };
}

export function isAlquiler(tipo: string): boolean {
  return /^\s*alquiler/i.test(tipo);
}

export const CATEGORIAS = [
  "Pisos",
  "Casas",
  "Terrenos",
  "Garajes",
  "Trasteros",
  "Locales",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export function getCategoria(tipo: string): Categoria | "Otros" {
  const t = tipo.toLowerCase().replace(/^\s*alquiler\s+/, "").trim();
  if (t.startsWith("piso")) return "Pisos";
  if (t.startsWith("chalet") || t.startsWith("casa")) return "Casas";
  if (t.startsWith("terreno")) return "Terrenos";
  if (t.startsWith("garaje")) return "Garajes";
  if (t.startsWith("trastero")) return "Trasteros";
  if (t.startsWith("local") || t.startsWith("nave") || t.startsWith("oficina") || t.startsWith("edificio"))
    return "Locales";
  return "Otros";
}


async function fetchInmueblesFiltered(): Promise<Inmueble[]> {
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;
  const formula = `OR(YEAR({Fecha de inicio})=${currentYear},YEAR({Fecha de inicio})=${prevYear})`;
  const records: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({
      pageSize: "100",
      filterByFormula: formula,
    });
    if (offset) params.set("offset", offset);
    const page = (await airtableFetch(
      `/v0/${BASE_ID}/${TABLES.inmuebles}?${params}`,
    )) as {
      records: Array<{ id: string; fields: Record<string, unknown> }>;
      offset?: string;
    };
    records.push(...page.records);
    offset = page.offset;
  } while (offset && records.length < 2000);
  return records.map(mapBase);
}

// Devuelve ventas y alquileres en una sola petición a Airtable.
// Las rutas comparten esta query para evitar refetches duplicados.
export const listAllInmuebles = createServerFn({ method: "GET" }).handler(async () => {
  const all = await fetchInmueblesFiltered();
  const inmuebles = all.filter((i) => !isAlquiler(i.tipo));
  const alquileres = all.filter((i) => isAlquiler(i.tipo));
  return { inmuebles, alquileres };
});

// Compat: ahora derivan del fetch combinado para reutilizar caché en servidor.
export const listInmuebles = createServerFn({ method: "GET" }).handler(async () => {
  const all = await fetchInmueblesFiltered();
  return { inmuebles: all.filter((i) => !isAlquiler(i.tipo)) };
});

export const listAlquileres = createServerFn({ method: "GET" }).handler(async () => {
  const all = await fetchInmueblesFiltered();
  return { inmuebles: all.filter((i) => isAlquiler(i.tipo)) };
});

export const getInmueble = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => {
    if (!d?.id || typeof d.id !== "string") throw new Error("id requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const r = (await airtableFetch(
      `/v0/${BASE_ID}/${TABLES.inmuebles}/${data.id}`,
    )) as { id: string; fields: Record<string, unknown> };
    const base = mapBase(r);
    const f = r.fields;
    const detalle: InmuebleDetalle = {
      ...base,
      imagenes: pickAllAttachments(f["Imágenes"]),
      imagenesAttachments: pickAttachmentsWithIds(f["Imágenes"]),
      agentesIds: pickIds(f["Agentes Asignados"]),
      agentesNombres: Array.isArray(f["Nombre Agente Asignado"])
        ? toTitleCaseArr(f["Nombre Agente Asignado"] as string[])
        : [],
      propietarioIds: pickIds(f["Propietario"]),
      emailPropietario: pickLookup(f["Email Propietario"]),
      certificacionEnergetica: toTitleCase(String(f["Certificación energética"] ?? "")),
      anoConstruccion: String(f["Año de construcción"] ?? ""),
      gastosComunidad: toTitleCase(String(f["Gastos de comunidad"] ?? "")),
      calefaccion: toTitleCase(String(f["Calefacción"] ?? "")),
      orientacion: toTitleCase(pickLookup(f["Orientación"])),
      garaje: toTitleCase(String(f["Garaje"] ?? "")),
      trastero: toTitleCase(String(f["Trastero"] ?? "")),
      ascensor: toTitleCase(String(f["Ascensor"] ?? "")),
      armariosEmpotrados: toTitleCase(String(f["Armarios empotrados"] ?? "")),
      terraza: toTitleCase(String(f["Terraza"] ?? "")),
      balcon: toTitleCase(String(f["Balcón"] ?? "")),
      planta: toTitleCase(String(f["Planta"] ?? "")),
      referenciaCatastral: String(f["Referencia Catastral"] ?? ""),
      honorarios: toTitleCase(String(f["Honorarios"] ?? "")),
      tipoExclusiva: toTitleCase(String(f["Tipo de exclusiva"] ?? "")),
      notaria: toTitleCase(String(f["Notaría"] ?? "")),
      observaciones: toSentenceCase(String(f["Observaciones"] ?? "")),
      llaves: toTitleCase(String(f["Llaves"] ?? "")),
      fechaInicio: (f["Fecha de inicio"] as string) ?? null,
      fechaExclusiva: (f["Fecha de autorización de venta ( exclusiva)"] as string) ?? null,
      fechaFinExclusiva: (f["Fecha fin de exclusividad"] as string) ?? null,
      fechaReserva: (f["Fecha Reserva"] as string) ?? null,
      fechaEscritura: (f["Fecha Escritura"] as string) ?? null,
    };
    return { inmueble: detalle };
  });

export const listAgentes = createServerFn({ method: "GET" }).handler(async () => {
  const data = (await airtableFetch(
    `/v0/${BASE_ID}/${TABLES.agentes}?pageSize=100`,
  )) as { records: Array<{ id: string; fields: Record<string, unknown> }> };
  const agentes: Agente[] = data.records.map((r) => ({
    id: r.id,
    nombre: toTitleCase(String(r.fields["Nombre"] ?? "").trim()) || "(sin nombre)",
    mail: String(r.fields["Mail"] ?? ""),
  }));
  agentes.sort((a, b) => a.nombre.localeCompare(b.nombre));
  return { agentes };
});

export type Visita = {
  id: string;
  fecha: string | null;
  estado: string;
  comentarios: string;
  actividad: string;
  clientesNombres: string[];
  clientesTelefonos: string[];
  agentesMails: string[];
};

export const listVisitasByInmueble = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id requerido");
    return d;
  })
  .handler(async ({ data }) => {
    // Paginar y filtrar en JS porque {Inmuebles} en filterByFormula devuelve
    // nombres concatenados, no IDs de los registros enlazados.
    const records: Array<{ id: string; fields: Record<string, unknown> }> = [];
    let offset: string | undefined;
    do {
      const params = new URLSearchParams({ pageSize: "100" });
      if (offset) params.set("offset", offset);
      const page = (await airtableFetch(
        `/v0/${BASE_ID}/${TABLES.visitas}?${params}`,
      )) as {
        records: Array<{ id: string; fields: Record<string, unknown> }>;
        offset?: string;
      };
      records.push(...page.records);
      offset = page.offset;
    } while (offset && records.length < 1000);
    const res = {
      records: records.filter((r) => {
        const v = r.fields["Inmuebles"];
        return Array.isArray(v) && (v as string[]).includes(data.id);
      }),
    };

    const visitas: Visita[] = res.records.map((r) => {
      const f = r.fields;
      return {
        id: r.id,
        fecha: (f["Fecha y Hora"] as string) ?? null,
        estado: String(f["Estado"] ?? ""),
        comentarios: String(f["Comentarios"] ?? ""),
        actividad: pickLookup(f["Actividad"]),
        clientesNombres: Array.isArray(f["Nombre Clientes"])
          ? (f["Nombre Clientes"] as string[])
          : [],
        clientesTelefonos: Array.isArray(f["Teléfono Clientes"])
          ? (f["Teléfono Clientes"] as string[])
          : [],
        agentesMails: Array.isArray(f["Mail (from Agentes)"])
          ? (f["Mail (from Agentes)"] as string[])
          : [],
      };
    });
    visitas.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
    return { visitas };
  });

export const getInmueblesByIds = createServerFn({ method: "POST" })
  .inputValidator((d: { ids: string[] }) => {
    if (!Array.isArray(d.ids)) throw new Error("ids requerido");
    return d;
  })
  .handler(async ({ data }) => {
    if (data.ids.length === 0) return { inmuebles: [] as Inmueble[] };
    const parts = data.ids.map((id) => `RECORD_ID()='${id}'`);
    const formula = `OR(${parts.join(",")})`;
    const res = (await airtableFetch(
      `/v0/${BASE_ID}/${TABLES.inmuebles}?filterByFormula=${encodeURIComponent(formula)}&pageSize=100`,
    )) as {
      records: Array<{ id: string; fields: Record<string, unknown> }>;
    };
    const inmuebles = res.records.map(mapBase);
    return { inmuebles };
  });

export type UpdateInmueblePayload = {
  id: string;
  estatus?: string;
  publicacion?: string;
  precio?: number | null;
  precioFinal?: number | null;
  agentesIds?: string[];
  observaciones?: string;
  descripcion?: string;
  imagenesAttachmentIds?: string[]; // reorder existing attachments
};

export const updateInmueble = createServerFn({ method: "POST" })
  .inputValidator((d: UpdateInmueblePayload) => {
    if (!d?.id) throw new Error("id requerido");
    if (d.estatus && !ESTATUS_OPCIONES.includes(d.estatus as (typeof ESTATUS_OPCIONES)[number]))
      throw new Error("Estatus inválido");
    if (
      d.publicacion &&
      !PUBLICACION_OPCIONES.includes(d.publicacion as (typeof PUBLICACION_OPCIONES)[number])
    )
      throw new Error("Publicación inválida");
    if (d.precio != null && (typeof d.precio !== "number" || d.precio < 0))
      throw new Error("Precio inválido");
    if (d.precioFinal != null && (typeof d.precioFinal !== "number" || d.precioFinal < 0))
      throw new Error("Precio final inválido");
    if (d.agentesIds && !Array.isArray(d.agentesIds)) throw new Error("Agentes inválidos");
    if (d.imagenesAttachmentIds && !Array.isArray(d.imagenesAttachmentIds))
      throw new Error("Imágenes inválidas");
    return d;
  })
  .handler(async ({ data }) => {
    const fields: Record<string, unknown> = {};
    if (data.estatus !== undefined) fields["Estatus"] = data.estatus;
    if (data.publicacion !== undefined) fields["Publicación"] = data.publicacion;
    if (data.precio !== undefined) fields["Precio"] = data.precio;
    if (data.precioFinal !== undefined) fields["Precio Final "] = data.precioFinal;
    if (data.agentesIds !== undefined) fields["Agentes Asignados"] = data.agentesIds;
    if (data.observaciones !== undefined) fields["Observaciones"] = data.observaciones;
    if (data.descripcion !== undefined) fields["Descripción"] = data.descripcion;
    if (data.imagenesAttachmentIds !== undefined)
      fields["Imágenes"] = data.imagenesAttachmentIds.map((id) => ({ id }));

    const res = (await airtableFetch(`/v0/${BASE_ID}/${TABLES.inmuebles}/${data.id}`, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    })) as { id: string };
    return { ok: true, id: res.id };
  });
