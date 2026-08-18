import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { getCookies } from "@tanstack/start-server-core";

// Returns a service-role Supabase client.
// Always call inside a server function — on Cloudflare Workers, env vars
// are only bound per-request, so module-scope reads return undefined.
//
// QA fallback: when the service key's JWT ref doesn't match the URL's project ref
// (e.g. production key against a branch URL), falls back to an authenticated client
// built from the request cookies. Requires RLS policies allowing authenticated reads.
export function getSupa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY required");

  try {
    const payload = JSON.parse(
      Buffer.from(key.split(".")[1] ?? "", "base64").toString(),
    ) as { ref?: string };
    const urlRef = url.split("//")[1]?.split(".")[0];
    if (urlRef && payload.ref && payload.ref !== urlRef) {
      const anonKey = process.env.SUPABASE_ANON_KEY;
      if (!anonKey) throw new Error("SUPABASE_ANON_KEY required as fallback");
      let cookies: Record<string, string> = {};
      try {
        cookies = getCookies();
      } catch {}
      return createServerClient(url, anonKey, {
        cookies: {
          getAll: () => Object.entries(cookies).map(([name, value]) => ({ name, value })),
          setAll: () => {},
        },
      });
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes("SUPABASE_ANON_KEY")) throw e;
  }

  return createClient(url, key, { auth: { persistSession: false } });
}
