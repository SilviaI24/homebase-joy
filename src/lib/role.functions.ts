import { createServerFn } from "@tanstack/react-start";
import { getAllowedCapabilities, requireCrmUser, type CrmCapability } from "@/lib/crm-auth.server";

// UserRol ahora refleja los roles de seguridad de crm_usuarios, no agents.rol.
// Los niveles profesionales (AGENTE, SENIOR, MANAGER) permanecen en agents.rol
// y no son roles de acceso al CRM.
export type UserRol = "ADMIN" | "FINANCIERO" | "OPERATIVO";

export type MyRole = {
  isAdmin: boolean;
  isFinanciero: boolean;
  agentId: string | null;
  rol: UserRol;
  allowedCapabilities: CrmCapability[];
};

// Fail-closed: si el usuario no tiene fila activa en crm_usuarios, lanza 403.
// Eliminado el retorno { isAdmin: true } por defecto — era C-01.
export const getMyRole = createServerFn({ method: "GET" }).handler(async (): Promise<MyRole> => {
  const crm = await requireCrmUser();
  const allowedCapabilities = await getAllowedCapabilities(crm);
  return {
    isAdmin: crm.rolBase === "ADMIN",
    isFinanciero: allowedCapabilities.includes("operations.read_financiero"),
    agentId: crm.agentId,
    rol: crm.rolBase,
    allowedCapabilities,
  };
});
