import { getStartContext } from "@tanstack/start-storage-context";
import { createServerClient } from "@supabase/ssr";

function parseCookies(header: string): { name: string; value: string }[] {
  if (!header) return [];
  return header.split(";").map((c) => {
    const idx = c.indexOf("=");
    return { name: c.slice(0, idx).trim(), value: c.slice(idx + 1).trim() };
  }).filter((c) => c.name);
}

export async function requireAuth() {
  const { request } = getStartContext();
  const cookieHeader = request.headers.get("cookie") ?? "";

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("SUPABASE_URL y SUPABASE_ANON_KEY requeridos");

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll: () => parseCookies(cookieHeader),
        setAll: () => {},
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user || error) {
    throw Object.assign(new Error("No autorizado"), { statusCode: 401 });
  }
  return user;
}
