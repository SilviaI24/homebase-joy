import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SafeImage } from "@/components/SafeImage";
import { NewInmuebleDialog } from "@/components/CreateDialogs";

import { getCategoria, CATEGORIAS, type Inmueble } from "@/lib/inmuebles.functions";
import { allInmueblesQuery } from "@/lib/queries";
import { Search, KeyRound, Home, CheckCircle2, TrendingUp, ArrowUpDown } from "lucide-react";

export const Route = createFileRoute("/alquileres/")({
  head: () => ({
    meta: [
      { title: "Alquileres · El Sol Grupo CRM" },
      { name: "description", content: "Listado de alquileres gestionados por El Sol Grupo." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(allInmueblesQuery),
  component: AlquileresPage,
  errorComponent: ({ error }) => (
    <AppShell title="Alquileres">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Error cargando alquileres: {error.message}
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell title="Alquileres">
      <div className="text-muted-foreground">Sin alquileres.</div>
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
    Activo: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    Baja: "bg-muted text-muted-foreground",
    Reservado: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    Alquilado: "bg-[var(--gold)]/20 text-[color:var(--gold-foreground,theme(colors.amber.700))]",
  };
  const cls = map[estatus] ?? "bg-secondary text-secondary-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {estatus || "—"}
    </span>
  );
}

type SortKey = "recent" | "price-asc" | "price-desc";

const DAY_MS = 1000 * 60 * 60 * 24;
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY_MS);
}

function MiniKpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "primary" | "gold" | "muted";
}) {
  const toneCls = {
    default: "bg-card",
    primary: "bg-primary/5 border-primary/20",
    gold: "bg-[var(--gold)]/10 border-[var(--gold)]/30",
    muted: "bg-muted/50",
  }[tone];
  return (
    <div className={`rounded-xl border border-border ${toneCls} p-4 flex items-start gap-3`}>
      <div className="size-9 rounded-lg bg-background border border-border flex items-center justify-center shrink-0">
        <Icon className="size-4 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
        <div className="text-xl font-bold tracking-tight truncate">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
    </div>
  );
}

