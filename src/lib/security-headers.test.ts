import { describe, it, expect } from "vitest";
import {
  applySecurityHeaders,
  buildEnforcedCsp,
  buildReportOnlyCsp,
  buildSecurityHeaders,
  isSecureRequest,
  resolveSupabaseOrigin,
} from "./security-headers";

const PROD_ORIGIN = "https://fyrfkbcabmitbfuqeccq.supabase.co";
const QA_ORIGIN = "https://bgotqyqvaxknmemgjskt.supabase.co";

describe("resolveSupabaseOrigin", () => {
  it("T01: usa SUPABASE_URL con prioridad", () => {
    expect(resolveSupabaseOrigin({ SUPABASE_URL: QA_ORIGIN, VITE_SUPABASE_URL: PROD_ORIGIN })).toBe(
      QA_ORIGIN,
    );
  });

  it("T02: cae a VITE_SUPABASE_URL si no hay SUPABASE_URL", () => {
    expect(resolveSupabaseOrigin({ VITE_SUPABASE_URL: QA_ORIGIN })).toBe(QA_ORIGIN);
  });

  it("T03: ignora URLs malformadas y sigue con la siguiente", () => {
    expect(
      resolveSupabaseOrigin({ SUPABASE_URL: "no-es-una-url", VITE_SUPABASE_URL: QA_ORIGIN }),
    ).toBe(QA_ORIGIN);
  });

  it("T04: cae al proyecto de producción si no hay nada usable", () => {
    expect(resolveSupabaseOrigin({})).toBe(PROD_ORIGIN);
  });

  it("T05: descarta la ruta y conserva solo el origen", () => {
    expect(resolveSupabaseOrigin({ SUPABASE_URL: `${QA_ORIGIN}/rest/v1/` })).toBe(QA_ORIGIN);
  });
});

describe("buildEnforcedCsp", () => {
  it("T06: bloquea framing, object, base y form-action externos", () => {
    const csp = buildEnforcedCsp();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("T07: no incluye default-src ni script-src (no puede romper la carga)", () => {
    const csp = buildEnforcedCsp();
    expect(csp).not.toContain("default-src");
    expect(csp).not.toContain("script-src");
  });
});

describe("buildReportOnlyCsp", () => {
  it("T08: permite los orígenes de Google Fonts que usa __root.tsx", () => {
    const csp = buildReportOnlyCsp({});
    expect(csp).toMatch(/style-src[^;]*https:\/\/fonts\.googleapis\.com/);
    expect(csp).toMatch(/font-src[^;]*https:\/\/fonts\.gstatic\.com/);
  });

  it("T09: permite el origen de Supabase del entorno en connect-src, https y wss", () => {
    const csp = buildReportOnlyCsp({ SUPABASE_URL: QA_ORIGIN });
    expect(csp).toContain(`connect-src 'self' ${QA_ORIGIN} wss://bgotqyqvaxknmemgjskt.supabase.co`);
  });

  it("T10: img-src acepta https arbitrario (fotos y documentos externos pegados a mano)", () => {
    expect(buildReportOnlyCsp({})).toContain("img-src 'self' data: blob: https:");
  });

  it("T11: mantiene 'unsafe-inline' en script-src por la hidratación SSR de TanStack Start", () => {
    expect(buildReportOnlyCsp({})).toContain("script-src 'self' 'unsafe-inline'");
  });
});

describe("buildSecurityHeaders", () => {
  it("T12: emite las cabeceras base", () => {
    const h = buildSecurityHeaders({}, true);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  });

  it("T13: Permissions-Policy deja micrófono a self (búsqueda por voz) y cierra el resto", () => {
    const value = buildSecurityHeaders({}, true)["Permissions-Policy"]!;
    expect(value).toContain("microphone=(self)");
    expect(value).toContain("camera=()");
    expect(value).toContain("geolocation=()");
    expect(value).toContain("payment=()");
  });

  it("T14: HSTS solo sobre transporte seguro", () => {
    expect(buildSecurityHeaders({}, true)["Strict-Transport-Security"]).toContain(
      "max-age=63072000",
    );
    expect(buildSecurityHeaders({}, false)["Strict-Transport-Security"]).toBeUndefined();
  });

  it("T15: la CSP enforce va en Content-Security-Policy y la completa en report-only", () => {
    const h = buildSecurityHeaders({}, true);
    expect(h["Content-Security-Policy"]).toBe(buildEnforcedCsp());
    expect(h["Content-Security-Policy-Report-Only"]).toContain("default-src 'self'");
  });

  it("T16: en desarrollo se omite la CSP report-only (ruido de Vite)", () => {
    const h = buildSecurityHeaders({ NODE_ENV: "development" }, false);
    expect(h["Content-Security-Policy-Report-Only"]).toBeUndefined();
    expect(h["Content-Security-Policy"]).toBe(buildEnforcedCsp());
  });

  it("T17: con NODE_ENV ausente la CSP report-only sigue activa (fail-secure)", () => {
    expect(buildSecurityHeaders({}, true)["Content-Security-Policy-Report-Only"]).toBeDefined();
  });
});

describe("isSecureRequest", () => {
  it("T18: confía en x-forwarded-proto cuando existe", () => {
    const req = new Request("http://interno/", { headers: { "x-forwarded-proto": "https" } });
    expect(isSecureRequest(req)).toBe(true);
  });

  it("T19: toma el primer valor de una cadena de proxies", () => {
    const req = new Request("http://interno/", { headers: { "x-forwarded-proto": "https, http" } });
    expect(isSecureRequest(req)).toBe(true);
  });

  it("T20: sin cabecera, usa el protocolo de la URL", () => {
    expect(isSecureRequest(new Request("https://app.example/"))).toBe(true);
    expect(isSecureRequest(new Request("http://localhost:3000/"))).toBe(false);
  });
});

describe("applySecurityHeaders", () => {
  it("T21: añade las cabeceras conservando cuerpo y estado", async () => {
    const res = applySecurityHeaders(
      new Response("hola", { status: 201, headers: { "content-type": "text/plain" } }),
      {},
      true,
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-type")).toBe("text/plain");
    expect(await res.text()).toBe("hola");
  });

  it("T22: sobrescribe un valor previo más débil", () => {
    const res = applySecurityHeaders(
      new Response("x", { headers: { "X-Frame-Options": "ALLOWALL" } }),
      {},
      true,
    );
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("T23: no rompe con respuestas de cabeceras inmutables (Response.redirect)", () => {
    const res = applySecurityHeaders(Response.redirect("https://app.example/login", 302), {}, true);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://app.example/login");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("T24: no añade HSTS en peticiones no seguras", () => {
    const res = applySecurityHeaders(new Response("x"), {}, false);
    expect(res.headers.get("strict-transport-security")).toBeNull();
  });
});
