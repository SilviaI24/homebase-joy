import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toTitleCase, toTitleCaseArr, toSentenceCase } from "./format";
import { hasPermission, requirePermission, requirePermissions } from "@/lib/crm-auth.server";

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
  esAlquiler: boolean;
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
  coordenadas: { lat: number; lng: number } | null;
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
  changelog: Array<{ ts: string; field: string; old: string | null; new: string | null }>;
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

export const PUBLICACION_OPCIONES = ["SUBIR", "PROSPECTO", "PUBLICADO"] as const;

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
  const t = tipo
    .toLowerCase()
    .replace(/^\s*alquiler\s+/, "")
    .trim();
  if (t.startsWith("piso")) return "Pisos";
  if (t.startsWith("chalet") || t.startsWith("casa")) return "Casas";
  if (t.startsWith("terreno")) return "Terrenos";
  if (t.startsWith("garaje")) return "Garajes";
  if (t.startsWith("trastero")) return "Trasteros";
  if (
    t.startsWith("local") ||
    t.startsWith("nave") ||
    t.startsWith("oficina") ||
    t.startsWith("edificio")
  )
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
  changelog: Array<{ ts: string; field: string; old: string | null; new: string | null }> | null;
  coordenadas: { lat: number; lng: number } | null;
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
  const img0 = imgs.find((img) => img?.url)?.url ?? null;
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
    tipo: s(row.tipo),
    esAlquiler: row.es_alquiler === true,
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
    coordenadas: (row.coordenadas as { lat: number; lng: number } | null) ?? null,
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
    changelog: (row.changelog ?? []) as Array<{
      ts: string;
      field: string;
      old: string | null;
      new: string | null;
    }>,
  };
}

// ── Types adicionales ─────────────────────────────────────────────────────────

export type ProspectoCanal = "Web" | "SilvIA" | "Directo";

export type ProspectoUnificado = {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  canal: ProspectoCanal;
  canalOrigen: string | null;
  fechaAlta: string;
  motivo: string;
  inmueble: {
    id: string;
    ref: string;
    calle: string;
    numero: string;
    barrio: string;
    localidad: string;
    tipo: string;
    superficie: number | null;
    habitaciones: number | null;
    precio: number | null;
    publicacion: string;
  } | null;
};

function canalGroup(origen: string | null): ProspectoCanal {
  if (!origen) return "Directo";
  if (origen === "Valorador-Web" || origen === "SilvIA-Valorador") return "Web";
  if (origen.startsWith("SilvIA-")) return "SilvIA";
  return "Directo";
}

// ── Server functions ──────────────────────────────────────────────────────────

export const listProspectos = createServerFn({ method: "GET" }).handler(async () => {
  await requirePermissions("contacts.read", "contact_roles.read", "properties.read");
  const supa = getSupa();
  const { data, error } = await supa
    .from("contacts")
    .select(
      `
      id, nombre, telefono, email, canal_origen, created_at, motivo,
      contact_roles(tipo,
        properties(id, ref, calle, numero, barrio, localidad, tipo,
          metros_construidos, habitaciones, precio, publicacion))
    `,
    )
    .eq("ciclo_vida", "Prospecto")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const prospectos: ProspectoUnificado[] = (data ?? []).map((c: any) => {
    const propRole = (c.contact_roles ?? []).find(
      (r: any) => r.tipo === "Propietario" || r.tipo === "Arrendador",
    );
    const prop = propRole?.properties ?? null;

    return {
      id: c.id,
      nombre: toTitleCase(c.nombre ?? "Sin nombre"),
      telefono: c.telefono ?? "",
      email: c.email ?? "",
      canal: canalGroup(c.canal_origen),
      canalOrigen: c.canal_origen ?? null,
      fechaAlta: c.created_at ?? "",
      motivo: c.motivo ?? "",
      inmueble: prop
        ? {
            id: prop.id,
            ref: prop.ref ?? "",
            calle: toTitleCase(prop.calle ?? ""),
            numero: prop.numero ?? "",
            barrio: toTitleCase(prop.barrio ?? ""),
            localidad: toTitleCase(prop.localidad ?? ""),
            tipo: prop.tipo ?? "",
            superficie: prop.metros_construidos ?? null,
            habitaciones: prop.habitaciones ?? null,
            precio: prop.precio ?? null,
            publicacion: prop.publicacion ?? "",
          }
        : null,
    };
  });

  return { prospectos };
});

