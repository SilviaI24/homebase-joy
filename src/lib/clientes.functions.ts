import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { getCategoria, isAlquiler, type Categoria } from "./inmuebles.functions";
import { toTitleCase, toTitleCaseArr, toSentenceCase, escapeSearchTerm } from "./format";
import { requirePermission, requirePermissions } from "@/lib/crm-auth.server";
import { s } from "./clientes-format";

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
  tipoInteres: string | null;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  tipo_interes: string | null;
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

// ── Contact → Cliente mapper (compartido) ───────────────────────────────────
// Antes este bloque (roles → inmuebles vinculados, preferencias de texto
// libre, motor de matching) estaba copiado casi carácter a carácter en
// listClientes, listLeads y getClienteById — ~400 líneas triplicadas, causa
// directa de que listLeads se hubiera olvidado de pedir `imagenes` en su
// select mientras las otras dos copias ya lo tenían (auditoría 12 sep 2026;
// ese bug ya se corrigió en la Fase 1, esto es la limpieza de la causa raíz).
// `matchCtx` es opcional: listLeads no calcula matching para Leads, así que
// se omite el análisis de texto libre y quedan matches=[] / preferencias
// vacías — igual que hacía su copia antes de unificar.

const CLOSED_ESTATUS = new Set(["Vendido", "Alquilado"]);
const INACTIVE_ESTATUS = new Set(["Vendido", "Alquilado", "Baja"]);

type MatchContext = {
  activosVenta: MiniInmueble[];
  activosAlquiler: MiniInmueble[];
  zonasConocidas: Set<string>;
};

function buildCliente(r: ContactQueryRow, matchCtx?: MatchContext): Cliente {
  const roles: RoleRow[] = r.contact_roles ?? [];
  const linkedRoles = roles.filter((role): role is RoleRow & { properties: PropertyRowShape } =>
    Boolean(role.properties),
  );
  const agentAssignments: AgentAssignmentRow[] = r.contact_agents ?? [];

  const { segmento, motivo: segmentoMotivo } = deriveSegmento(roles);
  const etapa = (r.ciclo_vida ?? "Lead") as Etapa;

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
  const inmueblesActivos = inmueblesVinculados.filter((i) => !INACTIVE_ESTATUS.has(i.estatus));
  // Histórico = operaciones cerradas
  const inmueblesHistorico = inmueblesVinculados.filter((i) => CLOSED_ESTATUS.has(i.estatus));

  const agentesIds = agentAssignments.map((a) => a.agent_id).filter(Boolean);
  const agentesMails = agentAssignments.map((a) => a.agents?.email ?? "").filter(Boolean);

  let matches: ClienteMatch[] = [];
  let presupuestoMin: number | null = null;
  let presupuestoMax: number | null = null;
  let habitacionesPref: number | null = null;
  let zonasPref: string[] = [];

  if (matchCtx) {
    // Preferencias desde texto libre
    const txtRaw = `${r.solicitud ?? ""} ${r.motivo ?? ""} ${r.observaciones ?? ""} ${r.feedback ?? ""} ${r.conversaciones ?? ""}`;
    const txt = txtRaw.toLowerCase();
    const wantsAlquiler = segmento === "Inquilino" || /alquil/i.test(txtRaw);
    const wantsVenta =
      segmento === "Comprador" || /\b(compra|venta|comprar|adquirir)\b/i.test(txtRaw);

    const habMatch = txt.match(/(\d+)\s*(?:hab|dorm|habitaci|dormitor)/);
    habitacionesPref = habMatch ? parseInt(habMatch[1], 10) : null;

    const budget = parsePresupuesto(txt, wantsAlquiler);
    presupuestoMin = budget.min;
    presupuestoMax = budget.max;
    zonasPref = Array.from(matchCtx.zonasConocidas).filter((z) => txt.includes(z));

    // Matching solo para leads activos sin inmueble ya cerrado
    const esCerrado = etapa === "Histórico";
    const puedeMatch =
      !esCerrado &&
      segmento !== "Propietario" &&
      segmento !== "Lead" &&
      presupuestoMax != null &&
      inmueblesActivos.length === 0;

    if (puedeMatch) {
      const pool = wantsAlquiler
        ? matchCtx.activosAlquiler
        : wantsVenta
          ? matchCtx.activosVenta
          : [];
      const linkedSet = new Set(inmueblesVinculados.map((i) => i.id));
      const cats = (r.categoria ?? []).map((c) => c.toLowerCase());
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
  }

  const fechaMs = r.created_at ? new Date(r.created_at).getTime() : 0;
  const diasDesdeAlta = fechaMs ? Math.max(0, Math.floor((Date.now() - fechaMs) / 86400000)) : null;

  const propiedadIds = propRoles.map((rl) => rl.property_id!).filter(Boolean);
  const compradorIds = cmpRoles.map((rl) => rl.property_id!).filter(Boolean);
  const alquilerIds = inqRoles.map((rl) => rl.property_id!).filter(Boolean);
  const atts = r.attachments ?? [];

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
    tipoInteres: r.tipo_interes,
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
        seccion, trabajado, tipo_interes, categoria, contrato_trabajo, mascota,
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

  const matchCtx: MatchContext = { activosVenta, activosAlquiler, zonasConocidas };
  const clientes: Cliente[] = allContacts.map((r) => buildCliente(r, matchCtx));

  return { clientes };
});

