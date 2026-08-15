import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { RouteError } from "@/components/RouteError";
import { SafeImage } from "@/components/SafeImage";
import { NewInmuebleDialog } from "@/components/CreateDialogs";
import { RecordatoriosEstancados } from "@/components/RecordatoriosEstancados";
import { Pagination } from "@/components/pagination/Pagination";
import { getCategoria, CATEGORIAS, type Inmueble } from "@/lib/inmuebles.functions";
import { inmueblesPageQuery, agentesQuery } from "@/lib/queries";
import { cleanRef } from "@/lib/format";
import { Search, LayoutGrid, Columns3, Clock, AlertTriangle, Hourglass } from "lucide-react";

const STALE_DAYS = 90;
const DAY_MS = 1000 * 60 * 60 * 24;
const PAGE_SIZE = 48;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY_MS);
}

type KanbanCol = "Activos" | "Reservados" | "Estancados";
const KANBAN_COLS: { key: KanbanCol; label: string; tone: string; icon: any }[] = [
  {
    key: "Activos",
    label: "Activos",
    tone: "border-emerald-500/40 bg-emerald-500/5",
    icon: LayoutGrid,
  },
  {
    key: "Reservados",
    label: "Reservados",
    tone: "border-amber-500/40 bg-amber-500/5",
    icon: Clock,
  },
  {
    key: "Estancados",
    label: `Estancados (>${STALE_DAYS}d)`,
    tone: "border-destructive/40 bg-destructive/5",
    icon: AlertTriangle,
  },
];

function classifyKanban(i: Inmueble): KanbanCol | null {
  const e = i.estatus;
  if (e === "Reservado") return "Reservados";
  if (e === "Activo") {
    const d = daysSince(i.fechaInicio);
    if (d !== null && d > STALE_DAYS) return "Estancados";
    return "Activos";
  }
  return null;
}

type Section = "venta" | "prospectos" | "historico";

const SECTION_ESTATUS: Record<Section, string[]> = {
  venta: ["Activo", "Reservado"],
  prospectos: ["Prospección"],
  historico: ["Vendido", "Baja"],
};

const SECTION_LABELS: Record<Section, string> = {
  venta: "Cartera · Venta",
  prospectos: "Inmuebles en prospección",
  historico: "Histórico",
};

