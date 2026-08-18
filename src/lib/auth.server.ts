import { getCookies } from "@tanstack/start-server-core";
import { createServerClient } from "@supabase/ssr";

export async function requireAuth() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("SUPABASE_URL y SUPABASE_ANON_KEY requeridos");

  const cookies = getCookies();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => Object.entries(cookies).map(([name, value]) => ({ name, value })),
      setAll: () => {},
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user || error) {
    throw Object.assign(new Error("No autorizado"), { statusCode: 401 });
  }
  return user;
}
