import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toTitleCase, toSentenceCase } from "./format";
import { requirePermission, requirePermissions } from "@/lib/crm-auth.server";

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// Map tipo/segmento values to Supabase ciclo_vida
function tipoCicloVida(tipo: string): string {
  const t = tipo.toLowerCase();
  if (t.includes("anular")) return "Descartado";
  if (t.includes("prospecc")) return "Prospecto";
  if (
    ["propietario", "comprador", "inquilino", "interesado alquiler", "interesado propiedades"].some(
      (v) => t === v,
    )
  )
    return "Cliente";
  return "Lead";
}

// ── CLIENTE ───────────────────────────────────────────────────────────────────

export type CreateClientePayload = {
  nombre: string;
  email?: string;
  telefono?: string;
  dni?: string;
  tipo?: string;
  fecha?: string | null;
  motivo?: string;
  solicitud?: string;
  observaciones?: string;
  categoria?: string[];
  profesion?: string;
  contratoTrabajo?: string;
  mascota?: string;
  avalista?: string;
  agentesIds?: string[];
  inmueblesIds?: string[];
};

export const createCliente = createServerFn({ method: "POST" })
  .validator((d: CreateClientePayload) => {
    if (!d?.nombre || !d.nombre.trim()) throw new Error("Nombre requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const tipo = strOpt(data.tipo) ?? "Interesado Propiedades";
    const cicloVida = tipoCicloVida(tipo);
    const creaRelacion = ["Propietario", "Comprador", "Inquilino"].includes(tipo);
    const { crm } = creaRelacion
      ? await requirePermissions("contacts.create", "contact_roles.create")
      : await requirePermission("contacts.create");
    const supa = getSupa();

    const row: Record<string, unknown> = {
      nombre: toTitleCase(data.nombre.trim()),
      ciclo_vida: cicloVida,
    };
    const email = strOpt(data.email);
    if (email) row.email = email;
    const tel = strOpt(data.telefono);
    if (tel) row.telefono = tel;
    const dni = strOpt(data.dni);
    if (dni) row.dni = dni;
    const mot = strOpt(data.motivo);
    if (mot) row.motivo = toSentenceCase(mot);
    const sol = strOpt(data.solicitud);
    if (sol) row.solicitud = toSentenceCase(sol);
    const obs = strOpt(data.observaciones);
    if (obs) row.observaciones = toSentenceCase(obs);
    const cat = arrOpt(data.categoria);
    if (cat) row.categoria = cat;
    const prof = strOpt(data.profesion);
    if (prof) row.profesion = toTitleCase(prof);
    const ct = strOpt(data.contratoTrabajo);
    if (ct) row.contrato_trabajo = toTitleCase(ct);
    const masc = strOpt(data.mascota);
    if (masc) row.mascota = toTitleCase(masc);
    const av = strOpt(data.avalista);
    if (av) row.avalista = toTitleCase(av);
    if (data.fecha) row.created_at = data.fecha;

    const { data: inserted, error } = await supa
      .from("contacts")
      .insert([row])
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const contactId = inserted.id;

    const rollbackContact = async () => {
      const { error: rollbackError } = await supa.from("contacts").delete().eq("id", contactId);
      if (rollbackError) {
        console.error("No se pudo revertir el contacto incompleto", rollbackError.message);
      }
    };

    // Si el formulario no especifica agentes, asigna el contacto a quien lo crea.
    // Así un lead nunca desaparece de la bandeja personal por quedar huérfano.
    const requestedAgents = arrOpt(data.agentesIds);
    const agentIds = requestedAgents?.length ? requestedAgents : crm.agentId ? [crm.agentId] : [];
    if (agentIds.length) {
      const { error: assignmentError } = await supa.from("contact_agents").upsert(
        agentIds.map((aid) => ({ contact_id: contactId, agent_id: aid })),
        { onConflict: "contact_id,agent_id", ignoreDuplicates: true },
      );
      if (assignmentError) {
        await rollbackContact();
        throw new Error(`No se pudo asignar el contacto: ${assignmentError.message}`);
      }
    }

    if (creaRelacion) {
      const { error: roleError } = await supa.from("contact_roles").insert([
        {
          contact_id: contactId,
          agente_id: agentIds[0] ?? null,
          tipo,
          estado: "Prospecto",
        },
      ]);
      if (roleError) {
        await rollbackContact();
        throw new Error(`No se pudo clasificar el contacto: ${roleError.message}`);
      }
    }

    return { id: contactId };
  });

// ── INMUEBLE ─────────────────────────────────────────────────────────────────

export type CreateInmueblePayload = {
  calle: string;
  numero?: string;
  barrio?: string;
  localidad?: string;
  tipo: string;
  estatus?: string;
  estado?: string;
  precio?: number | null;
  ref?: string;
  habitaciones?: string;
  banos?: string;
  superficie?: string;
  descripcion?: string;
  observaciones?: string;
  fechaInicio?: string | null;
  fechaExclusiva?: string | null;
  agentesIds?: string[];
  propietariosIds?: string[];
  publicacion?: string;
  plantas?: string;
  planta?: string;
  tipoSuelo?: string;
  calefaccion?: string;
  orientacion?: string;
  terraza?: string;
  balcon?: string;
  garaje?: string;
  trastero?: string;
  ascensor?: string;
  armariosEmpotrados?: string;
  anoConstruccion?: string;
  certificacionEnergetica?: string;
  llaves?: string;
  gastosComunidad?: string;
  inquilinos?: string;
  enlaceTours?: string;
  tipoChalet?: string;
  superficieEdificable?: string;
  viaUrbana?: string;
  salidaHumos?: string;
  almacen?: string;
  estancias?: string;
  imagenesUrls?: string[];
  documentacionUrls?: string[];
};

export const createInmueble = createServerFn({ method: "POST" })
  .validator((d: CreateInmueblePayload) => {
    if (!d?.calle || !d.calle.trim()) throw new Error("Calle requerida");
    if (!d?.tipo || !d.tipo.trim()) throw new Error("Tipo requerido");
    const estatusValidos = ["Activo", "Reservado", "Vendido", "Alquilado", "Baja", "Prospección"];
    if (d.estatus && !estatusValidos.includes(d.estatus)) {
      throw new Error("Estatus de inmueble inválido");
    }
    if (d.publicacion && !["SUBIR", "PROSPECTO", "PUBLICADO"].includes(d.publicacion)) {
      throw new Error("Estado de publicación inválido");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("properties.create");
    const ownerIds = arrOpt(data.propietariosIds) ?? [];
    if (ownerIds.length) {
      await requirePermissions("contact_roles.create", "contacts.update");
    }
    if (data.publicacion) {
      await requirePermission("properties.publish");
    }
    const supa = getSupa();
    const isAlq = /^\s*alquiler/i.test(data.tipo);

    const row: Record<string, unknown> = {
      calle: toTitleCase(data.calle.trim()),
      tipo: data.tipo.trim(),
      estatus: strOpt(data.estatus) ?? "Prospección",
      es_alquiler: isAlq,
      categoria: isAlq ? "Alquiler" : "Venta",
    };

    if (strOpt(data.numero)) row.numero = data.numero;
    if (strOpt(data.barrio)) row.barrio = toTitleCase(data.barrio!);
    if (strOpt(data.localidad)) row.localidad = toTitleCase(data.localidad!);
    if (strOpt(data.ref)) row.ref = data.ref;
    if (strOpt(data.publicacion)) row.publicacion = data.publicacion;
    if (strOpt(data.estado)) row.estado = data.estado;
    if (strOpt(data.descripcion)) row.descripcion = toSentenceCase(data.descripcion!);
    if (strOpt(data.observaciones)) row.observaciones = toSentenceCase(data.observaciones!);
    if (strOpt(data.planta)) row.piso = data.planta;
    if (strOpt(data.calefaccion)) row.calefaccion = data.calefaccion;
    if (strOpt(data.orientacion)) row.orientacion = data.orientacion;
    if (strOpt(data.terraza)) row.terraza = data.terraza;
    if (strOpt(data.balcon)) row.balcon = data.balcon;
    if (strOpt(data.garaje)) row.garaje = data.garaje;
    if (strOpt(data.trastero)) row.trastero = data.trastero;
    if (strOpt(data.ascensor)) row.ascensor = data.ascensor;
    if (strOpt(data.armariosEmpotrados)) row.armarios_empotrados = data.armariosEmpotrados;
    if (strOpt(data.anoConstruccion)) row.ano_construccion = data.anoConstruccion;
    if (strOpt(data.certificacionEnergetica))
      row.certificacion_energetica = data.certificacionEnergetica;
    if (strOpt(data.llaves)) row.llaves = data.llaves;
    if (strOpt(data.gastosComunidad)) row.gastos_comunidad = data.gastosComunidad;

    const precio = numOpt(data.precio);
    if (precio !== undefined) row.precio = precio;

    const hab = numOpt(data.habitaciones);
    if (hab !== undefined) row.habitaciones = hab;
    const ban = numOpt(data.banos);
    if (ban !== undefined) row.banos = ban;
    const sup = numOpt(data.superficie);
    if (sup !== undefined) row.metros_construidos = sup;

    if (data.fechaInicio) row.fecha_inicio = data.fechaInicio;
    if (data.fechaExclusiva) row.fecha_exclusiva = data.fechaExclusiva;

    // Single agent
    const requestedAgents = arrOpt(data.agentesIds);
    const agentIds = requestedAgents?.length ? requestedAgents : crm.agentId ? [crm.agentId] : [];
    if (agentIds.length) row.agente_id = agentIds[0];

    // Images from URLs
    const imgs = data.imagenesUrls?.filter(Boolean) ?? [];
    if (imgs.length) {
      row.imagenes = imgs.map((url, i) => ({ url, filename: `imagen_${i + 1}`, orden: i }));
    }
    const docs = data.documentacionUrls?.filter(Boolean) ?? [];
    if (docs.length) {
      row.documentos = docs.map((url) => ({
        url,
        filename: url.split("/").pop() ?? "doc",
        type: "application/octet-stream",
      }));
    }

    const { data: inserted, error } = await supa
      .from("properties")
      .insert([row])
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (ownerIds.length) {
      const { error: rolesError } = await supa.from("contact_roles").insert(
        ownerIds.map((contactId) => ({
          contact_id: contactId,
          property_id: inserted.id,
          agente_id: agentIds[0] ?? null,
          tipo: isAlq ? "Arrendador" : "Propietario",
          estado: "Activo",
        })),
      );
      if (rolesError) {
        await supa.from("properties").delete().eq("id", inserted.id);
        throw new Error(`No se pudo vincular el propietario: ${rolesError.message}`);
      }

      const { error: ownersError } = await supa
        .from("contacts")
        .update({ ciclo_vida: "Cliente" })
        .in("id", ownerIds);
      if (ownersError) {
        await supa.from("contact_roles").delete().eq("property_id", inserted.id);
        await supa.from("properties").delete().eq("id", inserted.id);
        throw new Error(`No se pudo actualizar el propietario: ${ownersError.message}`);
      }
    }

    return { id: inserted.id };
  });

// ── VISITA ────────────────────────────────────────────────────────────────────

export type CreateVisitaPayload = {
  fecha: string;
  estado?: string;
  comentarios?: string;
  inmueblesIds: string[];
  clientesIds?: string[];
  agentesIds?: string[];
};

const ESTADO_IN_MAP: Record<string, string> = {
  Programada: "Programada",
  Realizada: "Realizada",
  Cancelada: "Cancelada",
};

export const createVisita = createServerFn({ method: "POST" })
  .validator((d: CreateVisitaPayload) => {
    if (!d?.fecha) throw new Error("Fecha requerida");
    if (!Array.isArray(d.inmueblesIds) || d.inmueblesIds.length === 0)
      throw new Error("Selecciona al menos un inmueble");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermission("visits.create");
    const supa = getSupa();
    const estadoRaw = strOpt(data.estado) ?? "Programada";
    if (!Object.prototype.hasOwnProperty.call(ESTADO_IN_MAP, estadoRaw)) {
      throw new Error("Estado de visita inválido");
    }
    const row: Record<string, unknown> = {
      fecha: data.fecha,
      estado: ESTADO_IN_MAP[estadoRaw] ?? "Programada",
      property_id: data.inmueblesIds[0],
    };
    const com = strOpt(data.comentarios);
    if (com) row.notas = toSentenceCase(com);
    const cli = arrOpt(data.clientesIds);
    if (cli?.length) row.contact_id = cli[0];
    const ag = arrOpt(data.agentesIds);
    if (ag?.length) row.agente_id = ag[0];

    const { data: inserted, error } = await supa.from("visits").insert([row]).select("id").single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

// ── UPDATE VISITA ESTADO ───────────────────────────────────────────────────────

const ESTADO_IN_MAP_UPDATE: Record<string, string> = {
  Programada: "Programada",
  Realizada: "Realizada",
  Cancelada: "Cancelada",
};

export const updateVisitaEstado = createServerFn({ method: "POST" })
  .validator((d: { visitaId: string; estado: string }) => {
    if (!d?.visitaId) throw new Error("visitaId requerido");
    if (!d?.estado) throw new Error("estado requerido");
    if (!Object.prototype.hasOwnProperty.call(ESTADO_IN_MAP_UPDATE, d.estado)) {
      throw new Error("Estado de visita inválido");
    }
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermission("visits.update");
    const supa = getSupa();
    const dbEstado = ESTADO_IN_MAP_UPDATE[data.estado] ?? data.estado;
    const { error } = await supa
      .from("visits")
      .update({ estado: dbEstado })
      .eq("id", data.visitaId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── ASSIGN AGENTES ─────────────────────────────────────────────────────────────

export type AssignClientePayload = {
  clienteId: string;
  agentesIds: string[];
};

export const assignClienteAgentes = createServerFn({ method: "POST" })
  .validator((d: AssignClientePayload) => {
    if (!d?.clienteId) throw new Error("Cliente requerido");
    if (!Array.isArray(d.agentesIds)) throw new Error("Agentes inválidos");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermission("contacts.update");
    const supa = getSupa();
    // Delete all current assignments, then insert new ones
    await supa.from("contact_agents").delete().eq("contact_id", data.clienteId);
    if (data.agentesIds.length > 0) {
      const { error } = await supa
        .from("contact_agents")
        .insert(data.agentesIds.map((aid) => ({ contact_id: data.clienteId, agent_id: aid })));
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ── ACTIVAR PROSPECTO ─────────────────────────────────────────────────────────

export type ActivarProspectoPayload = {
  contactId: string;
  propertyId?: string;
};

// ── PROSPECTO MANUAL ─────────────────────────────────────────────────────────

export type CreateProspectoManualPayload = {
  nombre: string;
  telefono?: string;
  email?: string;
  tipo: string;
  calle: string;
  numero?: string;
  localidad?: string;
  precio?: number;
  superficie?: number;
  habitaciones?: number;
  agentesIds?: string[];
};

export const createProspectoManual = createServerFn({ method: "POST" })
  .validator((d: CreateProspectoManualPayload) => {
    if (!d?.nombre?.trim()) throw new Error("Nombre del propietario requerido");
    if (!d?.tipo?.trim()) throw new Error("Tipo de inmueble requerido");
    if (!d?.calle?.trim()) throw new Error("Calle requerida");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermissions(
      "contacts.create",
      "properties.create",
      "properties.publish",
      "contact_roles.create",
    );
    const supa = getSupa();
    const requestedAgents = arrOpt(data.agentesIds);
    const agentIds = requestedAgents?.length ? requestedAgents : crm.agentId ? [crm.agentId] : [];

    // 1. Crear contacto propietario con ciclo_vida=Prospecto, canal=Directo
    const contactRow: Record<string, unknown> = {
      nombre: toTitleCase(data.nombre.trim()),
      ciclo_vida: "Prospecto",
      canal_origen: "Manual",
    };
    if (strOpt(data.telefono)) contactRow.telefono = data.telefono!.trim();
    if (strOpt(data.email)) contactRow.email = data.email!.trim().toLowerCase();

    const { data: contact, error: cErr } = await supa
      .from("contacts")
      .insert([contactRow])
      .select("id")
      .single();
    if (cErr) throw new Error(cErr.message);

    // Sin transacción entre contacts/properties/contact_agents/contact_roles
    // (H-02): si un paso posterior falla, deshacemos lo ya creado en vez de
    // dejar un contacto o inmueble huérfano — mismo patrón que createCliente,
    // createInmueble y la Edge Function valorador (C-05).
    const rollback = async (propertyId?: string) => {
      if (propertyId) {
        await supa.from("contact_roles").delete().eq("property_id", propertyId);
        await supa.from("properties").delete().eq("id", propertyId);
      }
      await supa.from("contact_agents").delete().eq("contact_id", contact.id);
      await supa.from("contacts").delete().eq("id", contact.id);
    };

    // 2. Crear inmueble en estado Prospección
    const isAlq = /^\s*alquiler/i.test(data.tipo);
    const propRow: Record<string, unknown> = {
      calle: toTitleCase(data.calle.trim()),
      tipo: data.tipo.trim(),
      estatus: "Prospección",
      publicacion: "PROSPECTO",
      es_alquiler: isAlq,
      categoria: isAlq ? "Alquiler" : "Venta",
    };
    if (strOpt(data.numero)) propRow.numero = data.numero;
    if (strOpt(data.localidad)) propRow.localidad = toTitleCase(data.localidad!);
    const precio = numOpt(data.precio);
    if (precio !== undefined) propRow.precio = precio;
    const sup = numOpt(data.superficie);
    if (sup !== undefined) propRow.metros_construidos = sup;
    const hab = numOpt(data.habitaciones);
    if (hab !== undefined) propRow.habitaciones = hab;
    if (agentIds.length) propRow.agente_id = agentIds[0];

    const { data: property, error: pErr } = await supa
      .from("properties")
      .insert([propRow])
      .select("id")
      .single();
    if (pErr) {
      await rollback();
      throw new Error(pErr.message);
    }

    if (agentIds.length) {
      const { error: assignmentError } = await supa
        .from("contact_agents")
        .insert(agentIds.map((agentId) => ({ contact_id: contact.id, agent_id: agentId })));
      if (assignmentError) {
        await rollback(property.id);
        throw new Error(assignmentError.message);
      }
    }

    // 3. Vincular propietario ↔ inmueble
    const { error: rErr } = await supa.from("contact_roles").insert([
      {
        contact_id: contact.id,
        property_id: property.id,
        agente_id: agentIds[0] ?? null,
        tipo: "Propietario",
      },
    ]);
    if (rErr) {
      await rollback(property.id);
      throw new Error(rErr.message);
    }

    return { contactId: contact.id, propertyId: property.id };
  });

export const activarProspecto = createServerFn({ method: "POST" })
  .validator((d: ActivarProspectoPayload) => {
    if (!d?.contactId) throw new Error("contactId requerido");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermissions(
      "contacts.update",
      "contact_roles.read",
      "properties.update",
      "properties.publish",
    );
    const supa = getSupa();

    if (data.propertyId) {
      const { data: relation, error: relationError } = await supa
        .from("contact_roles")
        .select("id")
        .eq("contact_id", data.contactId)
        .eq("property_id", data.propertyId)
        .limit(1)
        .maybeSingle();
      if (relationError) throw new Error(relationError.message);
      if (!relation) throw new Error("El inmueble no está vinculado a este prospecto");

      const { data: previous, error: previousError } = await supa
        .from("properties")
        .select("estatus, publicacion")
        .eq("id", data.propertyId)
        .single();
      if (previousError) throw new Error(previousError.message);

      const { error: pErr } = await supa
        .from("properties")
        .update({ estatus: "Activo", publicacion: "SUBIR" })
        .eq("id", data.propertyId);
      if (pErr) throw new Error(pErr.message);

      const { error: cErr } = await supa
        .from("contacts")
        .update({ ciclo_vida: "Cliente" })
        .eq("id", data.contactId);
      if (cErr) {
        const { error: rollbackError } = await supa
          .from("properties")
          .update({ estatus: previous.estatus, publicacion: previous.publicacion })
          .eq("id", data.propertyId);
        if (rollbackError) {
          console.error("No se pudo revertir la activación del inmueble", rollbackError.message);
        }
        throw new Error(cErr.message);
      }
    } else {
      const { error: cErr } = await supa
        .from("contacts")
        .update({ ciclo_vida: "Cliente" })
        .eq("id", data.contactId);
      if (cErr) throw new Error(cErr.message);
    }

    return { ok: true };
  });

// ── SEGUIMIENTO ───────────────────────────────────────────────────────────────

export const ESTADOS_SEGUIMIENTO = ["Pendiente", "Contactado", "Descartado"] as const;
export type EstadoSeguimiento = (typeof ESTADOS_SEGUIMIENTO)[number];

export type SeguimientoPayload = {
  clienteId: string;
  estado?: EstadoSeguimiento;
  nota?: string;
  observacionesActuales?: string;
  tipo?: string;
};

export const updateClienteSeguimiento = createServerFn({ method: "POST" })
  .validator((d: SeguimientoPayload) => {
    if (!d?.clienteId) throw new Error("Cliente requerido");
    if (!d.estado && !d.nota && !d.tipo) throw new Error("Nada que actualizar");
    return d;
  })
  .handler(async ({ data }) => {
    const roleTypes = ["Propietario", "Comprador", "Inquilino"];
    const { crm } = await requirePermission("contacts.update");
    if (data.tipo && roleTypes.includes(data.tipo)) {
      await requirePermission("contact_roles.create");
    }
    if (data.nota?.trim()) {
      await requirePermission("seguimiento.create");
    }
    const supa = getSupa();
    const up: Record<string, unknown> = {};

    if (data.estado) up.trabajado = data.estado;

    // Update ciclo_vida when tipo changes
    if (data.tipo) {
      // Verificar asignación a comercial antes de cualificar un lead
      if (["Comprador", "Inquilino"].includes(data.tipo)) {
        const { data: asignacion } = await supa
          .from("contact_agents")
          .select("agent_id")
          .eq("contact_id", data.clienteId)
          .limit(1)
          .maybeSingle();
        if (!asignacion) {
          throw new Error("Este lead debe tener un comercial asignado antes de ser cualificado.");
        }
      }

      up.ciclo_vida = tipoCicloVida(data.tipo);
      if (data.tipo.toLowerCase().includes("anular")) up.trabajado = "Descartado";
      // If converting to a role type that needs a contact_role, create one if none exists
      if (roleTypes.includes(data.tipo)) {
        const { data: existing } = await supa
          .from("contact_roles")
          .select("id")
          .eq("contact_id", data.clienteId)
          .eq("tipo", data.tipo)
          .limit(1);
        if (!existing?.length) {
          const { error: roleError } = await supa.from("contact_roles").insert([
            {
              contact_id: data.clienteId,
              agente_id: crm.agentId,
              tipo: data.tipo,
              estado: "Prospecto",
            },
          ]);
          if (roleError) throw new Error(`No se pudo clasificar el contacto: ${roleError.message}`);
        }
      }
    }

    const nota = strOpt(data.nota);

    if (Object.keys(up).length > 0) {
      const { error } = await supa.from("contacts").update(up).eq("id", data.clienteId);
      if (error) throw new Error(error.message);
    }

    // La ficha mantiene el resumen para compatibilidad, pero el historial
    // operativo canónico es seguimiento: una nota nunca debe quedar aislada.
    if (nota) {
      const { error: seguimientoError } = await supa.from("seguimiento").insert({
        contact_id: data.clienteId,
        agente_id: crm.agentId,
        tipo: "Nota",
        texto: toSentenceCase(nota),
        fecha: new Date().toISOString(),
      });
      if (seguimientoError) {
        throw new Error(
          `La nota se guardó en la ficha, pero no en el historial: ${seguimientoError.message}`,
        );
      }
    }

    return { ok: true };
  });

export const asociarLeadAInmueble = createServerFn({ method: "POST" })
  .validator((d: { contactId: string; propertyId: string; tipo: string }) => {
    if (!d?.contactId) throw new Error("contactId requerido");
    if (!d?.propertyId) throw new Error("propertyId requerido");
    if (!d?.tipo) throw new Error("tipo requerido");
    if (!["Propietario", "Comprador", "Inquilino"].includes(d.tipo)) {
      throw new Error("Tipo de relación inválido");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermissions(
      "contacts.update",
      "contact_roles.create",
      "properties.read",
    );
    const supa = getSupa();
    const { data: property, error: propertyError } = await supa
      .from("properties")
      .select("es_alquiler")
      .eq("id", data.propertyId)
      .single();
    if (propertyError) throw new Error(propertyError.message);
    const tipoRelacion =
      data.tipo === "Propietario" && property.es_alquiler ? "Arrendador" : data.tipo;

    const { data: existing, error: existingError } = await supa
      .from("contact_roles")
      .select("id")
      .eq("contact_id", data.contactId)
      .eq("property_id", data.propertyId)
      .eq("tipo", tipoRelacion)
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    if (!existing) {
      const { error } = await supa.from("contact_roles").insert({
        contact_id: data.contactId,
        property_id: data.propertyId,
        agente_id: crm.agentId,
        tipo: tipoRelacion,
        estado: "Prospecto",
      });
      if (error) throw new Error(error.message);
    }
    // Sync ciclo_vida so the contact becomes a real client
    const ciclo = ["Propietario", "Comprador", "Inquilino"].includes(data.tipo)
      ? "Cliente"
      : "Prospecto";
    const { error: contactError } = await supa
      .from("contacts")
      .update({ ciclo_vida: ciclo })
      .eq("id", data.contactId);
    if (contactError) throw new Error(contactError.message);
    return { ok: true };
  });

export const checkDuplicates = createServerFn({ method: "GET" })
  .validator((d: { email?: string; telefono?: string }) => d)
  .handler(async ({ data }) => {
    await requirePermission("contacts.read");
    const supa = getSupa();
    const conditions: string[] = [];
    if (data.email?.trim()) conditions.push(`email.eq.${data.email.trim().toLowerCase()}`);
    if (data.telefono?.trim()) conditions.push(`telefono.eq.${data.telefono.trim()}`);
    if (!conditions.length) return { duplicates: [] };
    const { data: rows } = await supa
      .from("contacts")
      .select("id, nombre, email, telefono, ciclo_vida")
      .or(conditions.join(","))
      .limit(3);
    return { duplicates: rows ?? [] };
  });

export const sendWhatsAppReply = createServerFn({ method: "POST" })
  .validator((d: { phone: string; message: string }) => {
    if (!d?.phone?.trim()) throw new Error("Teléfono requerido");
    if (!d?.message?.trim()) throw new Error("Mensaje requerido");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermission("whatsapp.send");
    const phoneNumberId = process.env.WABA_PHONE_NUMBER_ID;
    const token = process.env.WABA_ACCESS_TOKEN;
    if (!phoneNumberId || !token)
      throw new Error("Integración WhatsApp no disponible en este entorno");

    // Normalize to E.164 without +: strip non-digits, then ensure country code
    let to = data.phone.replace(/\D/g, "");
    // If it's a 9-digit Spanish number without country code, prepend 34
    if (to.length === 9 && (to.startsWith("6") || to.startsWith("7") || to.startsWith("9"))) {
      to = "34" + to;
    }

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: data.message },
    };

    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string };
    };

    if (!res.ok) {
      const msg = body?.error?.message ?? `Error HTTP ${res.status}`;
      const code = body?.error?.code ?? "";
      throw new Error(code ? `[${code}] ${msg}` : msg);
    }

    return { ok: true, messageId: body.messages?.[0]?.id };
  });