// ── Leads query (only ciclo_vida='Lead', no matching) ─────────────────────────

// El Kanban de Leads de Contactos es por comercial: se abre siempre con un
// agenteId concreto (el elegido, el guardado en localStorage, o el primero
// de la lista). Antes esta función traía TODOS los Leads de la empresa —
// 2.808 filas hoy, con joins completos — para que el Kanban se quedara,
// tras filtrar en el navegador, con como mucho un puñado por agente (9 en
// el peor caso actual; el 99.6% de los Leads no tiene ningún agente
// asignado). Filtrar por agente aquí, en SQL, evita traer y procesar todo
// lo que se iba a descartar (auditoría 12 sep 2026).
export const listLeads = createServerFn({ method: "GET" })
  .validator((d: { agenteId?: string }) => ({
    agenteId: typeof d?.agenteId === "string" ? d.agenteId : "",
  }))
  .handler(async ({ data }): Promise<{ clientes: Cliente[] }> => {
    await requirePermissions("contacts.read", "contact_roles.read", "properties.read");
    if (!data.agenteId) return { clientes: [] };
    const supa = getSupa();

    // Resolver primero qué contactos tiene asignados este agente. No se usa
    // contact_agents!inner en la query principal porque eso recortaría el
    // array embebido a solo la fila que hace match — AsignarLeadButton
    // necesita ver TODOS los agentes ya asignados a cada lead, no solo este.
    const { data: assigned, error: assignedError } = await supa
      .from("contact_agents")
      .select("contact_id")
      .eq("agent_id", data.agenteId);
    if (assignedError) throw new Error(assignedError.message);
    const contactIds = (assigned ?? []).map((r) => r.contact_id);
    if (contactIds.length === 0) return { clientes: [] };

    const allContacts: ContactQueryRow[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data: rows, error } = await supa
        .from("contacts")
        .select(
          `
        id, nombre, email, telefono, dni, profesion, ciclo_vida, duplicados,
        motivo, solicitud, conversaciones, observaciones, feedback, canal_origen,
        seccion, trabajado, tipo_interes, categoria, contrato_trabajo, mascota,
        avalista, attachments, created_at,
        contact_roles(tipo, property_id,
          properties(id, ref, calle, numero, barrio, localidad, tipo, es_alquiler,
            estatus, precio, precio_final, imagenes, habitaciones, metros_construidos)),
        contact_agents(agent_id, agents(id, nombre, email))
      `,
        )
        .eq("ciclo_vida", "Lead")
        .in("id", contactIds)
        // Filtro estricto del Kanban por comercial (decisión de David, 21-22
        // sep 2026): "cualificado" no es un campo propio -- es la conjunción
        // de asignado (ya filtrado arriba vía contact_agents) + interés
        // indicado. trabajado no entra en esta condición: sigue siendo solo
        // el estado de la cola de llamadas (Pendiente/Contactado/Descartado)
        // dentro del propio Kanban, no un requisito para verlo.
        .not("tipo_interes", "is", null)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      // Ver comentario equivalente en listClientes: cast por el mismo motivo.
      allContacts.push(...((rows ?? []) as unknown as ContactQueryRow[]));
      if ((rows ?? []).length < PAGE) break;
      from += PAGE;
    }

    // Sin matchCtx: los Leads no calculan matching (matches=[] / preferencias
    // vacías), igual que antes de unificar con listClientes/getClienteById.
    const clientes: Cliente[] = allContacts.map((r) => buildCliente(r));

    return { clientes };
  });

