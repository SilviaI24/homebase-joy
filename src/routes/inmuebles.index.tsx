import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SafeImage } from "@/components/SafeImage";
import { NewInmuebleDialog } from "@/components/CreateDialogs";

import { getCategoria, CATEGORIAS, type Inmueble } from "@/lib/inmuebles.functions";
import { allInmueblesQuery } from "@/lib/queries";
import { Search, LayoutGrid, Columns3, Clock, AlertTriangle } from "lucide-react";

const STALE_DAYS = 90;
const DAY_MS = 1000 * 60 * 60 * 24;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY_MS);
}

type KanbanCol = "Activos" | "Reservados" | "Cerrados" | "Estancados";
const KANBAN_COLS: { key: KanbanCol; label: string; tone: string; icon: any }[] = [
  { key: "Activos", label: "Activos", tone: "border-emerald-500/40 bg-emerald-500/5", icon: LayoutGrid },
  { key: "Reservados", label: "Reservados", tone: "border-amber-500/40 bg-amber-500/5", icon: Clock },
  { key: "Cerrados", label: "Cerrados", tone: "border-blue-500/40 bg-blue-500/5", icon: Columns3 },
  { key: "Estancados", label: `Estancados (>${STALE_DAYS}d)`, tone: "border-destructive/40 bg-destructive/5", icon: AlertTriangle },
];

function classifyKanban(i: Inmueble): KanbanCol | null {
  const e = i.estatus;
  if (e === "Reservado") return "Reservados";
  if (e === "Vendido" || e === "Alquilado") return "Cerrados";
  if (e === "Activo" || e === "Prospección") {
    const d = daysSince(i.fechaInicio);
    if (d !== null && d > STALE_DAYS) return "Estancados";
    return "Activos";
  }
  return null;
}


