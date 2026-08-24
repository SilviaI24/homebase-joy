import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { getCategoria, isAlquiler, type Categoria } from "./inmuebles.functions";
import { toTitleCase, toTitleCaseArr, toSentenceCase } from "./format";
import { requirePermission, requirePermissions } from "@/lib/crm-auth.server";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  rolTipo?: string;
};

export type ClienteMatch = {
  inmueble: MiniInmueble;
  razones: string[];
  score: number;
};

// Tipo de relación con El Sol Grupo — solo 3 valores reales
export const SEGMENTOS = ["Propietario", "Comprador", "Inquilino", "Lead"] as const;
export type Segmento = (typeof SEGMENTOS)[number];

// Etapa en el ciclo de vida (se lee directamente de contacts.ciclo_vida)
export const ETAPAS = ["Lead", "Prospecto", "Cliente", "Histórico", "Descartado"] as const;
export type Etapa = (typeof ETAPAS)[number];

export type Cliente = {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  canalOrigen: string;
  dni: string;
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
  // Inmuebles vinculados por tipo de rol
  propiedadIds: string[]; // Propietario
  propiedadRefs: string[];
  propiedadCalles: string[];
  inmuebleCompradorIds: string[]; // Comprador
  propiedadAlquilerIds: string[]; // Inquilino
  inmueblesIds: string[]; // todos
  agentesIds: string[];
  agentesMails: string[];
  attachments: ClienteAttachment[];
  // Derivados
  segmento: Segmento; // tipo de relación (Propietario/Comprador/Inquilino/Lead)
  segmentoMotivo: string;
  etapa: Etapa; // posición en el ciclo (Activo/Histórico/Lead…)
  inmueblesVinculados: MiniInmueble[];
  inmueblesActivos: MiniInmueble[]; // propiedades no cerradas
  inmueblesHistorico: MiniInmueble[]; // propiedades cerradas (Vendido/Alquilado)
  matches: ClienteMatch[];
  diasDesdeAlta: number | null;
  duplicados: number;
  preferencias: ClientePrefs;
};

export type ClientePrefs = {
  presupuesto: { min: number | null; max: number | null };
  habitaciones: number | null;
  zonas: string[];
};

export type ConversacionIa = Pick<
  Cliente,
  | "id"
  | "nombre"
  | "email"
  | "telefono"
  | "canalOrigen"
  | "fecha"
  | "motivo"
  | "solicitud"
  | "seccion"
  | "conversaciones"
  | "categoria"
  | "trabajado"
  | "etapa"
  | "agentesIds"
  | "matches"
>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function s(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.filter(Boolean).join(", ");
  return String(v);
}

function parseIntSafe(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const m = v.match(/\d+/);
    if (m) return parseInt(m[0], 10);
  }
  return null;
}

type PropertyRowShape = {
  id: string;
  ref: string | null;
  calle: string | null;
  numero: string | null;
  barrio: string | null;
  localidad: string | null;
  estatus: string | null;
  tipo: string | null;
  es_alquiler?: boolean | null;
  precio: number | null;
  precio_final: number | null;
  imagenes: Array<{ url: string }> | null;
  habitaciones: number | null;
  metros_construidos: number | null;
};

type RoleRow = { tipo: string; property_id: string | null; properties: PropertyRowShape | null };

type AgentRef = { id: string; nombre: string | null; email: string | null };
type AgentAssignmentRow = { agent_id: string; agents: AgentRef | null };

// Fila de contacts tal como la devuelve el select de listClientes/listLeads
// (contact_roles/contact_agents son FK many-to-one desde la fila hija, pero
// aquí SÍ son arrays reales: un contacto tiene muchos roles/asignaciones).
type ContactQueryRow = {
  id: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  dni: string | null;
  profesion: string | null;
  ciclo_vida: string | null;
  duplicados: number | null;
  motivo: string | null;
  solicitud: string | null;
  conversaciones: string | null;
  observaciones: string | null;
  feedback: string | null;
  canal_origen: string | null;
  seccion: string | null;
  trabajado: string | null;
  categoria: string[] | null;
  contrato_trabajo: string | null;
  mascota: string | null;
  avalista: string | null;
  attachments: Array<{ url: string; filename: string; type: string }> | null;
  created_at: string | null;
  contact_roles: RoleRow[] | null;
  contact_agents: AgentAssignmentRow[] | null;
};

// Segmento = qué tipo de relación tiene el contacto con la agencia.
// Se basa en los contact_roles, no en el ciclo_vida.
function deriveSegmento(roles: Array<{ tipo: string }>): { segmento: Segmento; motivo: string } {
  if (roles.some((r) => r.tipo === "Propietario" || r.tipo === "Arrendador")) {
    return { segmento: "Propietario", motivo: "Relación de propietario registrada" };
  }
  if (roles.some((r) => r.tipo === "Comprador")) {
    return { segmento: "Comprador", motivo: "Demanda de compra registrada" };
  }
  if (roles.some((r) => r.tipo === "Inquilino")) {
    return { segmento: "Inquilino", motivo: "Demanda de alquiler registrada" };
  }
  return { segmento: "Lead", motivo: "Sin rol comercial registrado" };
}

function mapPropertyRow(p: PropertyRowShape): MiniInmueble {
  const tipo = s(p.tipo);
  const imgs = p.imagenes ?? [];
  return {
    id: p.id,
    ref: s(p.ref),
    calle: toTitleCase(s(p.calle)),
    numero: s(p.numero),
    barrio: toTitleCase(s(p.barrio)),
    localidad: toTitleCase(s(p.localidad)),
    estatus: s(p.estatus),
    tipo,
    categoria: getCategoria(tipo),
    esAlquiler: p.es_alquiler ?? isAlquiler(tipo),
    precio: p.precio ?? null,
    precioFinal: p.precio_final ?? null,
    imagen: imgs.find((i) => i?.url)?.url ?? null,
    habitaciones: p.habitaciones ?? null,
    superficie: p.metros_construidos ?? null,
  };
}

// ── Budget parser ─────────────────────────────────────────────────────────────

function parsePresupuesto(
  txt: string,
  wantsAlquiler: boolean,
): { min: number | null; max: number | null } {
  const amounts: number[] = [];

  const pushAmount = (n: number) => {
    if (!Number.isFinite(n)) return;
    if (wantsAlquiler && n >= 200 && n <= 10000) amounts.push(n);
    else if (!wantsAlquiler && n >= 30000 && n <= 5000000) amounts.push(n);
  };

  const parseNum = (raw: string, suffix: string): number | null => {
    const str = raw.trim();
    let n: number;
    if (/^\d{1,3}(?:[.,]\d{3})+$/.test(str)) n = parseInt(str.replace(/[.,]/g, ""), 10);
    else if (/^\d+[.,]\d+$/.test(str)) n = parseFloat(str.replace(",", "."));
    else n = parseInt(str, 10);
    if (!Number.isFinite(n)) return null;
    const suf = suffix.toLowerCase();
    if (suf === "k" || suf === "mil") n *= 1000;
    else if (suf === "m" || suf === "mill" || suf === "millon" || suf === "millones")
      n *= 1_000_000;
    return n;
  };

  const rangeRe =
    /(\d{1,7}(?:[.,]\d{1,3})*)\s*(?:-|–|a|y|hasta)\s*(\d{1,7}(?:[.,]\d{1,3})*)\s*(mill(?:on|ones)?|mil|k|m)?\b\s*(?:€|eur|euros)?/gi;
  const consumed: Array<[number, number]> = [];
  for (const m of txt.matchAll(rangeRe)) {
    const suf = m[3] ?? "";
    const a = parseNum(m[1], suf);
    const b = parseNum(m[2], suf);
    if (a != null) pushAmount(a);
    if (b != null) pushAmount(b);
    if (m.index != null) consumed.push([m.index, m.index + m[0].length]);
  }

  const moneyRe =
    /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(mill(?:on|ones)?|mil|k|m)?\b\s*(€|eur|euros)?/gi;
  for (const m of txt.matchAll(moneyRe)) {
    if (m.index != null && consumed.some(([st, en]) => m.index! >= st && m.index! < en)) continue;
    const suf = m[2] ?? "";
    const cur = m[3] ?? "";
    if (!suf && !cur) continue;
    const n = parseNum(m[1], suf);
    if (n != null) pushAmount(n);
  }

  return {
    min: amounts.length > 0 ? Math.min(...amounts) : null,
    max: amounts.length > 0 ? Math.max(...amounts) : null,
  };
}

// ── Main query ────────────────────────────────────────────────────────────────

