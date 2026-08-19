import { createServerFn } from "@tanstack/react-start";
import {
  CRM_CAPABILITIES,
  requirePermission,
  type CrmCapability,
  type RolBase,
} from "@/lib/crm-auth.server";
import { getSupa } from "@/lib/supabase.server";

export type PermissionCatalogRow = {
  clave: CrmCapability;
  dominio: string;
  accion: string;
  descripcion: string;
  sensible: boolean;
};

export type PermissionAdminUser = {
  userId: string;
  email: string;
  nombre: string;
  agentId: string | null;
  rolBase: RolBase;
  activo: boolean;
};

export type PermissionAdminData = {
  currentUserId: string;
  users: PermissionAdminUser[];
  catalog: PermissionCatalogRow[];
  presets: Record<RolBase, Partial<Record<CrmCapability, boolean>>>;
};

function isCapability(value: unknown): value is CrmCapability {
  return typeof value === "string" && CRM_CAPABILITIES.includes(value as CrmCapability);
}

function isRole(value: unknown): value is RolBase {
  return value === "ADMIN" || value === "FINANCIERO" || value === "OPERATIVO";
}

// Sin excepciones individuales por persona (se eliminó crm_permisos_usuario
// el 19 ago 2026) — el acceso depende solo del rol base de cada cuenta.
export const listPermissionAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<PermissionAdminData> => {
    const { crm } = await requirePermission("permissions.manage");
    const supa = getSupa();

    const [usersResult, catalogResult, presetsResult] = await Promise.all([
      supa
        .from("crm_usuarios")
        .select("user_id, agent_id, rol_base, activo, agents(nombre, email)")
        .order("created_at", { ascending: true }),
      supa
        .from("crm_permisos")
        .select("clave, dominio, accion, descripcion, sensible")
        .order("dominio", { ascending: true })
        .order("clave", { ascending: true }),
      supa.from("crm_permisos_rol").select("rol_base, permiso_clave, permitido"),
    ]);

    const queryError = usersResult.error ?? catalogResult.error ?? presetsResult.error;
    if (queryError) throw new Error(`permission admin lookup: ${queryError.message}`);

    const presets: PermissionAdminData["presets"] = {
      ADMIN: {},
      FINANCIERO: {},
      OPERATIVO: {},
    };
    for (const row of presetsResult.data ?? []) {
      if (!isRole(row.rol_base) || !isCapability(row.permiso_clave)) continue;
      presets[row.rol_base][row.permiso_clave] = row.permitido === true;
    }

    return {
      currentUserId: crm.userId,
      catalog: (catalogResult.data ?? [])
        .filter((row) => isCapability(row.clave))
        .map((row) => ({
          clave: row.clave as CrmCapability,
          dominio: row.dominio,
          accion: row.accion,
          descripcion: row.descripcion,
          sensible: row.sensible === true,
        })),
      presets,
      users: (usersResult.data ?? [])
        .filter((row) => isRole(row.rol_base))
        .map((row) => {
          const agent = Array.isArray(row.agents) ? row.agents[0] : row.agents;
          return {
            userId: row.user_id,
            email: agent?.email || "Sin email vinculado",
            nombre: agent?.nombre || "Usuario CRM",
            agentId: row.agent_id ?? null,
            rolBase: row.rol_base as RolBase,
            activo: row.activo === true,
          };
        }),
    };
  },
);

type UpdateCrmUserPayload = {
  userId: string;
  rolBase: RolBase;
  activo: boolean;
};

export const updateCrmUser = createServerFn({ method: "POST" })
  .validator((value: UpdateCrmUserPayload) => {
    if (!value?.userId) throw new Error("Usuario requerido");
    if (!isRole(value.rolBase)) throw new Error("Rol inválido");
    if (typeof value.activo !== "boolean") throw new Error("Estado inválido");
    return value;
  })
  .handler(async ({ data }) => {
    await requirePermission("users.manage");
    const supa = getSupa();
    const { error } = await supa
      .from("crm_usuarios")
      .update({ rol_base: data.rolBase, activo: data.activo })
      .eq("user_id", data.userId);
    if (error) throw new Error(`update CRM user: ${error.message}`);
    return { ok: true };
  });
