import { describe, expect, it } from "vitest";
import { CRM_CAPABILITIES, resolvePermissionDecision } from "@/lib/crm-auth.server";

describe("resolución de excepciones RBAC", () => {
  it("DENY individual prevalece sobre ALLOW y sobre el preset", () => {
    expect(
      resolvePermissionDecision({
        hasDeny: true,
        hasAllow: true,
        presetAllowed: true,
      }),
    ).toBe(false);
  });

  it("ALLOW individual habilita una función desactivada en el preset", () => {
    expect(
      resolvePermissionDecision({
        hasDeny: false,
        hasAllow: true,
        presetAllowed: false,
      }),
    ).toBe(true);
  });

  it("usa el preset cuando no hay excepción individual", () => {
    expect(
      resolvePermissionDecision({
        hasDeny: false,
        hasAllow: false,
        presetAllowed: true,
      }),
    ).toBe(true);
    expect(
      resolvePermissionDecision({
        hasDeny: false,
        hasAllow: false,
        presetAllowed: false,
      }),
    ).toBe(false);
  });
});

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
