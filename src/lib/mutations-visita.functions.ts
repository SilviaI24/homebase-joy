// M-03: extraído de mutations.functions.ts.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupa } from "./supabase.server";
import { toSentenceCase, toTitleCase } from "./format";
import { requirePermission } from "@/lib/crm-auth.server";
import { strOpt, arrOpt } from "./mutations-shared";
import {
  crearEventoGoogle,
  actualizarEventoGoogle,
  eliminarEventoGoogle,
  type VisitaEventInput,
} from "@/lib/google-calendar.server";
import {
  emailInvitable,
  textoEventoCliente,
  textoEventoInterno,
  ubicacionVisita,
  type DatosEventoVisita,
} from "./visita-invitacion";

export type CreateVisitaPayload = {
  fecha: string;
  estado?: string;
  comentarios?: string;
  inmueblesIds: string[];
  clientesIds?: string[];
  agentesIds?: string[];
  // "Registrar como visita" desde una cita que solo existe en Google Calendar
  // (Agenda, 23 sep 2026): la visita se enlaza a ese evento en vez de crear
  // otro nuevo en Google -- si no, el comercial vería la cita duplicada.
  googleEvento?: { agenteId: string; eventId: string };
};

// Validación de "estado de visita permitido", compartida por createVisita y
// updateVisitaEstado (antes duplicada como ESTADO_IN_MAP/ESTADO_IN_MAP_UPDATE,
// idénticas byte a byte — unificado 14 sep 2026).
const ESTADO_VISITA_VALIDOS: Record<string, string> = {
  Programada: "Programada",
  Realizada: "Realizada",
  Cancelada: "Cancelada",
};

// Duración por defecto de una visita en el calendario -- no hay campo de
// duración en el formulario, así que se asume 1h para el evento de Google.
const DURACION_EVENTO_MS = 60 * 60 * 1000;

// Invitar al cliente a la cita de Google Calendar (Google le envía la
// invitación por email desde la cuenta del comercial). Desactivado hasta
// que David apruebe el texto del correo -- con la variable sin poner, el
// comportamiento es exactamente el de antes (evento interno, sin invitados).
function invitacionClienteActiva(): boolean {
  return process.env.GOOGLE_CALENDAR_INVITAR_CLIENTES === "true";
}

