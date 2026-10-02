import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { toTitleCase, escapeSearchTerm } from "./format";
import { requirePermissions } from "@/lib/crm-auth.server";
import { s } from "./clientes-format";

// Suscriptores de Soldata (migración 20261001163807_soldata_suscriptores.sql):
// todo contacto con soldata_suscrito_at, tanto los que solo reciben la
// publicación (ciclo_vida 'Suscriptor') como los que ya pasaron a lead o eran
// contactos previos. Las altas las hace la web vía rpc soldata_suscribir.

export type SuscriptorRow = {
  id: string;
  nombre: string;
  email: string;
  telefono: string;
  etapa: string;
  quiereVender: boolean;
  origen: string | null;
  suscritoAt: string | null;
  bajaAt: string | null;
};

type SoldataOrigen = {
  pagina?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  quiere_vender?: boolean;
};

function origenLabel(o: SoldataOrigen | undefined): string | null {
  if (!o) return null;
  const campana = [o.utm_source, o.utm_campaign].filter(Boolean).join(" · ");
  return campana || o.pagina || null;
}

export const listSuscriptoresPage = createServerFn({ method: "GET" })
  .validator((d: { page?: number; pageSize?: number; q?: string }) => {
    const page = Math.max(1, Number(d?.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(d?.pageSize) || 50));
    const q = typeof d?.q === "string" ? d.q.trim() : "";
    return { page, pageSize, q };
  })
  .handler(async ({ data }): Promise<{ suscriptores: SuscriptorRow[]; total: number }> => {
    await requirePermissions("contacts.read");
    const supa = getSupa();
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let query = supa
      .from("contacts")
      .select(
        "id, nombre, email, telefono, ciclo_vida, soldata_suscrito_at, soldata_baja_at, soldata_datos",
        { count: "exact" },
      )
      .not("soldata_suscrito_at", "is", null)
      .order("soldata_suscrito_at", { ascending: false });

    if (data.q) {
      const needle = escapeSearchTerm(data.q);
      query = query.or(
        `nombre.ilike.%${needle}%,email.ilike.%${needle}%,telefono.ilike.%${needle}%`,
      );
    }

    const { data: rows, error, count } = await query.range(from, to);
    if (error) throw new Error("Error al cargar suscriptores");

    type Row = {
      id: string;
      nombre: string | null;
      email: string | null;
      telefono: string | null;
      ciclo_vida: string | null;
      soldata_suscrito_at: string | null;
      soldata_baja_at: string | null;
      soldata_datos: { primera?: SoldataOrigen; ultima?: SoldataOrigen } | null;
    };

    const suscriptores = ((rows ?? []) as Row[]).map((r) => ({
      id: r.id,
      nombre: toTitleCase(s(r.nombre)),
      email: s(r.email),
      telefono: s(r.telefono),
      etapa: r.ciclo_vida ?? "Suscriptor",
      quiereVender: Boolean(
        r.soldata_datos?.ultima?.quiere_vender || r.soldata_datos?.primera?.quiere_vender,
      ),
      origen: origenLabel(r.soldata_datos?.primera),
      suscritoAt: r.soldata_suscrito_at,
      bajaAt: r.soldata_baja_at,
    }));

    return { suscriptores, total: count ?? 0 };
  });
