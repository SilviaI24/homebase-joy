// M-03: extraído de src/routes/inmuebles.$id.tsx (DetailView). Recibe cada
// fecha/campo y su setter por props — el estado sigue en DetailView.
import { Calendar, Check } from "lucide-react";
import { SkeletonLine } from "@/components/inmueble-detail/SkeletonLine";
import { formatDate } from "@/lib/inmueble-detail-format";

export function HistorialPanel({
  detailReady,
  fechaInicio,
  setFechaInicio,
  fechaExclusiva,
  setFechaExclusiva,
  fechaFinExclusiva,
  setFechaFinExclusiva,
  fechaReserva,
  setFechaReserva,
  fechaEscritura,
  setFechaEscritura,
  notaria,
  setNotaria,
  honorarios,
  setHonorarios,
  tipoExclusiva,
  setTipoExclusiva,
  llaves,
  setLlaves,
}: {
  detailReady: boolean;
  fechaInicio: string;
  setFechaInicio: (v: string) => void;
  fechaExclusiva: string;
  setFechaExclusiva: (v: string) => void;
  fechaFinExclusiva: string;
  setFechaFinExclusiva: (v: string) => void;
  fechaReserva: string;
  setFechaReserva: (v: string) => void;
  fechaEscritura: string;
  setFechaEscritura: (v: string) => void;
  notaria: string;
  setNotaria: (v: string) => void;
  honorarios: string;
  setHonorarios: (v: string) => void;
  tipoExclusiva: string;
  setTipoExclusiva: (v: string) => void;
  llaves: string;
  setLlaves: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="font-display text-base font-semibold mb-4 flex items-center gap-2">
        <Calendar className="size-4 text-primary" /> Historial
      </h3>
      {detailReady ? (
        <>
          <ol className="relative ml-3 space-y-5 before:absolute before:left-0 before:top-1 before:bottom-1 before:w-px before:bg-border">
            {[
              { label: "Captación / inicio", value: fechaInicio, set: setFechaInicio },
              {
                label: "Autorización exclusiva",
                value: fechaExclusiva,
                set: setFechaExclusiva,
              },
              {
                label: "Fin de exclusividad",
                value: fechaFinExclusiva,
                set: setFechaFinExclusiva,
              },
              { label: "Reserva", value: fechaReserva, set: setFechaReserva },
              { label: "Escritura", value: fechaEscritura, set: setFechaEscritura },
            ].map((ev) => {
              const done = !!ev.value;
              return (
                <li key={ev.label} className="relative pl-6">
                  <span
                    className={`absolute -left-[7px] top-0.5 inline-flex items-center justify-center size-4 rounded-full ring-2 ring-card ${
                      done ? "bg-primary text-primary-foreground" : "bg-muted border border-border"
                    }`}
                  >
                    {done && <Check className="size-2.5" />}
                  </span>
                  <div
                    className={`text-sm font-medium ${done ? "text-foreground" : "text-muted-foreground"}`}
                  >
                    {ev.label}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="date"
                      value={ev.value ? ev.value.slice(0, 10) : ""}
                      onChange={(e) => ev.set(e.target.value)}
                      className="h-7 px-2 rounded border border-input bg-background text-xs"
                    />
                    {ev.value && (
                      <span className="text-xs text-muted-foreground">{formatDate(ev.value)}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="grid grid-cols-2 gap-x-6 mt-5 pt-4 border-t border-border">
            <div className="py-2">
              <div className="text-xs uppercase tracking-[0.08em] font-medium text-muted-foreground mb-1">
                Notaría
              </div>
              <input
                type="text"
                value={notaria}
                onChange={(e) => setNotaria(e.target.value)}
                className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
              />
            </div>
            <div className="py-2">
              <div className="text-xs uppercase tracking-[0.08em] font-medium text-muted-foreground mb-1">
                Honorarios
              </div>
              <input
                type="text"
                value={honorarios}
                onChange={(e) => setHonorarios(e.target.value)}
                className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
              />
            </div>
            <div className="py-2">
              <div className="text-xs uppercase tracking-[0.08em] font-medium text-muted-foreground mb-1">
                Tipo exclusiva
              </div>
              <input
                type="text"
                value={tipoExclusiva}
                onChange={(e) => setTipoExclusiva(e.target.value)}
                className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
              />
            </div>
            <div className="py-2">
              <div className="text-xs uppercase tracking-[0.08em] font-medium text-muted-foreground mb-1">
                Llaves
              </div>
              <input
                type="text"
                value={llaves}
                onChange={(e) => setLlaves(e.target.value)}
                className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
              />
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <SkeletonLine className="w-1/2" />
          <SkeletonLine className="w-2/3" />
          <SkeletonLine className="w-1/3" />
        </div>
      )}
    </div>
  );
}
