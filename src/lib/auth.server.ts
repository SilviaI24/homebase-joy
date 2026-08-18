import { getCookies } from "@tanstack/start-server-core";
import { createServerClient } from "@supabase/ssr";

export async function requireAuth() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("SUPABASE_URL y SUPABASE_ANON_KEY requeridos");

  // --- DIAG: capturar cookies y posibles errores ---
  let cookies: Record<string, string> = {};
  let cookieError: string | null = null;
  try {
    cookies = getCookies();
  } catch (e) {
    cookieError = e instanceof Error ? e.message : String(e);
    console.error("[auth] getCookies() threw:", cookieError);
  }
  const cookieNames = Object.keys(cookies);
  const hasSbToken = cookieNames.some((n) => n.includes("sb-") && n.includes("auth-token"));
  console.error("[auth] cookies:", cookieNames.length, cookieNames.join("|"), "hasSbToken:", hasSbToken, "url:", url?.slice(0, 40));
  // --- /DIAG ---

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => Object.entries(cookies).map(([name, value]) => ({ name, value })),
      setAll: () => {},
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  const diagMsg = cookieError
    ? `getCookies error: ${cookieError}`
    : `cookies(${cookieNames.length}): [${cookieNames.join(",")}] hasSbToken:${hasSbToken}`;
  console.error("[auth] getUser result:", user ? `uid=${user.id}` : "null", "error:", error?.message);
  if (!user || error) {
    throw Object.assign(new Error(`No autorizado — ${diagMsg}`), { statusCode: 401 });
  }
  return user;
}
