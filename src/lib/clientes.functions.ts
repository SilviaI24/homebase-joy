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

    // --- Extracción de preferencias desde texto libre ---------------------
    const txtRaw = `${base.solicitud} ${base.motivo} ${base.observaciones} ${base.feedback}`;
    const txt = txtRaw.toLowerCase();
    const wantsAlquiler =
      base.tipo === "Interesado alquiler" || /alquil/i.test(txtRaw);
    const wantsVenta =
      base.tipo === "Interesado Propiedades" ||
      base.tipo === "Comprador" ||
      /\b(compra|venta|comprar|adquirir)\b/i.test(txtRaw);

    // Habitaciones
    const habMatch = txt.match(/(\d+)\s*(?:hab|dorm|habitaci|dormitor)/);
    const habitacionesPref = habMatch ? parseInt(habMatch[1], 10) : null;

    // Presupuesto: capturar todos los importes en €
    const moneyRe = /(\d{1,3}(?:[.,]\d{3})+|\d{4,7})\s*(?:€|eur|euros)?/gi;
    const amounts: number[] = [];
    for (const m of txt.matchAll(moneyRe)) {
      const n = parseInt(m[1].replace(/[.,]/g, ""), 10);
      if (!Number.isFinite(n)) continue;
      // descartar números pequeños que claramente no son precio
      if (wantsAlquiler && n >= 200 && n <= 10000) amounts.push(n);
      else if (!wantsAlquiler && n >= 30000 && n <= 5000000) amounts.push(n);
    }
    const presupuestoMin = amounts.length > 0 ? Math.min(...amounts) : null;
    const presupuestoMax = amounts.length > 0 ? Math.max(...amounts) : null;

    // Zonas conocidas (barrios + localidades)
    const zonasPref = Array.from(zonasConocidas).filter((z) => txt.includes(z));

    const preferencias: ClientePrefs = {
      presupuesto: { min: presupuestoMin, max: presupuestoMax },
      habitaciones: habitacionesPref,
      zonas: zonasPref,
    };

    // Match para potenciales: solo si no es activo
    let matches: ClienteMatch[] = [];
    if (!activo) {
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
          // Categoría
          if (cats.length === 0) {
            // sin restricción
          } else if (cats.includes(i.categoria.toLowerCase())) {
            razones.push(`Categoría: ${i.categoria}`);
            score += 3;
          } else {
            score -= 5;
          }
          // Zona
          const barrioL = i.barrio.toLowerCase();
          const localL = i.localidad.toLowerCase();
          if (zonasPref.length > 0) {
            if (zonasPref.some((z) => barrioL === z || localL === z)) {
              razones.push(`Zona: ${i.barrio || i.localidad}`);
              score += 4;
            } else {
              score -= 2;
            }
          }
          // Presupuesto
          const precio = i.precioFinal ?? i.precio;
          if (presupuestoMax != null && precio != null) {
            const tol = i.esAlquiler ? 0.15 : 0.2;
            const techo = presupuestoMax * (1 + tol);
            const suelo = (presupuestoMin ?? presupuestoMax) * (1 - tol);
            if (precio <= techo && precio >= suelo) {
              razones.push(`Precio: ${precio.toLocaleString("es-ES")} €`);
              score += 4;
            } else if (precio > presupuestoMax * 1.5) {
              score -= 4;
            } else {
              score -= 1;
            }
          }
          // Habitaciones
          if (habitacionesPref != null && i.habitaciones != null) {
            const diff = Math.abs(i.habitaciones - habitacionesPref);
            if (diff === 0) {
              razones.push(`${i.habitaciones} hab.`);
              score += 3;
            } else if (diff === 1) {
              score += 1;
            } else {
              score -= 1;
            }
          }
          return { inmueble: i, razones, score };
        })
        .filter((m) => m.score >= 4)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
    }

    // --- Clasificación derivada ----------------------------------------
    const tipoNorm = base.tipo.trim();
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
      duplicados: 1,
      preferencias,
    };
  });

  clientes.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));

  // Dedupe: prioriza DNI > teléfono > email > nombre normalizado.
  // El primero (más reciente) gana; los demás suman al contador de duplicados.
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const normPhone = (s: string) => {
    const digits = s.replace(/\D/g, "");
    return digits.length >= 9 ? digits.slice(-9) : digits;
  };
  const map = new Map<string, Cliente>();
  for (const c of clientes) {
    const key =
      (c.dni && `dni:${norm(c.dni)}`) ||
      (c.telefono && normPhone(c.telefono).length >= 9 && `tel:${normPhone(c.telefono)}`) ||
      (c.email && `mail:${norm(c.email)}`) ||
      (c.nombre && `nom:${norm(c.nombre)}`) ||
      `id:${c.id}`;
    const existing = map.get(key);
    if (existing) {
      existing.duplicados += 1;
      // mergear inmuebles vinculados / matches únicos si el nuevo aporta info
      if (existing.inmueblesVinculados.length === 0 && c.inmueblesVinculados.length > 0) {
        existing.inmueblesVinculados = c.inmueblesVinculados;
        existing.inmueblesActivos = c.inmueblesActivos;
      }
      continue;
    }
    map.set(key, c);
  }

  return { clientes: Array.from(map.values()) };
});
