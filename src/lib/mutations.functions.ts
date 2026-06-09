import { createServerFn } from "@tanstack/react-start";
import { airtableFetch, BASE_ID, TABLES } from "./airtable.server";
import { toTitleCase, toSentenceCase } from "./format";

// Helpers
function strOpt(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}
function numOpt(v: unknown): number | undefined {
  if (v === "" || v == null) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function arrOpt(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const f = v.map(String).filter(Boolean);
  return f.length ? f : undefined;
}
function bust(...keys: string[]) {
  // No-op aquí; invalidación se hace en cliente vía queryClient.invalidateQueries.
  return keys;
}

// ------------------- CLIENTE -------------------
export type CreateClientePayload = {
  nombre: string;
  email?: string;
  telefono?: string;
  dni?: string;
  tipo?: string; // Propietario, Comprador, Interesado…
  fecha?: string | null; // ISO date
  motivo?: string;
  solicitud?: string;
  observaciones?: string;
  categoria?: string[]; // Pisos, Casas…
  profesion?: string;
  contratoTrabajo?: string;
  mascota?: string;
  avalista?: string;
  agentesIds?: string[];
  inmueblesIds?: string[];
};

export const createCliente = createServerFn({ method: "POST" })
  .inputValidator((d: CreateClientePayload) => {
    if (!d?.nombre || !d.nombre.trim()) throw new Error("Nombre requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const fields: Record<string, unknown> = { Nombre: toTitleCase(data.nombre.trim()) };
    const email = strOpt(data.email);
    if (email) fields["Email"] = email;
    const tel = strOpt(data.telefono);
    if (tel) fields["Teléfono"] = tel;
    const dni = strOpt(data.dni);
    if (dni) fields["DNI"] = dni;
    const tipo = strOpt(data.tipo);
    if (tipo) fields["Tipo de cliente"] = tipo;
    const fecha = strOpt(data.fecha ?? undefined);
    if (fecha) fields["Fecha"] = fecha;
    const motivo = strOpt(data.motivo);
    if (motivo) fields["Motivo de la llamada"] = toSentenceCase(motivo);
    const sol = strOpt(data.solicitud);
    if (sol) fields["Solicitud de llamada"] = toSentenceCase(sol);
    const obs = strOpt(data.observaciones);
    if (obs) fields["Observaciones"] = toSentenceCase(obs);
    const cat = arrOpt(data.categoria);
    if (cat) fields["Categoría"] = cat;
    const prof = strOpt(data.profesion);
    if (prof) fields["Profesión"] = toTitleCase(prof);
    const ct = strOpt(data.contratoTrabajo);
    if (ct) fields["Dispones de contrato de trabajo"] = toTitleCase(ct);
    const masc = strOpt(data.mascota);
    if (masc) fields["¿Tiene mascota?"] = toTitleCase(masc);
    const av = strOpt(data.avalista);
    if (av) fields["¿Dispones de avalista en caso de ser necesario?"] = toTitleCase(av);
    const ag = arrOpt(data.agentesIds);
    if (ag) fields["Agentes (tabla agentes)"] = ag;
    const inm = arrOpt(data.inmueblesIds);
    if (inm) fields["Inmuebles"] = inm;

    const res = (await airtableFetch(`/v0/${BASE_ID}/${TABLES.clientes}`, {
      method: "POST",
      body: JSON.stringify({ records: [{ fields }] }),
    })) as { records: Array<{ id: string }> };
    bust("clientes");
    return { id: res.records?.[0]?.id ?? "" };
  });

// ------------------- INMUEBLE / ALQUILER -------------------
export type CreateInmueblePayload = {
  calle: string;
  numero?: string;
  barrio?: string;
  localidad?: string;
  tipo: string; // ej. "Piso", "Alquiler Piso"…
  estatus?: string; // Activo por defecto
  precio?: number | null;
  habitaciones?: string;
  banos?: string;
  superficie?: string;
  descripcion?: string;
  observaciones?: string;
  fechaInicio?: string | null;
  agentesIds?: string[];
  propietariosIds?: string[];
};

export const createInmueble = createServerFn({ method: "POST" })
  .inputValidator((d: CreateInmueblePayload) => {
    if (!d?.calle || !d.calle.trim()) throw new Error("Calle requerida");
    if (!d?.tipo || !d.tipo.trim()) throw new Error("Tipo requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const fields: Record<string, unknown> = {
      Calle: toTitleCase(data.calle.trim()),
      "Tipo de inmueble (desplegable)": data.tipo.trim(),
      Estatus: strOpt(data.estatus) ?? "Activo",
      "Fecha de inicio": strOpt(data.fechaInicio ?? undefined) ?? new Date().toISOString().slice(0, 10),
    };
    const num = strOpt(data.numero);
    if (num) fields["Numero"] = num;
    const barrio = strOpt(data.barrio);
    if (barrio) fields["Barrio"] = toTitleCase(barrio);
    const loc = strOpt(data.localidad);
    if (loc) fields["Localidad"] = toTitleCase(loc);
    const precio = numOpt(data.precio);
    if (precio !== undefined) fields["Precio"] = precio;
    const hab = strOpt(data.habitaciones);
    if (hab) fields["Habitaciones"] = hab;
    const ban = strOpt(data.banos);
    if (ban) fields["Baños"] = ban;
    const sup = strOpt(data.superficie);
    if (sup) fields["Superficie"] = sup;
    const desc = strOpt(data.descripcion);
    if (desc) fields["Descripción"] = toSentenceCase(desc);
    const obs = strOpt(data.observaciones);
    if (obs) fields["Observaciones"] = toSentenceCase(obs);
    const ag = arrOpt(data.agentesIds);
    if (ag) fields["Agentes Asignados"] = ag;
    const prop = arrOpt(data.propietariosIds);
    if (prop) fields["Propietario"] = prop;

    const res = (await airtableFetch(`/v0/${BASE_ID}/${TABLES.inmuebles}`, {
      method: "POST",
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    })) as { records: Array<{ id: string }> };
    bust("all-inmuebles");
    return { id: res.records?.[0]?.id ?? "" };
  });

// ------------------- VISITA -------------------
export type CreateVisitaPayload = {
  fecha: string; // ISO datetime
  estado?: string;
  comentarios?: string;
  inmueblesIds: string[];
  clientesIds?: string[];
  agentesIds?: string[];
};

export const createVisita = createServerFn({ method: "POST" })
  .inputValidator((d: CreateVisitaPayload) => {
    if (!d?.fecha) throw new Error("Fecha requerida");
    if (!Array.isArray(d.inmueblesIds) || d.inmueblesIds.length === 0)
      throw new Error("Selecciona al menos un inmueble");
    return d;
  })
  .handler(async ({ data }) => {
    const fields: Record<string, unknown> = {
      "Fecha y Hora": data.fecha,
      Estado: strOpt(data.estado) ?? "Pendiente",
      Inmuebles: data.inmueblesIds,
    };
    const com = strOpt(data.comentarios);
    if (com) fields["Comentarios"] = toSentenceCase(com);
    const cli = arrOpt(data.clientesIds);
    if (cli) fields["Clientes"] = cli;
    const ag = arrOpt(data.agentesIds);
    if (ag) fields["Agentes"] = ag;

    const res = (await airtableFetch(`/v0/${BASE_ID}/${TABLES.visitas}`, {
      method: "POST",
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    })) as { records: Array<{ id: string }> };
    bust("visitas-all");
    return { id: res.records?.[0]?.id ?? "" };
  });

// ------------------- ASIGNAR LEAD A AGENTES -------------------
export type AssignClientePayload = {
  clienteId: string;
  agentesIds: string[]; // lista completa (reemplaza la actual)
};

export const assignClienteAgentes = createServerFn({ method: "POST" })
  .inputValidator((d: AssignClientePayload) => {
    if (!d?.clienteId) throw new Error("Cliente requerido");
    if (!Array.isArray(d.agentesIds)) throw new Error("Agentes inválidos");
    return d;
  })
  .handler(async ({ data }) => {
    const fields: Record<string, unknown> = {
      "Agentes (tabla agentes)": data.agentesIds,
    };
    await airtableFetch(`/v0/${BASE_ID}/${TABLES.clientes}/${data.clienteId}`, {
      method: "PATCH",
      body: JSON.stringify({ fields, typecast: true }),
    });
    bust("clientes");
    return { ok: true };
  });

// ------------------- SEGUIMIENTO DE LEAD -------------------
// Estado de trabajo del lead (campo "Trabajado") + nota opcional que se
// concatena al final de "Observaciones" con marca de tiempo.
export const ESTADOS_SEGUIMIENTO = [
  "Pendiente",
  "Contactado",
  "Descartado",
] as const;
export type EstadoSeguimiento = (typeof ESTADOS_SEGUIMIENTO)[number];

export type SeguimientoPayload = {
  clienteId: string;
  estado?: EstadoSeguimiento;
  nota?: string;
  observacionesActuales?: string;
};

function formatNota(nota: string, observacionesActuales: string): string {
  const ts = new Date().toLocaleString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const linea = `[${ts}] ${toSentenceCase(nota.trim())}`;
  const prev = observacionesActuales.trim();
  return prev ? `${prev}\n${linea}` : linea;
}

export const updateClienteSeguimiento = createServerFn({ method: "POST" })
  .inputValidator((d: SeguimientoPayload) => {
    if (!d?.clienteId) throw new Error("Cliente requerido");
    if (!d.estado && !d.nota) throw new Error("Nada que actualizar");
    return d;
  })
  .handler(async ({ data }) => {
    const fields: Record<string, unknown> = {};
    if (data.estado) fields["Trabajado"] = data.estado;
    const nota = strOpt(data.nota);
    if (nota) {
      fields["Observaciones"] = formatNota(nota, data.observacionesActuales ?? "");
    }
    await airtableFetch(`/v0/${BASE_ID}/${TABLES.clientes}/${data.clienteId}`, {
      method: "PATCH",
      body: JSON.stringify({ fields, typecast: true }),
    });
    bust("clientes");
    return { ok: true };
  });

