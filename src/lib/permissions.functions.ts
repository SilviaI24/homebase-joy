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

export type PermissionOverrideRow = {
  permisoClave: CrmCapability;
  efecto: "ALLOW" | "DENY";
  motivo: string;
  activo: boolean;
  expiraAt: string | null;
};

export type PermissionAdminUser = {
  userId: string;
  email: string;
  nombre: string;
  agentId: string | null;
  rolBase: RolBase;
  activo: boolean;
  overrides: PermissionOverrideRow[];
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
  return value === "ADMIN" || value === "FINANCIERO" || value === "COMERCIAL_ADMINISTRATIVO";
}

export const listPermissionAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<PermissionAdminData> => {
    const { crm } = await requirePermission("permissions.manage");
    const supa = getSupa();

    const [usersResult, catalogResult, presetsResult, overridesResult] = await Promise.all([
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
        supa
          .from("crm_permisos_usuario")
          .select("user_id, permiso_clave, efecto, motivo, activo, expira_at")
          .order("created_at", { ascending: false }),
      ]);

    const queryError =
      usersResult.error ??
      catalogResult.error ??
      presetsResult.error ??
      overridesResult.error;
    if (queryError) throw new Error(`permission admin lookup: ${queryError.message}`);

    const overridesByUser = new Map<string, PermissionOverrideRow[]>();

    for (const row of overridesResult.data ?? []) {
      if (!isCapability(row.permiso_clave)) continue;
      const current = overridesByUser.get(row.user_id) ?? [];
      current.push({
        permisoClave: row.permiso_clave,
        efecto: row.efecto === "DENY" ? "DENY" : "ALLOW",
        motivo: row.motivo,
        activo: row.activo === true,
        expiraAt: row.expira_at ?? null,
      });
      overridesByUser.set(row.user_id, current);
    }

    const presets: PermissionAdminData["presets"] = {
      ADMIN: {},
      FINANCIERO: {},
      COMERCIAL_ADMINISTRATIVO: {},
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
            overrides: overridesByUser.get(row.user_id) ?? [],
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

type SetUserPermissionPayload = {
  userId: string;
  capability: CrmCapability;
  effect: "ALLOW" | "DENY" | null;
  reason?: string;
};

export const setUserPermission = createServerFn({ method: "POST" })
  .validator((value: SetUserPermissionPayload) => {
    if (!value?.userId) throw new Error("Usuario requerido");
    if (!isCapability(value.capability)) throw new Error("Permiso inválido");
    if (value.effect !== null && value.effect !== "ALLOW" && value.effect !== "DENY") {
      throw new Error("Efecto inválido");
    }
    if (value.effect && !value.reason?.trim()) throw new Error("Indica el motivo del cambio");
    return value;
  })
  .handler(async ({ data }) => {
    const { crm } = await requirePermission("permissions.manage");
    const supa = getSupa();

    if (
      crm.userId === data.userId &&
      data.effect === "DENY" &&
      (data.capability === "permissions.manage" || data.capability === "users.manage")
    ) {
      throw new Error("No puedes retirarte a ti mismo el control administrativo");
    }

    if (data.effect === null) {
      const { error } = await supa
        .from("crm_permisos_usuario")
        .update({ activo: false })
        .eq("user_id", data.userId)
        .eq("permiso_clave", data.capability)
        .eq("activo", true);
      if (error) throw new Error(`reset permission: ${error.message}`);
      return { ok: true };
    }

    const { error } = await supa.from("crm_permisos_usuario").upsert(
      {
        user_id: data.userId,
        permiso_clave: data.capability,
        efecto: data.effect,
        motivo: data.reason!.trim(),
        otorgado_por: crm.userId,
        activo: true,
        expira_at: null,
      },
      { onConflict: "user_id,permiso_clave,efecto" },
    );
    if (error) throw new Error(`set permission: ${error.message}`);

    // El nuevo estado ya está persistido. DENY prevalece sobre ALLOW, por lo que
    // una interrupción antes de este paso nunca amplía permisos accidentalmente.
    const opposite = data.effect === "ALLOW" ? "DENY" : "ALLOW";
    const { error: oppositeError } = await supa
      .from("crm_permisos_usuario")
      .update({ activo: false })
      .eq("user_id", data.userId)
      .eq("permiso_clave", data.capability)
      .eq("efecto", opposite);
    if (oppositeError) throw new Error(`deactivate opposite permission: ${oppositeError.message}`);

    return { ok: true };
  });
