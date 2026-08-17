const PROD_REF = "fyrfkbcabmitbfuqeccq";
const ALLOWED_APP_ENVS = ["local", "qa", "production"] as const;
type AppEnv = (typeof ALLOWED_APP_ENVS)[number];

export type EnvCheckResult =
  | { ok: true }
  | { ok: false; reason: string };

function extractRef(supabaseUrl: string): string | null {
  try {
    const host = new URL(supabaseUrl).hostname;
    // hostname: <ref>.supabase.co
    const ref = host.split(".")[0];
    return ref && ref.length > 4 ? ref : null;
  } catch {
    return null;
  }
}

/** Pure, testable environment validation. No side effects. */
export function checkEnv(env: {
  APP_ENV?: string;
  EXPECTED_SUPABASE_PROJECT_REF?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
}): EnvCheckResult {
  const appEnv = env.APP_ENV;

  if (!appEnv || !(ALLOWED_APP_ENVS as readonly string[]).includes(appEnv)) {
    return { ok: false, reason: "APP_ENV ausente o no válido (local | qa | production)" };
  }

  // local: permite configuración flexible, pero aún valida consistencia de URLs
  if (appEnv === "local") {
    const refPriv = env.SUPABASE_URL ? extractRef(env.SUPABASE_URL) : null;
    const refPub = env.VITE_SUPABASE_URL ? extractRef(env.VITE_SUPABASE_URL) : null;
    if (refPriv && refPub && refPriv !== refPub) {
      return { ok: false, reason: "SUPABASE_URL y VITE_SUPABASE_URL apuntan a proyectos distintos" };
    }
    return { ok: true };
  }

  // qa y production: EXPECTED_SUPABASE_PROJECT_REF es obligatorio
  const expected = env.EXPECTED_SUPABASE_PROJECT_REF;
  if (!expected || expected.trim().length < 5) {
    return { ok: false, reason: "EXPECTED_SUPABASE_PROJECT_REF ausente o inválido" };
  }

  const refPriv = env.SUPABASE_URL ? extractRef(env.SUPABASE_URL) : null;
  const refPub = env.VITE_SUPABASE_URL ? extractRef(env.VITE_SUPABASE_URL) : null;

  if (!refPriv) {
    return { ok: false, reason: "SUPABASE_URL ausente o con formato inválido" };
  }
  if (!refPub) {
    return { ok: false, reason: "VITE_SUPABASE_URL ausente o con formato inválido" };
  }
  if (refPriv !== refPub) {
    return { ok: false, reason: "SUPABASE_URL y VITE_SUPABASE_URL apuntan a proyectos distintos" };
  }

  const actualRef = refPriv;

  if (actualRef !== expected) {
    return { ok: false, reason: "El project ref real no coincide con EXPECTED_SUPABASE_PROJECT_REF" };
  }

  if (appEnv === "qa" && actualRef === PROD_REF) {
    return { ok: false, reason: "Entorno QA no puede conectar al proyecto de producción" };
  }

  if (appEnv === "production" && actualRef !== PROD_REF) {
    return { ok: false, reason: "Entorno production solo puede apuntar al proyecto de producción autorizado" };
  }

  return { ok: true };
}
