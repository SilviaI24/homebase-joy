import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { RouteError } from "@/components/RouteError";
import { visitasQuery, seguimientosQuery, agentesQuery } from "@/lib/queries";
import type { VisitaFull } from "@/lib/visitas.functions";
import {
  Calendar,
  CalendarDays,
  Clock,
  Home,
  User,
  Phone,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Activity,
  Search,
  ChevronLeft,
  ChevronRight,
  ListFilter,
} from "lucide-react";

const searchSchema = z.object({
  tab: z.enum(["visitas", "actividad"]).optional(),
  mes: z.string().optional(),
  agente: z.string().optional(),
  estado: z.string().optional(),
  q: z.string().optional(),
});

type AgendaTab = "visitas" | "actividad";

export const Route = createFileRoute("/agenda/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Agenda · El Sol Grupo CRM" },
      {
        name: "description",
        content: "Agenda de visitas y actividad comercial.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(visitasQuery),
      context.queryClient.ensureQueryData(agentesQuery),
    ]),
  component: AgendaPage,
  errorComponent: ({ error }) => (
    <AppShell title="Agenda">
      <RouteError error={error} />
    </AppShell>
  ),
});

const TAB_CONFIG: Array<{ key: AgendaTab; label: string; icon: typeof Calendar }> = [
  { key: "visitas", label: "Visitas", icon: CalendarDays },
  { key: "actividad", label: "Actividad", icon: Activity },
];

