import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase-browser";
import { validatePasswordReset, executePasswordUpdate } from "@/lib/password-reset";

export const Route = createFileRoute("/restablecer-contrasena")({
  component: RestablecerContrasenaPage,
});

type PageState = "detecting" | "ready" | "submitting" | "success" | "no-session";

function RestablecerContrasenaPage() {
  const router = useRouter();
  const [state, setState] = useState<PageState>("detecting");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && !settled.current) {
        settled.current = true;
        setState("ready");
      }
    });

    const timer = setTimeout(() => {
      if (!settled.current) {
        settled.current = true;
        setState("no-session");
      }
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  // Auto-redirect after success
  useEffect(() => {
    if (state !== "success") return;
    const timer = setTimeout(() => {
      router.navigate({ to: "/login" });
    }, 2500);
    return () => clearTimeout(timer);
  }, [state, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    setUpdateError(null);

    const validation = validatePasswordReset(newPass, confirm);
    if (!validation.ok) {
      setValidationError(validation.reason);
      return;
    }

    setState("submitting");
    const result = await executePasswordUpdate(newPass, supabase.auth);

    if (!result.ok) {
      setState("ready");
      setUpdateError(result.reason);
      setNewPass("");
      setConfirm("");
      return;
    }

    setState("success");
  };

  if (state === "detecting") {
    return (
      <PageShell>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Verificando enlace…</p>
        </div>
      </PageShell>
    );
  }

  if (state === "no-session") {
    return (
      <PageShell>
        <div className="text-center space-y-3">
          <p className="text-sm font-semibold text-destructive">Enlace no válido o expirado</p>
          <p className="text-sm text-muted-foreground">
            El enlace de restablecimiento ha caducado o ya fue utilizado. Solicita uno nuevo desde
            la pantalla de inicio de sesión.
          </p>
          <button
            type="button"
            onClick={() => router.navigate({ to: "/login" })}
            className="text-sm text-primary hover:underline transition-colors"
          >
            Volver al inicio de sesión
          </button>
        </div>
      </PageShell>
    );
  }

  if (state === "success") {
    return (
      <PageShell>
        <div className="text-center space-y-3">
          <div className="text-3xl">✓</div>
          <p className="text-sm font-semibold text-foreground">Contraseña actualizada</p>
          <p className="text-sm text-muted-foreground">
            Tu contraseña ha sido cambiada. Serás redirigido al inicio de sesión.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Introduce tu nueva contraseña. Mínimo 8 caracteres.
        </p>

        <div className="space-y-1">
          <label htmlFor="new-pass" className="block text-sm font-medium text-foreground">
            Nueva contraseña
          </label>
          <input
            id="new-pass"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPass}
            onChange={(e) => {
              setNewPass(e.target.value);
              setValidationError(null);
            }}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
            placeholder="••••••••"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="confirm-pass" className="block text-sm font-medium text-foreground">
            Confirmar contraseña
          </label>
          <input
            id="confirm-pass"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setValidationError(null);
            }}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
            placeholder="••••••••"
          />
        </div>

        {validationError && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {validationError}
          </p>
        )}

        {updateError && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {updateError}
          </p>
        )}

        <button
          type="submit"
          disabled={state === "submitting"}
          className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "submitting" ? "Actualizando…" : "Establecer nueva contraseña"}
        </button>
      </form>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">El Sol Grupo CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">Restablecer contraseña</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
