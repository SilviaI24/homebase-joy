import { getCookies } from "@tanstack/start-server-core";
import { createServerClient } from "@supabase/ssr";

function buildAuthClient(url: string, anonKey: string) {
  let cookies: Record<string, string> = {};
  try {
    cookies = getCookies();
  } catch (e) {
    console.error("[auth] getCookies() threw:", e instanceof Error ? e.message : String(e));
  }
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => Object.entries(cookies).map(([name, value]) => ({ name, value })),
      setAll: () => {},
    },
  });
}

export async function requireAuth() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("SUPABASE_URL y SUPABASE_ANON_KEY requeridos");

  const supabase = buildAuthClient(url, anonKey);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user || error) {
    throw Object.assign(new Error("No autorizado"), { statusCode: 401 });
  }
  return user;
}

export async function requireAuthClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("SUPABASE_URL y SUPABASE_ANON_KEY requeridos");

  const supabase = buildAuthClient(url, anonKey);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user || error) {
    throw Object.assign(new Error("No autorizado"), { statusCode: 401 });
  }
  return { user, supabase };
}
