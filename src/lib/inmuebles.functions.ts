import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toTitleCase, toTitleCaseArr, toSentenceCase } from "./format";

// ── Types ─────────────────────────────────────────────────────────────────────

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

export type Documento = { url: string; filename: string; type: string };

export type InmuebleDetalle = Inmueble & {
  imagenes: string[];
  imagenesAttachments: Array<{ id: string; url: string }>;
  documentos: Documento[];
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

export const ESTATUS_OPCIONES = [
  "Activo",
  "Reservado",
  "Vendido",
  "Baja",
  "Prospección",
  "Alquilado",
] as const;

export const PUBLICACION_OPCIONES = ["SUBIR", "PUBLICADO"] as const;

export const CATEGORIAS = [
  "Pisos",
  "Casas",
  "Terrenos",
  "Garajes",
  "Trasteros",
  "Locales",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export function isAlquiler(tipo: string): boolean {
  return /^\s*alquiler/i.test(tipo);
}

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

// ── Row mappers ───────────────────────────────────────────────────────────────

type SupabasePropertyRow = {
  id: string;
  ref: string | null;
  tipo: string;
  es_alquiler: boolean;
  calle: string;
  numero: string | null;
  piso: string | null;
  barrio: string | null;
  localidad: string | null;
  metros_construidos: number | null;
  habitaciones: number | null;
  banos: number | null;
  orientacion: string | null;
  descripcion: string | null;
  precio: number | null;
  precio_final: number | null;
  estatus: string;
  publicacion: string | null;
  estado: string | null;
  imagenes: Array<{ url: string; filename: string; orden: number }> | null;
  documentos: Array<{ url: string; filename: string; type: string }> | null;
  fecha_inicio: string | null;
  fecha_reserva: string | null;
  fecha_escritura: string | null;
  fecha_exclusiva: string | null;
  fecha_fin_exclusiva: string | null;
  certificacion_energetica: string | null;
  ano_construccion: string | null;
  gastos_comunidad: string | null;
  calefaccion: string | null;
  garaje: string | null;
  trastero: string | null;
  ascensor: string | null;
  armarios_empotrados: string | null;
  terraza: string | null;
  balcon: string | null;
  referencia_catastral: string | null;
  honorarios: string | null;
  tipo_exclusiva: string | null;
  notaria: string | null;
  llaves: string | null;
  observaciones: string | null;
  created_at: string;
  agents: { id: string; nombre: string; email: string | null } | null;
};

function s(v: string | null | undefined): string {
  return v ?? "";
}

function mapBase(row: SupabasePropertyRow): Inmueble {
  const imgs = row.imagenes ?? [];
  const img0 = imgs[0]?.url ?? null;
  const agente = row.agents;
  return {
    id: row.id,
    ref: s(row.ref),
    calle: toTitleCase(s(row.calle)),
    numero: s(row.numero),
    localidad: toTitleCase(s(row.localidad)),
    barrio: toTitleCase(s(row.barrio)),
    precio: row.precio,
    precioFinal: row.precio_final,
    tipo: row.tipo,
    estatus: toTitleCase(row.estatus),
    publicacion: s(row.publicacion),
    estado: toTitleCase(s(row.estado)),
    habitaciones: row.habitaciones != null ? String(row.habitaciones) : "",
    banos: row.banos != null ? String(row.banos) : "",
    superficie: row.metros_construidos != null ? String(row.metros_construidos) : "",
    imagen: img0,
    descripcion: toSentenceCase(s(row.descripcion)),
    propietario: "",
    telefonoPropietario: "",
    fechaInicio: row.fecha_inicio ?? row.created_at?.slice(0, 10) ?? null,
    fechaReserva: row.fecha_reserva ?? null,
    fechaEscritura: row.fecha_escritura ?? null,
    agentesNombres: agente ? [toTitleCase(agente.nombre)] : [],
    observaciones: s(row.observaciones),
  };
}

function mapDetalle(
  row: SupabasePropertyRow,
  propietarios: Array<{ id: string; nombre: string; telefono: string; email: string }>,
): InmuebleDetalle {
  const base = mapBase(row);
  const imgs = row.imagenes ?? [];
  const imgsAll = imgs.map((i) => i.url);
  const imgsAtt = imgs.map((i) => ({ id: i.url, url: i.url }));
  const agente = row.agents;

  const propietario = propietarios[0];
  base.propietario = propietario ? toTitleCase(propietario.nombre) : "";
  base.telefonoPropietario = propietario?.telefono ?? "";

  return {
    ...base,
    imagenes: imgsAll,
    imagenesAttachments: imgsAtt,
    documentos: (row.documentos ?? []) as Array<{ url: string; filename: string; type: string }>,
    agentesIds: agente ? [agente.id] : [],
    agentesNombres: agente ? [toTitleCase(agente.nombre)] : [],
    propietarioIds: propietarios.map((p) => p.id),
    emailPropietario: propietario?.email ?? "",
    certificacionEnergetica: toTitleCase(s(row.certificacion_energetica)),
    anoConstruccion: s(row.ano_construccion),
    gastosComunidad: toTitleCase(s(row.gastos_comunidad)),
    calefaccion: toTitleCase(s(row.calefaccion)),
    orientacion: toTitleCase(s(row.orientacion)),
    garaje: toTitleCase(s(row.garaje)),
    trastero: toTitleCase(s(row.trastero)),
    ascensor: toTitleCase(s(row.ascensor)),
    armariosEmpotrados: toTitleCase(s(row.armarios_empotrados)),
    terraza: toTitleCase(s(row.terraza)),
    balcon: toTitleCase(s(row.balcon)),
    planta: toTitleCase(s(row.piso)),
    referenciaCatastral: s(row.referencia_catastral),
    honorarios: toTitleCase(s(row.honorarios)),
    tipoExclusiva: toTitleCase(s(row.tipo_exclusiva)),
    notaria: toTitleCase(s(row.notaria)),
    llaves: toTitleCase(s(row.llaves)),
    fechaExclusiva: row.fecha_exclusiva ?? null,
    fechaFinExclusiva: row.fecha_fin_exclusiva ?? null,
    fechaReserva: row.fecha_reserva ?? null,
    fechaEscritura: row.fecha_escritura ?? null,
  };
}

// ── Two-year filter helper ────────────────────────────────────────────────────
// Airtable showed current + prev year. We keep the same window.
function twoYearCutoff(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  return d.toISOString().slice(0, 10);
}

// ── Server functions ──────────────────────────────────────────────────────────

export const listAllInmuebles = createServerFn({ method: "GET" }).handler(async () => {
  const supa = getSupa();
  const cutoff = twoYearCutoff();

  const { data, error } = await supa
    .from("properties")
    .select("*, agents(id, nombre, email)")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SupabasePropertyRow[];
  const all = rows.map(mapBase);
  return {
    inmuebles: all.filter((i) => !isAlquiler(i.tipo)),
    alquileres: all.filter((i) => isAlquiler(i.tipo)),
  };
});

export const listInmuebles = createServerFn({ method: "GET" }).handler(async () => {
  const { inmuebles } = await listAllInmuebles();
  return { inmuebles };
});

export const listAlquileres = createServerFn({ method: "GET" }).handler(async () => {
  const { alquileres } = await listAllInmuebles();
  return { inmuebles: alquileres };
});

export const getInmueble = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => {
    if (!d?.id || typeof d.id !== "string") throw new Error("id requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const supa = getSupa();

    const { data: row, error } = await supa
      .from("properties")
      .select("*, agents(id, nombre, email)")
      .eq("id", data.id)
      .single();

    if (error) throw new Error(error.message);

    // Fetch Propietario contacts linked to this property via contact_roles
    const { data: roles } = await supa
      .from("contact_roles")
      .select("contacts(id, nombre, telefono, email)")
      .eq("property_id", data.id)
      .eq("tipo", "Propietario");

    const propietarios = (roles ?? [])
      .map((r: any) => r.contacts)
      .filter(Boolean) as Array<{ id: string; nombre: string; telefono: string; email: string }>;

    const inmueble = mapDetalle(row as SupabasePropertyRow, propietarios);
    return { inmueble };
  });

export const listAgentes = createServerFn({ method: "GET" }).handler(async () => {
  const supa = getSupa();
  const { data, error } = await supa
    .from("agents")
    .select("id, nombre, email")
    .eq("activo", true)
    .order("nombre");
  if (error) throw new Error(error.message);
  const agentes: Agente[] = (data ?? []).map((r: any) => ({
    id: r.id,
    nombre: toTitleCase(r.nombre ?? "") || "(sin nombre)",
    mail: r.email ?? "",
  }));
  return { agentes };
});

export const listVisitasByInmueble = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => {
    if (!d?.id) throw new Error("id requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const supa = getSupa();
    const { data: rows, error } = await supa
      .from("visits")
      .select("id, fecha, estado, notas, contacts(nombre, telefono), agents(email)")
      .eq("property_id", data.id)
      .order("fecha", { ascending: false });

    if (error) throw new Error(error.message);

    const visitas: Visita[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      fecha: r.fecha ?? null,
      estado: mapEstadoVisitaOut(r.estado ?? ""),
      comentarios: toSentenceCase(r.notas ?? ""),
      actividad: "",
      clientesNombres: r.contacts ? [toTitleCase(r.contacts.nombre ?? "")] : [],
      clientesTelefonos: r.contacts ? [r.contacts.telefono ?? ""] : [],
      agentesMails: r.agents ? [r.agents.email ?? ""] : [],
    }));

    return { visitas };
  });

