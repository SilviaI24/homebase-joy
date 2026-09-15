// M-03: extraído de mutations.functions.ts.
import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toTitleCase, toSentenceCase } from "./format";
import { requirePermission, requirePermissions } from "@/lib/crm-auth.server";
import { strOpt, numOpt, arrOpt } from "./mutations-shared";

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
  observacionesPropietario?: string;
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
    if (d.publicacion && !["SUBIR", "PUBLICADO"].includes(d.publicacion)) {
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
    // Mismo guard que updateInmueble (inmuebles.functions.ts): dar de alta
    // un inmueble ya en estatus final no debería requerir menos permiso que
    // cerrarlo — si no, alguien con solo properties.create podía crear un
    // inmueble ya "Vendido" y quedaba bloqueado ahí por el trigger de cierre.
    const ESTATUS_FINAL: readonly string[] = ["Vendido", "Alquilado", "Baja"];
    if (data.estatus && ESTATUS_FINAL.includes(data.estatus)) {
      await requirePermission("properties.status_final");
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
    if (strOpt(data.observacionesPropietario))
      row.observaciones_propietario = toSentenceCase(data.observacionesPropietario!);
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

    // H-05: vía RPC (inmueble + rol de propietario + ciclo_vida, todo en una
    // transacción) para que el actor real quede en audit_log.usuario_id. Ya
    // no hace falta el rollback manual (H-02) que había antes -- si
    // cualquier paso falla, la transacción entera se revierte sola.
    const { data: propertyId, error } = await supa.rpc("crm_crear_inmueble", {
      p_row: row,
      p_owner_ids: ownerIds.length ? ownerIds : null,
      p_es_alquiler: isAlq,
      p_actor_id: crm.userId,
    });
    if (error) throw new Error(error.message);

    return { id: propertyId as string };
  });