export const listAllInmuebles = createServerFn({ method: "GET" }).handler(async () => {
  await requirePermission("properties.read");
  const supa = getSupa();
  const PAGE = 1000;
  const rows: SupabasePropertyRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supa
      .from("properties")
      .select(
        `
        id, ref, tipo, es_alquiler, calle, numero, barrio, localidad,
        metros_construidos, habitaciones, banos, precio, precio_final,
        estatus, publicacion, estado, imagenes, coordenadas, observaciones,
        fecha_inicio, fecha_reserva, fecha_escritura, created_at,
        agents(id, nombre, email)
      `,
      )
      .not("estatus", "is", null)
      .order("created_at", { ascending: false, nullsFirst: false })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as SupabasePropertyRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  const all = rows.map(mapBase);
  return {
    inmuebles: all.filter((i) => !i.esAlquiler),
    alquileres: all.filter((i) => i.esAlquiler),
  };
});

export const listInmuebles = createServerFn({ method: "GET" }).handler(async () => {
  await requirePermission("properties.read");
  const { inmuebles } = await listAllInmuebles();
  return { inmuebles };
});

export const listAlquileres = createServerFn({ method: "GET" }).handler(async () => {
  await requirePermission("properties.read");
  const { alquileres } = await listAllInmuebles();
  return { inmuebles: alquileres };
});

export const getInmueble = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => {
    if (!d?.id || typeof d.id !== "string") throw new Error("id requerido");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermissions("contacts.read", "contact_roles.read", "properties.read");
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

    const propietarios = (roles ?? []).map((r: any) => r.contacts).filter(Boolean) as Array<{
      id: string;
      nombre: string;
      telefono: string;
      email: string;
    }>;

    const inmueble = mapDetalle(row as SupabasePropertyRow, propietarios);
    return { inmueble };
  });

export const listAgentes = createServerFn({ method: "GET" }).handler(async () => {
  await requirePermission("contacts.read");
  const supa = getSupa();
  const { data, error } = await supa
    .from("agents")
    .select("id, nombre, email")
    .eq("activo", true)
    .order("nombre");
  if (error) throw new Error(error.message);
  const agentes: Agente[] = (data ?? []).map((r) => ({
    id: r.id,
    nombre: toTitleCase(r.nombre ?? "") || "(sin nombre)",
    mail: r.email ?? "",
  }));
  return { agentes };
});

