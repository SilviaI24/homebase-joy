import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase-browser";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [mode, setMode]         = useState<"login" | "forgot">("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Credenciales incorrectas. Verifica tu email y contraseña.");
      setLoading(false);
      return;
    }
    router.navigate({ to: "/" });
  };

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError("Introduce tu email."); return; }
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/perfil`,
    });
    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setResetSent(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            El Sol Grupo CRM
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "login" ? "Accede con tu cuenta" : "Recuperar contraseña"}
          </p>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="space-y-1">
              <label htmlFor="email" className="block text-sm font-medium text-foreground">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                placeholder="usuario@empresa.com"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-medium text-foreground">Contraseña</label>
                <button
                  type="button"
                  onClick={() => { setMode("forgot"); setError(null); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Accediendo…" : "Acceder"}
            </button>
          </form>
        ) : (
          <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
            {resetSent ? (
              <div className="text-center space-y-3">
                <div className="text-[32px]">📨</div>
                <p className="text-sm font-semibold">Email enviado</p>
                <p className="text-sm text-muted-foreground">
                  Revisa tu bandeja de entrada en{" "}
                  <span className="font-medium text-foreground">{email}</span> y sigue
                  el enlace para crear una nueva contraseña.
                </p>
                <button
                  onClick={() => { setMode("login"); setResetSent(false); }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Volver al inicio de sesión
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgot} className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Introduce tu email y te enviaremos un enlace para restablecer tu contraseña.
                </p>
                <div className="space-y-1">
                  <label htmlFor="reset-email" className="block text-sm font-medium text-foreground">Email</label>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                    placeholder="usuario@empresa.com"
                  />
                </div>
                {error && (
                  <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {loading ? "Enviando…" : "Enviar enlace"}
                </button>
                <button
                  type="button"
                  onClick={() => { setMode("login"); setError(null); }}
                  className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancelar
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
