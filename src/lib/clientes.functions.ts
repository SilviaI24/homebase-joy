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

// Segmento = qué tipo de relación tiene el contacto con la agencia.
// Se basa en los contact_roles, no en el ciclo_vida.
function deriveSegmento(roles: RoleRow[]): { segmento: Segmento; motivo: string } {
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

  const allContacts: any[] = [];
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
    allContacts.push(...(data ?? []));
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

  const clientes: Cliente[] = allContacts.map((r: any) => {
    const roles: RoleRow[] = r.contact_roles ?? [];
    const linkedRoles = roles.filter((role): role is RoleRow & { properties: PropertyRowShape } =>
      Boolean(role.properties),
    );
    const agentAssignments: Array<{ agent_id: string; agents: any }> = r.contact_agents ?? [];

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

  const allContacts: any[] = [];
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
    allContacts.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
    from += PAGE;
  }

  const CLOSED = new Set(["Vendido", "Alquilado"]);
  const INACTIVE = new Set(["Vendido", "Alquilado", "Baja"]);

  const clientes: Cliente[] = allContacts.map((r: any) => {
    const roles: RoleRow[] = r.contact_roles ?? [];
    const linkedRoles = roles.filter((role): role is RoleRow & { properties: PropertyRowShape } =>
      Boolean(role.properties),
    );
    const agentAssignments: Array<{ agent_id: string; agents: any }> = r.contact_agents ?? [];

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
export const listConversacionesIa = createServerFn({ method: "GET" }).handler(async () => {
  await requirePermission("contacts.read");
  const supa = getSupa();
  const allContacts: any[] = [];
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
    const page = data ?? [];
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
        .map((assignment: { agent_id?: string }) => assignment.agent_id)
        .filter((id: string | undefined): id is string => Boolean(id)),
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

  const counts = { Propietario: 0, Comprador: 0, Inquilino: 0, total: 0 };
  for (const c of data ?? []) {
    const roles = ((c as any).contact_roles ?? []) as Array<{ tipo: string }>;
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

      const clientes: ClienteRow[] = (rows ?? []).map((r: any) => {
        const roles: RoleRow[] = r.contact_roles ?? [];
        const agentAssignments: Array<{ agent_id: string }> = r.contact_agents ?? [];
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
          agentesIds: agentAssignments.map((a) => a.agent_id).filter(Boolean),
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

    // Re-use the same mapping logic as listClientes (single contact)
    const roles: RoleRow[] = (r as any).contact_roles ?? [];
    const linkedRoles = roles.filter((role): role is RoleRow & { properties: PropertyRowShape } =>
      Boolean(role.properties),
    );
    const agentAssignments: Array<{ agent_id: string; agents: any }> =
      (r as any).contact_agents ?? [];

    const { segmento, motivo: segmentoMotivo } = deriveSegmento(roles);
    const etapa = ((r as any).ciclo_vida ?? "Lead") as Etapa;

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

    const txtRaw = `${(r as any).solicitud ?? ""} ${(r as any).motivo ?? ""} ${(r as any).observaciones ?? ""} ${(r as any).feedback ?? ""} ${(r as any).conversaciones ?? ""}`;
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
      const cats = (((r as any).categoria as string[]) ?? []).map((c: string) => c.toLowerCase());
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

    const fechaMs = (r as any).created_at ? new Date((r as any).created_at).getTime() : 0;
    const propiedadIds = propRoles.map((rl) => rl.property_id!).filter(Boolean);
    const compradorIds = cmpRoles.map((rl) => rl.property_id!).filter(Boolean);
    const alquilerIds = inqRoles.map((rl) => rl.property_id!).filter(Boolean);
    const atts =
      ((r as any).attachments as Array<{ url: string; filename: string; type: string }>) ?? [];

    const cliente: Cliente = {
      id: (r as any).id,
      nombre: toTitleCase(s((r as any).nombre)),
      email: s((r as any).email),
      telefono: s((r as any).telefono),
      canalOrigen: s((r as any).canal_origen),
      dni: s((r as any).dni),
      fecha: (r as any).created_at ? (r as any).created_at.slice(0, 10) : null,
      motivo: toSentenceCase(s((r as any).motivo)),
      observaciones: toSentenceCase(s((r as any).observaciones)),
      solicitud: toSentenceCase(s((r as any).solicitud)),
      seccion: toTitleCase(s((r as any).seccion)),
      conversaciones: toSentenceCase(s((r as any).conversaciones)),
      feedback: toSentenceCase(s((r as any).feedback)),
      profesion: toTitleCase(s((r as any).profesion)),
      contratoTrabajo: toTitleCase(s((r as any).contrato_trabajo)),
      mascota: toTitleCase(s((r as any).mascota)),
      avalista: toTitleCase(s((r as any).avalista)),
      categoria: Array.isArray((r as any).categoria) ? (r as any).categoria : [],
      trabajado: toTitleCase(s((r as any).trabajado)),
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
      duplicados: Number((r as any).duplicados) || 1,
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
      const canal = ["Todos", "WhatsApp", "Voz"].includes(d?.canal ?? "")
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
      const silviaOrPrimary = "canal_origen.ilike.silvia-whatsapp,canal_origen.ilike.silvia-voz";
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

      // Post-fetch: filter out legacy records that mention Idealista
      const validRows = (rows ?? []).filter((row: any) => {
        const origen = (row.canal_origen ?? "").toLowerCase();
        const esPrimary = origen === "silvia-whatsapp" || origen === "silvia-voz";
        if (esPrimary) return true;
        // Legacy: reject if idealista mention in text
        const texto = `${row.motivo ?? ""} ${row.solicitud ?? ""} ${row.conversaciones ?? ""}`;
        return !/idealista/i.test(texto);
      });

      const clientes: ConversacionIa[] = validRows.map((row: any) => ({
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
          .map((a: { agent_id?: string }) => a.agent_id)
          .filter((id: string | undefined): id is string => Boolean(id)),
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
    await requirePermission("contacts.delete_hard");
    const supa = getSupa();
    await supa.from("contact_roles").delete().eq("contact_id", data.id);
    await supa.from("contact_agents").delete().eq("contact_id", data.id);
    const { error } = await supa.from("contacts").delete().eq("id", data.id);
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
    await requirePermission("contacts.update");
    const supa = getSupa();
    const { error } = await supa
      .from("contacts")
      .update({ ciclo_vida: data.cicloVida })
      .eq("id", data.contactId);
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
    let tipoRelacion = data.tipo;
    if (tipoRelacion === "Propietario") {
      const { data: property, error: propertyError } = await supa
        .from("properties")
        .select("es_alquiler")
        .eq("id", data.propertyId)
        .single();
      if (propertyError) throw new Error(propertyError.message);
      if (property.es_alquiler) tipoRelacion = "Arrendador";
    }
    const { data: existing, error: existingError } = await supa
      .from("contact_roles")
      .select("id")
      .eq("contact_id", data.contactId)
      .eq("property_id", data.propertyId)
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    if (tipoRelacion === null) {
      if (existing) {
        const { error } = await supa.from("contact_roles").delete().eq("id", existing.id);
        if (error) throw new Error(error.message);
      }
    } else if (existing) {
      const { error } = await supa
        .from("contact_roles")
        .update({ tipo: tipoRelacion, agente_id: crm.agentId })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supa.from("contact_roles").insert({
        contact_id: data.contactId,
        property_id: data.propertyId,
        agente_id: crm.agentId,
        tipo: tipoRelacion,
        estado: "Prospecto",
      });
      if (error) throw new Error(error.message);
    }
    await recalcularEtapa(data.contactId, supa);
    return { ok: true };
  });

export const buscarInmuebles = createServerFn({ method: "GET" })
  .validator((d: { q: string }) => ({ q: d?.q ?? "" }))
  .handler(async ({ data }) => {
    await requirePermission("properties.read");
    const supa = getSupa();
    const q = data.q.trim();
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

// Prioridad: Activo > Reservado > Prospecto > Histórico > Lead
// Solo Descartado es intocable (estado final manual).
export async function recalcularEtapa(
  contactId: string,
  supa: ReturnType<typeof getSupa>,
): Promise<void> {
  const { data: current, error: currentError } = await supa
    .from("contacts")
    .select("ciclo_vida")
    .eq("id", contactId)
    .single();
  if (currentError) throw new Error(currentError.message);

  if (current?.ciclo_vida === "Descartado") return;

  const { data: roles, error: rolesError } = await supa
    .from("contact_roles")
    .select("tipo, properties(estatus)")
    .eq("contact_id", contactId);
  if (rolesError) throw new Error(rolesError.message);

  // Supabase returns properties as an array from the join; access .estatus via unknown cast
  const statuses = (roles ?? [])
    .map((r) => (r.properties as unknown as { estatus: string } | null)?.estatus ?? null)
    .filter((s): s is string => s !== null);

  let ciclo_vida: string;
  if (statuses.some((s) => s === "Activo" || s === "Reservado")) ciclo_vida = "Cliente";
  else if (statuses.some((s) => s === "Prospección")) ciclo_vida = "Prospecto";
  else if (statuses.some((s) => s === "Vendido" || s === "Alquilado")) ciclo_vida = "Histórico";
  else if (
    (roles ?? []).some((role) =>
      ["Propietario", "Arrendador", "Comprador", "Inquilino"].includes(role.tipo),
    )
  )
    ciclo_vida = "Cliente";
  else ciclo_vida = "Lead";

  if (ciclo_vida !== current?.ciclo_vida) {
    const { error } = await supa.from("contacts").update({ ciclo_vida }).eq("id", contactId);
    if (error) throw new Error(error.message);
  }
}

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
  const conVisita = new Set((visitsRes.data ?? []).map((v: any) => v.contact_id).filter(Boolean));

  const scored: LeadInsight[] = contacts.map((c: any) => {
    let s = 0;
    if (c.telefono) s += 0.1;
    if (c.email) s += 0.08;
    if (c.solicitud || c.motivo) s += 0.12;
    if ((c.contact_agents as any[])?.length > 0) s += 0.1;

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
      tieneAgente: (c.contact_agents as any[])?.length > 0,
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
