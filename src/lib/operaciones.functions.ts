import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { requireAuth } from "@/lib/auth.server";

export type OperacionTipo   = "Venta" | "Alquiler" | "Valoración" | "Servicio";
export type OperacionEstado = "Abierta" | "En negociación" | "Cerrada" | "Cancelada";

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
  agenteId: string | null;
  agenteNombre: string | null;
  vendedorId: string | null;
  vendedorNombre: string | null;
  compradorId: string | null;
  compradorNombre: string | null;
  created_at: string;
};

export const listOperaciones = createServerFn({ method: "GET" }).handler(async () => {
  await requireAuth();
  const supa = getSupa();

  const { data, error } = await supa
    .from("operations")
    .select(
      `id, tipo, estado,
       precio_operacion, comision_pct, comision_total,
       fecha_apertura, fecha_cierre, notas, created_at,
       property_id, properties(ref, barrio, calle, numero),
       agente_id,    agents(id, nombre),
       vendedor_id,  vendedor:contacts!operations_vendedor_id_fkey(id, nombre),
       comprador_id, comprador:contacts!operations_comprador_id_fkey(id, nombre)`
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(`listOperaciones: ${error.message}`);

  return {
    operaciones: (data ?? []).map((r: any): OperacionRow => ({
      id: r.id,
      tipo: r.tipo ?? "Venta",
      estado: r.estado ?? "Abierta",
      precioOperacion: r.precio_operacion ?? null,
      comisionPct: r.comision_pct ?? null,
      comisionTotal: r.comision_total ?? null,
      fechaApertura: r.fecha_apertura ?? null,
      fechaCierre: r.fecha_cierre ?? null,
      notas: r.notas ?? "",
      propertyId: r.property_id ?? null,
      propertyRef: r.properties?.ref ?? null,
      propertyBarrio: r.properties?.barrio ?? null,
      propertyCalle: r.properties?.calle
        ? `${r.properties.calle} ${r.properties.numero ?? ""}`.trim()
        : null,
      agenteId: r.agents?.id ?? null,
      agenteNombre: r.agents?.nombre ?? null,
      vendedorId: r.vendedor?.id ?? null,
      vendedorNombre: r.vendedor?.nombre ?? null,
      compradorId: r.comprador?.id ?? null,
      compradorNombre: r.comprador?.nombre ?? null,
      created_at: r.created_at,
    })),
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
  .validator((d: CreateOperacionPayload) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const supa = getSupa();

    const precio = data.precioOperacion ?? null;
    const pct    = data.comisionPct ?? null;
    const total  = precio && pct ? Math.round(precio * pct) / 100 : null;

    const row: Record<string, unknown> = {
      tipo: data.tipo,
      estado: data.estado ?? "Abierta",
      fecha_apertura: new Date().toISOString(),
    };
    if (precio !== null)       row.precio_operacion = precio;
    if (pct !== null)          row.comision_pct = pct;
    if (total !== null)        row.comision_total = total;
    if (data.propertyId)       row.property_id = data.propertyId;
    if (data.agenteId)         row.agente_id = data.agenteId;
    if (data.vendedorId)       row.vendedor_id = data.vendedorId;
    if (data.compradorId)      row.comprador_id = data.compradorId;
    if (data.notas?.trim())    row.notas = data.notas.trim();

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
  .validator((d: UpdateOperacionEstadoPayload) => d)
  .handler(async ({ data }) => {
    await requireAuth();
    const supa = getSupa();

    const update: Record<string, unknown> = { estado: data.estado };
    if (data.estado === "Cerrada") update.fecha_cierre = new Date().toISOString();

    const { error } = await supa
      .from("operations")
      .update(update)
      .eq("id", data.id);

    if (error) throw new Error(`updateOperacionEstado: ${error.message}`);
    return { ok: true };
  });
