import { requireAuthClient } from "@/lib/auth.server";
import { getSupa } from "@/lib/supabase.server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const CRM_CAPABILITIES = [
  "contacts.read",
  "contacts.create",
  "contacts.update",
  "contacts.archive",
  "contacts.delete_hard",
  "contacts.export",
  "contact_roles.read",
  "contact_roles.create",
  "contact_roles.update",
  "contact_roles.delete",
  "properties.read",
  "properties.create",
  "properties.update",
  "properties.status_final",
  "properties.publish",
  "properties.delete_hard",
  "documents.upload",
  "documents.delete",
  "visits.read",
  "visits.create",
  "visits.update",
  "visits.delete",
  "seguimiento.read",
  "seguimiento.create",
  "operations.read",
  "operations.read_financiero",
  "operations.create",
  "operations.close",
  "silvia.use",
  "silvia.execute_actions",
  "whatsapp.send",
  "email.send",
  "users.manage",
  "permissions.manage",
  "config.manage",
  "audit.read",
] as const;

export type CrmCapability = (typeof CRM_CAPABILITIES)[number];
// Solo dos niveles activos hoy: ADMIN (control total) y OPERATIVO (todo el
// personal de oficina, sin distinción departamental — decisión de David,
// 19 ago 2026: la restricción por departamento no hacía falta). FINANCIERO
// queda definido pero sin cuentas activas: su acceso real vivirá en un
// proyecto aparte ("command center") todavía sin diseñar.
export type RolBase = "ADMIN" | "FINANCIERO" | "OPERATIVO";

export type CrmUsuario = {
  userId: string;
  agentId: string | null;
  rolBase: RolBase;
};

export type PermissionResult = {
  crm: CrmUsuario;
};

function httpError(message: string, statusCode: number, capability?: CrmCapability) {
  return Object.assign(new Error(message), { statusCode, capability });
}

function isRolBase(value: unknown): value is RolBase {
  return value === "ADMIN" || value === "FINANCIERO" || value === "OPERATIVO";
}

async function lookupCrmUser(userId: string, supa: SupabaseClient): Promise<CrmUsuario> {
  const { data, error } = await supa
    .from("crm_usuarios")
    .select("user_id, agent_id, rol_base, activo")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw httpError(`crm_usuarios lookup: ${error.message}`, 500);
  }
  if (!data || !data.activo || !isRolBase(data.rol_base)) {
    throw httpError("Acceso denegado: usuario sin perfil CRM activo", 403);
  }
  return {
    userId: data.user_id as string,
    agentId: data.agent_id as string | null,
    rolBase: data.rol_base,
  };
}

export async function requireCrmUser(): Promise<CrmUsuario> {
  const { user, supabase } = await requireAuthClient();
  return lookupCrmUser(user.id, supabase);
}

// Decisión por rol únicamente — sin excepciones individuales (se eliminó
// crm_permisos_usuario el 19 ago 2026, ver migración
// simplify_roles_and_drop_individual_overrides).
async function evaluatePermissions(
  crm: CrmUsuario,
  capabilities: CrmCapability[],
): Promise<Map<CrmCapability, boolean>> {
  const supa = getSupa();
  const requested = [...new Set(capabilities)];
  if (requested.length === 0) return new Map();

  const { data, error } = await supa
    .from("crm_permisos_rol")
    .select("permiso_clave, permitido")
    .eq("rol_base", crm.rolBase)
    .in("permiso_clave", requested);

  if (error) {
    throw httpError(`permission lookup: ${error.message}`, 500);
  }

  const preset = new Map(
    (data ?? []).map((row) => [row.permiso_clave as CrmCapability, row.permitido === true]),
  );

  return new Map(requested.map((capability) => [capability, preset.get(capability) === true]));
}

export async function requirePermissions(
  ...capabilities: CrmCapability[]
): Promise<PermissionResult> {
  const { user, supabase } = await requireAuthClient();
  const crm = await lookupCrmUser(user.id, supabase);
  const decisions = await evaluatePermissions(crm, capabilities);

  for (const capability of capabilities) {
    if (!decisions.get(capability)) {
      throw httpError(`Sin permiso para: ${capability}`, 403, capability);
    }
  }

  return { crm };
}

export async function requirePermission(capability: CrmCapability): Promise<PermissionResult> {
  return requirePermissions(capability);
}

export async function hasPermission(crm: CrmUsuario, capability: CrmCapability): Promise<boolean> {
  try {
    const decisions = await evaluatePermissions(crm, [capability]);
    return decisions.get(capability) === true;
  } catch (error) {
    console.error(
      `Permiso no evaluable (${capability}):`,
      error instanceof Error ? error.message : "error desconocido",
    );
    return false;
  }
}

export async function getAllowedCapabilities(crm: CrmUsuario): Promise<CrmCapability[]> {
  const decisions = await evaluatePermissions(crm, [...CRM_CAPABILITIES]);
  return CRM_CAPABILITIES.filter((capability) => decisions.get(capability) === true);
}
