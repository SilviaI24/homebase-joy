import { getCookies } from "@tanstack/start-server-core";
import { createServerClient } from "@supabase/ssr";

function buildAuthClient(url: string, anonKey: string) {
  let cookies: Record<string, string> = {};
  try {
    cookies = getCookies();
  } catch {
    // getCookies() is only available inside a server request context
  }
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => Object.entries(cookies).map(([name, value]) => ({ name, value })),
      setAll: () => {},
    },
  });
}

export async function requireAuthClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("SUPABASE_URL y SUPABASE_ANON_KEY requeridos");

  let cookieNames: string[] = [];
  try {
    cookieNames = Object.keys(getCookies());
  } catch {
    // diagnóstico temporal 12 sep 2026
  }

  const supabase = buildAuthClient(url, anonKey);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!user || error) {
    // DIAGNÓSTICO TEMPORAL 12 sep 2026 — quitar en cuanto se identifique la
    // causa de "No autorizado" en producción con cookie presente.
    throw Object.assign(
      new Error(
        `No autorizado [diag: cookies=${JSON.stringify(cookieNames)} err=${error ? JSON.stringify({ message: error.message, status: error.status, code: (error as { code?: string }).code }) : "null"}]`,
      ),
      { statusCode: 401 },
    );
  }
  return { user, supabase };
}