// Map from Supabase normalized estados back to Airtable display values
function mapEstadoVisitaOut(estado: string): string {
  const MAP: Record<string, string> = {
    Programada: "Pendiente",
    Realizada: "Completado",
    Cancelada: "Anulada",
  };
  return MAP[estado] ?? estado;
}

export const getInmueblesByIds = createServerFn({ method: "POST" })
  .inputValidator((d: { ids: string[] }) => {
    if (!Array.isArray(d.ids)) throw new Error("ids requerido");
    return d;
  })
  .handler(async ({ data }) => {
    if (data.ids.length === 0) return { inmuebles: [] as Inmueble[] };
    const supa = getSupa();
    const { data: rows, error } = await supa
      .from("properties")
      .select("*, agents(id, nombre, email)")
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    const inmuebles = (rows ?? []).map((r) => mapBase(r as SupabasePropertyRow));
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
  imagenesAttachmentIds?: string[]; // URLs in desired order
  habitaciones?: string;
  banos?: string;
  superficie?: string;
  planta?: string;
  estado?: string;
  anoConstruccion?: string;
  certificacionEnergetica?: string;
  calefaccion?: string;
  orientacion?: string;
  garaje?: string;
  trastero?: string;
  ascensor?: string;
  armariosEmpotrados?: string;
  terraza?: string;
  balcon?: string;
  gastosComunidad?: string;
  referenciaCatastral?: string;
  fechaInicio?: string | null;
  fechaExclusiva?: string | null;
  fechaFinExclusiva?: string | null;
  fechaReserva?: string | null;
  fechaEscritura?: string | null;
  honorarios?: string;
  tipoExclusiva?: string;
  notaria?: string;
  llaves?: string;
  documentos?: Array<{ url: string; filename: string; type: string }>;
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
    return d;
  })
  .handler(async ({ data }) => {
    const supa = getSupa();

    // Build the Supabase update object
    const up: Record<string, unknown> = {};

    if (data.estatus !== undefined) up.estatus = data.estatus;
    if (data.publicacion !== undefined) up.publicacion = data.publicacion;
    if (data.precio !== undefined) up.precio = data.precio;
    if (data.precioFinal !== undefined) up.precio_final = data.precioFinal;
    if (data.observaciones !== undefined) up.observaciones = data.observaciones;
    if (data.descripcion !== undefined) up.descripcion = data.descripcion;
    if (data.habitaciones !== undefined) up.habitaciones = data.habitaciones ? Number(data.habitaciones) || null : null;
    if (data.banos !== undefined) up.banos = data.banos ? Number(data.banos) || null : null;
    if (data.superficie !== undefined) up.metros_construidos = data.superficie ? Number(data.superficie) || null : null;
    if (data.planta !== undefined) up.piso = data.planta || null;
    if (data.estado !== undefined) up.estado = data.estado || null;
    if (data.anoConstruccion !== undefined) up.ano_construccion = data.anoConstruccion || null;
    if (data.certificacionEnergetica !== undefined) up.certificacion_energetica = data.certificacionEnergetica || null;
    if (data.calefaccion !== undefined) up.calefaccion = data.calefaccion || null;
    if (data.orientacion !== undefined) up.orientacion = data.orientacion || null;
    if (data.garaje !== undefined) up.garaje = data.garaje || null;
    if (data.trastero !== undefined) up.trastero = data.trastero || null;
    if (data.ascensor !== undefined) up.ascensor = data.ascensor || null;
    if (data.armariosEmpotrados !== undefined) up.armarios_empotrados = data.armariosEmpotrados || null;
    if (data.terraza !== undefined) up.terraza = data.terraza || null;
    if (data.balcon !== undefined) up.balcon = data.balcon || null;
    if (data.gastosComunidad !== undefined) up.gastos_comunidad = data.gastosComunidad || null;
    if (data.referenciaCatastral !== undefined) up.referencia_catastral = data.referenciaCatastral || null;
    if (data.fechaInicio !== undefined) up.fecha_inicio = data.fechaInicio || null;
    if (data.fechaExclusiva !== undefined) up.fecha_exclusiva = data.fechaExclusiva || null;
    if (data.fechaFinExclusiva !== undefined) up.fecha_fin_exclusiva = data.fechaFinExclusiva || null;
    if (data.fechaReserva !== undefined) up.fecha_reserva = data.fechaReserva || null;
    if (data.fechaEscritura !== undefined) up.fecha_escritura = data.fechaEscritura || null;
    if (data.honorarios !== undefined) up.honorarios = data.honorarios || null;
    if (data.tipoExclusiva !== undefined) up.tipo_exclusiva = data.tipoExclusiva || null;
    if (data.notaria !== undefined) up.notaria = data.notaria || null;
    if (data.llaves !== undefined) up.llaves = data.llaves || null;
    if (data.documentos !== undefined) up.documentos = data.documentos;

    // Agent update: store single agente_id (first agent in list)
    if (data.agentesIds !== undefined) {
      up.agente_id = data.agentesIds[0] ?? null;
    }

    // Image reorder: imagenesAttachmentIds are URLs in desired order
    if (data.imagenesAttachmentIds !== undefined) {
      // Fetch current imagenes to rebuild array preserving filenames
      const { data: prop } = await supa
        .from("properties")
        .select("imagenes")
        .eq("id", data.id)
        .single();
      const current: Array<{ url: string; filename: string; orden: number }> = prop?.imagenes ?? [];
      const byUrl = new Map(current.map((i) => [i.url, i]));
      up.imagenes = data.imagenesAttachmentIds
        .map((url, idx) => {
          const existing = byUrl.get(url);
          return { url, filename: existing?.filename ?? "imagen", orden: idx };
        })
        .filter((i) => i.url);
    }

    if (Object.keys(up).length === 0) return { ok: true, id: data.id };

    const { error } = await supa.from("properties").update(up).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, id: data.id };
  });
