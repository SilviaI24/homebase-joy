import { describe, expect, it } from "vitest";
import { CRM_CAPABILITIES } from "@/lib/crm-auth.server";

// El sistema de excepciones individuales por persona (crm_permisos_usuario)
// se eliminó el 19 ago 2026 — decisión de David: con solo dos roles activos
// (ADMIN y OPERATIVO) y sin restricción departamental, el acceso depende
// únicamente del rol base de cada cuenta. Ver
// supabase/migrations/20260819153538_simplify_roles_and_drop_individual_overrides.sql.

describe("catálogo RBAC del CRM", () => {
  it("contiene 36 capacidades sin duplicados", () => {
    expect(CRM_CAPABILITIES).toHaveLength(36);
    expect(new Set(CRM_CAPABILITIES).size).toBe(CRM_CAPABILITIES.length);
  });

  it("separa consulta y escritura de SilvIA", () => {
    expect(CRM_CAPABILITIES).toContain("silvia.use");
    expect(CRM_CAPABILITIES).toContain("silvia.execute_actions");
  });

  it("mantiene permisos sensibles separados de las operaciones normales", () => {
    expect(CRM_CAPABILITIES).toEqual(
      expect.arrayContaining([
        "contacts.delete_hard",
        "properties.status_final",
        "operations.read_financiero",
        "operations.close",
        "permissions.manage",
      ]),
    );
  });
});
