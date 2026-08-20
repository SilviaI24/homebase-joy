import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, lazy, Suspense } from "react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { RouteError } from "@/components/RouteError";
import { type Inmueble } from "@/lib/inmuebles.functions";
import {
  dashboardStatsQuery,
  clientesQueryOpts,
  visitasQuery,
  leadsQueryOpts,
  insightsQuery,
  statsQuery,
  operacionesQuery,
  myRoleQuery,
} from "@/lib/queries";
import type { LeadInsight } from "@/lib/clientes.functions";
import { cleanRef } from "@/lib/format";
import type { LucideIcon } from "lucide-react";
import {
  TrendingUp,
  TrendingDown,
  Sparkles,
  ArrowRight,
  Users,
  UserRound,
  HandCoins,
  CalendarCheck,
  MapPin,
  Home,
  CalendarDays,
  CheckCircle2,
  Flame,
  BellOff,
  Banknote,
} from "lucide-react";

const EvolucionChart = lazy(() => import("@/components/EvolucionChart"));
const VisitasAnalytics = lazy(() => import("@/components/VisitasAnalytics"));

type VisRow = {
  id: string;
  fecha: string | null;
  estado: string;
  inmuebleIds?: string[];
  inmuebleCalles?: string[];
  inmuebleNumeros?: string[];
};

const clientesQuery = clientesQueryOpts;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · El Sol Grupo CRM" },
      { name: "description", content: "Panel comercial 360 de la inmobiliaria El Sol Grupo." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(dashboardStatsQuery).catch(() => {});
    context.queryClient.ensureQueryData(clientesQuery).catch(() => {});
    context.queryClient.ensureQueryData(visitasQuery).catch(() => {});
    context.queryClient.ensureQueryData(leadsQueryOpts).catch(() => {});
    context.queryClient.ensureQueryData(insightsQuery).catch(() => {});
    context.queryClient.ensureQueryData(statsQuery).catch(() => {});
    context.queryClient.ensureQueryData(operacionesQuery).catch(() => {});
    context.queryClient.ensureQueryData(myRoleQuery).catch(() => {});
  },
  component: Dashboard,
  errorComponent: ({ error }) => (
    <AppShell title="Dashboard">
      <RouteError error={error} />
    </AppShell>
  ),
});

function moneyShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M €`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k €`;
  return `${v} €`;
}
function moneyFull(v: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}
function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  } catch {
    return s;
  }
}
function calcDelta(cur: number, prev: number): number | null {
  if (prev === 0) return cur > 0 ? 100 : null;
  return Math.round(((cur - prev) / prev) * 100);
}

const ANALYTICS_PALETTE = [
  "#c9a94a",
  "#60a5fa",
  "#34d399",
  "#f472b6",
  "#a78bfa",
  "#fb923c",
  "#38bdf8",
  "#4ade80",
];

function fmtMes(mes: string) {
  const [y, m] = mes.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("es-ES", {
    month: "short",
    year: "2-digit",
  });
}

