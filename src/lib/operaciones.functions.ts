import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { requirePermission, hasPermission } from "@/lib/crm-auth.server";

export type OperacionTipo = "Venta" | "Alquiler" | "Valoración" | "Servicio";
export type OperacionEstado = "Abierta" | "En negociación" | "Cerrada" | "Cancelada";

const OPERACION_ESTADOS: OperacionEstado[] = ["Abierta", "En negociación", "Cerrada", "Cancelada"];

export function assertRegularOperacionTransition(
  current: OperacionEstado,
  target: OperacionEstado,
): void {
  if (target === "Cerrada") {
    throw new Error("El cierre definitivo debe ejecutarse con la acción Cerrar operación");
  }
  if (current === "Cerrada") {
    throw new Error("Una operación cerrada no puede reabrirse desde el CRM");
  }
}

export type OperacionRow = {
  id: string;
  tipo: OperacionTipo;
  estado: OperacionEstado;
  precioOperacion: number | null;
  comisionPct: number | null;
  comisionTotal: number | null;
  fechaApertura: string | null;
  fechaCierre: string | null;
  notas: string;
  propertyId: string | null;
  propertyRef: string | null;
  propertyBarrio: string | null;
  propertyCalle: string | null;
  propertyStatus: string | null;
  propertyEsAlquiler: boolean | null;
  agenteId: string | null;
  agenteNombre: string | null;
  vendedorId: string | null;
  vendedorNombre: string | null;
  compradorId: string | null;
  compradorNombre: string | null;
  created_at: string;
};

type OperationCloseReadiness = Pick<
  OperacionRow,
  | "tipo"
  | "precioOperacion"
  | "comisionPct"
  | "propertyId"
  | "propertyStatus"
  | "propertyEsAlquiler"
  | "vendedorId"
  | "compradorId"
>;

export function getOperationCloseBlockers(operation: OperationCloseReadiness): string[] {
  const blockers: string[] = [];

  if (operation.comisionPct != null && (operation.comisionPct < 0 || operation.comisionPct > 100)) {
    blockers.push("La comisión debe estar entre 0 y 100");
  }

  if (operation.tipo !== "Venta" && operation.tipo !== "Alquiler") return blockers;

  if (!operation.propertyId) blockers.push("Selecciona el inmueble");
  if (!operation.vendedorId) {
    blockers.push(
      operation.tipo === "Venta" ? "Selecciona el propietario" : "Selecciona el arrendador",
    );
  }
  if (!operation.compradorId) {
    blockers.push(
      operation.tipo === "Venta" ? "Selecciona el comprador" : "Selecciona el inquilino",
    );
  }
  if (
    operation.vendedorId &&
    operation.compradorId &&
    operation.vendedorId === operation.compradorId
  ) {
    blockers.push("Las dos partes deben ser contactos distintos");
  }
  if (operation.precioOperacion == null || operation.precioOperacion <= 0) {
    blockers.push("Indica un precio final mayor que cero");
  }
  if (
    operation.propertyId &&
    operation.propertyStatus &&
    !["Activo", "Reservado"].includes(operation.propertyStatus)
  ) {
    blockers.push("El inmueble debe estar activo o reservado");
  }
  if (operation.propertyId && operation.propertyEsAlquiler != null) {
    if (operation.tipo === "Venta" && operation.propertyEsAlquiler) {
      blockers.push("El inmueble pertenece a la cartera de alquiler");
    }
    if (operation.tipo === "Alquiler" && !operation.propertyEsAlquiler) {
      blockers.push("El inmueble pertenece a la cartera de venta");
    }
  }

  return blockers;
}

