import { describe, it, expect, vi } from "vitest";
import {
  validatePasswordReset,
  executePasswordUpdate,
  detectRecoverySession,
} from "./password-reset";

describe("validatePasswordReset", () => {
  it("T01: falla cuando las contraseñas son diferentes", () => {
    const r = validatePasswordReset("contraseña1!", "contraseña2!");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/coinciden/);
  });

  it("T02: falla cuando la longitud es menor a 8 caracteres", () => {
    const r = validatePasswordReset("corta", "corta");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/8/);
  });

  it("T03: pasa con contraseña de exactamente 8 caracteres iguales", () => {
    const r = validatePasswordReset("abcde123", "abcde123");
    expect(r.ok).toBe(true);
  });
});

describe("executePasswordUpdate", () => {
  it("T04: actualiza correctamente, llama a signOut y retorna ok:true", async () => {
    const mockAuth = {
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({}),
    };
    const r = await executePasswordUpdate("nueva_contraseña_segura_123", mockAuth);
    expect(r.ok).toBe(true);
    expect(mockAuth.updateUser).toHaveBeenCalledWith({
      password: "nueva_contraseña_segura_123",
    });
    expect(mockAuth.signOut).toHaveBeenCalledOnce();
  });

  it("T05: devuelve error seguro sin detalle interno cuando updateUser falla; no llama signOut", async () => {
    const mockAuth = {
      updateUser: vi.fn().mockResolvedValue({ error: new Error("JWT expired") }),
      signOut: vi.fn(),
    };
    const r = await executePasswordUpdate("nueva_contraseña_segura_123", mockAuth);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).not.toContain("JWT");
      expect(r.reason).not.toContain("expired");
      expect(r.reason.length).toBeGreaterThan(0);
    }
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  });
});

describe("detectRecoverySession", () => {
  it("T06: devuelve false cuando no se recibe evento PASSWORD_RECOVERY (sesión ausente)", async () => {
    const mockAuth = {
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    };
    const result = await detectRecoverySession(mockAuth, 50);
    expect(result).toBe(false);
  });

  it("T07: devuelve true cuando se recibe evento PASSWORD_RECOVERY", async () => {
    const mockAuth = {
      onAuthStateChange: vi.fn().mockImplementation((callback) => {
        callback("PASSWORD_RECOVERY", { user: { id: "fca7f51f" } });
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    };
    const result = await detectRecoverySession(mockAuth, 1000);
    expect(result).toBe(true);
  });

  it("T08: ignora eventos que no son PASSWORD_RECOVERY", async () => {
    const mockAuth = {
      onAuthStateChange: vi.fn().mockImplementation((callback) => {
        callback("SIGNED_IN", { user: { id: "fca7f51f" } });
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    };
    const result = await detectRecoverySession(mockAuth, 50);
    expect(result).toBe(false);
  });
});