function AlquileresPage() {
  const { data: all } = useSuspenseQuery(allInmueblesQuery);
  const inmuebles = all.alquileres;

  const router = useRouter();
  const [q, setQ] = useState("");
  const [estatus, setEstatus] = useState<string>("Activo");
  const [categoria, setCategoria] = useState<string>("Todas");
  const [sort, setSort] = useState<SortKey>("recent");

  const kpis = useMemo(() => {
    const activos = inmuebles.filter((i) => i.estatus === "Activo");
    const alquilados = inmuebles.filter((i) => i.estatus === "Alquilado");
    const reservados = inmuebles.filter((i) => i.estatus === "Reservado");
    const ingresosMensuales = alquilados.reduce((s, i) => s + (i.precioFinal || i.precio || 0), 0);
    const precios = activos.map((i) => i.precio || 0).filter((p) => p > 0);
    const ticketMedio = precios.length ? precios.reduce((a, b) => a + b, 0) / precios.length : 0;
    return {
      total: inmuebles.length,
      activos: activos.length,
      reservados: reservados.length,
      alquilados: alquilados.length,
      ingresosMensuales,
      ticketMedio,
    };
  }, [inmuebles]);

  const estatuses = useMemo(() => {
    const s = new Set<string>();
    inmuebles.forEach((i) => i.estatus && s.add(i.estatus));
    return ["Todos", ...Array.from(s).sort()];
  }, [inmuebles]);

  const conteoPorCategoria = useMemo(() => {
    const base = inmuebles.filter((i) => estatus === "Todos" || i.estatus === estatus);
    const map: Record<string, number> = { Todas: base.length };
    CATEGORIAS.forEach((c) => (map[c] = 0));
    map["Otros"] = 0;
    base.forEach((i) => {
      const c = getCategoria(i.tipo);
      map[c] = (map[c] ?? 0) + 1;
    });
    return map;
  }, [inmuebles, estatus]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const arr = inmuebles.filter((i: Inmueble) => {
      if (estatus !== "Todos" && i.estatus !== estatus) return false;
      if (categoria !== "Todas" && getCategoria(i.tipo) !== categoria) return false;
      if (!needle) return true;
      return (
        i.ref.toLowerCase().includes(needle) ||
        i.calle.toLowerCase().includes(needle) ||
        i.localidad.toLowerCase().includes(needle) ||
        i.barrio.toLowerCase().includes(needle) ||
        i.tipo.toLowerCase().includes(needle) ||
        i.propietario.toLowerCase().includes(needle)
      );
    });
    const sorted = [...arr];
    if (sort === "price-asc") sorted.sort((a, b) => (a.precio || 0) - (b.precio || 0));
    else if (sort === "price-desc") sorted.sort((a, b) => (b.precio || 0) - (a.precio || 0));
    else sorted.sort((a, b) => (Date.parse(b.fechaInicio || "") || 0) - (Date.parse(a.fechaInicio || "") || 0));
    return sorted;
  }, [inmuebles, q, estatus, categoria, sort]);

  const tabs: string[] = ["Todas", ...CATEGORIAS];

  return (
    <AppShell title="Alquileres">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <MiniKpi
          icon={Home}
          label="Cartera activa"
          value={String(kpis.activos)}
          hint={`${kpis.total} totales`}
          tone="primary"
        />
        <MiniKpi
          icon={KeyRound}
          label="Reservados"
          value={String(kpis.reservados)}
          hint="Pendiente firma"
        />
        <MiniKpi
          icon={CheckCircle2}
          label="Alquilados"
          value={String(kpis.alquilados)}
          tone="gold"
        />
        <MiniKpi
          icon={TrendingUp}
          label="Ingresos / mes"
          value={formatEuro(kpis.ingresosMensuales)}
          hint={`Ticket medio activo ${formatEuro(kpis.ticketMedio)}`}
        />
      </div>

      {/* Toolbar */}
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
        <select
          value={estatus}
          onChange={(e) => setEstatus(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm"
        >
          {estatuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="inline-flex items-center gap-1.5 h-9 px-2 rounded-md border border-input bg-background text-sm">
          <ArrowUpDown className="size-3.5 text-muted-foreground" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-transparent text-sm focus:outline-none"
          >
            <option value="recent">Más recientes</option>
            <option value="price-asc">Precio ↑</option>
            <option value="price-desc">Precio ↓</option>
          </select>
        </div>
        <div className="ml-auto text-sm text-muted-foreground">
          {filtered.length} de {inmuebles.length}
        </div>
        <button
          onClick={() => router.invalidate()}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent"
        >
          Refrescar
        </button>
        <NewInmuebleDialog defaultAlquiler />
      </div>

      {/* Tabs */}
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

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((i) => {
          const dias = daysSince(i.fechaInicio);
          const isNuevo = dias !== null && dias <= 7;
          return (
            <Link
              key={i.id}
              to="/inmuebles/$id"
              params={{ id: i.id }}
              className="group rounded-lg border border-border bg-card overflow-hidden flex flex-col hover:shadow-md transition-shadow"
            >
              <div className="aspect-video relative overflow-hidden">
                <SafeImage src={i.imagen} alt={i.calle || i.ref} imgClassName="group-hover:scale-[1.02] transition-transform" />
                <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
                  {statusBadge(i.estatus)}
                  {isNuevo && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-primary text-primary-foreground">
                      Nuevo
                    </span>
                  )}
                </div>
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
                    <span className="text-[11px] font-normal text-muted-foreground">/mes</span>
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
                <div className="mt-auto pt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/60">
                  {i.propietario ? (
                    <span className="truncate">
                      Prop.: <span className="text-foreground/80">{i.propietario}</span>
                    </span>
                  ) : <span />}
                  {dias !== null && (
                    <span className="shrink-0">{dias}d en cartera</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-16">
          Sin resultados para los filtros actuales.
        </div>
      )}
    </AppShell>
  );
}
