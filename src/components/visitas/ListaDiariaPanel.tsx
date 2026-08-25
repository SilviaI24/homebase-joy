// M-03: extraído de src/routes/visitas.index.tsx.
import { Link } from "@tanstack/react-router";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, CheckCheck, Ban, ChevronDown, ChevronUp } from "lucide-react";
import type { VisitaFull } from "@/lib/visitas.functions";
import { fmtTime, buildDayGroups, type DayGroup, ESTADO_COLORS } from "@/lib/visitas-format";
import { updateVisitaEstado } from "@/lib/mutations.functions";

const ESTADOS_ACTIVOS = new Set(["Programada"]);

export function ListaDiaria({
  visitas,
  inmIndex,
  now,
}: {
  visitas: VisitaFull[];
  inmIndex: Map<string, { calle: string; numero: string; barrio: string }>;
  now: number;
}) {
  const [collapsedPast, setCollapsedPast] = useState(true);
  const groups = useMemo(() => buildDayGroups(visitas, now), [visitas, now]);
  const futureGroups = groups.filter((g) => g.isFuture);
  const pastGroups = groups.filter((g) => !g.isFuture).reverse();
  const pastCount = pastGroups.reduce((s, g) => s + g.items.length, 0);
  const pastVisible = collapsedPast ? pastGroups.slice(0, 5) : pastGroups;

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Sin visitas para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
      {futureGroups.map((g) => (
        <DaySection key={g.key} group={g} inmIndex={inmIndex} now={now} />
      ))}

      {pastGroups.length > 0 && (
        <>
          {/* Historial toggle row */}
          <button
            onClick={() => setCollapsedPast((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-2 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
          >
            {collapsedPast ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronUp className="size-3.5 text-muted-foreground" />
            )}
            <span className="text-[11px] font-medium text-muted-foreground">
              Historial · {pastCount} visitas
            </span>
          </button>
          {!collapsedPast &&
            pastVisible.map((g) => (
              <DaySection key={g.key} group={g} inmIndex={inmIndex} now={now} past />
            ))}
          {collapsedPast &&
            pastGroups.length > 0 &&
            /* preview: show last 3 past visits compactly */
            pastVisible
              .slice(0, 2)
              .map((g) => <DaySection key={g.key} group={g} inmIndex={inmIndex} now={now} past />)}
        </>
      )}
    </div>
  );
}

function DaySection({
  group,
  inmIndex,
  now,
  past = false,
}: {
  group: DayGroup;
  inmIndex: Map<string, { calle: string; numero: string; barrio: string }>;
  now: number;
  past?: boolean;
}) {
  return (
    <>
      {/* Separator row */}
      <div
        className={`flex items-center gap-3 px-4 py-1.5 select-none ${group.isToday ? "bg-primary/5" : "bg-muted/30"}`}
      >
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${group.isToday ? "text-primary" : "text-muted-foreground"}`}
        >
          {group.label}
        </span>
        <span
          className={`text-[10px] tabular-nums ${group.isToday ? "text-primary/70" : "text-muted-foreground/60"}`}
        >
          {group.items.length}
        </span>
      </div>
      {/* Visit rows */}
      {group.items.map((v) => (
        <VisitaRowDiaria key={v.id} v={v} inmIndex={inmIndex} now={now} past={past} />
      ))}
    </>
  );
}

function VisitaRowDiaria({
  v,
  inmIndex,
  now,
  past,
}: {
  v: VisitaFull;
  inmIndex: Map<string, { calle: string; numero: string; barrio: string }>;
  now: number;
  past: boolean;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateVisitaEstado);

  const mut = useMutation({
    mutationFn: (estado: string) => updateFn({ data: { visitaId: v.id, estado } }),
    onSuccess: async (_result, estado) => {
      await qc.invalidateQueries({ queryKey: ["visitas-all"] });
      await qc.invalidateQueries({ queryKey: ["visitas", "inmueble"] });
      toast.success(`Visita marcada como ${estado}`);
    },
    onError: (e: Error) => toast.error(e.message || "Error al actualizar"),
  });

  const inmId = v.inmuebleIds[0];
  const meta = inmId ? inmIndex.get(inmId) : null;
  const calle = meta ? `${meta.calle || ""} ${meta.numero || ""}`.trim() : "";
  const label = calle || v.actividad || "Sin dirección";
  const color = ESTADO_COLORS[v.estado] ?? "#94a3b8";
  const isActive = ESTADOS_ACTIVOS.has(v.estado);
  const pending = mut.isPending;

  const addressEl = inmId ? (
    <Link
      to="/inmuebles/$id"
      params={{ id: inmId }}
      className="truncate hover:text-primary transition-colors"
    >
      {label}
    </Link>
  ) : (
    <span className="truncate">{label}</span>
  );

  return (
    <div
      className={`flex items-center gap-3 px-4 h-10 hover:bg-accent/30 transition-colors ${past ? "opacity-70" : ""}`}
    >
      {/* Hora */}
      <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground font-medium">
        {fmtTime(v.fecha) || "—"}
      </span>

      {/* Estado dot */}
      <span
        className="size-2 rounded-full shrink-0"
        style={{ background: color }}
        title={v.estado}
      />

      {/* Dirección */}
      <span className="flex-1 min-w-0 text-xs font-medium text-foreground truncate">
        {addressEl}
      </span>

      {/* Cliente */}
      {v.clientesNombres.length > 0 && (
        <span className="hidden md:block w-36 shrink-0 text-[11px] text-muted-foreground truncate">
          {v.clientesNombres[0]}
        </span>
      )}

      {/* Estado badge (solo en historial / terminales) */}
      {!isActive && (
        <span
          className="hidden sm:inline-flex shrink-0 items-center text-[10px] font-medium rounded-full px-2 py-0.5"
          style={{ background: `${color}18`, color }}
        >
          {v.estado}
        </span>
      )}

      {/* Acciones */}
      {isActive ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => mut.mutate("Realizada")}
            disabled={pending}
            title="Realizada"
            className="size-7 flex items-center justify-center rounded-md border border-success/20 bg-success/10 text-success hover:bg-success/10 transition-colors disabled:opacity-50"
          >
            <CheckCheck className="size-3.5" />
          </button>
          <button
            onClick={() => mut.mutate("Cancelada")}
            disabled={pending}
            title="Anular"
            className="size-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
          >
            <Ban className="size-3.5" />
          </button>
        </div>
      ) : (
        inmId && <ArrowRight className="size-3.5 text-muted-foreground/50 shrink-0" />
      )}
    </div>
  );
}
