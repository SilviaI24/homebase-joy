// M-03: extraído de mutations.functions.ts.
import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toTitleCase, toSentenceCase } from "./format";
import { requirePermission, requirePermissions } from "@/lib/crm-auth.server";
import { strOpt, arrOpt, tipoCicloVida } from "./mutations-shared";

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
      return {
        propietarioId: row.out_propietario_id,
        yaExistia: row.out_ya_existia,
        inviteSent: false,
      };
    }

    return {
      propietarioId: row.out_propietario_id,
      yaExistia: row.out_ya_existia,
      inviteSent: !yaRegistrado,
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
  estadoOnboarding: string;
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
      .select("id, nombre, email, dni, domicilio, estado_onboarding")
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
      estadoOnboarding: propietario.estado_onboarding as string,
      docs: (docsRes.data ?? []) as RevisionPropietarioDoc[],
      contrato: txRes.data
        ? { estado: txRes.data.estado as string, firmadoAt: txRes.data.firmado_at as string | null }
        : null,
    } satisfies RevisionPropietarioData;
  });

export type GuardarDatosFirmaPayload = { propietarioId: string; dni: string; domicilio: string };

export const guardarDatosFirmaPropietario = createServerFn({ method: "POST" })
  .validator((d: GuardarDatosFirmaPayload) => {
    if (!d?.propietarioId) throw new Error("Propietario requerido");
    if (!d?.dni?.trim() || !d?.domicilio?.trim()) throw new Error("DNI y domicilio requeridos");
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

    const { error: notifyError } = await supa.functions.invoke("notify-portal-activo", {
      body: {
        propietario_id: data.propietarioId,
        propietario_email: propietario.email,
        propietario_nombre: propietario.nombre,
      },
    });
    return { ok: true, emailEnviado: !notifyError };
  });
