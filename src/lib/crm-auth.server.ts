import { requireAuth } from "@/lib/auth.server";
import { getSupa } from "@/lib/supabase.server";

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
export type RolBase = "ADMIN" | "FINANCIERO" | "COMERCIAL_ADMINISTRATIVO";

export type CrmUsuario = {
  userId: string;
  agentId: string | null;
  rolBase: RolBase;
};

export type PermissionResult = {
  crm: CrmUsuario;
};

type PermissionDecisionInput = {
  hasDeny: boolean;
  hasAllow: boolean;
  presetAllowed: boolean;
};

export function resolvePermissionDecision({
  hasDeny,
  hasAllow,
  presetAllowed,
}: PermissionDecisionInput): boolean {
  if (hasDeny) return false;
  if (hasAllow) return true;
  return presetAllowed;
}

function httpError(message: string, statusCode: number, capability?: CrmCapability) {
  return Object.assign(new Error(message), { statusCode, capability });
}

function isRolBase(value: unknown): value is RolBase {
  return value === "ADMIN" || value === "FINANCIERO" || value === "COMERCIAL_ADMINISTRATIVO";
}

export async function requireCrmUser(): Promise<CrmUsuario> {
  const user = await requireAuth();

  // DIAG: identify which Supabase project/key is active at runtime
  const urlRef = (process.env.SUPABASE_URL ?? "").split("//")[1]?.split(".")[0] ?? "?";
  let keyRef = "?";
  try {
    const key = process.env.SUPABASE_SERVICE_KEY ?? "";
    const payload = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64").toString()) as { ref?: string };
    keyRef = payload.ref ?? "?";
  } catch {}
  console.error("[crm] url-ref:", urlRef, "key-ref:", keyRef);

  const supa = getSupa();
  const { data, error } = await supa
    .from("crm_usuarios")
    .select("user_id, agent_id, rol_base, activo")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw httpError(`crm_usuarios lookup: ${error.message} [url:${urlRef} key:${keyRef}]`, 500);
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

async function evaluatePermissions(
  crm: CrmUsuario,
  capabilities: CrmCapability[],
): Promise<Map<CrmCapability, boolean>> {
  const requested = [...new Set(capabilities)];
  if (requested.length === 0) return new Map();

  const supa = getSupa();
  const now = new Date().toISOString();

  const [overrideResult, presetResult] = await Promise.all([
    supa
      .from("crm_permisos_usuario")
      .select("permiso_clave, efecto")
      .eq("user_id", crm.userId)
      .in("permiso_clave", requested)
      .eq("activo", true)
      .or(`expira_at.is.null,expira_at.gt.${now}`),
    supa
      .from("crm_permisos_rol")
      .select("permiso_clave, permitido")
      .eq("rol_base", crm.rolBase)
      .in("permiso_clave", requested),
  ]);

  const queryError = overrideResult.error ?? presetResult.error;
  if (queryError) {
    throw httpError(`permission lookup: ${queryError.message}`, 500);
  }

  const denied = new Set(
    (overrideResult.data ?? [])
      .filter((row) => row.efecto === "DENY")
      .map((row) => row.permiso_clave as CrmCapability),
  );
  const allowed = new Set(
    (overrideResult.data ?? [])
      .filter((row) => row.efecto === "ALLOW")
      .map((row) => row.permiso_clave as CrmCapability),
  );
  const preset = new Map(
    (presetResult.data ?? []).map((row) => [
      row.permiso_clave as CrmCapability,
      row.permitido === true,
    ]),
  );

  return new Map(
    requested.map((capability) => [
      capability,
      resolvePermissionDecision({
        hasDeny: denied.has(capability),
        hasAllow: allowed.has(capability),
        presetAllowed: preset.get(capability) === true,
      }),
    ]),
  );
}

export async function requirePermissions(
  ...capabilities: CrmCapability[]
): Promise<PermissionResult> {
  const crm = await requireCrmUser();
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