export const listClientes = createServerFn({ method: "GET" }).handler(async () => {
  await requirePermissions("contacts.read", "contact_roles.read", "properties.read");
  const supa = getSupa();

  const allContacts: ContactQueryRow[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supa
      .from("contacts")
      .select(
        `
        id, nombre, email, telefono, dni, profesion, ciclo_vida, duplicados,
        motivo, solicitud, conversaciones, observaciones, feedback, canal_origen,
        seccion, trabajado, categoria, contrato_trabajo, mascota,
        avalista, attachments, created_at,
        contact_roles(tipo, property_id,
          properties(id, ref, calle, numero, barrio, localidad, tipo, es_alquiler,
            estatus, precio, precio_final, imagenes, habitaciones, metros_construidos)),
        contact_agents(agent_id, agents(id, nombre, email))
      `,
      )
      .in("ciclo_vida", ["Cliente", "Prospecto"])
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    // Supabase-js sin tipos de Database generados infiere las relaciones
    // anidadas (properties dentro de contact_roles, agents dentro de
    // contact_agents) como array por defecto; en runtime son FK many-to-one
    // (objeto único) — se corrige con el cast explícito.
    allContacts.push(...((data ?? []) as unknown as ContactQueryRow[]));
    if ((data ?? []).length < PAGE) break;
    from += PAGE;
  }

  // Propiedades activas para matching
  const { data: activePropRows } = await supa
    .from("properties")
    .select(
      "id, ref, calle, numero, barrio, localidad, tipo, es_alquiler, estatus, precio, precio_final, imagenes, habitaciones, metros_construidos",
    )
    .eq("estatus", "Activo");

  const allProps = (activePropRows ?? []).map(mapPropertyRow);
  const activosVenta = allProps.filter((i) => !i.esAlquiler);
  const activosAlquiler = allProps.filter((i) => i.esAlquiler);

  const zonasConocidas = new Set<string>();
  for (const i of allProps) {
    if (i.barrio) zonasConocidas.add(i.barrio.toLowerCase());
    if (i.localidad) zonasConocidas.add(i.localidad.toLowerCase());
  }

  const CLOSED = new Set(["Vendido", "Alquilado"]);
  const INACTIVE = new Set(["Vendido", "Alquilado", "Baja"]);

  const clientes: Cliente[] = allContacts.map((r) => {
    const roles: RoleRow[] = r.contact_roles ?? [];
    const linkedRoles = roles.filter((role): role is RoleRow & { properties: PropertyRowShape } =>
      Boolean(role.properties),
    );
    const agentAssignments: AgentAssignmentRow[] = r.contact_agents ?? [];

    const { segmento, motivo: segmentoMotivo } = deriveSegmento(roles);

    // Etapa viene directamente del campo ciclo_vida en BD
    const etapa = (r.ciclo_vida ?? "Lead") as Etapa;

    // Propiedades por rol
    const propRoles = linkedRoles.filter(
      (rl) => rl.tipo === "Propietario" || rl.tipo === "Arrendador",
    );
    const cmpRoles = linkedRoles.filter((rl) => rl.tipo === "Comprador");
    const inqRoles = linkedRoles.filter((rl) => rl.tipo === "Inquilino");

    const propietariosLinked = propRoles.map((rl) => ({
      ...mapPropertyRow(rl.properties),
      rolTipo: rl.tipo as string,
    }));
    const compradoresLinked = cmpRoles.map((rl) => ({
      ...mapPropertyRow(rl.properties),
      rolTipo: rl.tipo as string,
    }));
    const inquilinosLinked = inqRoles.map((rl) => ({
      ...mapPropertyRow(rl.properties),
      rolTipo: rl.tipo as string,
    }));

    const inmueblesVinculados = [...propietariosLinked, ...compradoresLinked, ...inquilinosLinked];

    // Activos = propiedades en gestión abierta (no cerradas ni de baja)
    const inmueblesActivos = inmueblesVinculados.filter((i) => !INACTIVE.has(i.estatus));
    // Histórico = operaciones cerradas
    const inmueblesHistorico = inmueblesVinculados.filter((i) => CLOSED.has(i.estatus));

    const agentesIds = agentAssignments.map((a) => a.agent_id).filter(Boolean);
    const agentesMails = agentAssignments.map((a) => a.agents?.email ?? "").filter(Boolean);

    // Preferencias desde texto libre
    const txtRaw = `${r.solicitud ?? ""} ${r.motivo ?? ""} ${r.observaciones ?? ""} ${r.feedback ?? ""} ${r.conversaciones ?? ""}`;
    const txt = txtRaw.toLowerCase();
    const wantsAlquiler = segmento === "Inquilino" || /alquil/i.test(txtRaw);
    const wantsVenta =
      segmento === "Comprador" || /\b(compra|venta|comprar|adquirir)\b/i.test(txtRaw);

    const habMatch = txt.match(/(\d+)\s*(?:hab|dorm|habitaci|dormitor)/);
    const habitacionesPref = habMatch ? parseInt(habMatch[1], 10) : null;

    const { min: presupuestoMin, max: presupuestoMax } = parsePresupuesto(txt, wantsAlquiler);
    const zonasPref = Array.from(zonasConocidas).filter((z) => txt.includes(z));

    // Matching solo para leads activos sin inmueble ya cerrado
    let matches: ClienteMatch[] = [];
    const esCerrado = etapa === "Histórico";
    const puedeMatch =
      !esCerrado &&
      segmento !== "Propietario" &&
      segmento !== "Lead" &&
      presupuestoMax != null &&
      inmueblesActivos.length === 0;

    if (puedeMatch) {
      const pool = wantsAlquiler ? activosAlquiler : wantsVenta ? activosVenta : [];
      const linkedSet = new Set(inmueblesVinculados.map((i) => i.id));
      const cats = ((r.categoria as string[]) ?? []).map((c: string) => c.toLowerCase());
      matches = pool
        .filter((i) => !linkedSet.has(i.id))
        .map<ClienteMatch | null>((i) => {
          const razones: string[] = [];
          let score = 0;
          razones.push(i.esAlquiler ? "Alquiler" : "Venta");
          score += 1;
          if (cats.length > 0) {
            if (!cats.includes(i.categoria.toLowerCase())) return null;
            razones.push(`Categoría: ${i.categoria}`);
            score += 3;
          }
          const barrioL = i.barrio.toLowerCase();
          const localL = i.localidad.toLowerCase();
          if (zonasPref.length > 0) {
            if (!zonasPref.some((z) => barrioL === z || localL === z)) return null;
            razones.push(`Zona: ${i.barrio || i.localidad}`);
            score += 4;
          }
          const precio = i.precioFinal ?? i.precio;
          if (presupuestoMax != null) {
            if (precio == null) return null;
            const techo = presupuestoMax * 1.1;
            const suelo = (presupuestoMin ?? presupuestoMax) * 0.9;
            if (precio > techo || precio < suelo) return null;
            razones.push(`Precio: ${precio.toLocaleString("es-ES")} €`);
            score += 4;
          }
          if (habitacionesPref != null && i.habitaciones != null) {
            const diff = Math.abs(i.habitaciones - habitacionesPref);
            if (diff === 0) {
              razones.push(`${i.habitaciones} hab.`);
              score += 3;
            } else if (diff === 1) score += 1;
            else score -= 2;
          }
          return { inmueble: i, razones, score };
        })
        .filter((m): m is ClienteMatch => m !== null && m.score >= 4)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
    }

    const fechaMs = r.created_at ? new Date(r.created_at).getTime() : 0;
    const diasDesdeAlta = fechaMs
      ? Math.max(0, Math.floor((Date.now() - fechaMs) / 86400000))
      : null;

    const propiedadIds = propRoles.map((rl) => rl.property_id!).filter(Boolean);
    const compradorIds = cmpRoles.map((rl) => rl.property_id!).filter(Boolean);
    const alquilerIds = inqRoles.map((rl) => rl.property_id!).filter(Boolean);
    const atts = (r.attachments as Array<{ url: string; filename: string; type: string }>) ?? [];

    return {
      id: r.id,
      nombre: toTitleCase(s(r.nombre)),
      email: s(r.email),
      telefono: s(r.telefono),
      canalOrigen: s(r.canal_origen),
      dni: s(r.dni),
      fecha: r.created_at ? r.created_at.slice(0, 10) : null,
      motivo: toSentenceCase(s(r.motivo)),
      observaciones: toSentenceCase(s(r.observaciones)),
      solicitud: toSentenceCase(s(r.solicitud)),
      seccion: toTitleCase(s(r.seccion)),
      conversaciones: toSentenceCase(s(r.conversaciones)),
      feedback: toSentenceCase(s(r.feedback)),
      profesion: toTitleCase(s(r.profesion)),
      contratoTrabajo: toTitleCase(s(r.contrato_trabajo)),
      mascota: toTitleCase(s(r.mascota)),
      avalista: toTitleCase(s(r.avalista)),
      categoria: Array.isArray(r.categoria) ? r.categoria : [],
      trabajado: toTitleCase(s(r.trabajado)),
      propiedadIds,
      propiedadRefs: propietariosLinked.map((p) => p.ref),
      propiedadCalles: toTitleCaseArr(propietariosLinked.map((p) => p.calle)),
      inmuebleCompradorIds: compradorIds,
      propiedadAlquilerIds: alquilerIds,
      inmueblesIds: [...propiedadIds, ...compradorIds, ...alquilerIds],
      agentesIds,
      agentesMails,
      attachments: atts,
      segmento,
      segmentoMotivo,
      etapa,
      inmueblesVinculados,
      inmueblesActivos,
      inmueblesHistorico,
      matches,
      diasDesdeAlta,
      duplicados: Number(r.duplicados) || 1,
      preferencias: {
        presupuesto: { min: presupuestoMin, max: presupuestoMax },
        habitaciones: habitacionesPref,
        zonas: zonasPref,
      },
    };
  });

  return { clientes };
});