function AgendaPage() {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab = rawSearch.tab ?? "visitas";

  return (
    <AppShell title="Agenda">
      <div className="mb-6 flex items-center gap-0 border-b border-border overflow-x-auto">
        {TAB_CONFIG.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => navigate({ search: (prev) => ({ ...prev, tab: t.key }) })}
              className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px cursor-pointer ${
                tab === t.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "visitas" && <VisitasTab />}
      {tab === "actividad" && <ActividadTab />}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VISITAS TAB
// ─────────────────────────────────────────────────────────────────────────────

const ESTADO_META: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  Programada: {
    label: "Programada",
    color: "text-warning bg-warning/10",
    icon: Clock,
  },
  Realizada: {
    label: "Realizada",
    color: "text-success bg-success/10",
    icon: CheckCircle2,
  },
  Cancelada: {
    label: "Cancelada",
    color: "text-slate-500 dark:text-slate-400 bg-slate-500/10",
    icon: XCircle,
  },
};

function estadoBadge(estado: string) {
  const m = ESTADO_META[estado];
  if (!m) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
        {estado}
      </span>
    );
  }
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium ${m.color}`}>
      <Icon className="size-2.5" /> {m.label}
    </span>
  );
}

function formatFechaMes(iso: string): string {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("es-ES", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return iso;
  }
}

function VisitasTab() {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(visitasQuery);
  const { data: agData } = useSuspenseQuery(agentesQuery);

  const now = new Date();
  const defaultMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const mes = rawSearch.mes ?? defaultMes;
  const estadoFiltro = rawSearch.estado ?? "Todas";
  const agenteFiltro = rawSearch.agente ?? "Todos";
  const q = rawSearch.q ?? "";

  const [mesActual, setMesActual] = useState(mes);

  const agentes = agData.agentes ?? [];
  const visitas = data.visitas ?? [];

  function navMes(dir: -1 | 1) {
    const [y, m] = mesActual.split("-").map(Number);
    const dt = new Date(y, m - 1 + dir, 1);
    const nuevo = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    setMesActual(nuevo);
    navigate({ search: (prev) => ({ ...prev, mes: nuevo }) });
  }

  const mesLabel = (() => {
    try {
      const [y, m] = mesActual.split("-").map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString("es-ES", {
        month: "long",
        year: "numeric",
      });
    } catch {
      return mesActual;
    }
  })();

  const visitasFiltradas = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return visitas
      .filter((v) => {
        if (!v.fecha) return false;
        if (!v.fecha.startsWith(mesActual)) return false;
        if (estadoFiltro !== "Todas" && v.estado !== estadoFiltro) return false;
        if (agenteFiltro !== "Todos" && !v.agentesIds.includes(agenteFiltro)) return false;
        if (ql) {
          const haystack = [
            ...v.clientesNombres,
            ...v.clientesTelefonos,
            ...v.inmuebleCalles,
            v.actividad,
            v.comentarios,
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(ql)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const fa = a.fecha ?? "";
        const fb = b.fecha ?? "";
        return fa < fb ? -1 : fa > fb ? 1 : 0;
      });
  }, [visitas, mesActual, estadoFiltro, agenteFiltro, q]);

  // Group by date
  const byDia = useMemo(() => {
    const map = new Map<string, VisitaFull[]>();
    for (const v of visitasFiltradas) {
      const dia = (v.fecha ?? "").slice(0, 10);
      if (!map.has(dia)) map.set(dia, []);
      map.get(dia)!.push(v);
    }
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [visitasFiltradas]);

  const totals = useMemo(() => {
    const t = { Programada: 0, Realizada: 0, Cancelada: 0 };
    visitasFiltradas.forEach((v) => {
      if (v.estado in t) (t as Record<string, number>)[v.estado]++;
    });
    return t;
  }, [visitasFiltradas]);

  return (
    <div>
      {/* Header controles */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {/* Navegación mes */}
        <div className="flex items-center gap-1 rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => navMes(-1)}
            className="p-2 hover:bg-muted transition-colors cursor-pointer"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="px-3 py-1.5 text-sm font-medium capitalize min-w-[160px] text-center">
            {mesLabel}
          </span>
          <button
            onClick={() => navMes(1)}
            className="p-2 hover:bg-muted transition-colors cursor-pointer"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* Estado filter */}
        <select
          value={estadoFiltro}
          onChange={(e) => navigate({ search: (prev) => ({ ...prev, estado: e.target.value }) })}
          className="h-9 px-2 rounded-md border border-input bg-background text-sm"
        >
          {["Todas", "Programada", "Realizada", "Cancelada"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>

        {/* Agente filter */}
        {agentes.length > 0 && (
          <select
            value={agenteFiltro}
            onChange={(e) =>
              navigate({ search: (prev) => ({ ...prev, agente: e.target.value }) })
            }
            className="h-9 px-2 rounded-md border border-input bg-background text-sm"
          >
            <option value="Todos">Todos los agentes</option>
            {agentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        )}

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => navigate({ search: (prev) => ({ ...prev, q: e.target.value }) })}
            placeholder="Buscar visita…"
            className="h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-48"
          />
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {Object.entries(totals).map(([estado, count]) => {
          const m = ESTADO_META[estado];
          if (!m) return null;
          const Icon = m.icon;
          return (
            <div
              key={estado}
              className="rounded-xl border border-border bg-card p-4 flex items-center gap-3"
            >
              <div className={`rounded-lg p-2 ${m.color}`}>
                <Icon className="size-5" />
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums">{count}</div>
                <div className="text-xs text-muted-foreground">{m.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lista de visitas agrupadas por día */}
      {byDia.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <CalendarDays className="mx-auto mb-2 size-6 opacity-50" />
          Sin visitas en {mesLabel}.
        </div>
      ) : (
        <div className="space-y-6">
          {byDia.map(([dia, visitasDia]) => (
            <div key={dia}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground capitalize">
                  {formatFechaMes(dia)}
                </span>
                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                  {visitasDia.length}
                </span>
                <hr className="flex-1 border-border" />
              </div>
              <div className="space-y-2">
                {visitasDia.map((v) => (
                  <VisitaCard key={v.id} visita={v} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VisitaCard({ visita: v }: { visita: VisitaFull }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-start gap-4">
      {/* Estado */}
      <div className="pt-0.5">{estadoBadge(v.estado)}</div>

      {/* Inmuebles */}
      <div className="flex-1 min-w-[180px]">
        {v.inmuebleCalles.length > 0 ? (
          <div className="space-y-0.5">
            {v.inmuebleCalles.map((calle, i) => (
              <div key={i} className="flex items-center gap-1 text-sm font-medium">
                <Home className="size-3 text-muted-foreground" />
                {calle} {v.inmuebleNumeros[i] ?? ""}
              </div>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Sin inmueble</span>
        )}
        {v.actividad && (
          <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{v.actividad}</p>
        )}
      </div>

      {/* Clientes */}
      {v.clientesNombres.length > 0 && (
        <div className="min-w-[150px]">
          {v.clientesNombres.map((nombre, i) => (
            <div key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
              <User className="size-3" />
              {nombre}
              {v.clientesTelefonos[i] && (
                <a
                  href={`tel:${v.clientesTelefonos[i]}`}
                  className="inline-flex items-center gap-0.5 hover:text-foreground"
                >
                  <Phone className="size-2.5" />
                  {v.clientesTelefonos[i]}
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Comentarios */}
      {v.comentarios && (
        <div className="w-full text-[11px] text-muted-foreground italic border-t border-border pt-2 mt-1">
          {v.comentarios}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVIDAD TAB (seguimientos)
// ─────────────────────────────────────────────────────────────────────────────

function ActividadTab() {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const q = rawSearch.q ?? "";

  // Use seguimientosQuery if available
  const { data: agData } = useSuspenseQuery(agentesQuery);
  const { data: vData } = useSuspenseQuery(visitasQuery);

  const agentes = agData.agentes ?? [];
  const agenteFiltro = rawSearch.agente ?? "Todos";

  // Build activity feed from visitas (realized/cancelled show as activity)
  const actFeed = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return (vData.visitas ?? [])
      .filter((v) => {
        if (v.estado === "Programada") return false;
        if (agenteFiltro !== "Todos" && !v.agentesIds.includes(agenteFiltro)) return false;
        if (ql) {
          const hay = [
            ...v.clientesNombres,
            ...v.inmuebleCalles,
            v.actividad,
            v.comentarios,
          ]
            .join(" ")
            .toLowerCase();
          if (!hay.includes(ql)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const fa = a.fecha ?? "";
        const fb = b.fecha ?? "";
        return fa > fb ? -1 : 1;
      })
      .slice(0, 150);
  }, [vData.visitas, agenteFiltro, q]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {agentes.length > 0 && (
          <select
            value={agenteFiltro}
            onChange={(e) =>
              navigate({ search: (prev) => ({ ...prev, agente: e.target.value }) })
            }
            className="h-9 px-2 rounded-md border border-input bg-background text-sm"
          >
            <option value="Todos">Todos los agentes</option>
            {agentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        )}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => navigate({ search: (prev) => ({ ...prev, q: e.target.value }) })}
            placeholder="Buscar actividad…"
            className="h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-48"
          />
        </div>
        <span className="text-xs text-muted-foreground">{actFeed.length} eventos</span>
      </div>

      {actFeed.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <Activity className="mx-auto mb-2 size-6 opacity-50" />
          Sin actividad registrada.
        </div>
      ) : (
        <div className="relative pl-6">
          <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-4">
            {actFeed.map((v) => {
              const isRealizada = v.estado === "Realizada";
              return (
                <div key={v.id} className="relative">
                  <div
                    className={`absolute -left-5 top-1.5 size-3 rounded-full border-2 border-background ${
                      isRealizada ? "bg-success" : "bg-slate-400"
                    }`}
                  />
                  <div className="rounded-xl border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {estadoBadge(v.estado)}
                      {v.fecha && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(v.fecha + "T12:00:00").toLocaleDateString("es-ES", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {v.inmuebleCalles.length > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <Home className="size-3" />
                          {v.inmuebleCalles.join(", ")}
                        </span>
                      )}
                      {v.clientesNombres.length > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          <User className="size-3" />
                          {v.clientesNombres.join(", ")}
                        </span>
                      )}
                    </div>
                    {v.actividad && (
                      <p className="mt-1.5 text-[11px] text-foreground/80 line-clamp-2">
                        {v.actividad}
                      </p>
                    )}
                    {v.comentarios && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground italic line-clamp-1">
                        {v.comentarios}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