// ── Pagination helpers ────────────────────────────────────────────────────────

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
  // Paginado igual que listClientes: sin esto, en cuanto los "Cliente" pasen
  // del tope de filas de PostgREST (1.000 por defecto), los KPI de
  // Propietario/Comprador/Inquilino/total se quedan cortos sin ningún error
  // visible (auditoría 12 sep 2026).
  type Row = { id: string; contact_roles: Array<{ tipo: string }> | null };
  const rows: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supa
      .from("contacts")
      .select("id, contact_roles(tipo)")
      .eq("ciclo_vida", "Cliente")
      .range(from, from + PAGE - 1);
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

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
        const needle = escapeSearchTerm(data.q);
        query = query.or(
          `nombre.ilike.%${needle}%,email.ilike.%${needle}%,telefono.ilike.%${needle}%`,
        );
      }

      const { data: rows, error, count } = await query.range(from, to);
      if (error) throw new Error("Error al cargar contactos");

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
            !INACTIVE_ESTATUS.has((rl.properties as unknown as { estatus: string }).estatus),
        ).length;
        const inmueblesHistoricoCount = linkedProps.filter(
          (rl) =>
            rl.properties &&
            CLOSED_ESTATUS.has((rl.properties as unknown as { estatus: string }).estatus),
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

// Contadores del Dashboard ("N clientes", "N leads"). Antes el Dashboard
// llamaba a listClientes()/listLeads() completos (con joins de inmuebles y
// el motor de matching corriendo fila por fila) solo para leer
// `.clientes.length` — con miles de contactos, eso es cargar y procesar
// todo el detalle para mostrar dos números (auditoría 12 sep 2026).
// clientesQueryOpts/leadsQueryOpts (listClientes/listLeads) se mantienen
// intactos para sus otros consumidores (pickers de create-dialogs, Kanban
// de Leads en Contactos), que sí necesitan el detalle completo.
export const getDashboardContactCounts = createServerFn({ method: "GET" }).handler(async () => {
  await requirePermissions("contacts.read");
  const supa = getSupa();
  const [clientesRes, leadsRes] = await Promise.all([
    supa
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .in("ciclo_vida", ["Cliente", "Prospecto"]),
    supa.from("contacts").select("id", { count: "exact", head: true }).eq("ciclo_vida", "Lead"),
  ]);
  return { clientesTotal: clientesRes.count ?? 0, leadsTotal: leadsRes.count ?? 0 };
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

    // Las dos consultas son independientes (la de propiedades activas para
    // el motor de matching no depende del contacto) — en paralelo en vez de
    // esperar la primera para lanzar la segunda (auditoría 12 sep 2026,
    // ahorra un roundtrip en cada apertura de ficha de cliente).
    const [{ data: r, error }, { data: activePropRows }] = await Promise.all([
      supa
        .from("contacts")
        .select(
          `
        id, nombre, email, telefono, dni, profesion, ciclo_vida, duplicados,
        motivo, solicitud, conversaciones, observaciones, feedback, canal_origen,
        seccion, trabajado, tipo_interes, categoria, contrato_trabajo, mascota,
        avalista, attachments, created_at,
        contact_roles(tipo, property_id,
          properties(id, ref, calle, numero, barrio, localidad, tipo, es_alquiler,
            estatus, precio, precio_final, imagenes, habitaciones, metros_construidos)),
        contact_agents(agent_id, agents(id, nombre, email))
      `,
        )
        .eq("id", data.id)
        .single(),
      // Active properties for match engine (same data as listClientes)
      supa
        .from("properties")
        .select(
          "id, ref, calle, numero, barrio, localidad, tipo, es_alquiler, estatus, precio, precio_final, imagenes, habitaciones, metros_construidos",
        )
        .eq("estatus", "Activo"),
    ]);

    if (error) throw new Error("Error al cargar contacto");

    const allProps = (activePropRows ?? []).map(mapPropertyRow);
    const zonasConocidas = new Set<string>();
    for (const i of allProps) {
      if (i.barrio) zonasConocidas.add(i.barrio.toLowerCase());
      if (i.localidad) zonasConocidas.add(i.localidad.toLowerCase());
    }
    const matchCtx: MatchContext = {
      activosVenta: allProps.filter((i) => !i.esAlquiler),
      activosAlquiler: allProps.filter((i) => i.esAlquiler),
      zonasConocidas,
    };

    // Mismo select que listClientes -> mismo tipo de fila (ver ContactQueryRow).
    const cliente = buildCliente(r as unknown as ContactQueryRow, matchCtx);

    return { cliente };
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

  // Antes: 4 consultas traídas con LIMIT 5000/2000 y agregadas en TypeScript
  // — correcto mientras el volumen no superara esos topes, pero de forma
  // silenciosa dejaría de estarlo (mismo patrón que dashboard_inmuebles_stats()
  // ya resolvió para inmuebles). dashboard_contactos_stats() agrega en SQL
  // sobre la tabla completa, sin límite.
  const { data, error } = await supa.rpc("dashboard_contactos_stats");
  if (error) throw new Error(`getStatsData: ${error.message}`);
  return data as StatsData;
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
  sinAsignar: LeadInsight[];
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

  // `scored` conserva el orden de contactRows (created_at desc), así que
  // esto ya son los sin agente más recientes, no hace falta reordenar.
  // La consulta de origen ya está acotada a los 120 Lead/Prospecto más
  // recientes (arriba), así que el histórico (2.797 de los 2.808 Leads
  // totales no tienen agente) queda fuera sin necesidad de ningún filtro de
  // fecha nuevo — este panel es para que se note un lead nuevo sin asignar
  // en el día a día, no para triar el histórico (decisión de David, 12 sep
  // 2026, ver Kanban de Leads filtrado por agente más abajo en Pendiente).
  const sinAsignar = scored.filter((c) => !c.tieneAgente).slice(0, 5);

  return {
    topCalientes,
    sinSeguimiento,
    sinAsignar,
    total: scored.length,
  } satisfies LeadInsightsData;
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
      const needle = escapeSearchTerm(data.q);
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
