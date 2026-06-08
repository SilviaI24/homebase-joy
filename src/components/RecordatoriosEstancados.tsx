import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Clock, ChevronDown, ChevronUp, CheckCircle2, X } from "lucide-react";
import { updateInmueble, type Inmueble } from "@/lib/inmuebles.functions";

const DAY_MS = 1000 * 60 * 60 * 24;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY_MS);
}

type Suggestion = { tone: "warning" | "danger" | "critical"; label: string; actions: string[] };

function suggestionFor(dias: number): Suggestion {
  if (dias > 180) {
    return {
      tone: "critical",
      label: "Crítico",
      actions: [
        "Reunión con propietario para revisar estrategia",
        "Evaluar baja temporal o cambio de exclusividad",
        "Análisis comparativo de mercado (CMA)",
      ],
    };
  }
  if (dias > 120) {
    return {
      tone: "danger",
      label: "Muy estancado",
      actions: [
        "Renovar reportaje fotográfico / home staging",
        "Bajada de precio del 5-10%",
        "Contactar propietario para feedback de visitas",
      ],
    };
  }
  return {
    tone: "warning",
    label: "Estancado",
    actions: [
      "Refrescar anuncio en portales",
      "Llamar a leads en frío con perfil compatible",
      "Considerar bajada de precio del 3-5%",
    ],
  };
}

const toneStyles: Record<Suggestion["tone"], string> = {
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  danger: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
  critical: "bg-destructive/10 text-destructive border-destructive/40",
};

type Props = { inmuebles: Inmueble[]; staleDays?: number };

export function RecordatoriosEstancados({ inmuebles, staleDays = 90 }: Props) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [okFlash, setOkFlash] = useState<string | null>(null);

  const update = useServerFn(updateInmueble);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: update,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["all-inmuebles"] });
      setOkFlash(vars.data.id);
      setEditing(null);
      setNote("");
      setTimeout(() => setOkFlash(null), 2000);
    },
  });

  const estancados = useMemo(() => {
    return inmuebles
      .map((i) => ({ i, dias: daysSince(i.fechaInicio) }))
      .filter((x) => x.dias !== null && x.dias > staleDays && (x.i.estatus === "Activo" || x.i.estatus === "Prospección"))
      .sort((a, b) => (b.dias as number) - (a.dias as number));
  }, [inmuebles, staleDays]);

  if (estancados.length === 0) return null;

  const handleSave = (inm: Inmueble) => {
    const trimmed = note.trim();
    if (!trimmed) return;
    const fecha = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
    const linea = `[${fecha}] ${trimmed}`;
    const next = inm.observaciones ? `${inm.observaciones}\n${linea}` : linea;
    mutation.mutate({ data: { id: inm.id, observaciones: next } });
  };

  return (
    <div className="mb-5 rounded-xl border border-destructive/30 bg-gradient-to-br from-destructive/5 to-transparent overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-destructive/5 transition-colors"
      >
        <div className="size-9 rounded-lg bg-destructive/15 text-destructive flex items-center justify-center">
          <AlertTriangle className="size-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">
            {estancados.length} inmueble{estancados.length === 1 ? "" : "s"} estancado{estancados.length === 1 ? "" : "s"}
          </div>
          <div className="text-xs text-muted-foreground">
            Sin movimiento desde hace más de {staleDays} días. Revisa las acciones sugeridas.
          </div>
        </div>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {estancados.slice(0, 12).map(({ i, dias }) => {
            const sug = suggestionFor(dias as number);
            const isEditing = editing === i.id;
            const isOk = okFlash === i.id;
            return (
              <div key={i.id} className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to="/inmuebles/$id"
                    params={{ id: i.id }}
                    className="text-sm font-semibold hover:underline truncate min-w-0 flex-1"
                  >
                    {i.calle || "Sin dirección"} {i.numero}
                  </Link>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${toneStyles[sug.tone]}`}>
                    {sug.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="font-mono">#{i.ref}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" /> {dias}d
                  </span>
                  {i.barrio && <span className="truncate">{i.barrio}</span>}
                </div>

                <ul className="text-xs text-foreground/80 space-y-1 mt-1 pl-4 list-disc marker:text-muted-foreground">
                  {sug.actions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>

                {isEditing ? (
                  <div className="mt-1 space-y-2">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Acción realizada (llamada, bajada de precio, visita, …)"
                      className="w-full text-xs rounded-md border border-input bg-background p-2 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                      rows={2}
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSave(i)}
                        disabled={mutation.isPending || !note.trim()}
                        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
                      >
                        {mutation.isPending ? "Guardando…" : "Guardar"}
                      </button>
                      <button
                        onClick={() => { setEditing(null); setNote(""); }}
                        className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-input text-xs hover:bg-accent"
                      >
                        <X className="size-3" /> Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between mt-1">
                    <button
                      onClick={() => { setEditing(i.id); setNote(""); }}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-input bg-background text-xs font-medium hover:bg-accent"
                    >
                      Registrar seguimiento
                    </button>
                    {isOk && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" /> Guardado
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {estancados.length > 12 && (
            <div className="md:col-span-2 xl:col-span-3 text-center text-xs text-muted-foreground">
              +{estancados.length - 12} más en la columna “Estancados” del kanban.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