// ── Leads query (only ciclo_vida='Lead', no matching) ─────────────────────────

export const listLeads = createServerFn({ method: "GET" }).handler(async () => {
  await requirePermissions("contacts.read", "contact_roles.read", "properties.read");
  const supa = getSupa();

  const allContacts: ContactQueryRow[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supa
      .from("contacts")
      .select(
        `
        id, nombre, email, telefono, dni, profesion, ciclo_vida, duplicados,
        motivo, solicitud, conversaciones, observaciones, feedback, canal_origen,
        seccion, trabajado, categoria, contrato_trabajo, mascota,
        avalista, attachments, created_at,
        contact_roles(tipo, property_id,
          properties(id, ref, calle, numero, barrio, localidad, tipo, es_alquiler,
            estatus, precio, precio_final, habitaciones, metros_construidos)),
        contact_agents(agent_id, agents(id, nombre, email))
      `,
      )
      .eq("ciclo_vida", "Lead")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    // Ver comentario equivalente en listClientes: cast por el mismo motivo.
    allContacts.push(...((data ?? []) as unknown as ContactQueryRow[]));
    if ((data ?? []).length < PAGE) break;
    from += PAGE;
  }

  const CLOSED = new Set(["Vendido", "Alquilado"]);
  const INACTIVE = new Set(["Vendido", "Alquilado", "Baja"]);

  const clientes: Cliente[] = allContacts.map((r) => {
    const roles: RoleRow[] = r.contact_roles ?? [];
    const linkedRoles = roles.filter((role): role is RoleRow & { properties: PropertyRowShape } =>
      Boolean(role.properties),
    );
    const agentAssignments: AgentAssignmentRow[] = r.contact_agents ?? [];

    const { segmento, motivo: segmentoMotivo } = deriveSegmento(roles);
    const etapa = "Lead" as Etapa;

    const propRoles = linkedRoles.filter(
      (rl) => rl.tipo === "Propietario" || rl.tipo === "Arrendador",
    );
    const cmpRoles = linkedRoles.filter((rl) => rl.tipo === "Comprador");
    const inqRoles = linkedRoles.filter((rl) => rl.tipo === "Inquilino");

    const propietariosLinked = propRoles.map((rl) => ({
      ...mapPropertyRow(rl.properties),
      rolTipo: rl.tipo as string,
    }));
    const compradoresLinked = cmpRoles.map((rl) => ({
      ...mapPropertyRow(rl.properties),
      rolTipo: rl.tipo as string,
    }));
    const inquilinosLinked = inqRoles.map((rl) => ({
      ...mapPropertyRow(rl.properties),
      rolTipo: rl.tipo as string,
    }));

    const inmueblesVinculados = [...propietariosLinked, ...compradoresLinked, ...inquilinosLinked];
    const inmueblesActivos = inmueblesVinculados.filter((i) => !INACTIVE.has(i.estatus));
    const inmueblesHistorico = inmueblesVinculados.filter((i) => CLOSED.has(i.estatus));

    const agentesIds = agentAssignments.map((a) => a.agent_id).filter(Boolean);
    const agentesMails = agentAssignments.map((a) => a.agents?.email ?? "").filter(Boolean);

    const propiedadIds = propRoles.map((rl) => rl.property_id!).filter(Boolean);
    const compradorIds = cmpRoles.map((rl) => rl.property_id!).filter(Boolean);
    const alquilerIds = inqRoles.map((rl) => rl.property_id!).filter(Boolean);
    const atts = (r.attachments as Array<{ url: string; filename: string; type: string }>) ?? [];
    const fechaMs = r.created_at ? new Date(r.created_at).getTime() : 0;

    return {
      id: r.id,
      nombre: toTitleCase(s(r.nombre)),
      email: s(r.email),
      telefono: s(r.telefono),
      canalOrigen: s(r.canal_origen),
      dni: s(r.dni),
      fecha: r.created_at ? r.created_at.slice(0, 10) : null,
      motivo: toSentenceCase(s(r.motivo)),
      observaciones: toSentenceCase(s(r.observaciones)),
      solicitud: toSentenceCase(s(r.solicitud)),
      seccion: toTitleCase(s(r.seccion)),
      conversaciones: toSentenceCase(s(r.conversaciones)),
      feedback: toSentenceCase(s(r.feedback)),
      profesion: toTitleCase(s(r.profesion)),
      contratoTrabajo: toTitleCase(s(r.contrato_trabajo)),
      mascota: toTitleCase(s(r.mascota)),
      avalista: toTitleCase(s(r.avalista)),
      categoria: Array.isArray(r.categoria) ? r.categoria : [],
      trabajado: toTitleCase(s(r.trabajado)),
      propiedadIds,
      propiedadRefs: propietariosLinked.map((p) => p.ref),
      propiedadCalles: toTitleCaseArr(propietariosLinked.map((p) => p.calle)),
      inmuebleCompradorIds: compradorIds,
      propiedadAlquilerIds: alquilerIds,
      inmueblesIds: [...propiedadIds, ...compradorIds, ...alquilerIds],
      agentesIds,
      agentesMails,
      attachments: atts,
      segmento,
      segmentoMotivo,
      etapa,
      inmueblesVinculados,
      inmueblesActivos,
      inmueblesHistorico,
      matches: [],
      diasDesdeAlta: fechaMs ? Math.max(0, Math.floor((Date.now() - fechaMs) / 86400000)) : null,
      duplicados: Number(r.duplicados) || 1,
      preferencias: { presupuesto: { min: null, max: null }, habitaciones: null, zonas: [] },
    };
  });

  return { clientes };
});

// Bandeja de IA: conserva las conversaciones de los agentes de WhatsApp y voz
// aunque el contacto deje de ser Lead. `contacts.canal_origen` es la fuente
// canónica; el texto solo se usa como compatibilidad con registros antiguos.
type ConversacionIaQueryRow = {
  id: string;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  ciclo_vida: string | null;
  canal_origen: string | null;
  created_at: string | null;
  motivo: string | null;
  solicitud: string | null;
  conversaciones: string | null;
  seccion: string | null;
  categoria: string[] | null;
  trabajado: string | null;
  contact_agents: Array<{ agent_id: string | null }> | null;
};

export const listConversacionesIa = createServerFn({ method: "GET" }).handler(async () => {
  await requirePermission("contacts.read");
  const supa = getSupa();
  const allContacts: ConversacionIaQueryRow[] = [];
  const PAGE = 1000;

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supa
      .from("contacts")
      .select(
        `id, nombre, email, telefono, ciclo_vida, canal_origen, created_at,
         motivo, solicitud, conversaciones, seccion, categoria, trabajado,
         contact_agents(agent_id)`,
      )
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`listConversacionesIa: ${error.message}`);
    const page = (data ?? []) as unknown as ConversacionIaQueryRow[];
    allContacts.push(...page);
    if (page.length < PAGE) break;
  }

  const clientes: ConversacionIa[] = allContacts
    .filter((row) => {
      const origen = s(row.canal_origen).toLowerCase();
      const esAgenteConversacional = origen === "silvia-whatsapp" || origen === "silvia-voz";
      const textoLegado = `${s(row.motivo)} ${s(row.solicitud)} ${s(row.conversaciones)}`;
      const esLegadoSinOrigen =
        !origen &&
        s(row.conversaciones).trim().length > 0 &&
        !/idealista/i.test(textoLegado) &&
        /whats|llamad|tel[eé]fono|call|\bvoz\b/i.test(textoLegado);
      return esAgenteConversacional || esLegadoSinOrigen;
    })
    .map((row) => ({
      id: row.id,
      nombre: toTitleCase(s(row.nombre)),
      email: s(row.email),
      telefono: s(row.telefono),
      canalOrigen: s(row.canal_origen),
      fecha: row.created_at ? row.created_at.slice(0, 10) : null,
      motivo: toSentenceCase(s(row.motivo)),
      solicitud: toSentenceCase(s(row.solicitud)),
      seccion: toTitleCase(s(row.seccion)),
      conversaciones: toSentenceCase(s(row.conversaciones)),
      categoria: Array.isArray(row.categoria) ? row.categoria : [],
      trabajado: toTitleCase(s(row.trabajado)),
      etapa: (row.ciclo_vida ?? "Lead") as Etapa,
      agentesIds: (row.contact_agents ?? [])
        .map((assignment) => assignment.agent_id)
        .filter((id): id is string => Boolean(id)),
      matches: [],
    }));

  return { clientes };
});

