import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toTitleCase, toTitleCaseArr, toSentenceCase, escapeSearchTerm } from "./format";
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
  observacionesPropietario: string;
  interesados: Array<{ id: string; nombre: string; telefono: string }>;
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
  duracionExclusividadMeses: number | null;
  comisionExclusividadPct: number | null;
  clausulasAdicionales: string;
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
  observaciones_propietario: string | null;
  created_at: string;
  agents: { id: string; nombre: string; email: string | null } | null;
  duracion_exclusividad_meses: number | null;
  comision_exclusividad_pct: number | null;
  clausulas_adicionales: string | null;
};

function s(v: string | null | undefined): string {
  return v ?? "";
}

// La portada no es "el primer elemento físico del array": es la de menor
// `orden`. Antes de esto, un reordenado manual en el CRM o un array mal
// reconstruido por la sync de Airtable (huecos/duplicados) cambiaba la
// portada aunque `orden` siguiera siendo correcto — con esto, el criterio es
// explícito y no depende de que la posición física del array esté bien.
function ordenarImagenes(
  imgs: Array<{ url: string; filename: string; orden?: number | null }>,
): Array<{ url: string; filename: string; orden?: number | null }> {
  return imgs
    .filter((img) => img?.url)
    .map((img, i) => ({ img, i }))
    .sort((a, b) => {
      const ordenA = a.img.orden ?? Number.MAX_SAFE_INTEGER;
      const ordenB = b.img.orden ?? Number.MAX_SAFE_INTEGER;
      if (ordenA !== ordenB) return ordenA - ordenB;
      return a.i - b.i; // estable: sin `orden`, se respeta el orden físico
    })
    .map(({ img }) => img);
}