// Evento de Google a partir de los datos ya normalizados de la visita -- una
// única lectura de inmueble+cliente+agente, reutilizada por createVisita y
// updateVisita. Con invitación activa y cliente con email, el texto pasa a
// ser el de cara al cliente (sin notas internas, ver visita-invitacion.ts).
async function construirEventoVisita(
  supa: SupabaseClient,
  params: {
    propertyId: string;
    contactId: string | null;
    agenteId: string | null;
    fecha: string;
    notas: string | null;
    // Solo se invita a visitas Programadas y futuras: registrar una visita
    // ya hecha no debe mandarle al cliente una invitación a algo pasado.
    estado: string;
  },
): Promise<VisitaEventInput> {
  const [{ data: prop }, contactRow, agentRow] = await Promise.all([
    supa
      .from("properties")
      .select("calle, numero, ref, barrio, cp, localidad")
      .eq("id", params.propertyId)
      .maybeSingle(),
    params.contactId
      ? supa.from("contacts").select("nombre, email").eq("id", params.contactId).maybeSingle()
      : Promise.resolve({ data: null }),
    params.agenteId
      ? supa.from("agents").select("nombre, email").eq("id", params.agenteId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const direccion =
    toTitleCase([prop?.calle, prop?.numero].filter(Boolean).join(" ").trim()) ||
    prop?.ref ||
    "Inmueble";
  const barrio = toTitleCase(prop?.barrio ?? "");
  const localidad = toTitleCase(prop?.localidad ?? "");
  const datos: DatosEventoVisita = {
    direccion,
    zona: barrio && localidad ? `${barrio} (${localidad})` : barrio || localidad,
    cp: prop?.cp ?? "",
    localidad,
    clienteNombre: toTitleCase(contactRow.data?.nombre ?? ""),
    agenteNombre: toTitleCase(agentRow.data?.nombre ?? ""),
    agenteEmail: agentRow.data?.email ?? "",
    notas: params.notas,
  };

  const inicio = new Date(params.fecha);
  const base = {
    ubicacion: ubicacionVisita(datos),
    inicioISO: inicio.toISOString(),
    finISO: new Date(inicio.getTime() + DURACION_EVENTO_MS).toISOString(),
  };

  if (!invitacionClienteActiva()) return { ...base, ...textoEventoInterno(datos) };

  const email = emailInvitable(contactRow.data?.email);
  const invitable = !!email && params.estado === "Programada" && inicio.getTime() > Date.now();
  if (!invitable) return { ...base, ...textoEventoInterno(datos), invitado: null };
  return {
    ...base,
    ...textoEventoCliente(datos),
    invitado: { email, nombre: datos.clienteNombre },
  };
}

export const createVisita = createServerFn({ method: "POST" })
  .validator((d: CreateVisitaPayload) => {
    if (!d?.fecha) throw new Error("Fecha requerida");
    if (!Array.isArray(d.inmueblesIds) || d.inmueblesIds.length === 0)
      throw new Error("Selecciona al menos un inmueble");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("visits.create");
    const supa = getSupa();
    const estadoRaw = strOpt(data.estado) ?? "Programada";
    if (!Object.prototype.hasOwnProperty.call(ESTADO_VISITA_VALIDOS, estadoRaw)) {
      throw new Error("Estado de visita inválido");
    }
    const com = strOpt(data.comentarios);
    const cli = arrOpt(data.clientesIds);
    const ag = arrOpt(data.agentesIds);
    const notas = com ? toSentenceCase(com) : null;
    const contactId = cli?.length ? cli[0] : null;
    const googleEvento = data.googleEvento?.eventId ? data.googleEvento : null;
    // El evento vive en el calendario de un agente concreto: la visita tiene
    // que quedar asignada a él para que editarla/anularla después actualice
    // ese mismo evento (updateVisita/deleteVisita usan el agente de la visita).
    const agenteId = googleEvento?.agenteId ?? (ag?.length ? ag[0] : null);

    if (googleEvento) {
      const { data: yaEnlazada } = await supa
        .from("visits")
        .select("id")
        .eq("google_event_id", googleEvento.eventId)
        .limit(1)
        .maybeSingle();
      if (yaEnlazada) throw new Error("Esta cita de Google ya está registrada como visita");
    }

    // El diálogo permite seleccionar varios inmuebles a la vez ("Seleccionados:
    // N"), pero cada fila de `visits` es un inmueble por visita — antes solo
    // se guardaba data.inmueblesIds[0] y el resto se descartaba en silencio
    // (auditoría 12 sep 2026). Se crea una visita por inmueble seleccionado,
    // con el mismo cliente/agente/fecha/notas en todas.
    const ids: string[] = [];
    for (const [i, propertyId] of data.inmueblesIds.entries()) {
      // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
      const { data: visitaId, error } = await supa.rpc("crm_crear_visita", {
        p_fecha: data.fecha,
        p_estado: ESTADO_VISITA_VALIDOS[estadoRaw] ?? "Programada",
        p_notas: notas,
        p_property_id: propertyId,
        p_contact_id: contactId,
        p_agente_id: agenteId,
        p_actor_id: crm.userId,
      });
      if (error) throw new Error(error.message);
      ids.push(visitaId as string);

      // Cita que ya existía en Google: se enlaza a la primera visita (una
      // cita = un evento); si se eligieron más inmuebles, el resto sigue el
      // camino normal y crea su propio evento.
      if (googleEvento && i === 0) {
        const { error: errLink } = await supa
          .from("visits")
          .update({ google_event_id: googleEvento.eventId })
          .eq("id", visitaId as string);
        if (errLink) throw new Error(errLink.message);
        continue;
      }

      // Google Calendar: empuje único CRM -> Google, best-effort (nunca
      // bloquea ni falla la creación de la visita si el agente no tiene
      // Google Calendar conectado o la API de Google falla).
      if (agenteId) {
        const evento = await construirEventoVisita(supa, {
          propertyId,
          contactId,
          agenteId,
          fecha: data.fecha,
          notas,
          estado: ESTADO_VISITA_VALIDOS[estadoRaw] ?? "Programada",
        });
        const googleEventId = await crearEventoGoogle(agenteId, evento);
        if (googleEventId) {
          await supa
            .from("visits")
            .update({ google_event_id: googleEventId })
            .eq("id", visitaId as string);
        }
      }
    }
    return { id: ids[0], ids };
  });

export type UpdateVisitaPayload = {
  visitaId: string;
  fecha: string;
  inmuebleId: string;
  clienteId?: string | null;
  agenteId?: string | null;
  notas?: string;
};

export const updateVisita = createServerFn({ method: "POST" })
  .validator((d: UpdateVisitaPayload) => {
    if (!d?.visitaId) throw new Error("visitaId requerido");
    if (!d?.fecha) throw new Error("Fecha requerida");
    if (!d?.inmuebleId) throw new Error("Selecciona un inmueble");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("visits.update");
    const supa = getSupa();
    const notas = strOpt(data.notas);
    const notasFinal = notas ? toSentenceCase(notas) : null;
    const nuevoAgenteId = data.agenteId || null;

    const { data: actual } = await supa
      .from("visits")
      .select("agente_id, google_event_id, estado")
      .eq("id", data.visitaId)
      .maybeSingle();

    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_actualizar_visita", {
      p_visita_id: data.visitaId,
      p_fecha: data.fecha,
      p_property_id: data.inmuebleId,
      p_contact_id: data.clienteId || null,
      p_agente_id: nuevoAgenteId,
      p_notas: notasFinal,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);

    // Google Calendar: si cambia de agente, el evento se mueve (se borra del
    // calendario del agente anterior y se crea en el del nuevo) -- un evento
    // no se puede "transferir" entre calendarios de dos cuentas distintas.
    const agenteAnterior = actual?.agente_id ?? null;
    const eventoAnterior = actual?.google_event_id ?? null;

    if (nuevoAgenteId) {
      const evento = await construirEventoVisita(supa, {
        propertyId: data.inmuebleId,
        contactId: data.clienteId || null,
        agenteId: nuevoAgenteId,
        fecha: data.fecha,
        notas: notasFinal,
        estado: actual?.estado ?? "Programada",
      });

      if (eventoAnterior && agenteAnterior === nuevoAgenteId) {
        await actualizarEventoGoogle(nuevoAgenteId, eventoAnterior, evento);
      } else {
        if (eventoAnterior && agenteAnterior) {
          await eliminarEventoGoogle(agenteAnterior, eventoAnterior);
        }
        const nuevoEventoId = await crearEventoGoogle(nuevoAgenteId, evento);
        await supa
          .from("visits")
          .update({ google_event_id: nuevoEventoId })
          .eq("id", data.visitaId);
      }
    } else if (eventoAnterior && agenteAnterior) {
      // Se quitó el agente de la visita: sin agente no hay calendario al que sincronizar.
      await eliminarEventoGoogle(agenteAnterior, eventoAnterior);
      await supa.from("visits").update({ google_event_id: null }).eq("id", data.visitaId);
    }

    return { ok: true };
  });

export const deleteVisita = createServerFn({ method: "POST" })
  .validator((d: { visitaId: string }) => {
    if (!d?.visitaId) throw new Error("visitaId requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("visits.delete");
    const supa = getSupa();

    const { data: actual } = await supa
      .from("visits")
      .select("agente_id, google_event_id")
      .eq("id", data.visitaId)
      .maybeSingle();

    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_eliminar_visita", {
      p_visita_id: data.visitaId,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);

    if (actual?.google_event_id && actual.agente_id) {
      await eliminarEventoGoogle(actual.agente_id, actual.google_event_id);
    }
    return { ok: true };
  });

export const updateVisitaEstado = createServerFn({ method: "POST" })
  .validator((d: { visitaId: string; estado: string }) => {
    if (!d?.visitaId) throw new Error("visitaId requerido");
    if (!d?.estado) throw new Error("estado requerido");
    if (!Object.prototype.hasOwnProperty.call(ESTADO_VISITA_VALIDOS, d.estado)) {
      throw new Error("Estado de visita inválido");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("visits.update");
    const supa = getSupa();
    const dbEstado = ESTADO_VISITA_VALIDOS[data.estado] ?? data.estado;
    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_actualizar_visita_estado", {
      p_visita_id: data.visitaId,
      p_estado: dbEstado,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);

    // Cancelada: el evento desaparece del calendario del agente -- una
    // visita anulada no debería seguir apareciendo como una cita real.
    if (dbEstado === "Cancelada") {
      const { data: actual } = await supa
        .from("visits")
        .select("agente_id, google_event_id")
        .eq("id", data.visitaId)
        .maybeSingle();
      if (actual?.google_event_id && actual.agente_id) {
        await eliminarEventoGoogle(actual.agente_id, actual.google_event_id);
        await supa.from("visits").update({ google_event_id: null }).eq("id", data.visitaId);
      }
    }
    return { ok: true };
  });