// ── Pagination helpers ────────────────────────────────────────────────────────

function escapeLikeCliente(str: string): string {
  return str.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// Lightweight row shape for paginated contact list (no full property joins or matching)
export type ClienteRow = {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  canalOrigen: string;
  fecha: string | null;
  segmento: Segmento;
  etapa: Etapa;
  inmueblesActivosCount: number;
  inmueblesHistoricoCount: number;
  diasDesdeAlta: number | null;
  agentesIds: string[];
  hasSilvia: boolean;
};

// Internal helper: compute segmento counts for all ciclo_vida='Cliente' contacts.
// Uses a lightweight query (just contact_id + tipo from contact_roles).
async function computeSegmentoCounts(
  supa: ReturnType<typeof getSupa>,
): Promise<{ Propietario: number; Comprador: number; Inquilino: number; total: number }> {
  const { data } = await supa
    .from("contacts")
    .select("id, contact_roles(tipo)")
    .eq("ciclo_vida", "Cliente");

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    contact_roles: Array<{ tipo: string }> | null;
  }>;

  const counts = { Propietario: 0, Comprador: 0, Inquilino: 0, total: 0 };
  for (const c of rows) {
    const roles = c.contact_roles ?? [];
    const { segmento } = deriveSegmento(roles as RoleRow[]);
    if (segmento === "Propietario") counts.Propietario++;
    else if (segmento === "Comprador") counts.Comprador++;
    else if (segmento === "Inquilino") counts.Inquilino++;
    if (segmento !== "Lead") counts.total++;
  }
  return counts;
}

// Paginated contact list (ciclo_vida='Cliente', commercial roles only).
// Server-side filters: segmento (via !inner join on contact_roles.tipo), text search.
// Returns lightweight ClienteRow array + total + segmento counts for KPI tiles.
export const listClientesPage = createServerFn({ method: "GET" })
  .validator((d: { page?: number; pageSize?: number; seg?: string; q?: string }) => {
    const page = Math.max(1, Number(d?.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(d?.pageSize) || 50));
    const seg = typeof d?.seg === "string" ? d.seg : "Todos";
    const q = typeof d?.q === "string" ? d.q.trim() : "";
    return { page, pageSize, seg, q };
  })
  .handler(
    async ({
      data,
    }): Promise<{
      clientes: ClienteRow[];
      total: number;
      segmentoCounts: { Propietario: number; Comprador: number; Inquilino: number; total: number };
    }> => {
      await requirePermissions("contacts.read", "contact_roles.read");
      const supa = getSupa();
      const from = (data.page - 1) * data.pageSize;
      const to = from + data.pageSize - 1;

      // Determine role tipo filter based on segmento
      const TODOS_TIPOS = ["Propietario", "Arrendador", "Comprador", "Inquilino"];
      const tipoFilter =
        data.seg === "Propietario"
          ? ["Propietario", "Arrendador"]
          : data.seg === "Comprador"
            ? ["Comprador"]
            : data.seg === "Inquilino"
              ? ["Inquilino"]
              : TODOS_TIPOS;

      // Use !inner join so only contacts WITH matching roles are returned.
      // The returned contact_roles array includes only the filtered role tipos.
      let query = supa
        .from("contacts")
        .select(
          `id, nombre, email, telefono, ciclo_vida, canal_origen, created_at,
           contact_roles!inner(tipo, property_id, properties(id, estatus)),
           contact_agents(agent_id)`,
          { count: "exact" },
        )
        .eq("ciclo_vida", "Cliente")
        .in("contact_roles.tipo", tipoFilter)
        .order("created_at", { ascending: false });

      if (data.q) {
        const needle = escapeLikeCliente(data.q);
        query = query.or(
          `nombre.ilike.%${needle}%,email.ilike.%${needle}%,telefono.ilike.%${needle}%`,
        );
      }

      const { data: rows, error, count } = await query.range(from, to);
      if (error) throw new Error("Error al cargar contactos");

      const INACTIVE = new Set(["Vendido", "Alquilado", "Baja"]);
      const CLOSED = new Set(["Vendido", "Alquilado"]);

      // Supabase-js sin tipos de Database generados infiere las relaciones
      // anidadas como array por defecto; en runtime son FK many-to-one
      // (objeto único) — se corrige con el cast explícito. `properties` aquí
      // solo trae (id, estatus), no el PropertyRowShape completo.
      type ClientesPageQueryRow = {
        id: string;
        nombre: string | null;
        email: string | null;
        telefono: string | null;
        ciclo_vida: string | null;
        canal_origen: string | null;
        created_at: string | null;
        contact_roles: Array<{
          tipo: string;
          property_id: string | null;
          properties: { id: string; estatus: string } | null;
        }> | null;
        contact_agents: Array<{ agent_id: string | null }> | null;
      };
      const clientRows = (rows ?? []) as unknown as ClientesPageQueryRow[];

      const clientes: ClienteRow[] = clientRows.map((r) => {
        const roles = r.contact_roles ?? [];
        const agentAssignments = r.contact_agents ?? [];
        const { segmento } = deriveSegmento(roles);

        const linkedProps = roles.filter((rl) => rl.properties);
        const inmueblesActivosCount = linkedProps.filter(
          (rl) =>
            rl.properties &&
            !INACTIVE.has((rl.properties as unknown as { estatus: string }).estatus),
        ).length;
        const inmueblesHistoricoCount = linkedProps.filter(
          (rl) =>
            rl.properties && CLOSED.has((rl.properties as unknown as { estatus: string }).estatus),
        ).length;

        const fechaMs = r.created_at ? new Date(r.created_at).getTime() : 0;
        const origen = (r.canal_origen ?? "").toLowerCase();
        const hasSilvia = origen === "silvia-whatsapp" || origen === "silvia-voz";

        return {
          id: r.id,
          nombre: toTitleCase(s(r.nombre)),
          email: s(r.email),
          telefono: s(r.telefono),
          canalOrigen: s(r.canal_origen),
          fecha: r.created_at ? r.created_at.slice(0, 10) : null,
          segmento,
          etapa: (r.ciclo_vida ?? "Lead") as Etapa,
          inmueblesActivosCount,
          inmueblesHistoricoCount,
          diasDesdeAlta: fechaMs
            ? Math.max(0, Math.floor((Date.now() - fechaMs) / 86400000))
            : null,
          agentesIds: agentAssignments
            .map((a) => a.agent_id)
            .filter((id): id is string => Boolean(id)),
          hasSilvia,
        };
      });

      // Compute KPI counts (separate lightweight query for global accuracy)
      const segmentoCounts = await computeSegmentoCounts(supa);

      return { clientes, total: count ?? 0, segmentoCounts };
    },
  );

// Stats for KPI tiles (cached separately to avoid recomputing on every page change).
export const getClientesStats = createServerFn({ method: "GET" }).handler(async () => {
  await requirePermissions("contacts.read", "contact_roles.read");
  const supa = getSupa();
  return computeSegmentoCounts(supa);
});