function mapBase(row: SupabasePropertyRow): Inmueble {
  const imgs = ordenarImagenes(row.imagenes ?? []);
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
  interesados: Array<{ id: string; nombre: string; telefono: string }> = [],
): InmuebleDetalle {
  const base = mapBase(row);
  const imgs = ordenarImagenes(row.imagenes ?? []);
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
    observacionesPropietario: toSentenceCase(s(row.observaciones_propietario)),
    interesados: interesados.map((i) => ({
      id: i.id,
      nombre: toTitleCase(i.nombre),
      telefono: i.telefono ?? "",
    })),
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
    duracionExclusividadMeses: row.duracion_exclusividad_meses ?? null,
    comisionExclusividadPct: row.comision_exclusividad_pct ?? null,
    clausulasAdicionales: s(row.clausulas_adicionales),
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

type ProspectoQueryRow = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  email: string | null;
  canal_origen: string | null;
  created_at: string | null;
  motivo: string | null;
  contact_roles: Array<{
    tipo: string;
    properties: {
      id: string;
      ref: string | null;
      calle: string | null;
      numero: string | null;
      barrio: string | null;
      localidad: string | null;
      tipo: string | null;
      metros_construidos: number | null;
      habitaciones: number | null;
      precio: number | null;
      publicacion: string | null;
    } | null;
  }> | null;
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

  const prospectos: ProspectoUnificado[] = (
    (data as unknown as ProspectoQueryRow[] | null) ?? []
  ).map((c) => {
    const propRole = (c.contact_roles ?? []).find(
      (r) => r.tipo === "Propietario" || r.tipo === "Arrendador",
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

// listComerciablesInmuebles: filtro de estatus (Activo/Reservado) empujado a
// SQL en vez de aplicarse en el cliente.
// Usado por la bandeja operativa para detectar inmuebles mencionados en
// conversaciones, y por el hub de Comerciales (directorio por agente + selector
// de inmueble en "Nueva visita") — solo tiene sentido vincular/asignar inmuebles
// que hoy se pueden comercializar, así que no hace falta traer los 5.817
// registros históricos. Verificado contra producción (21 ago 2026): del total
// de la tabla, solo 97 filas están Activo/Reservado, y los conteos por agente
// que antes calculaba el hub de Comerciales recorriendo TODA la tabla en el
// navegador solo dependen de estas dos estatus — ver comerciales.index.lazy.tsx.
export const listComerciablesInmuebles = createServerFn({ method: "GET" }).handler(async () => {
  await requirePermission("properties.read");
  const supa = getSupa();
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
    .in("estatus", ["Activo", "Reservado"])
    .order("created_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);
  const all = ((data ?? []) as unknown as SupabasePropertyRow[]).map(mapBase);
  return {
    inmuebles: all.filter((i) => !i.esAlquiler),
    alquileres: all.filter((i) => i.esAlquiler),
  };
});

// listInmueblesActividadReciente: para el feed "Actividad reciente" del hub de
// Comerciales, que antes recorría las 5.817 filas de listAllInmueblesLite
// buscando fecha_inicio/fecha_reserva/fecha_escritura para construir el feed
// de eventos (captación/reserva/cierre). En vez de la tabla completa, trae las
// LIMIT filas más recientes por cada una de esas 3 fechas por separado (mismo
// patrón que "recientes"/"estancados" en getDashboardStats: listas reales
// pedidas con .order().limit(), no un agregado) y las deduplica por id.
//
// LIMIT=40 en vez de 30 (que es lo que finalmente muestra la pantalla) por
// margen de seguridad: verificado contra producción con execute_sql (21 ago
// 2026) que el top-30 real de eventos — mezclando las 3 fechas de las 5.819
// filas de la tabla — está siempre contenido en la unión de los top-40 de
// cada columna por separado (0 filas del top-30 real quedaron fuera). Esto se
// cumple siempre que el límite por columna sea >= al límite final mostrado,
// porque cualquier fila del top-N global por fecha máxima también está en el
// top-N de su propia columna.
const ACTIVIDAD_RECIENTE_LIMIT_POR_FECHA = 40;

export const listInmueblesActividadReciente = createServerFn({ method: "GET" }).handler(
  async () => {
    await requirePermission("properties.read");
    const supa = getSupa();
    const cols = `
      id, ref, tipo, es_alquiler, calle, numero, barrio, localidad,
      precio, precio_final, estatus, publicacion,
      fecha_inicio, fecha_reserva, fecha_escritura, created_at,
      agents(id, nombre, email)
    `;

    const [captRes, reservaRes, cierreRes] = await Promise.all([
      supa
        .from("properties")
        .select(cols)
        .not("fecha_inicio", "is", null)
        .order("fecha_inicio", { ascending: false })
        .limit(ACTIVIDAD_RECIENTE_LIMIT_POR_FECHA),
      supa
        .from("properties")
        .select(cols)
        .not("fecha_reserva", "is", null)
        .order("fecha_reserva", { ascending: false })
        .limit(ACTIVIDAD_RECIENTE_LIMIT_POR_FECHA),
      supa
        .from("properties")
        .select(cols)
        .not("fecha_escritura", "is", null)
        .order("fecha_escritura", { ascending: false })
        .limit(ACTIVIDAD_RECIENTE_LIMIT_POR_FECHA),
    ]);

    if (captRes.error) throw new Error(captRes.error.message);
    if (reservaRes.error) throw new Error(reservaRes.error.message);
    if (cierreRes.error) throw new Error(cierreRes.error.message);

    // Dedup por id: una misma propiedad puede aparecer en más de una de las
    // 3 consultas (p. ej. captada y reservada recientemente a la vez).
    const byId = new Map<string, SupabasePropertyRow>();
    for (const row of [
      ...((captRes.data ?? []) as unknown as SupabasePropertyRow[]),
      ...((reservaRes.data ?? []) as unknown as SupabasePropertyRow[]),
      ...((cierreRes.data ?? []) as unknown as SupabasePropertyRow[]),
    ]) {
      byId.set(row.id, row);
    }

    const all = Array.from(byId.values()).map(mapBase);
    return {
      inmuebles: all.filter((i) => !i.esAlquiler),
      alquileres: all.filter((i) => i.esAlquiler),
    };
  },
);

export const getInmueble = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => {
    if (!d?.id || typeof d.id !== "string") throw new Error("id requerido");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermissions("contacts.read", "contact_roles.read", "properties.read");
    const supa = getSupa();

    // Las dos consultas son independientes (la de roles solo necesita
    // data.id) — en paralelo en vez de esperar la primera para lanzar la
    // segunda (auditoría 12 sep 2026, ahorra un roundtrip en cada apertura
    // de ficha).
    const [{ data: row, error }, { data: roles }, { data: interesadosRows }] = await Promise.all([
      supa.from("properties").select("*, agents(id, nombre, email)").eq("id", data.id).single(),
      // Contactos "dueños" del inmueble vía contact_roles: Propietario
      // (venta) y Arrendador (alquiler) se tratan como equivalentes en el
      // resto del código (deriveSegmento, listProspectos, listClientesPage)
      // — antes este filtro solo pedía "Propietario", así que la ficha de
      // un inmueble en alquiler nunca mostraba a su dueño.
      supa
        .from("contact_roles")
        .select("contacts(id, nombre, telefono, email)")
        .eq("property_id", data.id)
        .in("tipo", ["Propietario", "Arrendador"]),
      // Interesados: leads enlazados a este inmueble sin formalizar todavía
      // (ver punto "Interesado" de las instrucciones de mejora, sep 2026).
      supa
        .from("contact_roles")
        .select("contacts(id, nombre, telefono)")
        .eq("property_id", data.id)
        .eq("tipo", "Interesado"),
    ]);

    if (error) throw new Error(error.message);

    const roleRows = (roles ?? []) as unknown as Array<{
      contacts: { id: string; nombre: string; telefono: string; email: string } | null;
    }>;
    const propietarios = roleRows.map((r) => r.contacts).filter(Boolean) as Array<{
      id: string;
      nombre: string;
      telefono: string;
      email: string;
    }>;

    const interesadosRaw = (interesadosRows ?? []) as unknown as Array<{
      contacts: { id: string; nombre: string; telefono: string } | null;
    }>;
    const interesados = interesadosRaw.map((r) => r.contacts).filter(Boolean) as Array<{
      id: string;
      nombre: string;
      telefono: string;
    }>;

    const inmueble = mapDetalle(row as SupabasePropertyRow, propietarios, interesados);
    return { inmueble };
  });

export type PropietarioInmueble = {
  id: string;
  nombre: string;
  dni: string;
  domicilio: string;
  telefono: string;
  contactId: string | null;
};

// Para el panel "Datos del contrato de exclusividad" en la ficha del
// inmueble (21 sep 2026): el comercial necesita ver y editar el DNI/domicilio
// de TODOS los propietarios vinculados desde un único sitio, no uno por uno
// desde la ficha de cada contacto -- ninguna función existente traía esta
// lista completa con datos de firma incluidos.
export const listPropietariosInmueble = createServerFn({ method: "GET" })
  .validator((d: { propertyId: string }) => {
    if (!d?.propertyId) throw new Error("Inmueble requerido");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermission("contacts.portal_invite");
    const supa = getSupa();

    const { data: enlaces, error } = await supa
      .from("propietario_inmueble")
      .select("propietario_id")
      .eq("property_id", data.propertyId);
    if (error) throw new Error(error.message);

    const ids = (enlaces ?? []).map((e) => e.propietario_id as string);
    if (ids.length === 0) return { propietarios: [] as PropietarioInmueble[] };

    const { data: rows, error: err2 } = await supa
      .from("propietarios")
      .select("id, nombre, dni, domicilio, telefono, contact_id")
      .in("id", ids)
      .order("nombre");
    if (err2) throw new Error(err2.message);

    const propietarios: PropietarioInmueble[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      nombre: (r.nombre as string) ?? "",
      dni: (r.dni as string) ?? "",
      domicilio: (r.domicilio as string) ?? "",
      telefono: (r.telefono as string) ?? "",
      contactId: (r.contact_id as string | null) ?? null,
    }));
    return { propietarios };
  });

// Documentos de onboarding (tabla `documentos`, no el campo `properties.documentos`
// que edita DocumentosPanel) — 22 sep 2026. Nunca se veían desde la ficha del
// inmueble, solo desde el Portal y desde la ficha de cliente: el comercial no
// tenía forma de comprobar aquí que ya había un contrato firmado, ni el resto
// de documentación subida.
export type DocumentoOnboarding = {
  id: string;
  nombre: string;
  categoria: string | null;
  estado: string;
  tipoMime: string | null;
  createdAt: string | null;
};

export const listDocumentosOnboarding = createServerFn({ method: "GET" })
  .validator((d: { propertyId: string }) => {
    if (!d?.propertyId) throw new Error("Inmueble requerido");
    return d;
  })
  .handler(async ({ data }): Promise<{ documentos: DocumentoOnboarding[] }> => {
    await requirePermission("contacts.portal_invite");
    const supa = getSupa();
    const { data: rows, error } = await supa
      .from("documentos")
      .select("id, nombre, categoria, estado, tipo_mime, created_at")
      .eq("property_id", data.propertyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      documentos: (rows ?? []).map((r) => ({
        id: r.id as string,
        nombre: (r.nombre as string) ?? "Documento",
        categoria: (r.categoria as string | null) ?? null,
        estado: (r.estado as string) ?? "pendiente",
        tipoMime: (r.tipo_mime as string | null) ?? null,
        createdAt: (r.created_at as string | null) ?? null,
      })),
    };
  });

// URL firmada de un documento de la tabla `documentos` (bucket client-documents
// — el mismo que usa docuten-webhook para archivar el contrato firmado y el
// Portal para las subidas de onboarding). Mismo patrón que getPropertyDocumentUrl
// más abajo, pero para esta tabla en vez de properties.documentos.
export const getDocumentoOnboardingUrl = createServerFn({ method: "POST" })
  .validator((d: { documentoId: string }) => {
    if (!d?.documentoId) throw new Error("Documento requerido");
    return d;
  })
  .handler(async ({ data }): Promise<{ url: string; tipoMime: string | null; nombre: string }> => {
    await requirePermission("contacts.portal_invite");
    const supa = getSupa();
    const { data: doc, error } = await supa
      .from("documentos")
      .select("storage_path, tipo_mime, nombre")
      .eq("id", data.documentoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc?.storage_path) throw new Error("Documento sin archivo asociado");
    const { data: signed, error: signError } = await supa.storage
      .from("client-documents")
      .createSignedUrl(doc.storage_path as string, 120);
    if (signError) throw new Error(signError.message);
    return {
      url: signed.signedUrl,
      tipoMime: (doc.tipo_mime as string | null) ?? null,
      nombre: (doc.nombre as string) ?? "Documento",
    };
  });

// Estado del contrato de exclusividad de un inmueble — 22 sep 2026, para que
// "Generar contrato" (ContratoExclusividadPanel) deje de estar siempre abierto
// una vez ya hay uno firmado (riesgo real: generar otro de más sale dinero de
// verdad en Docuten). `documentoId` permite abrir directamente su vista previa.
export type ContratoExclusividadEstado = {
  firmado: boolean;
  documentoId: string | null;
};

export const getContratoExclusividadEstado = createServerFn({ method: "GET" })
  .validator((d: { propertyId: string }) => {
    if (!d?.propertyId) throw new Error("Inmueble requerido");
    return d;
  })
  .handler(async ({ data }): Promise<ContratoExclusividadEstado> => {
    await requirePermission("contacts.portal_invite");
    const supa = getSupa();
    const { data: tx } = await supa
      .from("transacciones_docuten")
      .select("estado, envelope_id")
      .eq("property_id", data.propertyId)
      .eq("tipo_documento", "CONTRATO_EXCLUSIVIDAD")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tx || tx.estado !== "signed") return { firmado: false, documentoId: null };

    const { data: doc } = await supa
      .from("documentos")
      .select("id")
      .eq("docuten_envelope_id", tx.envelope_id as string)
      .maybeSingle();

    return { firmado: true, documentoId: (doc?.id as string | undefined) ?? null };
  });

// Rechazar un contrato ya firmado que resulta ser erróneo — 22 sep 2026,
// pedido por David tras la primera firma real: si el comercial detecta un
// error al revisar el PDF firmado, necesita poder invalidarlo (no solo
// generar uno nuevo por encima, que dejaría el erróneo como si fuera válido
// en el progreso de onboarding y en la lista de documentos del propietario).
export const rechazarContratoFirmado = createServerFn({ method: "POST" })
  .validator((d: { propertyId: string }) => {
    if (!d?.propertyId) throw new Error("Inmueble requerido");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermission("contacts.portal_invite");
    const supa = getSupa();

    const { data: tx, error: txFindError } = await supa
      .from("transacciones_docuten")
      .select("id, envelope_id")
      .eq("property_id", data.propertyId)
      .eq("tipo_documento", "CONTRATO_EXCLUSIVIDAD")
      .eq("estado", "signed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (txFindError) throw new Error(txFindError.message);
    if (!tx) throw new Error("No hay ningún contrato firmado para rechazar");

    const { error: txError } = await supa
      .from("transacciones_docuten")
      .update({ estado: "rejected" })
      .eq("id", tx.id);
    if (txError) throw new Error(txError.message);

    if (tx.envelope_id) {
      await supa
        .from("documentos")
        .update({ estado: "rechazado" })
        .eq("docuten_envelope_id", tx.envelope_id as string);
    }

    return { ok: true };
  });

// Desvincular un propietario de un inmueble — 22 sep 2026, para el caso de
// haber vinculado el contacto equivocado como propietario. Retira el rol
// (contact_roles, lo que hace visible/editable "Propietario" en la ficha del
// inmueble) y el enlace de Portal (propietario_inmueble, lo que hace que
// vea este inmueble en su cartera). No borra la ficha de propietarios en sí
// ni su cuenta del Portal — puede seguir vinculado a otros inmuebles.
export const desvincularPropietarioInmueble = createServerFn({ method: "POST" })
  .validator((d: { propertyId: string; propietarioId: string; contactId: string | null }) => {
    if (!d?.propertyId) throw new Error("Inmueble requerido");
    if (!d?.propietarioId) throw new Error("Propietario requerido");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermission("contacts.portal_invite");
    const supa = getSupa();

    const { error: piError } = await supa
      .from("propietario_inmueble")
      .delete()
      .eq("propietario_id", data.propietarioId)
      .eq("property_id", data.propertyId);
    if (piError) throw new Error(piError.message);

    if (data.contactId) {
      const { error: rolError } = await supa
        .from("contact_roles")
        .delete()
        .eq("contact_id", data.contactId)
        .eq("property_id", data.propertyId)
        .in("tipo", ["Propietario", "Arrendador"]);
      if (rolError) throw new Error(rolError.message);
    }

    return { ok: true };
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

    // Supabase-js sin tipos de Database generados infiere las relaciones
    // como array por defecto; en runtime PostgREST devuelve un objeto único
    // (FK many-to-one) — se corrige con el cast explícito.
    const visitRows = (rows ?? []) as unknown as Array<{
      id: string;
      fecha: string | null;
      estado: string | null;
      notas: string | null;
      contacts: { nombre: string | null; telefono: string | null } | null;
      agents: { email: string | null } | null;
    }>;

    const visitas: Visita[] = visitRows.map((r) => ({
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

export type UpdateInmueblePayload = {
  id: string;
  estatus?: string;
  publicacion?: string;
  precio?: number | null;
  precioFinal?: number | null;
  agentesIds?: string[];
  observaciones?: string;
  observacionesPropietario?: string;
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
  duracionExclusividadMeses?: number | null;
  comisionExclusividadPct?: number | null;
  clausulasAdicionales?: string;
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
    if (d.duracionExclusividadMeses != null && d.duracionExclusividadMeses <= 0)
      throw new Error("Duración de exclusividad inválida");
    if (
      d.comisionExclusividadPct != null &&
      (d.comisionExclusividadPct < 0 || d.comisionExclusividadPct > 100)
    )
      throw new Error("Comisión de exclusividad inválida");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("properties.update");
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
    if (data.observacionesPropietario !== undefined)
      up.observaciones_propietario = data.observacionesPropietario;
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
    if (data.duracionExclusividadMeses !== undefined)
      up.duracion_exclusividad_meses = data.duracionExclusividadMeses;
    if (data.comisionExclusividadPct !== undefined)
      up.comision_exclusividad_pct = data.comisionExclusividadPct;
    if (data.clausulasAdicionales !== undefined)
      up.clausulas_adicionales = data.clausulasAdicionales ?? "";

    // Agent update: store single agente_id (first agent in list)
    if (data.agentesIds !== undefined) {
      up.agente_id = data.agentesIds[0] ?? null;
    }

    // Nota H-05 (24 ago 2026): aquí vivía un bloque de "changelog" que
    // intentaba registrar cambios de estatus/precio/observaciones en una
    // columna properties.changelog -- esa columna no existe en el esquema
    // real (verificado contra information_schema), así que ese bloque era
    // código muerto en la práctica desde siempre (el try/catch nunca
    // disparaba: supabase-js no lanza excepción por columna inexistente,
    // solo devuelve data:null, y el `if (cur)` de más abajo nunca era
    // cierto). No se replica en el RPC.

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

    const ESTATUS_FINAL: readonly string[] = ["Vendido", "Alquilado", "Baja"];
    if (data.estatus && ESTATUS_FINAL.includes(data.estatus)) {
      await requirePermission("properties.status_final");
    }
    if (data.publicacion !== undefined) {
      await requirePermission("properties.publish");
    }

    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
    // `up` ya usa las claves snake_case reales de la tabla -- jsonb_populate_record
    // sobre la fila existente conserva cualquier columna cuya clave no esté
    // en `up`, dando exactamente la semántica de "solo escribir lo que
    // llegó" que tenía el .update(up) directo. La cascada de ciclo_vida
    // sobre los contactos vinculados (antes eran varias llamadas desde
    // aquí) también vive ahora en el RPC, en la misma transacción.
    const { error } = await supa.rpc("crm_actualizar_inmueble", {
      p_property_id: data.id,
      p_patch: up,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);

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
    const { crm } = await requirePermission("properties.update");
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

    // El append va dentro del propio UPDATE (crm_agregar_imagen_inmueble),
    // no como leer-modificar-reescribir aquí: dos subidas concurrentes ya
    // no pueden pisarse la una a la otra (auditoría 12 sep 2026). También
    // fija el actor real para audit_log.usuario_id (H-05).
    const { error: saveError } = await supa.rpc("crm_agregar_imagen_inmueble", {
      p_property_id: data.id,
      p_url: publicUrl,
      p_filename: data.filename,
      p_actor_id: crm.userId,
    });
    if (saveError) throw new Error(saveError.message);

    return { url: publicUrl };
  });

const ALLOWED_BUCKETS = new Set(["property-images", "property-docs"]);

// property-docs es un bucket privado: puede contener contratos, DNI, escrituras...
// solo para uso interno del personal con permiso "properties.read". property-images
// sigue siendo público a propósito (fotos comerciales usadas en la web/WordPress).
const PRIVATE_BUCKETS = new Set(["property-docs"]);
const SIGNED_URL_TTL_SECONDS = 120;

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

    // En un bucket privado no existe URL pública: guardamos solo la ruta interna
    // (storage_path) y se resuelve a una URL firmada de corta duración al abrirla
    // — ver getPropertyDocumentUrl.
    if (PRIVATE_BUCKETS.has(data.bucket)) return { url: path };

    const { data: pd } = supa.storage.from(data.bucket).getPublicUrl(path);
    return { url: pd.publicUrl };
  });

// Los documentos históricos (importados desde Airtable) guardan la URL pública
// completa que tenía el bucket antes de cerrarse. Aceptamos ambos formatos y
// extraemos solo la ruta interna del objeto dentro de property-docs.
function extractPropertyDocsPath(value: string): string | null {
  const marker = "/storage/v1/object/public/property-docs/";
  const idx = value.indexOf(marker);
  if (idx !== -1) return decodeURIComponent(value.slice(idx + marker.length));
  // Ya es una ruta interna (subida nueva) si no parece una URL externa.
  if (!/^https?:\/\//i.test(value)) return value;
  // Cualquier otro http(s) es un enlace externo pegado a mano (p. ej. Google Drive)
  // — no pertenece a nuestro bucket, se abre tal cual.
  return null;
}

export const getPropertyDocumentUrl = createServerFn({ method: "POST" })
  .validator((d: { value: string }) => {
    if (!d?.value) throw new Error("value requerido");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermissions("properties.read", "documents.read");
    const path = extractPropertyDocsPath(data.value);
    if (!path) return { url: data.value };

    const supa = getSupa();
    const { data: signed, error } = await supa.storage
      .from("property-docs")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const deleteInmueble = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => {
    if (!d?.id) throw new Error("id requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("properties.delete_hard");
    const supa = getSupa();
    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_eliminar_inmueble", {
      p_property_id: data.id,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Pagination helpers ────────────────────────────────────────────────────────

export type SearchInmueblesParams = {
  q: string;
  limit: number;
  esAlquiler?: boolean;
};

// Búsqueda server-side por texto (ref/calle/barrio/localidad), con límite —
// para los buscadores tipo autocompletar (AsociarInmuebleButton, selector de
// inmueble en NewVisitaDialog, picker de propiedad en Operaciones). Antes cada
// uno cargaba las 5.817 filas de listAllInmuebles al navegador y filtraba en
// memoria mostrando solo los primeros 20. Aprovecha el índice pg_trgm
// existente sobre properties.calle (20260819145303_add_missing_composite_indexes.sql).
export const searchInmuebles = createServerFn({ method: "GET" })
  .validator((d: Partial<SearchInmueblesParams>): SearchInmueblesParams => {
    const q = typeof d?.q === "string" ? d.q.trim() : "";
    const limit = Math.min(50, Math.max(1, Number(d?.limit) || 20));
    const esAlquiler = typeof d?.esAlquiler === "boolean" ? d.esAlquiler : undefined;
    return { q, limit, esAlquiler };
  })
  .handler(async ({ data }): Promise<{ inmuebles: Inmueble[] }> => {
    await requirePermission("properties.read");
    const supa = getSupa();

    let query = supa
      .from("properties")
      .select(
        `id, ref, tipo, es_alquiler, calle, numero, barrio, localidad,
         metros_construidos, habitaciones, banos, precio, precio_final,
         estatus, publicacion, estado, imagenes, coordenadas, observaciones,
         fecha_inicio, fecha_reserva, fecha_escritura, created_at,
         agents(id, nombre, email)`,
      )
      .not("estatus", "is", null)
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(data.limit);

    if (data.esAlquiler !== undefined) {
      query = query.eq("es_alquiler", data.esAlquiler);
    }

    if (data.q) {
      const needle = escapeSearchTerm(data.q);
      query = query.or(
        `ref.ilike.%${needle}%,calle.ilike.%${needle}%,barrio.ilike.%${needle}%,localidad.ilike.%${needle}%`,
      );
    }

    const { data: rows, error } = await query;
    if (error) throw new Error("Error al buscar inmuebles");

    return { inmuebles: ((rows ?? []) as unknown as SupabasePropertyRow[]).map(mapBase) };
  });

export type InmueblesPageParams = {
  page: number;
  pageSize: number;
  statuses: string[];
  q: string;
  categoria: string;
  agente: string;
  // Universo a filtrar (false = venta, true = alquiler). Sin definir = ambos
  // (usado por HistoricoTab, que mezcla ventas y alquileres cerrados).
  esAlquiler?: boolean;
};

export type InmueblesPageResult = {
  inmuebles: Inmueble[];
  total: number;
};

// Paginated fetch for la Cartera de Inmuebles. `esAlquiler` selecciona el universo
// (false = venta/histórico, true = alquiler) — antes cada universo se separaba
// client-side a partir de listAllInmuebles; ahora el filtro va en la query SQL.
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
    const esAlquiler = typeof d?.esAlquiler === "boolean" ? d.esAlquiler : undefined;
    return { page, pageSize, statuses, q, categoria, agente, esAlquiler };
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
      .not("estatus", "is", null)
      .order("created_at", { ascending: false, nullsFirst: false });

    if (data.esAlquiler !== undefined) {
      query = query.eq("es_alquiler", data.esAlquiler);
    }

    if (data.statuses.length > 0) {
      query = query.in("estatus", data.statuses);
    }

    if (data.q) {
      const needle = escapeSearchTerm(data.q);
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
        .map((p) => `tipo.ilike.%${escapeSearchTerm(p)}%`)
        .join(",");
      query = query.or(orClauses);
    }

    // Server-side agent filter. `.eq("agents.nombre", ...)` sobre una
    // relación embebida no filtra las filas padre en PostgREST (haría falta
    // "agents!inner(...)" en el select, que a su vez rompería el caso "Sin
    // asignar" al forzar un inner join). Se resuelve el nombre a su id y se
    // filtra por la propia columna agente_id de properties, igual que ya
    // hace el caso "Sin asignar".
    if (data.agente === "Sin asignar") {
      query = query.is("agente_id", null);
    } else if (data.agente !== "Todos") {
      const { data: agenteRow } = await supa
        .from("agents")
        .select("id")
        .eq("nombre", data.agente)
        .maybeSingle();
      // Sin match: UUID inexistente para que la query devuelva 0 filas en
      // vez de omitir el filtro y devolver todo el listado.
      query = query.eq("agente_id", agenteRow?.id ?? "00000000-0000-0000-0000-000000000000");
    }

    const { data: rows, error, count } = await query.range(from, to);
    if (error) throw new Error("Error al cargar inmuebles");

    // sectionTotals (venta/prospectos/histórico) se retiró el 12 sep 2026:
    // eran 3 COUNT(*) exactos por cada carga/página/filtro de Cartera y
    // ningún tab/badge los leía (código muerto detectado en auditoría),
    // además mal calculados (ignoraban esAlquiler y "histórico" no incluía
    // "Alquilado").
    return {
      inmuebles: ((rows ?? []) as unknown as SupabasePropertyRow[]).map(mapBase),
      total: count ?? 0,
    };
  });

// ── Dashboard (M-01-bis, parte pendiente) ──────────────────────────────────────
// Antes el dashboard traía las 5.817 filas de properties (con
// listAllInmueblesLite) para sumar/agrupar en el navegador. Los agregados
// (conteos, serie de 12 meses, comisiones, pulso, zonas, cartera por tipo)
// ahora los calcula la función SQL dashboard_inmuebles_stats() — réplica
// fiel de la lógica anterior, verificada con execute_sql antes de conectarla.
// "recientes" y "estancados" siguen siendo listas de filas reales (no
// agregados), así que se piden aparte con .limit(), no con la función.

export type DashboardSerieMes = { mes: string; Captaciones: number; Ventas: number };
export type DashboardZona = {
  display: string;
  captaciones: number;
  ventas: number;
  activos: number;
};
export type DashboardCarteraTipo = { tipo: string; count: number; valor: number };

export type DashboardStats = {
  activos: number;
  reservados: number;
  vendidos: number;
  alquilados: number;
  valorCartera: number;
  prospectosPendientes: number;
  serie: DashboardSerieMes[];
  comisionMes: number;
  comisionAnual: number;
  comisionPipeline: number;
  pulso: {
    captMes: number;
    captPrev: number;
    cierresMes: number;
    cierresPrev: number;
    reservasTotal: number;
  };
  departamentos: DashboardZona[];
  carteraBreakdown: DashboardCarteraTipo[];
  recientes: Inmueble[];
  estancados: Array<{ i: Inmueble; dias: number }>;
};

export const getDashboardStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardStats> => {
    await requirePermission("properties.read");
    const supa = getSupa();

    const [aggRes, recientesRes, estancadosRes] = await Promise.all([
      supa.rpc("dashboard_inmuebles_stats"),
      supa
        .from("properties")
        .select(
          `id, ref, tipo, es_alquiler, calle, numero, barrio, localidad,
           metros_construidos, habitaciones, banos, precio, precio_final,
           estatus, publicacion, estado, imagenes, coordenadas, observaciones,
           fecha_inicio, fecha_reserva, fecha_escritura, created_at,
           agents(id, nombre, email)`,
        )
        .not("fecha_inicio", "is", null)
        .order("fecha_inicio", { ascending: false })
        .limit(6),
      supa
        .from("properties")
        .select(
          `id, ref, tipo, es_alquiler, calle, numero, barrio, localidad,
           metros_construidos, habitaciones, banos, precio, precio_final,
           estatus, publicacion, estado, imagenes, coordenadas, observaciones,
           fecha_inicio, fecha_reserva, fecha_escritura, created_at,
           agents(id, nombre, email)`,
        )
        .eq("estatus", "Activo")
        .lt("fecha_inicio", new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10))
        .order("fecha_inicio", { ascending: true })
        .limit(5),
    ]);

    if (aggRes.error) throw new Error(`dashboard_inmuebles_stats: ${aggRes.error.message}`);
    if (recientesRes.error) throw new Error("Error al cargar inmuebles recientes");
    if (estancadosRes.error) throw new Error("Error al cargar inmuebles estancados");

    const agg = aggRes.data as Omit<DashboardStats, "recientes" | "estancados">;
    const recientes = ((recientesRes.data ?? []) as unknown as SupabasePropertyRow[]).map(mapBase);
    const ahora = Date.now();
    const estancados = ((estancadosRes.data ?? []) as unknown as SupabasePropertyRow[])
      .map(mapBase)
      .map((i) => ({
        i,
        dias: i.fechaInicio
          ? Math.floor((ahora - new Date(i.fechaInicio).getTime()) / 86400000)
          : 0,
      }))
      .sort((a, b) => b.dias - a.dias);

    return { ...agg, recientes, estancados };
  },
);