export const Route = createFileRoute("/inmuebles/")({
  head: () => ({
    meta: [
      { title: "Inmuebles · El Sol Grupo CRM" },
      { name: "description", content: "Listado de inmuebles gestionados por El Sol Grupo." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(allInmueblesQuery),
  component: InmueblesPage,
  errorComponent: ({ error }) => (
    <AppShell title="Inmuebles">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Error cargando inmuebles: {error.message}
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell title="Inmuebles">
      <div className="text-muted-foreground">Sin inmuebles.</div>
    </AppShell>
  ),
});

function formatEuro(n: number | null) {
  if (n == null || n === 0) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function statusBadge(estatus: string) {
  const map: Record<string, string> = {
    Activo: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    Baja: "bg-muted text-muted-foreground",
    Reservado: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    Vendido: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  };
  const cls = map[estatus] ?? "bg-secondary text-secondary-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {estatus || "—"}
    </span>
  );
}

function InmueblesPage() {
  const { data: all } = useSuspenseQuery(allInmueblesQuery);
  const data = { inmuebles: all.inmuebles };

  const router = useRouter();
  const [q, setQ] = useState("");
  const [estatus, setEstatus] = useState<string>("Activo");
  const [categoria, setCategoria] = useState<string>("Todas");
  const [view, setView] = useState<"grid" | "kanban">("grid");

  const estatuses = useMemo(() => {
    const s = new Set<string>();
    data.inmuebles.forEach((i) => i.estatus && s.add(i.estatus));
    return ["Todos", ...Array.from(s).sort()];
  }, [data.inmuebles]);

  const conteoPorCategoria = useMemo(() => {
    const base = data.inmuebles.filter((i) => estatus === "Todos" || i.estatus === estatus);
    const map: Record<string, number> = { Todas: base.length };
    CATEGORIAS.forEach((c) => (map[c] = 0));
    map["Otros"] = 0;
    base.forEach((i) => {
      const c = getCategoria(i.tipo);
      map[c] = (map[c] ?? 0) + 1;
    });
    return map;
  }, [data.inmuebles, estatus]);

  const matchesSearch = (i: Inmueble, needle: string) => {
    if (!needle) return true;
    return (
      i.ref.toLowerCase().includes(needle) ||
      i.calle.toLowerCase().includes(needle) ||
      i.localidad.toLowerCase().includes(needle) ||
      i.barrio.toLowerCase().includes(needle) ||
      i.tipo.toLowerCase().includes(needle) ||
      i.propietario.toLowerCase().includes(needle)
    );
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.inmuebles.filter((i: Inmueble) => {
      if (estatus !== "Todos" && i.estatus !== estatus) return false;
      if (categoria !== "Todas" && getCategoria(i.tipo) !== categoria) return false;
      return matchesSearch(i, needle);
    });
  }, [data.inmuebles, q, estatus, categoria]);

  const kanbanGroups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const groups: Record<KanbanCol, Inmueble[]> = {
      Activos: [], Reservados: [], Cerrados: [], Estancados: [],
    };
    data.inmuebles.forEach((i) => {
      if (categoria !== "Todas" && getCategoria(i.tipo) !== categoria) return;
      if (!matchesSearch(i, needle)) return;
      const col = classifyKanban(i);
      if (col) groups[col].push(i);
    });
    // Sort oldest first by fechaInicio
    (Object.keys(groups) as KanbanCol[]).forEach((k) => {
      groups[k].sort((a, b) => {
        const da = Date.parse(a.fechaInicio || "") || Infinity;
        const db = Date.parse(b.fechaInicio || "") || Infinity;
        return da - db;
      });
    });
    return groups;
  }, [data.inmuebles, q, categoria]);

  const tabs: string[] = ["Todas", ...CATEGORIAS];

  return (
    <AppShell title="Inmuebles">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por ref, calle, barrio…"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {view === "grid" && (
          <select
            value={estatus}
            onChange={(e) => setEstatus(e.target.value)}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm"
          >
            {estatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        <div className="inline-flex h-9 rounded-md border border-input bg-background overflow-hidden">
          <button
            onClick={() => setView("grid")}
            className={`px-3 text-xs font-medium inline-flex items-center gap-1.5 ${view === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
            title="Vista en cuadrícula"
          >
            <LayoutGrid className="size-3.5" /> Lista
          </button>
          <button
            onClick={() => setView("kanban")}
            className={`px-3 text-xs font-medium inline-flex items-center gap-1.5 border-l border-input ${view === "kanban" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
            title="Vista kanban"
          >
            <Columns3 className="size-3.5" /> Kanban
          </button>
        </div>
        <div className="ml-auto text-sm text-muted-foreground">
          {view === "grid"
            ? `${filtered.length} de ${data.inmuebles.length}`
            : `${kanbanGroups.Activos.length + kanbanGroups.Reservados.length + kanbanGroups.Cerrados.length + kanbanGroups.Estancados.length} inmuebles`}
        </div>
        <button
          onClick={() => router.invalidate()}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent"
        >
          Refrescar
        </button>
        <NewInmuebleDialog />
      </div>


      <div className="flex flex-wrap gap-1.5 mb-5 border-b border-border pb-2">
        {tabs.map((t) => {
          const active = categoria === t;
          const count = conteoPorCategoria[t] ?? 0;
          return (
            <button
              key={t}
              onClick={() => setCategoria(t)}
              className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/70 hover:bg-accent"
              }`}
            >
              <span>{t}</span>
              <span
                className={`text-[10px] leading-none px-1.5 py-0.5 rounded-full ${
                  active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((i) => (
          <Link
            key={i.id}
            to="/inmuebles/$id"
            params={{ id: i.id }}
            className="group rounded-lg border border-border bg-card overflow-hidden flex flex-col hover:shadow-md transition-shadow"
          >
            <div className="aspect-video relative overflow-hidden">
              <SafeImage src={i.imagen} alt={i.calle || i.ref} imgClassName="group-hover:scale-[1.02] transition-transform" />
              <div className="absolute top-2 left-2 z-10">{statusBadge(i.estatus)}</div>
              {i.ref && (
                <div className="absolute top-2 right-2 z-10 text-[11px] font-mono bg-background/90 text-foreground border border-border/60 backdrop-blur px-1.5 py-0.5 rounded shadow-sm">
                  #{i.ref}
                </div>
              )}
            </div>
            <div className="p-4 flex flex-col gap-2 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold text-sm truncate min-w-0 flex-1">
                  {i.calle || "Sin dirección"} {i.numero && <span className="text-muted-foreground font-normal">{i.numero}</span>}
                </h3>
                <div className="text-base font-semibold text-primary whitespace-nowrap shrink-0">
                  {formatEuro(i.precio)}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {[i.barrio, i.localidad].filter(Boolean).join(" · ") || "—"}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                {i.tipo && <span>{i.tipo}</span>}
                {i.habitaciones && <span>{i.habitaciones} hab.</span>}
                {i.banos && <span>{i.banos} baños</span>}
                {i.superficie && <span>{i.superficie} m²</span>}
              </div>
              {i.propietario && (
                <div className="mt-auto pt-2 text-[11px] text-muted-foreground border-t border-border/60">
                  Propietario: <span className="text-foreground/80">{i.propietario}</span>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-16">
          Sin resultados para los filtros actuales.
        </div>
      )}
    </AppShell>
  );
}
