// M-03: extraído de src/routes/inmuebles.$id.tsx.
import { useMemo } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { CalendarDays, Mail, Phone, User } from "lucide-react";
import { NewVisitaDialog } from "@/components/CreateDialogs";
import { listVisitasByInmueble, type InmuebleDetalle } from "@/lib/inmuebles.functions";
import {
  diffDays,
  daysLabel,
  formatDate,
  formatDateTime,
  estadoVisitaColor,
} from "@/lib/inmueble-detail-format";
import { SkeletonLine } from "./SkeletonLine";

const visitasQuery = (id: string) =>
  queryOptions({
    queryKey: ["visitas", "inmueble", id],
    queryFn: () => listVisitasByInmueble({ data: { id } }),
    staleTime: 60_000,
  });

export function StatBox({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "success" | "primary" | "destructive" | "muted";
}) {
  const toneCls =
    tone === "success"
      ? "text-success"
      : tone === "primary"
        ? "text-primary"
        : tone === "destructive"
          ? "text-destructive"
          : tone === "muted"
            ? "text-muted-foreground"
            : "text-foreground";
  const accent =
    tone === "success"
      ? "before:bg-success"
      : tone === "primary"
        ? "before:bg-primary"
        : tone === "destructive"
          ? "before:bg-destructive"
          : tone === "muted"
            ? "before:bg-muted-foreground/40"
            : "before:bg-border";
  return (
    <div
      className={`relative rounded-md border border-border bg-background px-3 py-2.5 overflow-hidden before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] ${accent}`}
    >
      <div className="text-[10px] uppercase tracking-[0.08em] font-medium text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-lg font-display font-semibold leading-tight mt-0.5 tabular-nums ${toneCls}`}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

export function TiempoMercadoPanel({
  inmueble,
  detailReady,
}: {
  inmueble: InmuebleDetalle;
  detailReady: boolean;
}) {
  const todayIso = new Date().toISOString();
  const diasEnMercado = diffDays(inmueble.fechaInicio, todayIso);

  const hitos: {
    label: string;
    from: string | null;
    to: string | null;
    tone?: Parameters<typeof StatBox>[0]["tone"];
  }[] = [
    { label: "Captación → Exclusiva", from: inmueble.fechaInicio, to: inmueble.fechaExclusiva },
    {
      label: "Exclusiva → Fin exclusividad",
      from: inmueble.fechaExclusiva,
      to: inmueble.fechaFinExclusiva,
    },
    { label: "Inicio → Reserva", from: inmueble.fechaInicio, to: inmueble.fechaReserva },
    { label: "Reserva → Escritura", from: inmueble.fechaReserva, to: inmueble.fechaEscritura },
    {
      label: "Ciclo total (inicio → escritura)",
      from: inmueble.fechaInicio,
      to: inmueble.fechaEscritura,
      tone: "primary",
    },
  ];

  const completados = hitos.filter((h) => h.from && h.to);

  const statusTone: Parameters<typeof StatBox>[0]["tone"] =
    inmueble.estatus === "Vendido" || inmueble.estatus === "Alquilado"
      ? "success"
      : inmueble.estatus === "Reservado"
        ? "primary"
        : inmueble.estatus === "Baja"
          ? "destructive"
          : "default";

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="font-display text-base font-semibold mb-4">Tiempo en mercado</h3>

      {!detailReady ? (
        <div className="space-y-2">
          <SkeletonLine className="w-1/3" />
          <SkeletonLine className="w-1/2" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <StatBox
              label="Días desde alta"
              value={daysLabel(diasEnMercado)}
              tone={diasEnMercado != null && diasEnMercado > 180 ? "destructive" : statusTone}
              hint={inmueble.estatus}
            />
            <StatBox label="Estado actual" value={inmueble.estatus || "—"} tone={statusTone} />
          </div>

          {completados.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                Duración entre hitos
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {completados.map((h) => (
                  <StatBox
                    key={h.label}
                    label={h.label}
                    value={daysLabel(diffDays(h.from, h.to))}
                    tone={h.tone ?? "default"}
                    hint={`${formatDate(h.from)} → ${formatDate(h.to)}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VisitaList({
  title,
  visitas,
  muted = false,
}: {
  title: string;
  visitas: Array<{
    id: string;
    fecha: string | null;
    estado: string;
    comentarios: string;
    actividad: string;
    clientesNombres: string[];
    clientesTelefonos: string[];
    agentesMails: string[];
  }>;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">{title}</div>
      <ul className="space-y-2">
        {visitas.map((v) => (
          <li
            key={v.id}
            className={`rounded-md border border-border p-3 ${muted ? "bg-muted/30" : "bg-background"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">{formatDateTime(v.fecha)}</div>
              {v.estado && (
                <span className={`text-[11px] px-2 py-0.5 rounded ${estadoVisitaColor(v.estado)}`}>
                  {v.estado}
                </span>
              )}
            </div>
            <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {v.clientesNombres.length > 0 && (
                <div className="flex items-center gap-1">
                  <User className="size-3" />
                  <span>{v.clientesNombres.join(", ")}</span>
                </div>
              )}
              {v.clientesTelefonos.length > 0 && (
                <div className="flex items-center gap-1">
                  <Phone className="size-3" />
                  <a href={`tel:${v.clientesTelefonos[0]}`} className="hover:text-primary">
                    {v.clientesTelefonos.join(", ")}
                  </a>
                </div>
              )}
              {v.agentesMails.length > 0 && (
                <div className="flex items-center gap-1 sm:col-span-2">
                  <Mail className="size-3" />
                  <span>{v.agentesMails.join(", ")}</span>
                </div>
              )}
              {v.actividad && (
                <div className="sm:col-span-2">
                  <span className="font-medium text-foreground/80">Actividad:</span> {v.actividad}
                </div>
              )}
            </div>
            {v.comentarios && (
              <div className="mt-2 text-xs whitespace-pre-line text-foreground/80">
                {v.comentarios}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VisitasPanel({ id }: { id: string }) {
  const visitasQ = useQuery(visitasQuery(id));
  // Memoizado: `?? []` crea un array nuevo cada render si no hay datos aún,
  // lo que invalidaría el useMemo de `stats` de más abajo aunque los datos
  // reales no hayan cambiado.
  const visitas = useMemo(() => visitasQ.data?.visitas ?? [], [visitasQ.data?.visitas]);
  const now = Date.now();
  const futuras = visitas.filter((v) => v.fecha && new Date(v.fecha).getTime() >= now);
  const pasadas = visitas.filter((v) => !v.fecha || new Date(v.fecha).getTime() < now);

  const stats = useMemo(() => {
    const total = visitas.length;
    let confirmadas = 0,
      realizadas = 0,
      canceladas = 0,
      pendientes = 0;
    const clientesSet = new Set<string>();
    const agentesSet = new Set<string>();
    let lastPast: number | null = null;
    let nextFuture: number | null = null;
    const months: { label: string; count: number; key: string }[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      months.push({
        key: `${m.getFullYear()}-${m.getMonth()}`,
        label: m.toLocaleDateString("es-ES", { month: "short" }),
        count: 0,
      });
    }
    const idxByKey = new Map(months.map((m, i) => [m.key, i]));
    for (const v of visitas) {
      const e = v.estado.toLowerCase();
      if (e.includes("confirm")) confirmadas++;
      else if (e.includes("realiz")) realizadas++;
      else if (e.includes("cancel")) canceladas++;
      else if (e.includes("pend")) pendientes++;
      v.clientesNombres.forEach((c) => clientesSet.add(c));
      v.agentesMails.forEach((a) => agentesSet.add(a));
      if (v.fecha) {
        const t = new Date(v.fecha).getTime();
        if (t < now && (lastPast == null || t > lastPast)) lastPast = t;
        if (t >= now && (nextFuture == null || t < nextFuture)) nextFuture = t;
        const dt = new Date(v.fecha);
        const key = `${dt.getFullYear()}-${dt.getMonth()}`;
        const idx = idxByKey.get(key);
        if (idx != null) months[idx].count++;
      }
    }
    const efectivas = confirmadas + realizadas;
    const conversion = total > 0 ? Math.round((efectivas / total) * 100) : 0;
    const daysSince = lastPast != null ? Math.floor((now - lastPast) / 86400000) : null;
    const daysUntil = nextFuture != null ? Math.ceil((nextFuture - now) / 86400000) : null;
    const maxMonth = Math.max(1, ...months.map((m) => m.count));
    return {
      total,
      confirmadas,
      realizadas,
      canceladas,
      pendientes,
      clientes: clientesSet.size,
      agentes: agentesSet.size,
      conversion,
      efectivas,
      daysSince,
      daysUntil,
      months,
      maxMonth,
    };
  }, [visitas, now]);

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-base font-semibold flex items-center gap-2">
          <CalendarDays className="size-4" /> Visitas y actividad
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {visitasQ.isLoading
              ? "Cargando…"
              : `${visitas.length} registro${visitas.length === 1 ? "" : "s"}`}
          </span>
          <NewVisitaDialog defaultInmuebleId={id} />
        </div>
      </div>

      {visitasQ.isLoading ? (
        <div className="space-y-2">
          <SkeletonLine className="w-2/3" />
          <SkeletonLine className="w-1/2" />
        </div>
      ) : visitas.length === 0 ? (
        <div className="text-sm text-muted-foreground">Sin visitas registradas.</div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatBox label="Total" value={stats.total} />
            <StatBox
              label="Conversión"
              value={`${stats.conversion}%`}
              hint={`${stats.efectivas} efectivas`}
            />
            <StatBox label="Clientes" value={stats.clientes} />
            <StatBox label="Agentes" value={stats.agentes} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatBox label="Confirmadas" value={stats.confirmadas} tone="success" />
            <StatBox label="Realizadas" value={stats.realizadas} tone="primary" />
            <StatBox label="Pendientes" value={stats.pendientes} tone="muted" />
            <StatBox label="Canceladas" value={stats.canceladas} tone="destructive" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatBox
              label="Última visita"
              value={stats.daysSince != null ? `hace ${stats.daysSince}d` : "—"}
            />
            <StatBox
              label="Próxima visita"
              value={
                stats.daysUntil != null
                  ? stats.daysUntil === 0
                    ? "hoy"
                    : `en ${stats.daysUntil}d`
                  : "—"
              }
            />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
              Visitas últimos 6 meses
            </div>
            <div className="flex items-end gap-2 h-20">
              {stats.months.map((m) => (
                <div key={m.key} className="flex-1 flex flex-col items-center gap-1 h-full">
                  <div className="w-full flex-1 bg-muted/50 rounded-sm relative overflow-hidden">
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-primary/70 rounded-sm transition-all"
                      style={{ height: `${(m.count / stats.maxMonth) * 100}%` }}
                      title={`${m.count} visita${m.count === 1 ? "" : "s"}`}
                    />
                    {m.count > 0 && (
                      <div className="absolute top-0.5 left-0 right-0 text-center text-[10px] font-medium text-foreground/70">
                        {m.count}
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground capitalize">{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {futuras.length > 0 && <VisitaList title="Próximas" visitas={futuras} />}
          {pasadas.length > 0 && <VisitaList title="Histórico" visitas={pasadas} muted />}
        </div>
      )}
    </div>
  );
}