export const Route = createFileRoute("/inmuebles/")({
  validateSearch: (
    s: Record<string, unknown>,
  ): {
    page?: number;
    section?: Section;
    q?: string;
    categoria?: string;
    agente?: string;
    view?: "grid" | "kanban";
  } => ({
    page: typeof s.page === "number" && s.page >= 1 ? Math.floor(s.page) : undefined,
    section: (["venta", "prospectos", "historico"] as Section[]).includes(s.section as Section)
      ? (s.section as Section)
      : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
    categoria: typeof s.categoria === "string" ? s.categoria : undefined,
    agente: typeof s.agente === "string" ? s.agente : undefined,
    view: s.view === "kanban" ? "kanban" : s.view === "grid" ? "grid" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Inmuebles · El Sol Grupo CRM" },
      { name: "description", content: "Listado de inmuebles gestionados por El Sol Grupo." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        inmueblesPageQuery({
          page: 1,
          pageSize: PAGE_SIZE,
          statuses: SECTION_ESTATUS.venta,
          q: "",
          categoria: "Todas",
          agente: "Todos",
        }),
      ),
      context.queryClient.ensureQueryData(agentesQuery),
    ]),
  component: InmueblesPage,
  errorComponent: ({ error }) => (
    <AppShell title="Inmuebles">
      <RouteError error={error} />
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
    Activo: "bg-emerald-600 text-white border-emerald-700",
    Baja: "bg-muted text-foreground border-border",
    Reservado: "bg-amber-500 text-white border-amber-600",
    Vendido: "bg-blue-600 text-white border-blue-700",
  };
  const cls = map[estatus] ?? "bg-secondary text-secondary-foreground border-border";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm ${cls}`}
    >
      {estatus || "—"}
    </span>
  );
}

function prospectoBadge(publicacion: string) {
  if (publicacion !== "PROSPECTO") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/50 bg-violet-500/20 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:text-violet-400 shadow-sm">
      <Hourglass className="size-3" />
      Prospecto
    </span>
  );
}

function InmueblesPage() {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();

  // Apply defaults for optional search params.
  const search = {
    page: rawSearch.page ?? 1,
    section: rawSearch.section ?? ("venta" as Section),
    q: rawSearch.q ?? "",
    categoria: rawSearch.categoria ?? "Todas",
    agente: rawSearch.agente ?? "Todos",
    view: rawSearch.view ?? ("grid" as "grid" | "kanban"),
  };

  const statuses = SECTION_ESTATUS[search.section];

  const { data, isFetching } = useQuery(
    inmueblesPageQuery({
      page: search.page,
      pageSize: PAGE_SIZE,
      statuses,
      q: search.q,
      categoria: search.categoria,
      agente: search.agente,
    }),
  );

  const { data: agentesData } = useSuspenseQuery(agentesQuery);

  const inmuebles = data?.inmuebles ?? [];
  const total = data?.total ?? 0;
  const sectionTotals = data?.sectionTotals ?? { venta: 0, prospectos: 0, historico: 0 };

  const agentNames = useMemo(
    () => ["Todos", "Sin asignar", ...agentesData.agentes.map((a) => a.nombre).sort()],
    [agentesData.agentes],
  );

  function goPage(p: number) {
    navigate({ search: (prev) => ({ ...prev, page: p }) });
  }

  function changeSection(s: Section) {
    navigate({
      search: (prev) => ({
        ...prev,
        section: s,
        page: 1,
        categoria: "Todas",
        view: s !== "venta" && prev.view === "kanban" ? "grid" : prev.view,
      }),
    });
  }

  function changeCategoria(c: string) {
    navigate({ search: (prev) => ({ ...prev, categoria: c, page: 1 }) });
  }

  function changeAgente(a: string) {
    navigate({ search: (prev) => ({ ...prev, agente: a, page: 1 }) });
  }

  function changeQ(q: string) {
    navigate({ search: (prev) => ({ ...prev, q, page: 1 }) });
  }

  function changeView(v: "grid" | "kanban") {
    navigate({ search: (prev) => ({ ...prev, view: v }) });
  }

  const tabs: string[] = ["Todas", ...CATEGORIAS, "Otros"];
  const showKanban = search.section === "venta";

  const kanbanGroups = useMemo(() => {
    const groups: Record<KanbanCol, Inmueble[]> = {
      Activos: [],
      Reservados: [],
      Estancados: [],
    };
    inmuebles.forEach((i) => {
      const col = classifyKanban(i);
      if (col) groups[col].push(i);
    });
    (Object.keys(groups) as KanbanCol[]).forEach((k) => {
      const withTs = groups[k].map((i) => ({
        i,
        t: i.fechaInicio ? Date.parse(i.fechaInicio) : Infinity,
      }));
      withTs.sort((a, b) => a.t - b.t);
      groups[k] = withTs.map((x) => x.i);
    });
    return groups;
  }, [inmuebles]);

  return (
    <AppShell title="Inmuebles">
      <>
        {/* ── Section tabs ── */}
        <div className="flex gap-1 mb-5 border-b border-border pb-3">
          {(["venta", "prospectos", "historico"] as Section[]).map((s) => {
            const active = search.section === s;
            const count =
              s === "venta"
                ? sectionTotals.venta
                : s === "prospectos"
                  ? sectionTotals.prospectos
                  : sectionTotals.historico;
            return (
              <button
                key={s}
                onClick={() => changeSection(s)}
                className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-2 ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {SECTION_LABELS[s]}
                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded-full ${
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={search.q}
              onChange={(e) => changeQ(e.target.value)}
              placeholder="Buscar por ref, calle, barrio…"
              className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={search.agente}
            onChange={(e) => changeAgente(e.target.value)}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm max-w-[180px]"
            title="Filtrar por agente asignado"
          >
            {agentNames.map((a) => (
              <option key={a} value={a}>
                {a === "Todos" ? "Todos los agentes" : a}
              </option>
            ))}
          </select>
          <div className="inline-flex h-9 rounded-md border border-input bg-background overflow-hidden">
            <button
              onClick={() => changeView("grid")}
              className={`px-3 text-xs font-medium inline-flex items-center gap-1.5 ${search.view === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
              title="Vista en cuadrícula"
            >
              <LayoutGrid className="size-3.5" /> Lista
            </button>
            {showKanban && (
              <button
                onClick={() => changeView("kanban")}
                className={`px-3 text-xs font-medium inline-flex items-center gap-1.5 border-l border-input ${search.view === "kanban" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                title="Vista kanban"
              >
                <Columns3 className="size-3.5" /> Kanban
              </button>
            )}
          </div>
          <button
            onClick={() => router.invalidate()}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent"
          >
            Refrescar
          </button>
          <NewInmuebleDialog />
        </div>

        {/* ── Category sub-tabs ── */}
        <div className="flex flex-wrap gap-1.5 mb-5 border-b border-border pb-2">
          {tabs.map((t) => {
            const active = search.categoria === t;
            return (
              <button
                key={t}
                onClick={() => changeCategoria(t)}
                className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground/70 hover:bg-accent"
                }`}
              >
                <span>{t}</span>
              </button>
            );
          })}
        </div>

        {search.view === "grid" && search.section === "venta" && (
          <RecordatoriosEstancados inmuebles={inmuebles} staleDays={STALE_DAYS} />
        )}

        {search.view === "grid" ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {inmuebles.map((i) => (
                <Link
                  key={i.id}
                  to="/inmuebles/$id"
                  params={{ id: i.id }}
                  className="group overflow-hidden rounded-lg border border-border bg-card flex flex-col shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="aspect-video relative overflow-hidden">
                    <SafeImage
                      src={i.imagen}
                      alt={i.calle || i.ref}
                      imgClassName="group-hover:scale-[1.02] transition-transform"
                    />
                    <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                      {statusBadge(i.estatus)}
                      {prospectoBadge(i.publicacion)}
                    </div>
                    {i.ref && (
                      <div className="absolute top-2 right-2 z-10 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-mono font-semibold text-foreground shadow-sm">
                        #{cleanRef(i.ref)}
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
                  </div>
                  <div className="p-4 flex flex-col gap-2 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-semibold text-sm truncate min-w-0 flex-1">
                        {i.calle || "Sin dirección"}{" "}
                        {i.numero && (
                          <span className="text-muted-foreground font-normal">{i.numero}</span>
                        )}
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
                    <div className="mt-auto border-t border-border pt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                      {i.propietario ? (
                        <span className="truncate">
                          Prop.:{" "}
                          <span className="text-foreground font-medium">{i.propietario}</span>
                        </span>
                      ) : (
                        <span />
                      )}
                      {(() => {
                        const d = daysSince(i.fechaInicio);
                        if (d === null) return null;
                        const cls =
                          d > 90
                            ? "bg-destructive/15 text-destructive"
                            : d > 30
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              : "bg-muted text-muted-foreground";
                        return (
                          <span
                            className={`shrink-0 px-1.5 py-0.5 rounded-full font-medium ${cls}`}
                          >
                            {d}d
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            {inmuebles.length === 0 && !isFetching && (
              <div className="text-center text-sm text-muted-foreground py-16">
                Sin resultados para los filtros actuales.
              </div>
            )}
            <Pagination
              page={search.page}
              pageSize={PAGE_SIZE}
              total={total}
              onPage={goPage}
              isFetching={isFetching}
              className="mt-2"
            />
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {KANBAN_COLS.map(({ key, label, tone, icon: Icon }) => {
                const items = kanbanGroups[key];
                return (
                  <div
                    key={key}
                    className={`rounded-lg border ${tone} flex flex-col min-h-[300px]`}
                  >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <Icon className="size-4" />
                        <span>{label}</span>
                      </div>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-background/80 border border-border/60">
                        {items.length}
                      </span>
                    </div>
                    <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[70vh]">
                      {items.length === 0 && (
                        <div className="text-center text-xs text-muted-foreground py-6">Vacío</div>
                      )}
                      {items.map((i) => {
                        const dias = daysSince(i.fechaInicio);
                        const isStale = key === "Estancados";
                        return (
                          <Link
                            key={i.id}
                            to="/inmuebles/$id"
                            params={{ id: i.id }}
                            className="block rounded-md border border-border bg-card hover:shadow-md transition-shadow p-2.5"
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="size-12 shrink-0 rounded overflow-hidden bg-muted">
                                <SafeImage src={i.imagen} alt={i.calle || i.ref} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-2">
                                  <h4 className="text-xs font-semibold truncate">
                                    {i.calle || "Sin dirección"} {i.numero}
                                  </h4>
                                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                                    #{cleanRef(i.ref)}
                                  </span>
                                </div>
                                <div className="text-[11px] text-muted-foreground truncate">
                                  {[i.barrio, i.localidad].filter(Boolean).join(" · ") || "—"}
                                </div>
                                <div className="flex items-center justify-between mt-1 gap-2">
                                  <span className="text-xs font-semibold text-primary">
                                    {formatEuro(i.precio)}
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {i.publicacion === "PROSPECTO" && (
                                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-400 border border-violet-500/30 inline-flex items-center gap-0.5">
                                        <Hourglass className="size-2.5" />
                                        Prospecto
                                      </span>
                                    )}
                                    {dias !== null && (
                                      <span
                                        className={`text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${
                                          isStale
                                            ? "bg-destructive/15 text-destructive"
                                            : "bg-muted text-muted-foreground"
                                        }`}
                                      >
                                        <Clock className="size-2.5" />
                                        {dias}d
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <Pagination
              page={search.page}
              pageSize={PAGE_SIZE}
              total={total}
              onPage={goPage}
              isFetching={isFetching}
              className="mt-4"
            />
          </>
        )}
      </>
    </AppShell>
  );
}