export const listVisitasByInmueble = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => {
    if (!d?.id) throw new Error("id requerido");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermissions("contacts.read", "visits.read");
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
  .validator((d: { ids: string[] }) => {
    if (!Array.isArray(d.ids)) throw new Error("ids requerido");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermission("properties.read");
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
  .validator((d: UpdateInmueblePayload) => {
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
    await requirePermission("properties.update");
    if (data.estatus) {
      await requirePermissions("contacts.read", "contacts.update", "contact_roles.read");
    }
    const supa = getSupa();

    // Build the Supabase update object
    const up: Record<string, unknown> = {};

    if (data.estatus !== undefined) up.estatus = data.estatus;
    if (data.publicacion !== undefined) up.publicacion = data.publicacion;
    if (data.precio !== undefined) up.precio = data.precio;
    if (data.precioFinal !== undefined) up.precio_final = data.precioFinal;
    if (data.observaciones !== undefined) up.observaciones = data.observaciones;
    if (data.descripcion !== undefined) up.descripcion = data.descripcion;
    if (data.habitaciones !== undefined)
      up.habitaciones = data.habitaciones ? Number(data.habitaciones) || null : null;
    if (data.banos !== undefined) up.banos = data.banos ? Number(data.banos) || null : null;
    if (data.superficie !== undefined)
      up.metros_construidos = data.superficie ? Number(data.superficie) || null : null;
    if (data.planta !== undefined) up.piso = data.planta ?? "";
    if (data.estado !== undefined) up.estado = data.estado ?? "";
    if (data.anoConstruccion !== undefined) up.ano_construccion = data.anoConstruccion ?? "";
    if (data.certificacionEnergetica !== undefined)
      up.certificacion_energetica = data.certificacionEnergetica ?? "";
    if (data.calefaccion !== undefined) up.calefaccion = data.calefaccion ?? "";
    if (data.orientacion !== undefined) up.orientacion = data.orientacion ?? "";
    if (data.garaje !== undefined) up.garaje = data.garaje ?? "";
    if (data.trastero !== undefined) up.trastero = data.trastero ?? "";
    if (data.ascensor !== undefined) up.ascensor = data.ascensor ?? "";
    if (data.armariosEmpotrados !== undefined)
      up.armarios_empotrados = data.armariosEmpotrados ?? "";
    if (data.terraza !== undefined) up.terraza = data.terraza ?? "";
    if (data.balcon !== undefined) up.balcon = data.balcon ?? "";
    if (data.gastosComunidad !== undefined) up.gastos_comunidad = data.gastosComunidad ?? "";
    if (data.referenciaCatastral !== undefined)
      up.referencia_catastral = data.referenciaCatastral ?? "";
    if (data.fechaInicio !== undefined) up.fecha_inicio = data.fechaInicio || null;
    if (data.fechaExclusiva !== undefined) up.fecha_exclusiva = data.fechaExclusiva || null;
    if (data.fechaFinExclusiva !== undefined)
      up.fecha_fin_exclusiva = data.fechaFinExclusiva || null;
    if (data.fechaReserva !== undefined) up.fecha_reserva = data.fechaReserva || null;
    if (data.fechaEscritura !== undefined) up.fecha_escritura = data.fechaEscritura || null;
    if (data.honorarios !== undefined) up.honorarios = data.honorarios ?? "";
    if (data.tipoExclusiva !== undefined) up.tipo_exclusiva = data.tipoExclusiva ?? "";
    if (data.notaria !== undefined) up.notaria = data.notaria ?? "";
    if (data.llaves !== undefined) up.llaves = data.llaves ?? "";
    if (data.documentos !== undefined) up.documentos = data.documentos;

    // Agent update: store single agente_id (first agent in list)
    if (data.agentesIds !== undefined) {
      up.agente_id = data.agentesIds[0] ?? null;
    }

    // Changelog: record changes to estatus, precio, observaciones
    const needsLog =
      data.estatus !== undefined || data.precio !== undefined || data.observaciones !== undefined;
    if (needsLog) {
      try {
        const { data: cur } = await supa
          .from("properties")
          .select("estatus,precio,observaciones,changelog")
          .eq("id", data.id)
          .single();
        if (cur) {
          const existing: Array<{
            ts: string;
            field: string;
            old: string | null;
            new: string | null;
          }> = (cur as any).changelog ?? [];
          const ts = new Date().toISOString();
          const entries: typeof existing = [];
          if (data.estatus !== undefined && data.estatus !== cur.estatus)
            entries.push({ ts, field: "Estatus", old: cur.estatus ?? null, new: data.estatus });
          if (data.precio !== undefined && data.precio !== cur.precio)
            entries.push({
              ts,
              field: "Precio",
              old: cur.precio != null ? String(cur.precio) : null,
              new: data.precio != null ? String(data.precio) : null,
            });
          if (data.observaciones !== undefined && data.observaciones !== (cur.observaciones ?? ""))
            entries.push({
              ts,
              field: "Observaciones",
              old: cur.observaciones ?? null,
              new: data.observaciones || null,
            });
          if (entries.length > 0) {
            up.changelog = [...existing, ...entries];
          }
        }
      } catch {
        // changelog column may not exist yet — skip silently
      }
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

    const ESTATUS_FINAL = ["Vendido", "Alquilado", "Baja"] as const;
    if (data.estatus && ESTATUS_FINAL.includes(data.estatus as any)) {
      await requirePermission("properties.status_final");
    }
    if (data.publicacion !== undefined) {
      await requirePermission("properties.publish");
    }

    const { error } = await supa.from("properties").update(up).eq("id", data.id);
    if (error) throw new Error(error.message);

    // Cuando cambia el estatus de un inmueble, recalcular ciclo_vida de sus contactos.
    if (data.estatus) {
      const { data: linkedRoles } = await supa
        .from("contact_roles")
        .select("contact_id")
        .eq("property_id", data.id);

      const contactIds = [...new Set((linkedRoles ?? []).map((r: any) => r.contact_id as string))];

      if (contactIds.length > 0) {
        // Batch fetch all contacts and all their roles in two queries instead of 2×N
        const [{ data: contacts }, { data: allContactRoles }] = await Promise.all([
          supa.from("contacts").select("id, ciclo_vida").in("id", contactIds),
          supa
            .from("contact_roles")
            .select("contact_id, tipo, properties(estatus)")
            .in("contact_id", contactIds),
        ]);

        // Group roles by contact_id in memory
        const rolesByContact = new Map<
          string,
          Array<{ tipo: string; properties: { estatus: string } | null }>
        >();
        for (const role of (allContactRoles ?? []) as any[]) {
          if (!rolesByContact.has(role.contact_id)) rolesByContact.set(role.contact_id, []);
          rolesByContact.get(role.contact_id)!.push(role);
        }

        // Compute new ciclo_vida for each contact and batch update
        await Promise.all(
          (contacts ?? []).map(async (contact: any) => {
            if (contact.ciclo_vida === "Descartado") return;

            const roles = rolesByContact.get(contact.id) ?? [];
            const statuses = roles
              .map((r) => r.properties?.estatus as string | undefined)
              .filter(Boolean) as string[];

            let newCiclo: string;
            if (statuses.some((s) => s === "Activo" || s === "Reservado")) newCiclo = "Cliente";
            else if (statuses.some((s) => s === "Prospección")) newCiclo = "Prospecto";
            else if (statuses.some((s) => s === "Vendido" || s === "Alquilado"))
              newCiclo = "Histórico";
            else if (
              roles.some((role) =>
                ["Propietario", "Arrendador", "Comprador", "Inquilino"].includes(role.tipo),
              )
            )
              newCiclo = "Cliente";
            else newCiclo = "Lead";

            if (newCiclo !== contact.ciclo_vida) {
              const { error: lifecycleError } = await supa
                .from("contacts")
                .update({ ciclo_vida: newCiclo })
                .eq("id", contact.id);
              if (lifecycleError) throw new Error(lifecycleError.message);
            }
          }),
        );
      }
    }

    return { ok: true, id: data.id };
  });

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BASE64_MB = 10;

export const addImagenToInmueble = createServerFn({ method: "POST" })
  .validator((d: { id: string; base64: string; filename: string; mimeType: string }) => {
    if (!d?.id) throw new Error("id requerido");
    if (!d.base64) throw new Error("base64 requerido");
    if (!ALLOWED_MIME_TYPES.has(d.mimeType))
      throw new Error("Tipo de archivo no permitido. Use JPEG, PNG, WebP o GIF.");
    if (d.base64.length > (MAX_BASE64_MB * 1024 * 1024 * 4) / 3)
      throw new Error(`La imagen supera el límite de ${MAX_BASE64_MB}MB.`);
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermission("properties.update");
    const supa = getSupa();
    const BUCKET = "property-images";

    const byteString = atob(data.base64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);

    const safeFilename = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${data.id}/${Date.now()}_${safeFilename}`;

    const { error: uploadError } = await supa.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: data.mimeType, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const {
      data: { publicUrl },
    } = supa.storage.from(BUCKET).getPublicUrl(storagePath);

    const { data: prop } = await supa
      .from("properties")
      .select("imagenes")
      .eq("id", data.id)
      .single();
    const current: Array<{ url: string; filename: string; orden: number }> = prop?.imagenes ?? [];
    const next = [...current, { url: publicUrl, filename: data.filename, orden: current.length }];
    await supa.from("properties").update({ imagenes: next }).eq("id", data.id);

    return { url: publicUrl };
  });

const ALLOWED_BUCKETS = new Set(["property-images", "property-docs"]);

const ALLOWED_ATTACHMENT_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const MAX_ATTACHMENT_BASE64_MB = 20;

export const uploadPropertyAttachment = createServerFn({ method: "POST" })
  .validator((d: { base64: string; filename: string; mimeType: string; bucket: string }) => {
    if (!d?.base64) throw new Error("base64 requerido");
    if (!d?.filename) throw new Error("filename requerido");
    if (!d?.bucket) throw new Error("bucket requerido");
    if (!ALLOWED_BUCKETS.has(d.bucket)) throw new Error("bucket no permitido");
    if (!ALLOWED_ATTACHMENT_MIME.has(d.mimeType))
      throw new Error("Tipo de archivo no permitido. Use imágenes o PDF.");
    if (d.base64.length > (MAX_ATTACHMENT_BASE64_MB * 1024 * 1024 * 4) / 3)
      throw new Error(`El archivo supera el límite de ${MAX_ATTACHMENT_BASE64_MB}MB.`);
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermission("documents.upload");
    const supa = getSupa();
    const byteString = atob(data.base64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `pending/${Date.now()}_${safe}`;
    const { error } = await supa.storage.from(data.bucket).upload(path, bytes, {
      contentType: data.mimeType || "application/octet-stream",
      upsert: true,
    });
    if (error) throw new Error(error.message);
    const { data: pd } = supa.storage.from(data.bucket).getPublicUrl(path);
    return { url: pd.publicUrl };
  });

export const deleteInmueble = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => {
    if (!d?.id) throw new Error("id requerido");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermission("properties.delete_hard");
    const supa = getSupa();
    await supa.from("contact_roles").delete().eq("property_id", data.id);
    const { error } = await supa.from("properties").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Pagination helpers ────────────────────────────────────────────────────────

function escapeLike(s: string): string {
  return s.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export type InmueblesPageParams = {
  page: number;
  pageSize: number;
  statuses: string[];
  q: string;
  categoria: string;
  agente: string;
};

export type InmueblesPageResult = {
  inmuebles: Inmueble[];
  total: number;
  sectionTotals: { venta: number; prospectos: number; historico: number };
};

// Paginated fetch for the Cartera de Inmuebles grid (es_alquiler = false only).
// Filters applied server-side: estatus, search text (ref/calle/barrio/localidad/tipo),
// categoria (via tipo ilike patterns), agente (by nombre or null for unassigned).
// Returns current page data + total + section totals for tab badges.
export const listInmueblesPage = createServerFn({ method: "GET" })
  .validator((d: Partial<InmueblesPageParams>): InmueblesPageParams => {
    const page = Math.max(1, Number(d?.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(d?.pageSize) || 48));
    const statuses = Array.isArray(d?.statuses) ? (d.statuses as string[]).filter(Boolean) : [];
    const q = typeof d?.q === "string" ? d.q.trim() : "";
    const categoria = typeof d?.categoria === "string" ? d.categoria : "Todas";
    const agente = typeof d?.agente === "string" ? d.agente : "Todos";
    return { page, pageSize, statuses, q, categoria, agente };
  })
  .handler(async ({ data }): Promise<InmueblesPageResult> => {
    await requirePermission("properties.read");
    const supa = getSupa();
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let query = supa
      .from("properties")
      .select(
        `id, ref, tipo, es_alquiler, calle, numero, barrio, localidad,
         metros_construidos, habitaciones, banos, precio, precio_final,
         estatus, publicacion, estado, imagenes, coordenadas, observaciones,
         fecha_inicio, fecha_reserva, fecha_escritura, created_at,
         agents(id, nombre, email)`,
        { count: "exact" },
      )
      .eq("es_alquiler", false)
      .not("estatus", "is", null)
      .order("created_at", { ascending: false, nullsFirst: false });

    if (data.statuses.length > 0) {
      query = query.in("estatus", data.statuses);
    }

    if (data.q) {
      const needle = escapeLike(data.q);
      query = query.or(
        `ref.ilike.%${needle}%,calle.ilike.%${needle}%,barrio.ilike.%${needle}%,localidad.ilike.%${needle}%,tipo.ilike.%${needle}%`,
      );
    }

    // Server-side categoria filter via tipo patterns (Otros handled client-side)
    const catPatterns: Record<string, string[]> = {
      Pisos: ["piso"],
      Casas: ["chalet", "casa"],
      Terrenos: ["terreno"],
      Garajes: ["garaje"],
      Trasteros: ["trastero"],
      Locales: ["local", "nave", "oficina", "edificio"],
    };
    if (data.categoria !== "Todas" && data.categoria !== "Otros" && catPatterns[data.categoria]) {
      const orClauses = catPatterns[data.categoria]
        .map((p) => `tipo.ilike.%${escapeLike(p)}%`)
        .join(",");
      query = query.or(orClauses);
    }

    // Server-side agent filter
    if (data.agente === "Sin asignar") {
      query = query.is("agente_id", null);
    } else if (data.agente !== "Todos") {
      // Filter by agent name via join — effectively an INNER join condition
      query = query.eq("agents.nombre", data.agente);
    }

    const { data: rows, error, count } = await query.range(from, to);
    if (error) throw new Error("Error al cargar inmuebles");

    // Section counts (lightweight, unfiltered, for tab badges)
    const [ventaRes, prospRes, histRes] = await Promise.all([
      supa
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("es_alquiler", false)
        .in("estatus", ["Activo", "Reservado"]),
      supa
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("es_alquiler", false)
        .eq("estatus", "Prospección"),
      supa
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("es_alquiler", false)
        .in("estatus", ["Vendido", "Baja"]),
    ]);

    return {
      inmuebles: ((rows ?? []) as unknown as SupabasePropertyRow[]).map(mapBase),
      total: count ?? 0,
      sectionTotals: {
        venta: ventaRes.count ?? 0,
        prospectos: prospRes.count ?? 0,
        historico: histRes.count ?? 0,
      },
    };
  });

export const geocodeInmuebles = createServerFn({ method: "POST" })
  .validator(
    (d: {
      items: Array<{
        id: string;
        calle: string;
        numero: string;
        barrio: string;
        localidad: string;
      }>;
    }) => {
      if (!Array.isArray(d?.items)) throw new Error("items requerido");
      return d;
    },
  )
  .handler(async ({ data }) => {
    await requirePermission("properties.update");
    const supa = getSupa();
    const results: Array<{ id: string; lat: number; lng: number } | { id: string; error: string }> =
      [];
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (const item of data.items) {
      const parts = [item.calle, item.numero, item.barrio, item.localidad, "España"].filter(
        Boolean,
      );
      const q = encodeURIComponent(parts.join(", "));
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=es`,
          { headers: { "User-Agent": "ElSolGrupoCRM/1.0" } },
        );
        const json = (await res.json()) as Array<{ lat: string; lon: string }>;
        if (json.length > 0) {
          const lat = parseFloat(json[0].lat);
          const lng = parseFloat(json[0].lon);
          await supa.from("properties").update({ coordenadas: { lat, lng } }).eq("id", item.id);
          results.push({ id: item.id, lat, lng });
        } else {
          results.push({ id: item.id, error: "no_result" });
        }
      } catch (e) {
        results.push({ id: item.id, error: "fetch_error" });
      }
      await sleep(1100); // Nominatim: max 1 req/sec
    }
    return { results };
  });