// Full Cliente detail for a single contact (includes property joins + AI matching).
// Called when user opens the detail Sheet for a contact row.
export const getClienteById = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => {
    if (!d?.id || typeof d.id !== "string") throw new Error("id requerido");
    return d;
  })
  .handler(async ({ data }): Promise<{ cliente: Cliente }> => {
    await requirePermissions("contacts.read", "contact_roles.read", "properties.read");
    const supa = getSupa();

    const { data: r, error } = await supa
      .from("contacts")
      .select(
        `
        id, nombre, email, telefono, dni, profesion, ciclo_vida, duplicados,
        motivo, solicitud, conversaciones, observaciones, feedback, canal_origen,
        seccion, trabajado, categoria, contrato_trabajo, mascota,
        avalista, attachments, created_at,
        contact_roles(tipo, property_id,
          properties(id, ref, calle, numero, barrio, localidad, tipo, es_alquiler,
            estatus, precio, precio_final, imagenes, habitaciones, metros_construidos)),
        contact_agents(agent_id, agents(id, nombre, email))
      `,
      )
      .eq("id", data.id)
      .single();

    if (error) throw new Error("Error al cargar contacto");

    // Active properties for match engine (same data as listClientes)
    const { data: activePropRows } = await supa
      .from("properties")
      .select(
        "id, ref, calle, numero, barrio, localidad, tipo, es_alquiler, estatus, precio, precio_final, imagenes, habitaciones, metros_construidos",
      )
      .eq("estatus", "Activo");

    const allProps = (activePropRows ?? []).map(mapPropertyRow);
    const activosVenta = allProps.filter((i) => !i.esAlquiler);
    const activosAlquiler = allProps.filter((i) => i.esAlquiler);

    const zonasConocidas = new Set<string>();
    for (const i of allProps) {
      if (i.barrio) zonasConocidas.add(i.barrio.toLowerCase());
      if (i.localidad) zonasConocidas.add(i.localidad.toLowerCase());
    }

    const CLOSED = new Set(["Vendido", "Alquilado"]);
    const INACTIVE = new Set(["Vendido", "Alquilado", "Baja"]);

    // Re-use the same mapping logic as listClientes (single contact). Mismo
    // select que listClientes -> mismo tipo de fila (ver ContactQueryRow).
    const row = r as unknown as ContactQueryRow;
    const roles: RoleRow[] = row.contact_roles ?? [];
    const linkedRoles = roles.filter((role): role is RoleRow & { properties: PropertyRowShape } =>
      Boolean(role.properties),
    );
    const agentAssignments: AgentAssignmentRow[] = row.contact_agents ?? [];

    const { segmento, motivo: segmentoMotivo } = deriveSegmento(roles);
    const etapa = (row.ciclo_vida ?? "Lead") as Etapa;

    const propRoles = linkedRoles.filter(
      (rl) => rl.tipo === "Propietario" || rl.tipo === "Arrendador",
    );
    const cmpRoles = linkedRoles.filter((rl) => rl.tipo === "Comprador");
    const inqRoles = linkedRoles.filter((rl) => rl.tipo === "Inquilino");

    const propietariosLinked = propRoles.map((rl) => ({
      ...mapPropertyRow(rl.properties),
      rolTipo: rl.tipo as string,
    }));
    const compradoresLinked = cmpRoles.map((rl) => ({
      ...mapPropertyRow(rl.properties),
      rolTipo: rl.tipo as string,
    }));
    const inquilinosLinked = inqRoles.map((rl) => ({
      ...mapPropertyRow(rl.properties),
      rolTipo: rl.tipo as string,
    }));

    const inmueblesVinculados = [...propietariosLinked, ...compradoresLinked, ...inquilinosLinked];
    const inmueblesActivos = inmueblesVinculados.filter((i) => !INACTIVE.has(i.estatus));
    const inmueblesHistorico = inmueblesVinculados.filter((i) => CLOSED.has(i.estatus));

    const agentesIds = agentAssignments.map((a) => a.agent_id).filter(Boolean);
    const agentesMails = agentAssignments.map((a) => a.agents?.email ?? "").filter(Boolean);

    const txtRaw = `${row.solicitud ?? ""} ${row.motivo ?? ""} ${row.observaciones ?? ""} ${row.feedback ?? ""} ${row.conversaciones ?? ""}`;
    const txt = txtRaw.toLowerCase();
    const wantsAlquiler = segmento === "Inquilino" || /alquil/i.test(txtRaw);
    const wantsVenta =
      segmento === "Comprador" || /\b(compra|venta|comprar|adquirir)\b/i.test(txtRaw);

    const habMatch = txt.match(/(\d+)\s*(?:hab|dorm|habitaci|dormitor)/);
    const habitacionesPref = habMatch ? parseInt(habMatch[1], 10) : null;
    const { min: presupuestoMin, max: presupuestoMax } = parsePresupuesto(txt, wantsAlquiler);
    const zonasPref = Array.from(zonasConocidas).filter((z) => txt.includes(z));

    let matches: ClienteMatch[] = [];
    const esCerrado = etapa === "Histórico";
    const puedeMatch =
      !esCerrado &&
      segmento !== "Propietario" &&
      segmento !== "Lead" &&
      presupuestoMax != null &&
      inmueblesActivos.length === 0;

    if (puedeMatch) {
      const pool = wantsAlquiler ? activosAlquiler : wantsVenta ? activosVenta : [];
      const linkedSet = new Set(inmueblesVinculados.map((i) => i.id));
      const cats = (row.categoria ?? []).map((c) => c.toLowerCase());
      matches = pool
        .filter((i) => !linkedSet.has(i.id))
        .map<ClienteMatch | null>((i) => {
          const razones: string[] = [];
          let score = 0;
          razones.push(i.esAlquiler ? "Alquiler" : "Venta");
          score += 1;
          if (cats.length > 0) {
            if (!cats.includes(i.categoria.toLowerCase())) return null;
            razones.push(`Categoría: ${i.categoria}`);
            score += 3;
          }
          const barrioL = i.barrio.toLowerCase();
          const localL = i.localidad.toLowerCase();
          if (zonasPref.length > 0) {
            if (!zonasPref.some((z) => barrioL === z || localL === z)) return null;
            razones.push(`Zona: ${i.barrio || i.localidad}`);
            score += 4;
          }
          const precio = i.precioFinal ?? i.precio;
          if (presupuestoMax != null) {
            if (precio == null) return null;
            const techo = presupuestoMax * 1.1;
            const suelo = (presupuestoMin ?? presupuestoMax) * 0.9;
            if (precio > techo || precio < suelo) return null;
            razones.push(`Precio: ${precio.toLocaleString("es-ES")} €`);
            score += 4;
          }
          if (habitacionesPref != null && i.habitaciones != null) {
            const diff = Math.abs(i.habitaciones - habitacionesPref);
            if (diff === 0) {
              razones.push(`${i.habitaciones} hab.`);
              score += 3;
            } else if (diff === 1) score += 1;
            else score -= 2;
          }
          return { inmueble: i, razones, score };
        })
        .filter((m): m is ClienteMatch => m !== null && m.score >= 4)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
    }

    const fechaMs = row.created_at ? new Date(row.created_at).getTime() : 0;
    const propiedadIds = propRoles.map((rl) => rl.property_id!).filter(Boolean);
    const compradorIds = cmpRoles.map((rl) => rl.property_id!).filter(Boolean);
    const alquilerIds = inqRoles.map((rl) => rl.property_id!).filter(Boolean);
    const atts = row.attachments ?? [];

    const cliente: Cliente = {
      id: row.id,
      nombre: toTitleCase(s(row.nombre)),
      email: s(row.email),
      telefono: s(row.telefono),
      canalOrigen: s(row.canal_origen),
      dni: s(row.dni),
      fecha: row.created_at ? row.created_at.slice(0, 10) : null,
      motivo: toSentenceCase(s(row.motivo)),
      observaciones: toSentenceCase(s(row.observaciones)),
      solicitud: toSentenceCase(s(row.solicitud)),
      seccion: toTitleCase(s(row.seccion)),
      conversaciones: toSentenceCase(s(row.conversaciones)),
      feedback: toSentenceCase(s(row.feedback)),
      profesion: toTitleCase(s(row.profesion)),
      contratoTrabajo: toTitleCase(s(row.contrato_trabajo)),
      mascota: toTitleCase(s(row.mascota)),
      avalista: toTitleCase(s(row.avalista)),
      categoria: Array.isArray(row.categoria) ? row.categoria : [],
      trabajado: toTitleCase(s(row.trabajado)),
      propiedadIds,
      propiedadRefs: propietariosLinked.map((p) => p.ref),
      propiedadCalles: toTitleCaseArr(propietariosLinked.map((p) => p.calle)),
      inmuebleCompradorIds: compradorIds,
      propiedadAlquilerIds: alquilerIds,
      inmueblesIds: [...propiedadIds, ...compradorIds, ...alquilerIds],
      agentesIds,
      agentesMails,
      attachments: atts,
      segmento,
      segmentoMotivo,
      etapa,
      inmueblesVinculados,
      inmueblesActivos,
      inmueblesHistorico,
      matches,
      diasDesdeAlta: fechaMs ? Math.max(0, Math.floor((Date.now() - fechaMs) / 86400000)) : null,
      duplicados: Number(row.duplicados) || 1,
      preferencias: {
        presupuesto: { min: presupuestoMin, max: presupuestoMax },
        habitaciones: habitacionesPref,
        zonas: zonasPref,
      },
    };

    return { cliente };
  });