function Dashboard() {
  const { data: dashStats } = useSuspenseQuery(dashboardStatsQuery);
  const { data: cliData } = useSuspenseQuery(clientesQuery);
  const { data: visData } = useSuspenseQuery(visitasQuery);
  const { data: leadsData } = useSuspenseQuery(leadsQueryOpts);
  const { data: insights } = useSuspenseQuery(insightsQuery);
  const { data: statsData } = useSuspenseQuery(statsQuery);
  const { data: opsData } = useSuspenseQuery(operacionesQuery);
  const { data: myRole } = useSuspenseQuery(myRoleQuery);

  const leadsCount = leadsData.clientes.length;

  // M-01-bis: los agregados (conteos, serie de 12 meses, comisiones, pulso,
  // zonas, cartera por tipo) ya vienen calculados desde SQL
  // (dashboard_inmuebles_stats, ver dashboardStatsQuery) en vez de traer las
  // 5.817 filas de properties para sumar aquí. captDelta/sparkCapt siguen
  // siendo derivaciones puras de la serie, no hace falta pedirlas al server.
  const stats = useMemo(() => {
    const seriesData = dashStats.serie;
    const lastCapt = seriesData[seriesData.length - 1]?.Captaciones ?? 0;
    const prevCapt = seriesData[seriesData.length - 2]?.Captaciones ?? 0;
    const captDelta =
      prevCapt === 0
        ? lastCapt > 0
          ? 100
          : 0
        : Math.round(((lastCapt - prevCapt) / prevCapt) * 100);
    const sparkCapt = seriesData.slice(-8).map((d, i) => ({ i, v: d.Captaciones }));

    return {
      activos: dashStats.activos,
      reservados: dashStats.reservados,
      vendidos: dashStats.vendidos,
      alquilados: dashStats.alquilados,
      valorCartera: dashStats.valorCartera,
      seriesData,
      sparkCapt,
      captDelta,
      recientes: dashStats.recientes,
      comisionMes: dashStats.comisionMes,
      comisionAnual: dashStats.comisionAnual,
      comisionPipeline: dashStats.comisionPipeline,
      estancados: dashStats.estancados,
      prospectosWeb: dashStats.prospectosWeb,
    };
  }, [dashStats]);

  const cliTotal = useMemo(() => cliData.clientes.length, [cliData]);

  const visStats = useMemo(() => {
    const v = visData.visitas;
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000);
    const proximas = v.filter((x) => {
      if (!x.fecha) return false;
      const d = new Date(x.fecha);
      return d >= now && d <= in7;
    }).length;
    const ventas = dashStats.vendidos + dashStats.alquilados;
    const tasaCierre = v.length ? Math.round((ventas / v.length) * 100) : 0;
    return { proximas, tasaCierre };
  }, [visData, dashStats]);

  // ── Pulso del mes ── captMes/captPrev/cierresMes/cierresPrev/reservasTotal
  // vienen ya calculados del server; solo visitasMes/visitasPrev se derivan
  // aquí porque dependen de visData, que es una query aparte.
  const pulso = useMemo(() => {
    const visitas = visData.visitas as VisRow[];
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevMonthKey =
      now.getMonth() === 0
        ? `${now.getFullYear() - 1}-12`
        : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`;

    const visitasMes = visitas.filter(
      (v) => v.estado === "Realizada" && v.fecha?.startsWith(curMonth),
    ).length;
    const visitasPrev = visitas.filter(
      (v) => v.estado === "Realizada" && v.fecha?.startsWith(prevMonthKey),
    ).length;

    return { ...dashStats.pulso, visitasMes, visitasPrev };
  }, [visData, dashStats]);

  // ── Actividad por zona ── ya viene agrupada/normalizada/ordenada del server.
  const departamentos = dashStats.departamentos;

  // ── Cartera por tipo ── ya viene agrupada/ordenada del server (top 7 por valor).
  const carteraBreakdown = useMemo(
    () => ({
      list: dashStats.carteraBreakdown,
      maxValor: dashStats.carteraBreakdown[0]?.valor ?? 1,
    }),
    [dashStats],
  );

  // ── Analytics (stats + ops) ──
  const analytics = useMemo(() => {
    const pipeline = [
      { label: "Lead", value: statsData.pipeline["Lead"] ?? 0, color: "#94a3b8" },
      { label: "Prospecto", value: statsData.pipeline["Prospecto"] ?? 0, color: "#60a5fa" },
      { label: "Cliente", value: statsData.pipeline["Cliente"] ?? 0, color: "#c9a94a" },
      { label: "Histórico", value: statsData.pipeline["Histórico"] ?? 0, color: "#34d399" },
      { label: "Descartado", value: statsData.pipeline["Descartado"] ?? 0, color: "#f87171" },
    ];
    const totalContactos = pipeline.reduce((s, p) => s + p.value, 0);
    const convRate = totalContactos
      ? Math.round(((statsData.pipeline["Cliente"] ?? 0) / totalContactos) * 100)
      : 0;
    const maxPipelineVal = Math.max(...pipeline.map((p) => p.value), 1);

    const canalData = Object.entries(statsData.canales)
      .map(([name, value]) => ({
        name: name === "null" ? "Sin canal" : name,
        value: value as number,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    const leadsChartData = statsData.leadsPorMes.map((m) => ({
      total: m.total,
      mes: fmtMes(m.mes),
    }));

    const visitasChartData = statsData.visitasPorMes.map((m) => ({
      ...m,
      mes: fmtMes(m.mes),
    }));

    const ops = opsData.operaciones;
    const opsCerradas = ops.filter((o: any) => o.estado === "Cerrada");
    const totalComision = opsCerradas.reduce((s: number, o: any) => s + (o.comisionTotal ?? 0), 0);
    const pipelineValorOps = ops
      .filter((o: any) => o.estado === "Abierta" || o.estado === "En negociación")
      .reduce((s: number, o: any) => s + (o.precioOperacion ?? 0), 0);

    return {
      pipeline,
      totalContactos,
      convRate,
      maxPipelineVal,
      canalData,
      leadsChartData,
      visitasChartData,
      opsCerradas,
      totalComision,
      pipelineValorOps,
    };
  }, [statsData, opsData]);

  // ── Visitas analytics ──
  const visitasAnalytics = useMemo(() => {
    const visitas = visData.visitas as VisRow[];
    const now = new Date();
    const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 86400000);
    const semanas = Array.from({ length: 8 }, (_, k) => {
      const wStart = new Date(eightWeeksAgo.getTime() + k * 7 * 86400000);
      const wEnd = new Date(wStart.getTime() + 7 * 86400000);
      const label = `${wStart.getDate()}/${wStart.getMonth() + 1}`;
      const count = visitas.filter((v) => {
        if (!v.fecha) return false;
        const vd = new Date(v.fecha);
        return vd >= wStart && vd < wEnd;
      }).length;
      return { label, count };
    });

    const inmMap = new Map<string, { id: string; dir: string; count: number }>();
    visitas.forEach((v) => {
      const ids = v.inmuebleIds ?? [];
      const calles = v.inmuebleCalles ?? [];
      const numeros = v.inmuebleNumeros ?? [];
      ids.forEach((id, idx) => {
        const prev = inmMap.get(id) ?? {
          id,
          dir: `${calles[idx] ?? ""} ${numeros[idx] ?? ""}`.trim(),
          count: 0,
        };
        inmMap.set(id, { ...prev, count: prev.count + 1 });
      });
    });
    const topInmuebles = [...inmMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);

    return { semanas, topInmuebles };
  }, [visData]);

  return (
    <AppShell
      title="Dashboard"
      subtitle={`${stats.activos} activos · ${cliTotal} clientes · ${visStats.proximas} visitas próximas`}
    >
      {/* ── ROW 1: Hero ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 flex flex-col min-h-[200px]">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium mb-4 flex items-center gap-2">
            {myRole.isFinanciero ? "Comisiones este mes" : "Actividad próxima"}
            {myRole.isFinanciero && (
              <span className="normal-case tracking-normal text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                est.
              </span>
            )}
          </div>
          <div className="flex-1">
            <div
              className="font-display font-bold text-gold tabular-nums leading-none tracking-tighter"
              style={{ fontSize: "clamp(2.75rem, 7vw, 4.5rem)" }}
            >
              {myRole.isFinanciero ? moneyShort(stats.comisionMes) : visStats.proximas}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
              {myRole.isFinanciero ? (
                <>
                  <span className="text-muted-foreground">
                    Año en curso{" "}
                    <strong className="text-foreground font-semibold">
                      {moneyShort(stats.comisionAnual)}
                    </strong>
                    <span className="text-[9px] ml-1 opacity-50">est.</span>
                  </span>
                  <span className="text-muted-foreground">
                    Pipeline{" "}
                    <strong className="text-foreground font-semibold">
                      {moneyShort(stats.comisionPipeline)}
                    </strong>
                    <span className="text-[9px] ml-1 opacity-50">est.</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">Visitas en los próximos 7 días</span>
                  <span className="text-muted-foreground">
                    Leads activos{" "}
                    <strong className="text-foreground font-semibold">{leadsCount}</strong>
                  </span>
                </>
              )}
              <span className="text-muted-foreground">
                Conversión{" "}
                <strong className="text-foreground font-semibold">{visStats.tasaCierre}%</strong>
              </span>
              {stats.captDelta !== 0 && (
                <span
                  className={`inline-flex items-center gap-0.5 font-semibold ${stats.captDelta > 0 ? "text-success" : "text-destructive"}`}
                >
                  {stats.captDelta > 0 ? (
                    <TrendingUp className="size-3" />
                  ) : (
                    <TrendingDown className="size-3" />
                  )}
                  {stats.captDelta > 0 ? "+" : ""}
                  {stats.captDelta}% captaciones MoM
                </span>
              )}
            </div>
          </div>
          {stats.sparkCapt.length > 1 && (
            <div className="mt-5 h-14 -mx-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.sparkCapt} margin={{ top: 1, right: 1, left: 1, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bentospk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="var(--gold)"
                    strokeWidth={1.75}
                    fill="url(#bentospk)"
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div
            className="flex-1 rounded-2xl bg-sidebar p-5 flex flex-col"
            style={{ color: "var(--sidebar-foreground)" }}
          >
            <div
              className="text-[10px] uppercase tracking-[0.22em] font-medium mb-3"
              style={{ opacity: 0.45 }}
            >
              Cartera activa
            </div>
            <div className="flex-1">
              <div className="text-[2.75rem] font-display font-bold tabular-nums leading-none">
                {stats.activos}
              </div>
              <div className="text-xs mt-1.5" style={{ opacity: 0.45 }}>
                {stats.reservados} reservados · {moneyShort(stats.valorCartera)}
              </div>
            </div>
            <Link
              to="/inmuebles"
              className="mt-3 text-xs font-medium inline-flex items-center gap-1 transition-opacity hover:opacity-100"
              style={{ opacity: 0.4 }}
            >
              Ver cartera <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="flex-1 rounded-2xl border border-border bg-card p-5 grid grid-cols-3 divide-x divide-border">
            <div className="pr-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                Clientes
              </div>
              <div className="text-3xl font-display font-bold tabular-nums leading-none">
                {cliTotal}
              </div>
              <Link
                to="/clientes"
                search={{ id: undefined }}
                className="mt-2 text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors"
              >
                Ver todos <ArrowRight className="size-2.5" />
              </Link>
            </div>
            <div className="px-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                Visitas / 7d
              </div>
              <div className="text-3xl font-display font-bold tabular-nums leading-none">
                {visStats.proximas}
              </div>
              <Link
                to="/visitas"
                className="mt-2 text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors"
              >
                Ver agenda <ArrowRight className="size-2.5" />
              </Link>
            </div>
            <div className="pl-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
                Prospectos
              </div>
              <div
                className={`text-3xl font-display font-bold tabular-nums leading-none ${stats.prospectosWeb > 0 ? "text-info" : ""}`}
              >
                {stats.prospectosWeb}
              </div>
              <Link
                to="/prospectos"
                className="mt-2 text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors"
              >
                Revisar <ArrowRight className="size-2.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 1.5: Pulso del mes ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <PulsoChip
          label="Captaciones · mes"
          value={pulso.captMes}
          prev={pulso.captPrev}
          icon={Home}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
        <PulsoChip
          label="Cierres · mes"
          value={pulso.cierresMes}
          prev={pulso.cierresPrev}
          icon={CheckCircle2}
          iconColor="text-success"
          iconBg="bg-success/10"
        />
        <PulsoChip
          label="Visitas realizadas · mes"
          value={pulso.visitasMes}
          prev={pulso.visitasPrev}
          icon={CalendarDays}
          iconColor="text-gold"
          iconBg="bg-gold/10"
        />
        <PulsoChip
          label="Reservas activas"
          value={pulso.reservasTotal}
          icon={HandCoins}
          iconColor="text-info"
          iconBg="bg-info/10"
        />
      </div>

      {/* ── ROW 2: Evolución + Actividad por zona ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <Suspense
          fallback={
            <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 h-[284px] animate-pulse bg-muted/30" />
          }
        >
          <EvolucionChart seriesData={stats.seriesData} />
        </Suspense>
        <DepartamentosPanel data={departamentos} />
      </div>

      {/* ── ROW 2.5: Pipeline ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Link
          to="/mis-leads"
          className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-foreground/20 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center justify-center size-8 rounded-xl bg-muted">
              <UserRound className="size-4 text-foreground" />
            </span>
            <ArrowRight className="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
          </div>
          <div>
            <div className="text-2xl font-display font-bold tabular-nums leading-none">
              {leadsCount}
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mt-1.5">
              Leads activos
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Pendientes de cualificar</div>
          </div>
        </Link>
        <Link
          to="/clientes"
          search={{ id: undefined }}
          className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-foreground/20 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center justify-center size-8 rounded-xl bg-success/10">
              <Users className="size-4 text-success" />
            </span>
            <ArrowRight className="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
          </div>
          <div>
            <div className="text-2xl font-display font-bold tabular-nums leading-none">
              {cliTotal}
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mt-1.5">
              En seguimiento
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Activos · Prospectos</div>
          </div>
        </Link>
        <Link
          to="/inmuebles"
          className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-foreground/20 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center justify-center size-8 rounded-xl bg-gold/10">
              <HandCoins className="size-4 text-gold" />
            </span>
            <ArrowRight className="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
          </div>
          <div>
            <div className="text-2xl font-display font-bold tabular-nums leading-none">
              {stats.reservados}
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mt-1.5">
              Reservados
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Inmuebles en reserva</div>
          </div>
        </Link>
        <Link
          to="/visitas"
          className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-foreground/20 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center justify-center size-8 rounded-xl bg-primary/10">
              <CalendarCheck className="size-4 text-primary" />
            </span>
            <ArrowRight className="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
          </div>
          <div>
            <div className="text-2xl font-display font-bold tabular-nums leading-none">
              {visStats.proximas}
            </div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mt-1.5">
              Visitas · 7 días
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Agendadas próxima semana</div>
          </div>
        </Link>
      </div>

      {/* ── ROW 3: Cartera tipo + Visitas analytics + SilvIA ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <CarteraBreakdown data={carteraBreakdown.list} maxValor={carteraBreakdown.maxValor} />
        <Suspense
          fallback={
            <div className="rounded-2xl border border-border bg-card p-5 h-64 animate-pulse bg-muted/30" />
          }
        >
          <VisitasAnalytics data={visitasAnalytics} />
        </Suspense>
        <Link
          to="/silvia"
          className="rounded-2xl border border-gold/25 bg-gradient-to-br from-gold/10 to-transparent p-5 flex flex-col justify-between hover:border-gold/50 hover:shadow-lg transition-all group"
        >
          <div className="size-11 rounded-xl bg-gradient-to-br from-gold to-amber-300 flex items-center justify-center shadow-md">
            <Sparkles className="size-5 text-gold-foreground" />
          </div>
          <div className="mt-4">
            <div className="text-base font-semibold tracking-tight">SilvIA</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {leadsCount} leads en seguimiento
            </div>
            <div className="text-xs text-muted-foreground mt-1">Gestionados por IA</div>
          </div>
          <div className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-gold group-hover:gap-2 transition-all">
            Revisar leads <ArrowRight className="size-3" />
          </div>
        </Link>
      </div>

      {/* ── ROW 3.5: SilvIA Insights ── */}
      {(insights.topCalientes.length > 0 || insights.sinSeguimiento.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
          <LeadsCalientesPanel leads={insights.topCalientes} />
          <SinSeguimientoPanel leads={insights.sinSeguimiento} />
        </div>
      )}

      {/* ── ROW 4: Recientes + Estancados ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="text-sm font-semibold">Captaciones recientes</h3>
            <Link
              to="/inmuebles"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
            >
              Ver todas <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {stats.recientes.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Sin captaciones recientes.
              </div>
            ) : (
              stats.recientes.map((i) => <RecentRow key={i.id} i={i} />)
            )}
          </div>
        </div>
        <AlertasPanel estancados={stats.estancados} />
      </div>

      {/* ── ROW 5: Análisis comercial ── */}
      <div className="mt-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            Análisis comercial
          </span>
          <span className="flex-1 h-px bg-border" />
          {myRole.isFinanciero && (
            <span className="text-[9px] text-success bg-success/10 px-2 py-0.5 rounded-full font-medium">
              Vista financiera
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
          {/* Pipeline funnel */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold">Pipeline de contactos</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {analytics.totalContactos} contactos · Conv. {analytics.convRate}%
              </p>
            </div>
            <div className="space-y-2">
              {analytics.pipeline
                .filter((p) => p.value > 0)
                .map((p) => (
                  <div key={p.label} className="flex items-center gap-3">
                    <span className="text-[11px] w-20 text-muted-foreground shrink-0">
                      {p.label}
                    </span>
                    <div className="flex-1 h-5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(2, Math.round((p.value / analytics.maxPipelineVal) * 100))}%`,
                          background: p.color,
                        }}
                      />
                    </div>
                    <span className="text-[12px] font-semibold tabular-nums w-8 text-right">
                      {p.value}
                    </span>
                  </div>
                ))}
            </div>
            {myRole.isFinanciero && (
              <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-x-6 gap-y-2">
                <div>
                  <div className="text-[10px] text-muted-foreground">Pipeline (valor real)</div>
                  <div className="text-[13px] font-semibold tabular-nums">
                    {moneyFull(analytics.pipelineValorOps)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Ops. cerradas</div>
                  <div className="text-[13px] font-semibold tabular-nums">
                    {analytics.opsCerradas.length}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground">Comisiones reales</div>
                  <div className="text-[13px] font-semibold tabular-nums">
                    {moneyFull(analytics.totalComision)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Canal captación */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-1">Canal de captación</h3>
            <p className="text-[11px] text-muted-foreground mb-4">Distribución por origen</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={analytics.canalData}
                layout="vertical"
                margin={{ left: 0, right: 20, top: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  stroke="var(--color-muted-foreground)"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={96}
                  tick={{ fontSize: 9 }}
                  stroke="var(--color-muted-foreground)"
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  cursor={{ fill: "var(--color-accent)" }}
                />
                <Bar dataKey="value" name="Contactos" radius={[0, 4, 4, 0]}>
                  {analytics.canalData.map((_, i) => (
                    <Cell key={i} fill={ANALYTICS_PALETTE[i % ANALYTICS_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Leads + Visitas por mes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-1">Leads captados</h3>
            <p className="text-[11px] text-muted-foreground mb-4">Últimos 12 meses</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={analytics.leadsChartData}
                margin={{ left: -16, right: 4, top: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 9 }}
                  stroke="var(--color-muted-foreground)"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="var(--color-muted-foreground)"
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  cursor={{ fill: "var(--color-accent)" }}
                />
                <Bar dataKey="total" name="Leads" fill="var(--gold)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-1">Visitas</h3>
            <p className="text-[11px] text-muted-foreground mb-4">
              Realizadas vs canceladas · 12 meses
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart
                data={analytics.visitasChartData}
                margin={{ left: -16, right: 8, top: 4, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 9 }}
                  stroke="var(--color-muted-foreground)"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="var(--color-muted-foreground)"
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  cursor={{ stroke: "var(--color-border)" }}
                />
                <Line
                  dataKey="realizadas"
                  name="Realizadas"
                  stroke="var(--gold)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 4 }}
                />
                <Line
                  dataKey="canceladas"
                  name="Canceladas"
                  stroke="#f87171"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  strokeDasharray="4 2"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Actividad por agente — solo financiero/admin */}
        {myRole.isFinanciero &&
          statsData.agentes.filter((a: any) => a.leads + a.clientes > 0).length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Banknote className="size-4 text-gold" />
                <h3 className="text-sm font-semibold">Actividad por agente</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {statsData.agentes
                  .filter((a: any) => a.leads + a.clientes > 0)
                  .map((a: any) => (
                    <div
                      key={a.nombre}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border"
                    >
                      <div className="size-8 rounded-full grid place-items-center text-[11px] font-bold border border-border bg-card shrink-0">
                        {a.nombre.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium truncate">{a.nombre}</div>
                        <div className="flex gap-3 mt-0.5">
                          <span className="text-[10px] text-muted-foreground">
                            <span className="font-semibold text-foreground">{a.leads}</span> leads
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            <span className="font-semibold text-gold">{a.clientes}</span> clientes
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
      </div>
    </AppShell>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function PulsoChip({
  label,
  value,
  prev,
  icon: Icon,
  iconColor,
  iconBg,
}: {
  label: string;
  value: number;
  prev?: number;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
}) {
  const d = prev !== undefined ? calcDelta(value, prev) : null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
      <span
        className={`inline-flex items-center justify-center size-9 rounded-xl shrink-0 ${iconBg}`}
      >
        <Icon className={`size-4 ${iconColor}`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-2xl font-display font-bold tabular-nums leading-none">{value}</div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-1 leading-tight">
          {label}
        </div>
      </div>
      {d !== null && (
        <div
          className={`shrink-0 text-xs font-semibold ${d >= 0 ? "text-success" : "text-destructive"}`}
        >
          {d >= 0 ? "+" : ""}
          {d}%
        </div>
      )}
    </div>
  );
}

function DepartamentosPanel({
  data,
}: {
  data: { display: string; captaciones: number; ventas: number; activos: number }[];
}) {
  const maxCap = Math.max(1, ...data.map((d) => d.captaciones));
  const totalCapt = data.reduce((s, d) => s + d.captaciones, 0);
  const totalVentas = data.reduce((s, d) => s + d.ventas, 0);
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MapPin className="size-4 text-gold" /> Actividad por zona
        </h3>
        <div className="text-[10px] text-muted-foreground tabular-nums text-right leading-tight">
          <span className="font-semibold text-foreground">{totalCapt}</span> capt
          <br />
          <span className="font-semibold text-foreground">{totalVentas}</span> vtas
        </div>
      </div>
      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Sin datos.
        </div>
      ) : (
        <div className="flex-1 space-y-2.5">
          {data.map((d) => (
            <div key={d.display}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium truncate">{d.display}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded bg-gold/15 text-gold text-[10px] font-bold tabular-nums">
                    {d.captaciones}
                  </span>
                  {d.ventas > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded bg-success/10 text-success text-[10px] font-bold tabular-nums">
                      {d.ventas}
                    </span>
                  )}
                </div>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gold"
                  style={{ width: `${Math.max(6, Math.round((d.captaciones / maxCap) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 pt-3 border-t border-border flex gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-gold inline-block" />
          Captaciones
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-success/40 inline-block" />
          Ventas
        </span>
      </div>
    </div>
  );
}

function CarteraBreakdown({
  data,
  maxValor,
}: {
  data: { tipo: string; count: number; valor: number }[];
  maxValor: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-4">
        Cartera activa · por tipo
      </h3>
      {data.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Sin activos.</div>
      ) : (
        <div className="space-y-3">
          {data.map((d) => (
            <div key={d.tipo}>
              <div className="flex items-baseline justify-between text-xs mb-1.5">
                <span className="font-medium truncate max-w-[55%]">{d.tipo}</span>
                <span className="text-muted-foreground tabular-nums shrink-0 text-[11px]">
                  <span className="font-semibold text-foreground">{d.count}</span> ·{" "}
                  {moneyShort(d.valor)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gold/70"
                  style={{ width: `${Math.max(6, Math.round((d.valor / maxValor) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertasPanel({ estancados }: { estancados: { i: Inmueble; dias: number }[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <TrendingDown className="size-4 text-alert" /> Inmuebles estancados
        </h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Activos sin escritura tras +90 días.
        </p>
      </div>
      {estancados.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          Sin alertas. Cartera saludable.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {estancados.map(({ i, dias }) => (
            <li key={i.id}>
              <Link
                to="/inmuebles/$id"
                params={{ id: i.id }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-alert/10 text-alert text-[11px] font-bold tabular-nums">
                  {dias}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">
                    {i.calle || "Sin dirección"} {i.numero}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[i.barrio, i.localidad].filter(Boolean).join(" · ") || i.tipo}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {i.precio ? moneyShort(i.precio) : "—"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
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
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">
          {i.calle || "Sin dirección"} {i.numero}
          {i.ref && (
            <span className="ml-2 text-[11px] font-mono text-muted-foreground">
              #{cleanRef(i.ref)}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {[i.barrio, i.localidad].filter(Boolean).join(" · ") || "—"} · {i.tipo || "—"}
          {i.agentesNombres.length > 0 && ` · ${i.agentesNombres.join(", ")}`}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold tabular-nums">
          {i.precio ? moneyFull(i.precio) : "—"}
        </div>
        <div className="text-[11px] text-muted-foreground">{fmtDate(i.fechaInicio)}</div>
      </div>
    </Link>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 70
      ? "bg-success/15 text-success"
      : pct >= 40
        ? "bg-gold/15 text-[var(--gold)]"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center justify-center size-8 rounded-lg text-[11px] font-bold tabular-nums shrink-0 ${color}`}
    >
      {pct}
    </span>
  );
}

function LeadsCalientesPanel({ leads }: { leads: LeadInsight[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Flame className="size-4 text-[var(--gold)]" /> Leads más calientes
        </h3>
        <Link
          to="/mis-leads"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          Ver todos <ArrowRight className="size-3" />
        </Link>
      </div>
      {leads.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          Sin leads con score alto.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link
                to="/clientes"
                search={{ id: lead.id }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
              >
                <ScoreBadge score={lead.score} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{lead.nombre}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {lead.telefono ?? "Sin tel."} · {lead.ciclo_vida}
                    {lead.diasSinContacto !== null && (
                      <span
                        className={`ml-1 ${lead.diasSinContacto < 7 ? "text-success" : ""}`}
                      >
                        · {lead.diasSinContacto}d
                      </span>
                    )}
                  </div>
                </div>
                {!lead.tieneAgente && (
                  <span className="text-[10px] text-warning bg-warning/10 px-1.5 py-0.5 rounded shrink-0">
                    Sin asignar
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SinSeguimientoPanel({ leads }: { leads: LeadInsight[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <BellOff className="size-4 text-destructive" /> Sin seguimiento · +30 días
        </h3>
        <Link
          to="/mis-leads"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          Ver todos <ArrowRight className="size-3" />
        </Link>
      </div>
      {leads.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          Sin leads sin atender. Bien hecho.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link
                to="/clientes"
                search={{ id: lead.id }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive text-[11px] font-bold tabular-nums">
                  {lead.diasSinContacto === null ? "∞" : lead.diasSinContacto}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{lead.nombre}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {lead.telefono ?? "Sin tel."} · {lead.ciclo_vida}
                  </div>
                </div>
                {!lead.tieneAgente && (
                  <span className="text-[10px] text-warning bg-warning/10 px-1.5 py-0.5 rounded shrink-0">
                    Sin asignar
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
