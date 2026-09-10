import { describe, expect, it } from "vitest";
import { CRM_CAPABILITIES } from "@/lib/crm-auth.server";

// El sistema de excepciones individuales por persona (crm_permisos_usuario)
// se eliminó el 19 ago 2026 — decisión de David: con solo dos roles activos
// (ADMIN y OPERATIVO) y sin restricción departamental, el acceso depende
// únicamente del rol base de cada cuenta. Ver
// supabase/migrations/20260819153538_simplify_roles_and_drop_individual_overrides.sql.
//
// 9 sep 2026 (auditoría): de 36 a 30 capacidades — se retiraron 7 que no
// comprobaba ningún requirePermission() porque la funcionalidad que
// gobernarían no existe en la app (contacts.export, documents.delete,
// visits.delete, silvia.execute_actions, email.send, config.manage,
// audit.read; ver 20260909124258_retirar_permisos_sin_uso_real.sql) y se
// añadió documents.read, que sí separa una acción real (ver
// 20260909124425_agregar_permiso_documents_read.sql).

describe("catálogo RBAC del CRM", () => {
  it("contiene 30 capacidades sin duplicados", () => {
    expect(CRM_CAPABILITIES).toHaveLength(30);
    expect(new Set(CRM_CAPABILITIES).size).toBe(CRM_CAPABILITIES.length);
  });

  it("separa la ficha del inmueble de su documentación legal", () => {
    expect(CRM_CAPABILITIES).toContain("properties.read");
    expect(CRM_CAPABILITIES).toContain("documents.read");
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
