import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { listInmuebles, getCategoria, CATEGORIAS, type Inmueble } from "@/lib/inmuebles.functions";
import { listClientes } from "@/lib/clientes.functions";
import {
  Building2,
  Users,
  TrendingUp,
  KeyRound,
  Sparkles,
  Wallet,
  CheckCircle2,
  Clock,
  ArrowRight,
  Tag,
} from "lucide-react";

const inmueblesQuery = queryOptions({
  queryKey: ["inmuebles"],
  queryFn: () => listInmuebles(),
});
const clientesQuery = queryOptions({
  queryKey: ["clientes"],
  queryFn: () => listClientes(),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · El Sol Grupo CRM" },
      { name: "description", content: "Panel comercial 360 de la inmobiliaria El Sol Grupo." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(inmueblesQuery);
    context.queryClient.ensureQueryData(clientesQuery);
  },
  component: Dashboard,
  errorComponent: ({ error }) => (
    <AppShell title="Dashboard">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Error cargando datos: {error.message}
      </div>
    </AppShell>
  ),
});

function moneyShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M €`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k €`;
  return `${v} €`;
}
function moneyFull(v: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}
function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  } catch {
    return s;
  }
}

function Dashboard() {
  const { data: inmData } = useSuspenseQuery(inmueblesQuery);
  const { data: cliData } = useSuspenseQuery(clientesQuery);

  const stats = useMemo(() => {
    const inmuebles = inmData.inmuebles;
    const byEstatus = (e: string) => inmuebles.filter((i) => i.estatus === e);
    const activos = byEstatus("Activo");
    const reservados = byEstatus("Reservado");
    const vendidos = byEstatus("Vendido");
    const valorCartera = activos.reduce((s, i) => s + (i.precio ?? 0), 0);
    const precios = activos.map((i) => i.precio).filter((p): p is number => !!p && p > 0);
    const precioMedio = precios.length ? Math.round(precios.reduce((a, b) => a + b, 0) / precios.length) : 0;

    // por categoría (sobre activos)
    const porCategoria: Record<string, number> = {};
    [...CATEGORIAS, "Otros"].forEach((c) => (porCategoria[c] = 0));
    activos.forEach((i) => {
      const c = getCategoria(i.tipo);
      porCategoria[c] = (porCategoria[c] ?? 0) + 1;
    });

    // recientes (por fecha de inicio)
    const recientes = [...inmuebles]
      .filter((i) => i.fechaInicio)
      .sort((a, b) => (b.fechaInicio ?? "").localeCompare(a.fechaInicio ?? ""))
      .slice(0, 6);

    return { inmuebles, activos, reservados, vendidos, valorCartera, precioMedio, porCategoria, recientes };
  }, [inmData]);

  const cliStats = useMemo(() => {
    const c = cliData.clientes;
    const propietarios = c.filter((x) => x.tipo === "Propietario").length;
    const compradores = c.filter((x) => x.tipo === "Comprador" || x.tipo === "Interesado Propiedades").length;
    const alquilerInt = c.filter((x) => x.tipo === "Interesado alquiler").length;
    const conConv = c.filter((x) => (x.conversaciones?.trim().length ?? 0) > 0 || (x.motivo?.trim().length ?? 0) > 0);
    return { total: c.length, propietarios, compradores, alquilerInt, leadsSilvia: conConv.length };
  }, [cliData]);

  const maxCat = Math.max(1, ...Object.values(stats.porCategoria));

  return (
    <AppShell title="Dashboard">
      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          icon={Building2}
          label="Inmuebles activos"
          value={stats.activos.length.toString()}
          hint={`${stats.inmuebles.length} en base`}
          to="/inmuebles"
          tone="primary"
        />
        <KpiCard
          icon={Wallet}
          label="Valor de cartera"
          value={moneyShort(stats.valorCartera)}
          hint={`Medio: ${moneyShort(stats.precioMedio)}`}
          tone="emerald"
        />
        <KpiCard
          icon={Users}
          label="Clientes"
          value={cliStats.total.toString()}
          hint={`${cliStats.propietarios} propietarios · ${cliStats.compradores} compradores`}
          to="/clientes"
          tone="blue"
        />
        <KpiCard
          icon={Sparkles}
          label="Leads de SilvIA"
          value={cliStats.leadsSilvia.toString()}
          hint="Conversaciones con motivo"
          to="/silvia"
          tone="violet"
        />
      </div>

      {/* Estatus breakdown + categorías */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="size-4 text-muted-foreground" /> Estado de la cartera
          </h3>
          <div className="space-y-3">
            <StatusRow label="Activos" count={stats.activos.length} total={stats.inmuebles.length} color="bg-emerald-500" />
            <StatusRow label="Reservados" count={stats.reservados.length} total={stats.inmuebles.length} color="bg-amber-500" />
            <StatusRow label="Vendidos" count={stats.vendidos.length} total={stats.inmuebles.length} color="bg-blue-500" />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Tag className="size-4 text-muted-foreground" /> Activos por categoría
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            {[...CATEGORIAS, "Otros"].map((cat) => {
              const n = stats.porCategoria[cat] ?? 0;
              const pct = (n / maxCat) * 100;
              return (
                <div key={cat}>
                  <div className="flex items-baseline justify-between text-xs mb-1">
                    <span className="text-foreground/80">{cat}</span>
                    <span className="font-semibold tabular-nums">{n}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Composición clientes + accesos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" /> Composición de clientes
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Propietarios" value={cliStats.propietarios} icon={KeyRound} />
            <MiniStat label="Compradores" value={cliStats.compradores} icon={CheckCircle2} />
            <MiniStat label="Interés alquiler" value={cliStats.alquilerInt} icon={Clock} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow">
              <Sparkles className="size-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">SilvIA tiene {cliStats.leadsSilvia} conversaciones</div>
              <div className="text-xs text-muted-foreground mt-0.5">Revisa los leads y cualifícalos.</div>
              <Link
                to="/silvia"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-700 dark:text-violet-300 hover:underline"
              >
                Ir a la bandeja <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Captaciones recientes */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" /> Captaciones recientes
          </h3>
          <Link to="/inmuebles" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            Ver todas <ArrowRight className="size-3" />
          </Link>
        </div>
        <div className="divide-y divide-border">
          {stats.recientes.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Sin captaciones recientes.</div>
          ) : (
            stats.recientes.map((i) => <RecentRow key={i.id} i={i} />)
          )}
        </div>
      </div>
    </AppShell>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  to,
  tone = "primary",
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  hint?: string;
  to?: string;
  tone?: "primary" | "emerald" | "blue" | "violet";
}) {
  const toneMap: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    blue: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
    violet: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
  };
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground font-medium">{label}</div>
        <div className={`size-8 rounded-md flex items-center justify-center ${toneMap[tone]}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </>
  );
  if (to) {
    return (
      <Link
        to={to as "/"}
        className="rounded-lg border border-border bg-card p-4 hover:border-foreground/20 hover:shadow-sm transition-all"
      >
        {inner}
      </Link>
    );
  }
  return <div className="rounded-lg border border-border bg-card p-4">{inner}</div>;
}

function StatusRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-foreground/80">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{count}</span> / {total}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Users }) {
  return (
    <div className="rounded-md border border-border bg-background/50 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3" /> {label}
      </div>
      <div className="text-lg font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function RecentRow({ i }: { i: Inmueble }) {
  return (
    <Link
      to="/inmuebles/$id"
      params={{ id: i.id }}
      className="flex items-center gap-3 px-5 py-3 hover:bg-accent/40 transition-colors"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Building2 className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">
          {i.calle || "Sin dirección"} {i.numero}
          {i.ref && <span className="ml-2 text-[11px] font-mono text-muted-foreground">#{i.ref}</span>}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {[i.barrio, i.localidad].filter(Boolean).join(" · ") || "—"} · {i.tipo || "—"}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold tabular-nums">{i.precio ? moneyFull(i.precio) : "—"}</div>
        <div className="text-[11px] text-muted-foreground">{fmtDate(i.fechaInicio)}</div>
      </div>
    </Link>
  );
}
