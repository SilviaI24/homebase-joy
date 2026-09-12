// M-03: extraído de src/routes/inmuebles.$id.tsx (DetailView). Barra
// flotante de guardado — solo lee el estado de guardado por props.
import { Loader2, Check, Save } from "lucide-react";

export function SaveBar({
  dirty,
  dirtyAuto,
  saveStatus,
  isPending,
  detailReady,
  onSave,
}: {
  dirty: boolean;
  dirtyAuto: boolean;
  saveStatus: "idle" | "pending" | "saved" | "error";
  isPending: boolean;
  detailReady: boolean;
  onSave: () => void;
}) {
  if (!(dirty || saveStatus === "pending" || saveStatus === "saved" || saveStatus === "error")) {
    return null;
  }
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-between gap-4 px-4 py-3 bg-card border-t border-border shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.15)] md:left-56">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {saveStatus === "pending" ? (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Guardando…
          </>
        ) : saveStatus === "saved" ? (
          <>
            <Check className="size-3.5 text-success" />{" "}
            <span className="text-success">Guardado</span>
          </>
        ) : saveStatus === "error" ? (
          <>
            <span className="size-2 rounded-full bg-destructive" /> Error al guardar
          </>
        ) : dirtyAuto ? (
          <>
            <span className="size-2 rounded-full bg-warning animate-pulse" /> Guardando en 2 s…
          </>
        ) : (
          <>
            <span className="size-2 rounded-full bg-warning" /> Cambios sin guardar — requiere
            guardado manual
          </>
        )}
      </div>
      <button
        onClick={onSave}
        disabled={isPending || !detailReady}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
      >
        <Save className="size-4" />
        Guardar ahora
      </button>
    </div>
  );
}
