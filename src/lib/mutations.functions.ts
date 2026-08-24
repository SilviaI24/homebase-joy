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

    // Si el formulario no especifica agentes, asigna el contacto a quien lo crea.
    // Así un lead nunca desaparece de la bandeja personal por quedar huérfano.
    const requestedAgents = arrOpt(data.agentesIds);
    const agentIds = requestedAgents?.length ? requestedAgents : crm.agentId ? [crm.agentId] : [];

    // H-05: vía RPC (todo en una transacción -- ya no hace falta el rollback
    // manual que había antes) para que el actor real quede en
    // audit_log.usuario_id.
    const { data: contactId, error } = await supa.rpc("crm_crear_cliente", {
      p_nombre: toTitleCase(data.nombre.trim()),
      p_ciclo_vida: cicloVida,
      p_email: strOpt(data.email) ?? null,
      p_telefono: strOpt(data.telefono) ?? null,
      p_dni: strOpt(data.dni) ?? null,
      p_motivo: strOpt(data.motivo) ? toSentenceCase(strOpt(data.motivo)!) : null,
      p_solicitud: strOpt(data.solicitud) ? toSentenceCase(strOpt(data.solicitud)!) : null,
      p_observaciones: strOpt(data.observaciones)
        ? toSentenceCase(strOpt(data.observaciones)!)
        : null,
      p_categoria: arrOpt(data.categoria) ?? null,
      p_profesion: strOpt(data.profesion) ? toTitleCase(strOpt(data.profesion)!) : null,
      p_contrato_trabajo: strOpt(data.contratoTrabajo)
        ? toTitleCase(strOpt(data.contratoTrabajo)!)
        : null,
      p_mascota: strOpt(data.mascota) ? toTitleCase(strOpt(data.mascota)!) : null,
      p_avalista: strOpt(data.avalista) ? toTitleCase(strOpt(data.avalista)!) : null,
      p_created_at: data.fecha ?? null,
      p_agente_ids: agentIds.length ? agentIds : null,
      p_crea_relacion: creaRelacion,
      p_tipo_relacion: creaRelacion ? tipo : null,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);

    return { id: contactId as string };
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
    const { crm } = await requirePermission("visits.create");
    const supa = getSupa();
    const estadoRaw = strOpt(data.estado) ?? "Programada";
    if (!Object.prototype.hasOwnProperty.call(ESTADO_IN_MAP, estadoRaw)) {
      throw new Error("Estado de visita inválido");
    }
    const com = strOpt(data.comentarios);
    const cli = arrOpt(data.clientesIds);
    const ag = arrOpt(data.agentesIds);

    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
    const { data: visitaId, error } = await supa.rpc("crm_crear_visita", {
      p_fecha: data.fecha,
      p_estado: ESTADO_IN_MAP[estadoRaw] ?? "Programada",
      p_notas: com ? toSentenceCase(com) : null,
      p_property_id: data.inmueblesIds[0],
      p_contact_id: cli?.length ? cli[0] : null,
      p_agente_id: ag?.length ? ag[0] : null,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    return { id: visitaId as string };
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
    const { crm } = await requirePermission("visits.update");
    const supa = getSupa();
    const dbEstado = ESTADO_IN_MAP_UPDATE[data.estado] ?? data.estado;
    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_actualizar_visita_estado", {
      p_visita_id: data.visitaId,
      p_estado: dbEstado,
      p_actor_id: crm.userId,
    });
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
    const { crm } = await requirePermission("contacts.update");
    const supa = getSupa();
    // H-05: vía RPC (borra + inserta en la misma transacción) para que el
    // actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_asignar_agentes_cliente", {
      p_contact_id: data.clienteId,
      p_agente_ids: data.agentesIds.length ? data.agentesIds : null,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
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
    const isAlq = /^\s*alquiler/i.test(data.tipo);

    // H-05: vía RPC (contacto + inmueble + agentes + rol, todo en una
    // transacción) para que el actor real quede en audit_log.usuario_id. Ya
    // no hace falta el rollback manual (H-02) que había antes -- si
    // cualquier paso falla, la transacción entera se revierte sola.
    const { data: rows, error } = await supa.rpc("crm_crear_prospecto_manual", {
      p_nombre: toTitleCase(data.nombre.trim()),
      p_telefono: strOpt(data.telefono)?.trim() ?? null,
      p_email: strOpt(data.email)?.trim().toLowerCase() ?? null,
      p_tipo: data.tipo.trim(),
      p_calle: toTitleCase(data.calle.trim()),
      p_numero: strOpt(data.numero) ?? null,
      p_localidad: strOpt(data.localidad) ? toTitleCase(data.localidad!) : null,
      p_precio: numOpt(data.precio) ?? null,
      p_superficie: numOpt(data.superficie) ?? null,
      p_habitaciones: numOpt(data.habitaciones) ?? null,
      p_es_alquiler: isAlq,
      p_categoria: isAlq ? "Alquiler" : "Venta",
      p_agente_ids: agentIds.length ? agentIds : null,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
    const row = (rows as unknown as Array<{ contact_id: string; property_id: string }>)[0];

    return { contactId: row.contact_id, propertyId: row.property_id };
  });

export const activarProspecto = createServerFn({ method: "POST" })
  .validator((d: ActivarProspectoPayload) => {
    if (!d?.contactId) throw new Error("contactId requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermissions(
      "contacts.update",
      "contact_roles.read",
      "properties.update",
      "properties.publish",
    );
    const supa = getSupa();

    // H-05: vía RPC para que el actor real quede en audit_log.usuario_id. Ya
    // no hace falta el rollback manual (H-02) que había antes -- al ser una
    // sola transacción, si el UPDATE de contacts falla el de properties se
    // revierte solo.
    const { error } = await supa.rpc("crm_activar_prospecto", {
      p_contact_id: data.contactId,
      p_property_id: data.propertyId ?? null,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);

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

    // trabajado/ciclo_vida se resuelven aquí igual que antes (mapeos de
    // texto puros, sin acceso a datos) -- el RPC hace la comprobación de
    // "comercial asignado", la escritura y la nota de seguimiento, todo en
    // una transacción, con el actor real fijado antes de escribir (H-05).
    let trabajado = strOpt(data.estado) ?? null;
    let cicloVida: string | null = null;
    if (data.tipo) {
      cicloVida = tipoCicloVida(data.tipo);
      if (data.tipo.toLowerCase().includes("anular")) trabajado = "Descartado";
    }
    const tipoRol = data.tipo && roleTypes.includes(data.tipo) ? data.tipo : null;
    const nota = strOpt(data.nota);

    const { error } = await supa.rpc("crm_actualizar_seguimiento_cliente", {
      p_contact_id: data.clienteId,
      p_trabajado: trabajado,
      p_ciclo_vida: cicloVida,
      p_tipo_rol: tipoRol,
      p_nota: nota ? toSentenceCase(nota) : null,
      p_agente_id: crm.agentId,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);

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
    // H-05: vía RPC (resuelve es_alquiler/tipoRelacion, inserta el rol si no
    // existe, y actualiza ciclo_vida, todo en una transacción) para que el
    // actor real quede en audit_log.usuario_id.
    const { error } = await supa.rpc("crm_asociar_lead_inmueble", {
      p_contact_id: data.contactId,
      p_property_id: data.propertyId,
      p_tipo: data.tipo,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);
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
