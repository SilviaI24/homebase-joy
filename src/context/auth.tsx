import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase-browser";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      // getSession() solo lee lo guardado en el navegador, sin preguntar a
      // Supabase. Si esa sesión se cerró en otro sitio (logout en otra
      // pestaña, token revocado), el CRM creía que el usuario seguía dentro
      // mientras el servidor rechazaba todo ("Session not found"): menú
      // vacío y "No se pudo cargar esta sección" sin forma de salir (visto en
      // real el 26 sep 2026). Se valida con getUser() y, si falla, se limpia
      // la sesión local para volver a la pantalla de acceso.
      if (session) {
        const { error } = await supabase.auth.getUser();
        // Solo si Supabase rechaza la sesión; un fallo de red no debe echar
        // a nadie.
        if (error && (error.status === 401 || error.status === 403)) {
          await supabase.auth.signOut({ scope: "local" });
          session = null;
        }
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;
    const path = router.state.location.pathname;
    if (!user && path !== "/login" && path !== "/restablecer-contrasena") {
      router.navigate({ to: "/login" });
    }
  }, [loading, user, router]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/login" });
  };

  // Mientras se comprueba la sesión, no renderizar el contenido
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