// Paginated SilvIA bandeja — contacts with canal_origen SilvIA-WhatsApp / SilvIA-Voz
// plus legacy records without canal_origen that contain conversation text.
// Tab filter maps to contacts.trabajado field; canal filter refines by channel.
export const listConversacionesIaPage = createServerFn({ method: "GET" })
  .validator(
    (d: { page?: number; pageSize?: number; tab?: string; q?: string; canal?: string }) => {
      const page = Math.max(1, Number(d?.page) || 1);
      const pageSize = Math.min(200, Math.max(1, Number(d?.pageSize) || 50));
      const tab = ["Pendientes", "Cualificados", "Archivados", "Todos"].includes(d?.tab ?? "")
        ? (d!.tab as string)
        : "Pendientes";
      const q = typeof d?.q === "string" ? d.q.trim() : "";
      const canal = ["Todos", "WhatsApp", "Voz", "Email"].includes(d?.canal ?? "")
        ? (d!.canal as string)
        : "Todos";
      return { page, pageSize, tab, q, canal };
    },
  )
  .handler(
    async ({
      data,
    }): Promise<{
      clientes: ConversacionIa[];
      total: number;
      tabCounts: Record<string, number>;
    }> => {
      await requirePermission("contacts.read");
      const supa = getSupa();
      const from = (data.page - 1) * data.pageSize;
      const to = from + data.pageSize - 1;

      // Main SilvIA canal filter (OR: primary + legacy)
      const silviaOrPrimary =
        "canal_origen.ilike.silvia-whatsapp,canal_origen.ilike.silvia-voz,canal_origen.ilike.silvia-email";
      const silviaOrLegacy = "and(canal_origen.is.null,conversaciones.not.is.null)";
      const silviaOrFilter = `${silviaOrPrimary},${silviaOrLegacy}`;

      let query = supa
        .from("contacts")
        .select(
          `id, nombre, email, telefono, ciclo_vida, canal_origen, created_at,
           motivo, solicitud, conversaciones, seccion, categoria, trabajado,
           contact_agents(agent_id)`,
          { count: "exact" },
        )
        .order("created_at", { ascending: false });

      // Apply canal filter (determines if we use primary only or primary+legacy)
      if (data.canal === "WhatsApp") {
        query = query.ilike("canal_origen", "silvia-whatsapp");
      } else if (data.canal === "Voz") {
        query = query.ilike("canal_origen", "silvia-voz");
      } else if (data.canal === "Email") {
        query = query.ilike("canal_origen", "silvia-email");
      } else {
        query = query.or(silviaOrFilter);
      }

      // Apply tab filter via trabajado field
      if (data.tab === "Cualificados") {
        query = query.ilike("trabajado", "contactado");
      } else if (data.tab === "Archivados") {
        query = query.ilike("trabajado", "descartado");
      } else if (data.tab === "Pendientes") {
        // Include: trabajado IS NULL OR (trabajado != 'Descartado' AND trabajado != 'Contactado')
        query = query.or(
          "trabajado.is.null,and(trabajado.not.ilike.descartado,trabajado.not.ilike.contactado)",
        );
      }
      // "Todos" → no trabajado filter

      // Apply search filter
      if (data.q) {
        const needle = escapeLikeCliente(data.q);
        query = query.or(
          `nombre.ilike.%${needle}%,telefono.ilike.%${needle}%,email.ilike.%${needle}%,motivo.ilike.%${needle}%,conversaciones.ilike.%${needle}%`,
        );
      }

      const { data: rows, error, count } = await query.range(from, to);
      if (error) throw new Error("Error al cargar conversaciones");

      // Mismo select que listConversacionesIa -> mismo tipo de fila.
      const typedRows = (rows ?? []) as unknown as ConversacionIaQueryRow[];

      // Post-fetch: filter out legacy records that mention Idealista
      const validRows = typedRows.filter((row) => {
        const origen = (row.canal_origen ?? "").toLowerCase();
        const esPrimary =
          origen === "silvia-whatsapp" || origen === "silvia-voz" || origen === "silvia-email";
        if (esPrimary) return true;
        // Legacy: reject if idealista mention in text
        const texto = `${row.motivo ?? ""} ${row.solicitud ?? ""} ${row.conversaciones ?? ""}`;
        return !/idealista/i.test(texto);
      });

      const clientes: ConversacionIa[] = validRows.map((row) => ({
        id: row.id,
        nombre: toTitleCase(s(row.nombre)),
        email: s(row.email),
        telefono: s(row.telefono),
        canalOrigen: s(row.canal_origen),
        fecha: row.created_at ? row.created_at.slice(0, 10) : null,
        motivo: toSentenceCase(s(row.motivo)),
        solicitud: toSentenceCase(s(row.solicitud)),
        seccion: toTitleCase(s(row.seccion)),
        conversaciones: toSentenceCase(s(row.conversaciones)),
        categoria: Array.isArray(row.categoria) ? row.categoria : [],
        trabajado: toTitleCase(s(row.trabajado)),
        etapa: (row.ciclo_vida ?? "Lead") as Etapa,
        agentesIds: (row.contact_agents ?? [])
          .map((a) => a.agent_id)
          .filter((id): id is string => Boolean(id)),
        matches: [],
      }));

      // Tab counts (all SilvIA contacts, no canal-button or search filter)
      const baseCount = () =>
        supa.from("contacts").select("id", { count: "exact", head: true }).or(silviaOrFilter);

      const pendientesOr =
        "trabajado.is.null,and(trabajado.not.ilike.descartado,trabajado.not.ilike.contactado)";

      const [todosRes, cualRes, archRes, pendRes] = await Promise.all([
        baseCount(),
        baseCount().ilike("trabajado", "contactado"),
        baseCount().ilike("trabajado", "descartado"),
        baseCount().or(pendientesOr),
      ]);

      return {
        clientes,
        total: count ?? 0,
        tabCounts: {
          Todos: todosRes.count ?? 0,
          Cualificados: cualRes.count ?? 0,
          Archivados: archRes.count ?? 0,
          Pendientes: pendRes.count ?? 0,
        },
      };
    },
  );

// ── Delete ────────────────────────────────────────────────────────────────────

