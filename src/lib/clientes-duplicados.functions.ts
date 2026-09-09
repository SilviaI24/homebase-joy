import { createServerFn } from "@tanstack/react-start";
import { getSupa } from "./supabase.server";
import { requirePermission, requirePermissions } from "@/lib/crm-auth.server";

// ── M-05: candidatos a duplicado y fusión (siempre con revisión humana) ───────

export type DuplicadoRow = {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  cicloVida: string;
  createdAt: string | null;
  tieneActividad: boolean;
};

export type GrupoDuplicado = {
  telNorm: string;
  contactos: DuplicadoRow[];
};

export const listContactosDuplicados = createServerFn({ method: "GET" }).handler(
  async (): Promise<GrupoDuplicado[]> => {
    await requirePermission("contacts.read");
    const supa = getSupa();
    const { data, error } = await supa.rpc("listar_contactos_duplicados");
    if (error) throw new Error(error.message);

    const grupos = new Map<string, DuplicadoRow[]>();
    for (const row of data ?? []) {
      const list = grupos.get(row.tel_norm) ?? [];
      list.push({
        id: row.contact_id,
        nombre: row.nombre || "Sin nombre",
        telefono: row.telefono ?? "",
        email: row.email ?? "",
        cicloVida: row.ciclo_vida ?? "Lead",
        createdAt: row.created_at ?? null,
        tieneActividad: row.tiene_actividad === true,
      });
      grupos.set(row.tel_norm, list);
    }
    return [...grupos.entries()].map(([telNorm, contactos]) => ({ telNorm, contactos }));
  },
);

export const fusionarContactosDuplicados = createServerFn({ method: "POST" })
  .validator((d: { survivorId: string; loserIds: string[] }) => {
    if (!d?.survivorId) throw new Error("survivorId requerido");
    if (!d?.loserIds?.length) throw new Error("loserIds requerido");
    if (d.loserIds.includes(d.survivorId)) {
      throw new Error("El superviviente no puede estar también en la lista de duplicados");
    }
    return d;
  })
  .handler(async ({ data }) => {
    // Fusionar es tan destructivo como un borrado (los duplicados
    // desaparecen tras traspasar su historial) — exige el mismo permiso.
    await requirePermissions("contacts.update", "contacts.delete_hard");
    const supa = getSupa();
    for (const loserId of data.loserIds) {
      const { error } = await supa.rpc("fusionar_contactos", {
        _survivor_id: data.survivorId,
        _loser_id: loserId,
      });
      if (error) throw new Error(`fusión de ${loserId}: ${error.message}`);
    }
    return { ok: true, fusionados: data.loserIds.length };
  });
