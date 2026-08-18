import { createClient } from "@supabase/supabase-js";

// Returns a service-role Supabase client.
// Always call inside a server function — env vars are only bound per-request
// in serverless runtimes, so module-scope reads return undefined.
export function getSupa() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY required");

  return createClient(url, key, { auth: { persistSession: false } });
}
