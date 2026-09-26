// M-03: extraído de mutations.functions.ts.
import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toTitleCase, toSentenceCase } from "./format";
import { requirePermission, requirePermissions } from "@/lib/crm-auth.server";
import { strOpt, arrOpt, tipoCicloVida } from "./mutations-shared";
import { CANALES_ALTA_MANUAL, FUENTES } from "./contactos-format";
import { TIPOS_INTERES } from "./mutations-seguimiento.functions";

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
  // Circuito del lead (26 sep 2026, C1/C2): por dónde se habla con él, de
  // dónde vino y qué busca. Solo se guardan si llegan; canal solo para Leads.
  canalOrigen?: string;
  fuente?: string;
  tipoInteres?: string;
};

export const createCliente = createServerFn({ method: "POST" })
  .validator((d: CreateClientePayload) => {
    if (!d?.nombre || !d.nombre.trim()) throw new Error("Nombre requerido");
    const canal = strOpt(d.canalOrigen);
    if (canal && !CANALES_ALTA_MANUAL.some((c) => c.value === canal)) {
      throw new Error("Canal no válido");
    }
    const fuente = strOpt(d.fuente);
    if (fuente && !(FUENTES as readonly string[]).includes(fuente)) {
      throw new Error("Fuente no válida");
    }
    const interes = strOpt(d.tipoInteres);
    if (interes && !(TIPOS_INTERES as readonly string[]).includes(interes)) {
      throw new Error("Tipo de interés no válido");
    }
    return d;
  })
  .handler(async ({ data }) => {
    // Auditoría de altas (26 sep 2026, C1): antes el tipo vacío caía en
    // "Interesado Propiedades" → ciclo_vida 'Cliente' SIN rol, y el contacto
    // no salía en ninguna pestaña de Contactos (todas exigen rol) ni en la
    // Bandeja. Sin tipo, lo coherente con el circuito del lead es un Lead que
    // entra por la Bandeja y de ahí sale cualificado o descartado.
    const tipo = strOpt(data.tipo) ?? "Lead";
    const cicloVida = tipoCicloVida(tipo);
    const creaRelacion = ["Propietario", "Comprador", "Inquilino"].includes(tipo);
    // canal_origen solo para Leads: es lo que los mete en la Bandeja (que no
    // filtra por ciclo_vida). Un Propietario/Comprador/Inquilino dado de alta
    // ya con rol está cualificado, no debe aparecer como pendiente de llamar.
    // Un Lead sin canal indicado es un alta de oficina → Presencial.
    const canalOrigen = cicloVida === "Lead" ? (strOpt(data.canalOrigen) ?? "Presencial") : null;
    // El interés se deduce del rol cuando lo hay (mismo vocabulario que
    // contacts_tipo_interes_check); para un Lead, lo que marque la oficina.
    const tipoInteres =
      tipo === "Comprador"
        ? "Compra"
        : tipo === "Inquilino"
          ? "Alquiler"
          : (strOpt(data.tipoInteres) ?? null);
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
      p_canal_origen: canalOrigen,
      // NULL → el trigger contacts_fuente_por_defecto la deduce del canal
      // (Presencial → Oficina).
      p_fuente: strOpt(data.fuente) ?? null,
      p_tipo_interes: tipoInteres,
    });
    if (error) throw new Error(error.message);

    return { id: contactId as string };
  });

export type InvitarPropietarioPortalPayload = {
  contactId: string;
  propertyId: string;
};

