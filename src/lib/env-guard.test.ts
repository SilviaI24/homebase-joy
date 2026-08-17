import { describe, it, expect } from "vitest";
import { checkEnv } from "./env-guard";

const PROD_URL = "https://fyrfkbcabmitbfuqeccq.supabase.co";
const QA_URL = "https://bgotqyqvaxknmemgjskt.supabase.co";

const PROD_REF = "fyrfkbcabmitbfuqeccq";
const QA_REF = "bgotqyqvaxknmemgjskt";

describe("checkEnv", () => {
  it("T01: falla cuando APP_ENV está ausente", () => {
    const r = checkEnv({});
    expect(r.ok).toBe(false);
    expect((r as { ok: false; reason: string }).reason).toMatch(/APP_ENV/);
  });

  it("T02: falla cuando APP_ENV tiene un valor no permitido", () => {
    const r = checkEnv({ APP_ENV: "staging" });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; reason: string }).reason).toMatch(/APP_ENV/);
  });

  it("T03: pasa en local sin EXPECTED_SUPABASE_PROJECT_REF", () => {
    const r = checkEnv({
      APP_ENV: "local",
      SUPABASE_URL: QA_URL,
      VITE_SUPABASE_URL: QA_URL,
    });
    expect(r.ok).toBe(true);
  });

  it("T04: falla en local cuando SUPABASE_URL y VITE_SUPABASE_URL apuntan a proyectos distintos", () => {
    const r = checkEnv({
      APP_ENV: "local",
      SUPABASE_URL: PROD_URL,
      VITE_SUPABASE_URL: QA_URL,
    });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; reason: string }).reason).toMatch(/proyectos distintos/);
  });

  it("T05: falla en qa cuando EXPECTED_SUPABASE_PROJECT_REF está ausente", () => {
    const r = checkEnv({
      APP_ENV: "qa",
      SUPABASE_URL: QA_URL,
      VITE_SUPABASE_URL: QA_URL,
    });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; reason: string }).reason).toMatch(/EXPECTED_SUPABASE_PROJECT_REF/);
  });

  it("T06: falla en qa cuando el ref real no coincide con EXPECTED", () => {
    const r = checkEnv({
      APP_ENV: "qa",
      EXPECTED_SUPABASE_PROJECT_REF: "otroproyecto123456789",
      SUPABASE_URL: QA_URL,
      VITE_SUPABASE_URL: QA_URL,
    });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; reason: string }).reason).toMatch(/no coincide/);
  });

  it("T07: falla en qa cuando apunta al proyecto de producción", () => {
    const r = checkEnv({
      APP_ENV: "qa",
      EXPECTED_SUPABASE_PROJECT_REF: PROD_REF,
      SUPABASE_URL: PROD_URL,
      VITE_SUPABASE_URL: PROD_URL,
    });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; reason: string }).reason).toMatch(/QA no puede/);
  });

  it("T08: pasa en production cuando apunta al proyecto de producción autorizado", () => {
    const r = checkEnv({
      APP_ENV: "production",
      EXPECTED_SUPABASE_PROJECT_REF: PROD_REF,
      SUPABASE_URL: PROD_URL,
      VITE_SUPABASE_URL: PROD_URL,
    });
    expect(r.ok).toBe(true);
  });

  it("T09: falla en production cuando apunta a un proyecto que no es el de producción", () => {
    const r = checkEnv({
      APP_ENV: "production",
      EXPECTED_SUPABASE_PROJECT_REF: QA_REF,
      SUPABASE_URL: QA_URL,
      VITE_SUPABASE_URL: QA_URL,
    });
    expect(r.ok).toBe(false);
    expect((r as { ok: false; reason: string }).reason).toMatch(/production solo puede/);
  });

  it("T10: pasa en qa cuando apunta al proyecto QA con EXPECTED correcto", () => {
    const r = checkEnv({
      APP_ENV: "qa",
      EXPECTED_SUPABASE_PROJECT_REF: QA_REF,
      SUPABASE_URL: QA_URL,
      VITE_SUPABASE_URL: QA_URL,
    });
    expect(r.ok).toBe(true);
  });
});
