import { createServerFn } from "@tanstack/react-start";
import { airtableFetch, BASE_ID, TABLES } from "./airtable.server";
import { toTitleCase } from "./format";

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
    const fields: Record<string, unknown> = { Nombre: data.nombre.trim() };
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
    if (motivo) fields["Motivo de la llamada"] = motivo;
    const sol = strOpt(data.solicitud);
    if (sol) fields["Solicitud de llamada"] = sol;
    const obs = strOpt(data.observaciones);
    if (obs) fields["Observaciones"] = obs;
    const cat = arrOpt(data.categoria);
    if (cat) fields["Categoría"] = cat;
    const prof = strOpt(data.profesion);
    if (prof) fields["Profesión"] = prof;
    const ct = strOpt(data.contratoTrabajo);
    if (ct) fields["Dispones de contrato de trabajo"] = ct;
    const masc = strOpt(data.mascota);
    if (masc) fields["¿Tiene mascota?"] = masc;
    const av = strOpt(data.avalista);
    if (av) fields["¿Dispones de avalista en caso de ser necesario?"] = av;
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
      Calle: data.calle.trim(),
      "Tipo de inmueble (desplegable)": data.tipo.trim(),
      Estatus: strOpt(data.estatus) ?? "Activo",
      "Fecha de inicio": strOpt(data.fechaInicio ?? undefined) ?? new Date().toISOString().slice(0, 10),
    };
    const num = strOpt(data.numero);
    if (num) fields["Numero"] = num;
    const barrio = strOpt(data.barrio);
    if (barrio) fields["Barrio"] = barrio;
    const loc = strOpt(data.localidad);
    if (loc) fields["Localidad"] = loc;
    const precio = numOpt(data.precio);
    if (precio !== undefined) fields["Precio"] = precio;
    const hab = strOpt(data.habitaciones);
    if (hab) fields["Habitaciones"] = hab;
    const ban = strOpt(data.banos);
    if (ban) fields["Baños"] = ban;
    const sup = strOpt(data.superficie);
    if (sup) fields["Superficie"] = sup;
    const desc = strOpt(data.descripcion);
    if (desc) fields["Descripción"] = desc;
    const obs = strOpt(data.observaciones);
    if (obs) fields["Observaciones"] = obs;
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
    if (com) fields["Comentarios"] = com;
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