// Da de alta (o reutiliza) la ficha de propietario en el Portal y envía la
// invitación de acceso por email — mismo destino final que
// admin_crear_invitacion_propietario en elsol-client-hub, pero llamado desde
// aquí (service role, sin auth.uid()) por lo que usa crm_invitar_propietario_portal
// en su lugar (actor explícito, validado contra crm_usuarios). Llama
// directamente a supabase.auth.admin en vez de invocar la Edge Function
// invite-propietario: esa función exige un JWT de usuario real en el header
// (comprueba rol admin vía roles_usuario), y una llamada con la service key
// no lleva ese JWT — más simple reproducir aquí la única línea que hace
// falta (inviteUserByEmail) que enmendar el Edge Function para un segundo
// caso de uso.
export const invitarPropietarioPortal = createServerFn({ method: "POST" })
  .validator((d: InvitarPropietarioPortalPayload) => {
    if (!d?.contactId) throw new Error("Contacto requerido");
    if (!d?.propertyId) throw new Error("Inmueble requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("contacts.portal_invite");
    const supa = getSupa();

    const { data: rows, error } = await supa.rpc("crm_invitar_propietario_portal", {
      p_actor_id: crm.userId,
      p_contact_id: data.contactId,
      p_property_id: data.propertyId,
    });
    if (error) throw new Error(error.message);
    const row = (
      rows as Array<{
        out_propietario_id: string;
        out_email: string;
        out_nombre: string;
        out_ya_existia: boolean;
      }> | null
    )?.[0];
    if (!row) throw new Error("No se pudo crear el acceso de propietario");

    const portalUrl = process.env.PORTAL_URL;
    if (!portalUrl) {
      throw new Error("PORTAL_URL no configurada — pide a David que la añada a .env.local");
    }

    const { error: inviteError } = await supa.auth.admin.inviteUserByEmail(row.out_email, {
      redirectTo: `${portalUrl}/reset-password?invite=1`,
      data: { nombre: row.out_nombre, invited_as: "propietario" },
    });

    // Si el usuario ya tenía cuenta en auth.users, el invite falla — no es
    // bloqueante, ya tiene acceso, solo no recibe un email nuevo.
    const yaRegistrado = Boolean(inviteError?.message?.includes("already been registered"));
    if (inviteError && !yaRegistrado) {
      // Fallo real de envío (p. ej. Supabase Auth sin SMTP propio, que solo
      // entrega a miembros del equipo): se devuelve el motivo para que la
      // pantalla no diga "ya tenía acceso" cuando la ficha existía de antes
      // pero nadie ha recibido nada (auditoría 25 sep 2026).
      console.error("invitarPropietarioPortal: inviteUserByEmail", inviteError);
      return {
        propietarioId: row.out_propietario_id,
        yaExistia: row.out_ya_existia,
        inviteSent: false,
        errorEnvio: inviteError.message,
      };
    }

    return {
      propietarioId: row.out_propietario_id,
      yaExistia: row.out_ya_existia,
      inviteSent: !yaRegistrado,
      errorEnvio: null as string | null,
    };
  });

// Revisión de documentación + activación desde el CRM — 17 sep 2026.
// Los comerciales trabajan siempre desde homebase-joy: hasta ahora esto solo
// existía en AdminPropietarios.tsx (panel admin del propio Portal). Mismo
// comportamiento, llamado desde aquí con actor auditado (H-05).

export type RevisionPropietarioDoc = {
  id: string;
  nombre: string;
  categoria: string | null;
  estado: string;
};

export type RevisionPropietarioData = {
  propietarioId: string;
  nombre: string;
  email: string | null;
  dni: string | null;
  domicilio: string | null;
  telefono: string | null;
  estadoOnboarding: string;
  casosEspeciales: string[];
  docs: RevisionPropietarioDoc[];
  contrato: { estado: string; firmadoAt: string | null } | null;
};

export const getRevisionPropietario = createServerFn({ method: "POST" })
  .validator((d: { contactId: string }) => {
    if (!d?.contactId) throw new Error("Contacto requerido");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermission("contacts.portal_invite");
    const supa = getSupa();

    const { data: propietario } = await supa
      .from("propietarios")
      .select("id, nombre, email, dni, domicilio, telefono, estado_onboarding, casos_especiales")
      .eq("contact_id", data.contactId)
      .maybeSingle();
    if (!propietario) return null;

    const { data: enlaces } = await supa
      .from("propietario_inmueble")
      .select("property_id")
      .eq("propietario_id", propietario.id);
    const propertyIds = (enlaces ?? []).map((e) => e.property_id as string);

    const [docsRes, txRes] = propertyIds.length
      ? await Promise.all([
          supa
            .from("documentos")
            .select("id, nombre, categoria, estado")
            .in("property_id", propertyIds)
            .eq("es_onboarding", true)
            .order("created_at", { ascending: false }),
          supa
            .from("transacciones_docuten")
            .select("estado, firmado_at")
            .in("property_id", propertyIds)
            .eq("tipo_documento", "CONTRATO_EXCLUSIVIDAD")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])
      : [{ data: [] }, { data: null }];

    return {
      propietarioId: propietario.id,
      nombre: propietario.nombre,
      email: propietario.email,
      dni: propietario.dni,
      domicilio: propietario.domicilio,
      telefono: propietario.telefono,
      estadoOnboarding: propietario.estado_onboarding as string,
      casosEspeciales: (propietario.casos_especiales ?? []) as string[],
      docs: (docsRes.data ?? []) as RevisionPropietarioDoc[],
      contrato: txRes.data
        ? { estado: txRes.data.estado as string, firmadoAt: txRes.data.firmado_at as string | null }
        : null,
    } satisfies RevisionPropietarioData;
  });

export type GuardarDatosFirmaPayload = {
  propietarioId: string;
  dni: string;
  domicilio: string;
  telefono: string;
};

// El teléfono es obligatorio para la firma real en Docuten (signature_type
// "OTP" se envía por SMS) — descubierto probando en producción el 22 sep
// 2026, hasta entonces no se pedía en ningún punto del flujo.
export const guardarDatosFirmaPropietario = createServerFn({ method: "POST" })
  .validator((d: GuardarDatosFirmaPayload) => {
    if (!d?.propietarioId) throw new Error("Propietario requerido");
    if (!d?.dni?.trim() || !d?.domicilio?.trim() || !d?.telefono?.trim()) {
      throw new Error("DNI, domicilio y teléfono requeridos");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("contacts.portal_invite");
    const supa = getSupa();
    const { error } = await supa.rpc("crm_actualizar_datos_firma_propietario", {
      p_actor_id: crm.userId,
      p_propietario_id: data.propietarioId,
      p_dni: data.dni.trim(),
      p_domicilio: data.domicilio.trim(),
      p_telefono: data.telefono.trim(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ActualizarEstadoDocumentoPayload = {
  documentoId: string;
  estado: "aprobado" | "rechazado";
};

export const actualizarEstadoDocumentoPropietario = createServerFn({ method: "POST" })
  .validator((d: ActualizarEstadoDocumentoPayload) => {
    if (!d?.documentoId) throw new Error("Documento requerido");
    if (d?.estado !== "aprobado" && d?.estado !== "rechazado") throw new Error("Estado inválido");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("contacts.portal_invite");
    const supa = getSupa();
    const { error } = await supa.rpc("crm_actualizar_estado_documento", {
      p_actor_id: crm.userId,
      p_documento_id: data.documentoId,
      p_estado: data.estado,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ActivarPropietarioPayload = { propietarioId: string };

// Mismo criterio que handleActivar en AdminPropietarios.tsx (Portal): el
// acceso queda activo aunque el email de aviso falle.
export const activarPropietarioCrm = createServerFn({ method: "POST" })
  .validator((d: ActivarPropietarioPayload) => {
    if (!d?.propietarioId) throw new Error("Propietario requerido");
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("contacts.portal_invite");
    const supa = getSupa();

    const { error } = await supa.rpc("crm_activar_propietario", {
      p_actor_id: crm.userId,
      p_propietario_id: data.propietarioId,
    });
    if (error) throw new Error(error.message);

    const { data: propietario } = await supa
      .from("propietarios")
      .select("nombre, email")
      .eq("id", data.propietarioId)
      .maybeSingle();

    if (!propietario?.email) return { ok: true, emailEnviado: false };

    // notify-portal-activo exige un admin del Portal o el secreto interno: la
    // clave de servicio sola no es un usuario y daba 401 (el acceso se
    // activaba pero el email nunca salía).
    const internalSecret = process.env.CRM_INTERNAL_SECRET;
    if (!internalSecret) return { ok: true, emailEnviado: false };
    const { data: notifyResult, error: notifyError } = await supa.functions.invoke(
      "notify-portal-activo",
      {
        headers: { "x-crm-internal-secret": internalSecret },
        body: {
          propietario_id: data.propietarioId,
          propietario_email: propietario.email,
          propietario_nombre: propietario.nombre,
        },
      },
    );
    // Sin RESEND_API_KEY la función responde 200 con skipped: true — eso no
    // es un email enviado.
    const skipped = (notifyResult as { skipped?: boolean } | null)?.skipped === true;
    return { ok: true, emailEnviado: !notifyError && !skipped };
  });

// Generar contrato de exclusividad desde la ficha del inmueble — 21 sep 2026.
// El comercial revisa/edita nombre-DNI-domicilio de cada propietario y la
// comisión/duración/cláusulas en una vista previa del PDF real antes de dar
// acceso al Portal, en vez de rellenar un formulario a ciegas sin ver el
// documento (ContratoExclusividadPanel, que sigue existiendo para correcciones
// puntuales fuera de este flujo).

export type PreviewContratoOwner = { nombre: string; dni: string; domicilio: string };

export type PreviewContratoPayload = {
  propertyId: string;
  owners: PreviewContratoOwner[];
  duracionMeses: number;
  comisionPct: number;
  clausulasAdicionales: string;
};

// El PDF de vista previa lo genera la misma Edge Function que genera el PDF
// real (portal-iniciar-firma, en elsol-client-hub — mismo proyecto Supabase,
// dos repos), en modo "preview": sin JWT de propietario (no hay ninguno
// logueado en este punto), autenticado con un secreto compartido, y sin
// crear transacción en Docuten ni escribir nada en la base.
export const previewContratoExclusividad = createServerFn({ method: "POST" })
  .validator((d: PreviewContratoPayload) => {
    if (!d?.propertyId) throw new Error("Inmueble requerido");
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermission("contacts.portal_invite");
    const supa = getSupa();

    const internalSecret = process.env.CRM_INTERNAL_SECRET;
    if (!internalSecret) {
      throw new Error(
        "CRM_INTERNAL_SECRET no configurada — pide a David que la añada a .env.local",
      );
    }

    const { data: result, error } = await supa.functions.invoke("portal-iniciar-firma", {
      headers: { "x-crm-internal-secret": internalSecret },
      body: {
        mode: "preview",
        property_id: data.propertyId,
        overrides: {
          owners: data.owners,
          duracionMeses: data.duracionMeses,
          comisionPct: data.comisionPct,
          clausulasAdicionales: data.clausulasAdicionales,
        },
      },
    });
    if (error) throw new Error(error.message || "No se pudo generar la vista previa");
    return { pdfBase64: (result as { pdf_base64: string }).pdf_base64 };
  });

export type GenerarContratoOwner = {
  propietarioId: string;
  contactId: string | null;
  dni: string;
  domicilio: string;
  telefono: string;
};

export type GenerarContratoPayload = {
  propertyId: string;
  duracionMeses: number;
  comisionPct: number;
  clausulasAdicionales: string;
  propietarios: GenerarContratoOwner[];
};

export type GenerarContratoResultado = {
  propietarioId: string;
  inviteSent: boolean;
  error?: string;
};

// Guarda los datos ya confirmados en la vista previa (comisión/duración/
// cláusulas del inmueble + DNI/domicilio de cada propietario) y da acceso al
// Portal a todos los propietarios vinculados de una vez — antes eran dos
// pasos manuales separados (rellenar ContratoExclusividadPanel y luego "Dar
// acceso al portal" contacto por contacto desde su ficha).
export const generarContratoYDarAccesoPortal = createServerFn({ method: "POST" })
  .validator((d: GenerarContratoPayload) => {
    if (!d?.propertyId) throw new Error("Inmueble requerido");
    if (!d?.duracionMeses || d.duracionMeses <= 0) throw new Error("Duración inválida");
    if (d?.comisionPct == null || d.comisionPct < 0) throw new Error("Comisión inválida");
    if (!d?.propietarios?.length) throw new Error("Sin propietarios vinculados a este inmueble");
    for (const p of d.propietarios) {
      if (!p.dni?.trim() || !p.domicilio?.trim() || !p.telefono?.trim()) {
        throw new Error("Falta DNI, domicilio o teléfono de algún propietario");
      }
    }
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("contacts.portal_invite");
    const supa = getSupa();

    const { error: propError } = await supa
      .from("properties")
      .update({
        duracion_exclusividad_meses: data.duracionMeses,
        comision_exclusividad_pct: data.comisionPct,
        clausulas_adicionales: data.clausulasAdicionales,
      })
      .eq("id", data.propertyId);
    if (propError) throw new Error(propError.message);

    for (const p of data.propietarios) {
      const { error } = await supa.rpc("crm_actualizar_datos_firma_propietario", {
        p_actor_id: crm.userId,
        p_propietario_id: p.propietarioId,
        p_dni: p.dni.trim(),
        p_domicilio: p.domicilio.trim(),
        p_telefono: p.telefono.trim(),
      });
      if (error) throw new Error(`Guardando datos de firma: ${error.message}`);
    }

    const portalUrl = process.env.PORTAL_URL;
    const resultados: GenerarContratoResultado[] = [];

    for (const p of data.propietarios) {
      if (!p.contactId) {
        resultados.push({
          propietarioId: p.propietarioId,
          inviteSent: false,
          error: "Sin contacto vinculado",
        });
        continue;
      }
      try {
        const { data: rows, error } = await supa.rpc("crm_invitar_propietario_portal", {
          p_actor_id: crm.userId,
          p_contact_id: p.contactId,
          p_property_id: data.propertyId,
        });
        if (error) throw new Error(error.message);
        const row = (rows as Array<{ out_email: string; out_nombre: string }> | null)?.[0];
        if (!row) throw new Error("No se pudo crear el acceso de propietario");

        if (!portalUrl) {
          resultados.push({
            propietarioId: p.propietarioId,
            inviteSent: false,
            error: "PORTAL_URL no configurada",
          });
          continue;
        }
        const { error: inviteError } = await supa.auth.admin.inviteUserByEmail(row.out_email, {
          redirectTo: `${portalUrl}/reset-password?invite=1`,
          data: { nombre: row.out_nombre, invited_as: "propietario" },
        });
        // Mismo criterio que invitarPropietarioPortal: si ya tenía cuenta, no
        // es un fallo, solo no recibe un email nuevo.
        const yaRegistrado = Boolean(inviteError?.message?.includes("already been registered"));
        resultados.push({
          propietarioId: p.propietarioId,
          inviteSent: !yaRegistrado,
          error: inviteError && !yaRegistrado ? inviteError.message : undefined,
        });
      } catch (e) {
        resultados.push({
          propietarioId: p.propietarioId,
          inviteSent: false,
          error: e instanceof Error ? e.message : "Error desconocido",
        });
      }
    }

    return { ok: true, resultados };
  });
