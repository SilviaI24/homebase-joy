import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function RouteError({ error }: { error: Error }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-border bg-card px-6 py-10 text-center"
    >
      <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold text-foreground">No se pudo cargar esta sección</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Revisa tu conexión e inténtalo de nuevo. Si el problema continúa, contacta con el
        administrador del CRM.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Reintentar
      </button>
    </div>
  );
}
