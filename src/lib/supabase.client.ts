import { createBrowserClient } from "@supabase/ssr";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error("VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY son requeridos");
}

// createBrowserClient guarda la sesión en cookies (además de localStorage),
// lo que permite a los server functions verificar la autenticación del usuario.
export const supabase = createBrowserClient(url, anonKey);