export const deleteContacto = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => {
    if (!d?.id) throw new Error("id requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("contacts.delete_hard");
    const supa = getSupa();
    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_eliminar_contacto", {
      p_contact_id: data.id,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Mutaciones manuales ───────────────────────────────────────────────────────

export const actualizarCicloVida = createServerFn({ method: "POST" })
  .validator((d: { contactId: string; cicloVida: string }) => {
    if (!d?.contactId || !d?.cicloVida) throw new Error("contactId y cicloVida requeridos");
    if (!["Lead", "Prospecto", "Cliente", "Histórico", "Descartado"].includes(d.cicloVida)) {
      throw new Error("Etapa de contacto inválida");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("contacts.update");
    const supa = getSupa();

    // H-05: el cambio va por RPC en lugar de un .update() directo para que el
    // actor real quede en audit_log.usuario_id. El RPC fija app.actor_id como
    // GUC local a su propia transacción y luego escribe, todo en la misma
    // llamada HTTP — un SET LOCAL suelto desde aquí no sobreviviría al salto de
    // petición (PostgREST abre una transacción por request). El RPC también se
    // encarga de guardar ciclo_vida_anterior al archivar (M-05), que antes se
    // resolvía con una lectura previa desde aquí.
    const { error } = await supa.rpc("crm_actualizar_ciclo_vida", {
      p_contact_id: data.contactId,
      p_ciclo_vida: data.cicloVida,
      p_actor_id: crm.userId,
    });
    if (error) {
      console.error("crm_actualizar_ciclo_vida:", error.message);
      throw new Error("No se pudo actualizar la etapa del contacto");
    }
    return { ok: true };
  });

// M-05: "sacar" un contacto de Histórico devolviéndolo a la etapa real de la
// que vino (no siempre Lead) — complemento de actualizarCicloVida.
export const restaurarContactoDeHistorico = createServerFn({ method: "POST" })
  .validator((d: { contactId: string }) => {
    if (!d?.contactId) throw new Error("contactId requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("contacts.update");
    const supa = getSupa();
    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_restaurar_contacto_historico", {
      p_contact_id: data.contactId,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const gestionarRol = createServerFn({ method: "POST" })
  .validator((d: { contactId: string; propertyId: string; tipo: string | null }) => {
    if (!d?.contactId || !d?.propertyId) throw new Error("contactId y propertyId requeridos");
    if (
      d.tipo !== null &&
      !["Propietario", "Arrendador", "Comprador", "Inquilino"].includes(d.tipo)
    ) {
      throw new Error("Tipo de relación inválido");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermissions(
      "contact_roles.create",
      "contact_roles.update",
      "properties.read",
    );
    if (data.tipo === null) await requirePermission("contact_roles.delete");
    const supa = getSupa();
    // H-05: vía RPC (crea/actualiza/borra el rol y recalcula ciclo_vida, todo
    // en la misma transacción) para que el actor real quede en
    // audit_log.usuario_id — antes eran 4 llamadas .from() sueltas.
    const { error } = await supa.rpc("crm_gestionar_rol", {
      p_contact_id: data.contactId,
      p_property_id: data.propertyId,
      p_tipo: data.tipo,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const buscarInmuebles = createServerFn({ method: "GET" })
  .validator((d: { q: string }) => ({ q: d?.q ?? "" }))
  .handler(async ({ data }) => {
    await requirePermission("properties.read");
    const supa = getSupa();
    const q = data.q
      .trim()
      .replace(/[,%()]/g, " ")
      .replace(/\s+/g, " ");
    if (q.length < 2) return { results: [] as ReturnType<typeof mapPropertyRow>[] };
    const { data: rows } = await supa
      .from("properties")
      .select(
        "id, ref, calle, numero, barrio, localidad, tipo, es_alquiler, estatus, precio, precio_final, imagenes, habitaciones, metros_construidos",
      )
      .or(`ref.ilike.%${q}%,calle.ilike.%${q}%`)
      .limit(10);
    return { results: (rows ?? []).map(mapPropertyRow) };
  });

// ── Actividad reciente ────────────────────────────────────────────────────────

export const getContactoActividad = createServerFn({ method: "GET" })
  .validator((d: { contactId: string }) => d)
  .handler(async ({ data }) => {
    await requirePermissions("contacts.read", "seguimiento.read", "visits.read");
    const supa = getSupa();
    const [seg, vis] = await Promise.all([
      supa
        .from("seguimiento")
        .select("id, tipo, texto, fecha, agente_id, agents(nombre)")
        .eq("contact_id", data.contactId)
        .order("fecha", { ascending: false })
        .limit(20),
      supa
        .from("visits")
        .select("id, fecha, estado, notas, property_id, properties(calle, numero)")
        .eq("contact_id", data.contactId)
        .order("fecha", { ascending: false })
        .limit(10),
    ]);
    type SeguimientoRow = {
      id: string;
      tipo: string;
      texto: string | null;
      fecha: string;
      agente_id: string | null;
      agents: { nombre: string }[] | null;
    };
    type VisitaRow = {
      id: string;
      fecha: string;
      estado: string;
      notas: string | null;
      property_id: string | null;
      properties: { calle: string; numero: string }[] | null;
    };
    const eventos = [
      ...(seg.data ?? []).map((s: SeguimientoRow) => ({
        id: s.id,
        tipo: "seguimiento" as const,
        subtipo: s.tipo,
        texto: s.texto ?? "",
        fecha: s.fecha,
        extra: Array.isArray(s.agents)
          ? (s.agents[0]?.nombre ?? "")
          : ((s.agents as { nombre: string } | null)?.nombre ?? ""),
      })),
      ...(vis.data ?? []).map((v: VisitaRow) => {
        const prop = Array.isArray(v.properties)
          ? v.properties[0]
          : (v.properties as { calle: string; numero: string } | null);
        return {
          id: v.id,
          tipo: "visita" as const,
          subtipo: v.estado,
          texto: v.notas ?? "",
          fecha: v.fecha,
          extra: prop ? `${prop.calle} ${prop.numero ?? ""}`.trim() : "",
        };
      }),
    ]
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .slice(0, 25);
    return { eventos };
  });

// ── Etapa helpers ─────────────────────────────────────────────────────────────
// La regla de recálculo de ciclo_vida (Activo/Reservado > Prospección >
// Vendido/Alquilado > algún rol de cliente > Lead; Descartado intocable) vive
// ahora en SQL, dentro de crm_gestionar_rol (H-05) — su único llamador,
// gestionarRol, pasó a usar ese RPC. El helper de TypeScript que hacía esto se
// retiró aquí porque quedó sin consumidores.

// ── Estadísticas ──────────────────────────────────────────────────────────────

export type StatsData = {
  pipeline: Record<string, number>;
  canales: Record<string, number>;
  leadsPorMes: { mes: string; total: number }[];
  visitasPorMes: { mes: string; realizadas: number; canceladas: number }[];
  agentes: { nombre: string; leads: number; clientes: number }[];
};

export const getStatsData = createServerFn({ method: "GET" }).handler(async () => {
  await requirePermissions("contacts.read", "visits.read");
  const supa = getSupa();

  const [contactsRes, visitsRes, agentesRes, caRes] = await Promise.all([
    supa
      .from("contacts")
      .select("ciclo_vida, canal_origen, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    supa.from("visits").select("fecha, estado").not("fecha", "is", null).limit(2000),
    supa.from("agents").select("id, nombre").eq("activo", true),
    supa.from("contact_agents").select("agent_id, contacts(ciclo_vida)").limit(5000),
  ]);

  const contacts = contactsRes.data ?? [];
  const visits = visitsRes.data ?? [];
  const agentes = agentesRes.data ?? [];
  const caRows = caRes.data ?? [];

  // Pipeline funnel
  const pipeline: Record<string, number> = {
    Lead: 0,
    Prospecto: 0,
    Cliente: 0,
    Histórico: 0,
    Descartado: 0,
  };
  for (const c of contacts) {
    const k = c.ciclo_vida ?? "Lead";
    pipeline[k] = (pipeline[k] ?? 0) + 1;
  }

  // Canal captación
  const canales: Record<string, number> = {};
  for (const c of contacts) {
    const k = c.canal_origen ?? "Sin canal";
    canales[k] = (canales[k] ?? 0) + 1;
  }

  // Leads por mes (últimos 12)
  const now = new Date();
  const meses12: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    meses12.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const leadsPorMes = meses12.map((mes) => ({
    mes,
    total: contacts.filter((c) => (c.created_at ?? "").startsWith(mes)).length,
  }));

  // Visitas por mes (últimos 12)
  const visitasPorMes = meses12.map((mes) => {
    const del_mes = visits.filter((v) => (v.fecha ?? "").startsWith(mes));
    return {
      mes,
      realizadas: del_mes.filter((v) => v.estado === "Realizada").length,
      canceladas: del_mes.filter((v) => v.estado === "Cancelada").length,
    };
  });

  // Leads/clientes por agente
  const agenteMap: Record<string, { leads: number; clientes: number }> = {};
  for (const a of agentes) agenteMap[a.id] = { leads: 0, clientes: 0 };
  for (const row of caRows) {
    const entry = agenteMap[row.agent_id];
    if (!entry) continue;
    const cv = (row.contacts as unknown as { ciclo_vida: string } | null)?.ciclo_vida ?? "Lead";
    if (cv === "Cliente" || cv === "Prospecto") entry.clientes++;
    else entry.leads++;
  }
  const agentesStats = agentes
    .map((a) => ({
      nombre: a.nombre,
      leads: agenteMap[a.id]?.leads ?? 0,
      clientes: agenteMap[a.id]?.clientes ?? 0,
    }))
    .sort((a, b) => b.clientes + b.leads - (a.clientes + a.leads));

  return {
    pipeline,
    canales,
    leadsPorMes,
    visitasPorMes,
    agentes: agentesStats,
  } satisfies StatsData;
});

// ── Lead Insights (Meta scoring rule-based) ───────────────────────────────────

export type LeadInsight = {
  id: string;
  nombre: string;
  telefono: string | null;
  ciclo_vida: string;
  score: number;
  diasSinContacto: number | null;
  tieneAgente: boolean;
};

export type LeadInsightsData = {
  topCalientes: LeadInsight[];
  sinSeguimiento: LeadInsight[];
  total: number;
};

export const getLeadInsightsFn = createServerFn({ method: "GET" }).handler(async () => {
  // El dashboard calcula el score al vuelo. Un GET nunca debe modificar contactos:
  // así funciona también para perfiles de solo consulta, como FINANCIERO.
  await requirePermissions("contacts.read", "seguimiento.read", "visits.read");
  const supa = getSupa();
  const now = Date.now();
  const hace90d = new Date(now - 90 * 86400000).toISOString();

  const [contactsRes, segRes, visitsRes] = await Promise.all([
    supa
      .from("contacts")
      .select(
        "id, nombre, telefono, email, solicitud, motivo, ciclo_vida, canal_origen, contact_agents(agent_id)",
      )
      .in("ciclo_vida", ["Lead", "Prospecto"])
      .order("created_at", { ascending: false })
      .limit(120),

    supa
      .from("seguimiento")
      .select("contact_id, fecha")
      .gte("fecha", hace90d)
      .order("fecha", { ascending: false }),

    supa
      .from("visits")
      .select("contact_id")
      .in("estado", ["Programada", "Pendiente"])
      .gte("fecha", new Date(now).toISOString().slice(0, 10)),
  ]);

  const contacts = contactsRes.data ?? [];

  // Última interacción por contacto (de seguimiento)
  const ultimaSeg = new Map<string, number>();
  for (const s of segRes.data ?? []) {
    if (s.contact_id && s.fecha && !ultimaSeg.has(s.contact_id)) {
      ultimaSeg.set(s.contact_id, new Date(s.fecha).getTime());
    }
  }
  const visitRows = (visitsRes.data ?? []) as Array<{ contact_id: string | null }>;
  const conVisita = new Set(visitRows.map((v) => v.contact_id).filter(Boolean));

  type LeadInsightQueryRow = {
    id: string;
    nombre: string | null;
    telefono: string | null;
    email: string | null;
    solicitud: string | null;
    motivo: string | null;
    ciclo_vida: string | null;
    canal_origen: string | null;
    contact_agents: Array<{ agent_id: string | null }> | null;
  };
  const contactRows = contacts as unknown as LeadInsightQueryRow[];

  const scored: LeadInsight[] = contactRows.map((c) => {
    let s = 0;
    if (c.telefono) s += 0.1;
    if (c.email) s += 0.08;
    if (c.solicitud || c.motivo) s += 0.12;
    if ((c.contact_agents?.length ?? 0) > 0) s += 0.1;

    const canal = (c.canal_origen ?? "").toLowerCase();
    if (/referi|directo|captaci/.test(canal)) s += 0.1;
    else if (/ideal|portal|web|inmob/.test(canal)) s += 0.05;

    const last = ultimaSeg.get(c.id);
    let diasSinContacto: number | null = null;
    if (last) {
      const dias = (now - last) / 86400000;
      diasSinContacto = Math.floor(dias);
      if (dias < 7) s += 0.3;
      else if (dias < 30) s += 0.15;
      else if (dias < 90) s += 0.05;
    }
    if (conVisita.has(c.id)) s += 0.2;

    return {
      id: c.id as string,
      nombre: c.nombre as string,
      telefono: c.telefono as string | null,
      ciclo_vida: c.ciclo_vida as string,
      score: Math.min(1, Math.round(s * 100) / 100),
      diasSinContacto,
      tieneAgente: (c.contact_agents?.length ?? 0) > 0,
    };
  });

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const topCalientes = sorted.slice(0, 6).filter((c) => c.score >= 0.15);

  const sinSeguimiento = scored
    .filter((c) => c.diasSinContacto === null || c.diasSinContacto > 30)
    .sort((a, b) => {
      if (a.diasSinContacto === null) return -1;
      if (b.diasSinContacto === null) return 1;
      return b.diasSinContacto - a.diasSinContacto;
    })
    .slice(0, 5);

  return { topCalientes, sinSeguimiento, total: scored.length } satisfies LeadInsightsData;
});

// ── Histórico / Descartado paginado ───────────────────────────────────────────
// Consulta ligera sin !inner join ni matching de inmuebles.

export type ClienteRowSimple = {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  canalOrigen: string;
  fecha: string | null;
  segmento: Segmento;
  etapa: Etapa;
  diasDesdeAlta: number | null;
  agentesIds: string[];
};

export const listContactosPage = createServerFn({ method: "GET" })
  .validator((d: { page?: number; pageSize?: number; q?: string; etapa?: string }) => {
    const page = Math.max(1, Number(d?.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(d?.pageSize) || 50));
    const etapa = typeof d?.etapa === "string" && d.etapa.length ? d.etapa : "Histórico";
    const q = typeof d?.q === "string" ? d.q.trim() : "";
    return { page, pageSize, etapa, q };
  })
  .handler(async ({ data }): Promise<{ clientes: ClienteRowSimple[]; total: number }> => {
    await requirePermissions("contacts.read");
    const supa = getSupa();
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let query = supa
      .from("contacts")
      .select(
        `id, nombre, email, telefono, ciclo_vida, canal_origen, created_at,
           contact_roles(tipo, property_id),
           contact_agents(agent_id)`,
        { count: "exact" },
      )
      .eq("ciclo_vida", data.etapa)
      .order("created_at", { ascending: false });

    if (data.q) {
      const needle = escapeLikeCliente(data.q);
      query = query.or(
        `nombre.ilike.%${needle}%,email.ilike.%${needle}%,telefono.ilike.%${needle}%`,
      );
    }

    const { data: rows, error, count } = await query.range(from, to);
    if (error) throw new Error("Error al cargar contactos");

    type ContactosPageQueryRow = {
      id: string;
      nombre: string | null;
      email: string | null;
      telefono: string | null;
      ciclo_vida: string | null;
      canal_origen: string | null;
      created_at: string | null;
      contact_roles: Array<{ tipo: string; property_id: string | null }> | null;
      contact_agents: Array<{ agent_id: string | null }> | null;
    };
    const contactRows = (rows ?? []) as unknown as ContactosPageQueryRow[];

    const clientes: ClienteRowSimple[] = contactRows.map((r) => {
      const roles = r.contact_roles ?? [];
      const agentAssignments = r.contact_agents ?? [];
      const { segmento } = deriveSegmento(roles);
      const fechaMs = r.created_at ? new Date(r.created_at).getTime() : 0;
      return {
        id: r.id,
        nombre: toTitleCase(s(r.nombre)),
        email: s(r.email),
        telefono: s(r.telefono),
        canalOrigen: s(r.canal_origen),
        fecha: r.created_at ? r.created_at.slice(0, 10) : null,
        segmento,
        etapa: (r.ciclo_vida ?? data.etapa) as Etapa,
        diasDesdeAlta: fechaMs ? Math.max(0, Math.floor((Date.now() - fechaMs) / 86400000)) : null,
        agentesIds: agentAssignments
          .map((a) => a.agent_id)
          .filter((id): id is string => Boolean(id)),
      };
    });

    return { clientes, total: count ?? 0 };
  });

// ── M-05: candidatos a duplicado y fusión (siempre con revisión humana) ───────

export type DuplicadoRow = {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  cicloVida: string;
  createdAt: string | null;
  tieneActividad: boolean;
};

export type GrupoDuplicado = {
  telNorm: string;
  contactos: DuplicadoRow[];
};

export const listContactosDuplicados = createServerFn({ method: "GET" }).handler(
  async (): Promise<GrupoDuplicado[]> => {
    await requirePermission("contacts.read");
    const supa = getSupa();
    const { data, error } = await supa.rpc("listar_contactos_duplicados");
    if (error) throw new Error(error.message);

    const grupos = new Map<string, DuplicadoRow[]>();
    for (const row of data ?? []) {
      const list = grupos.get(row.tel_norm) ?? [];
      list.push({
        id: row.contact_id,
        nombre: row.nombre || "Sin nombre",
        telefono: row.telefono ?? "",
        email: row.email ?? "",
        cicloVida: row.ciclo_vida ?? "Lead",
        createdAt: row.created_at ?? null,
        tieneActividad: row.tiene_actividad === true,
      });
      grupos.set(row.tel_norm, list);
    }
    return [...grupos.entries()].map(([telNorm, contactos]) => ({ telNorm, contactos }));
  },
);

export const fusionarContactosDuplicados = createServerFn({ method: "POST" })
  .validator((d: { survivorId: string; loserIds: string[] }) => {
    if (!d?.survivorId) throw new Error("survivorId requerido");
    if (!d?.loserIds?.length) throw new Error("loserIds requerido");
    if (d.loserIds.includes(d.survivorId)) {
      throw new Error("El superviviente no puede estar también en la lista de duplicados");
    }
    return d;
  })
  .handler(async ({ data }) => {
    // Fusionar es tan destructivo como un borrado (los duplicados
    // desaparecen tras traspasar su historial) — exige el mismo permiso.
    await requirePermissions("contacts.update", "contacts.delete_hard");
    const supa = getSupa();
    for (const loserId of data.loserIds) {
      const { error } = await supa.rpc("fusionar_contactos", {
        _survivor_id: data.survivorId,
        _loser_id: loserId,
      });
      if (error) throw new Error(`fusión de ${loserId}: ${error.message}`);
    }
    return { ok: true, fusionados: data.loserIds.length };
  });