export const listOperaciones = createServerFn({ method: "GET" }).handler(async () => {
  const { crm } = await requirePermission("operations.read");
  const supa = getSupa();

  const [canSeeFinanciero, canCreate, canClose] = await Promise.all([
    hasPermission(crm, "operations.read_financiero"),
    hasPermission(crm, "operations.create"),
    hasPermission(crm, "operations.close"),
  ]);

  const { data, error } = await supa
    .from("operations")
    .select(
      `id, tipo, estado,
       precio_operacion, comision_pct, comision_total,
       fecha_apertura, fecha_cierre, notas, created_at,
       property_id, properties(ref, barrio, calle, numero, estatus, es_alquiler),
       agente_id,    agents(id, nombre),
       vendedor_id,  vendedor:contacts!operations_vendedor_id_fkey(id, nombre),
       comprador_id, comprador:contacts!operations_comprador_id_fkey(id, nombre)`,
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(`listOperaciones: ${error.message}`);

  return {
    permissions: { canSeeFinanciero, canCreate, canClose },
    operaciones: (data ?? []).map(
      (r: any): OperacionRow => ({
        id: r.id,
        tipo: r.tipo ?? "Venta",
        estado: r.estado ?? "Abierta",
        // Datos financieros: solo visibles con operations.read_financiero
        precioOperacion: canSeeFinanciero ? (r.precio_operacion ?? null) : null,
        comisionPct: canSeeFinanciero ? (r.comision_pct ?? null) : null,
        comisionTotal: canSeeFinanciero ? (r.comision_total ?? null) : null,
        fechaApertura: r.fecha_apertura ?? null,
        fechaCierre: r.fecha_cierre ?? null,
        notas: r.notas ?? "",
        propertyId: r.property_id ?? null,
        propertyRef: r.properties?.ref ?? null,
        propertyBarrio: r.properties?.barrio ?? null,
        propertyCalle: r.properties?.calle
          ? `${r.properties.calle} ${r.properties.numero ?? ""}`.trim()
          : null,
        propertyStatus: r.properties?.estatus ?? null,
        propertyEsAlquiler:
          typeof r.properties?.es_alquiler === "boolean" ? r.properties.es_alquiler : null,
        agenteId: r.agents?.id ?? null,
        agenteNombre: r.agents?.nombre ?? null,
        vendedorId: r.vendedor?.id ?? null,
        vendedorNombre: r.vendedor?.nombre ?? null,
        compradorId: r.comprador?.id ?? null,
        compradorNombre: r.comprador?.nombre ?? null,
        created_at: r.created_at,
      }),
    ),
  };
});

export type CreateOperacionPayload = {
  tipo: OperacionTipo;
  estado?: OperacionEstado;
  precioOperacion?: number | null;
  comisionPct?: number | null;
  propertyId?: string | null;
  agenteId?: string | null;
  vendedorId?: string | null;
  compradorId?: string | null;
  notas?: string;
};

export const createOperacion = createServerFn({ method: "POST" })
  .validator((d: CreateOperacionPayload) => {
    const tipos: OperacionTipo[] = ["Venta", "Alquiler", "Valoración", "Servicio"];
    if (!d?.tipo || !tipos.includes(d.tipo)) {
      throw new Error("Tipo de operación inválido");
    }
    if (d.estado && d.estado !== "Abierta") {
      throw new Error("Las operaciones nuevas deben abrirse en estado Abierta");
    }
    if (d.precioOperacion != null && d.precioOperacion < 0) {
      throw new Error("Precio de operación inválido");
    }
    if (d.comisionPct != null && (d.comisionPct < 0 || d.comisionPct > 100)) {
      throw new Error("La comisión debe estar entre 0 y 100");
    }
    return d;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("operations.create");
    if (data.precioOperacion != null || data.comisionPct != null) {
      await requirePermission("operations.close");
    }
    const supa = getSupa();

    const precio = data.precioOperacion ?? null;
    const pct = data.comisionPct ?? null;
    const total = precio !== null && pct !== null ? Math.round(precio * pct) / 100 : null;

    const row: Record<string, unknown> = {
      tipo: data.tipo,
      estado: "Abierta",
      fecha_apertura: new Date().toISOString(),
    };
    if (precio !== null) row.precio_operacion = precio;
    if (pct !== null) row.comision_pct = pct;
    if (total !== null) row.comision_total = total;
    if (data.propertyId) row.property_id = data.propertyId;
    const agenteId = data.agenteId ?? crm.agentId;
    if (!agenteId) throw new Error("La operación necesita un agente responsable");
    row.agente_id = agenteId;
    if (data.vendedorId) row.vendedor_id = data.vendedorId;
    if (data.compradorId) row.comprador_id = data.compradorId;
    if (data.notas?.trim()) row.notas = data.notas.trim();

    const { data: inserted, error } = await supa
      .from("operations")
      .insert([row])
      .select("id")
      .single();

    if (error) throw new Error(`createOperacion: ${error.message}`);
    return { id: inserted.id };
  });

export type UpdateOperacionEstadoPayload = {
  id: string;
  estado: OperacionEstado;
};

export const updateOperacionEstado = createServerFn({ method: "POST" })
  .validator((d: UpdateOperacionEstadoPayload) => {
    if (!d?.id) throw new Error("Operación requerida");
    if (!d.estado || !OPERACION_ESTADOS.includes(d.estado)) {
      throw new Error("Estado de operación inválido");
    }
    if (d.estado === "Cerrada") {
      throw new Error("El cierre definitivo debe ejecutarse con la acción Cerrar operación");
    }
    return d;
  })
  .handler(async ({ data }) => {
    await requirePermission("operations.create");
    const supa = getSupa();
    const { data: current, error: currentError } = await supa
      .from("operations")
      .select("estado")
      .eq("id", data.id)
      .single();

    if (currentError) {
      throw new Error(`updateOperacionEstado: ${currentError.message}`);
    }

    if (current.estado === "Cerrada") {
      await requirePermission("operations.close");
    }

    assertRegularOperacionTransition(current.estado as OperacionEstado, data.estado);

    if (current.estado === data.estado) return { ok: true };

    const update: Record<string, unknown> = { estado: data.estado };
    update.fecha_cierre = null;

    const { error } = await supa.from("operations").update(update).eq("id", data.id);

    if (error) throw new Error(`updateOperacionEstado: ${error.message}`);
    return { ok: true };
  });

export type CloseOperacionPayload = { id: string };

export type CloseOperacionResult = {
  ok: true;
  alreadyClosed: boolean;
  propertyStatus: string | null;
};

const SAFE_CLOSE_ERRORS = [
  "La operación no existe",
  "Una operación cancelada no puede cerrarse; debe reabrirse primero",
  "El estado actual de la operación no permite cerrarla",
  "El usuario que ejecuta el cierre es obligatorio",
  "El usuario no tiene un perfil CRM activo",
  "El agente indicado no corresponde al usuario autenticado",
  "La operación necesita un agente responsable para poder cerrarse",
  "El agente responsable no existe o está inactivo",
  "La operación necesita un inmueble para poder cerrarse",
  "La operación necesita un propietario o arrendador",
  "La operación necesita un comprador o inquilino",
  "El propietario y el comprador o inquilino deben ser contactos distintos",
  "La operación necesita un precio final mayor que cero",
  "La comisión debe estar entre 0 y 100",
  "El inmueble de la operación no existe",
  "Un inmueble de alquiler no puede cerrarse como venta",
  "Un inmueble de venta no puede cerrarse como alquiler",
  "Solo puede cerrarse una operación con un inmueble activo o reservado",
  "Hay varias relaciones abiertas de propietario para el mismo inmueble",
  "Hay varias relaciones abiertas de comprador o inquilino para el mismo inmueble",
  "Hay varias relaciones genéricas abiertas de propietario",
  "Hay varias relaciones genéricas abiertas de comprador o inquilino",
] as const;

export function toPublicCloseError(message: string): Error {
  const safeMessage = SAFE_CLOSE_ERRORS.find((candidate) => message.includes(candidate));
  return new Error(
    safeMessage ??
      "No se pudo cerrar la operación de forma segura. Revisa sus datos e inténtalo de nuevo.",
  );
}

export const closeOperacion = createServerFn({ method: "POST" })
  .validator((d: CloseOperacionPayload) => {
    if (!d?.id) throw new Error("Operación requerida");
    return d;
  })
  .handler(async ({ data }): Promise<CloseOperacionResult> => {
    const { crm } = await requirePermission("operations.close");
    const supa = getSupa();

    const { data: result, error } = await supa.rpc("cerrar_operacion_crm", {
      p_operacion_id: data.id,
      p_actor_user_id: crm.userId,
      p_actor_agente_id: crm.agentId,
    });

    if (error) {
      console.error("cerrar_operacion_crm:", error.message);
      throw toPublicCloseError(error.message);
    }

    const row = Array.isArray(result) ? result[0] : result;
    if (!row) {
      throw new Error("No se pudo confirmar el cierre de la operación");
    }

    return {
      ok: true,
      alreadyClosed: row.ya_estaba_cerrada === true,
      propertyStatus: row.property_estatus ?? null,
    };
  });
