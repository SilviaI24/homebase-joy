import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, lazy, Suspense } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { AppShell } from "@/components/AppShell";
import { isAlquiler, type Inmueble } from "@/lib/inmuebles.functions";
import { allInmueblesQuery, clientesQueryOpts, visitasQuery, leadsQueryOpts } from "@/lib/queries";
import { cleanRef } from "@/lib/format";
import type { LucideIcon } from "lucide-react";
import {
  TrendingUp, TrendingDown, Sparkles, ArrowRight,
  Users, UserRound, HandCoins, CalendarCheck,
  MapPin, Home, CalendarDays, CheckCircle2,
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

const inmueblesQuery = allInmueblesQuery;
const clientesQuery = clientesQueryOpts;

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
    context.queryClient.ensureQueryData(visitasQuery);
    context.queryClient.ensureQueryData(leadsQueryOpts);
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
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M €`;
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
  } catch { return s; }
}
function calcDelta(cur: number, prev: number): number | null {
  if (prev === 0) return cur > 0 ? 100 : null;
  return Math.round(((cur - prev) / prev) * 100);
}

const COMISION_VENTA = 0.03;

function Dashboard() {
  const { data: inmData } = useSuspenseQuery(inmueblesQuery);
  const { data: cliData } = useSuspenseQuery(clientesQuery);
  const { data: visData } = useSuspenseQuery(visitasQuery);
  const { data: leadsData } = useSuspenseQuery(leadsQueryOpts);

  const leadsCount = leadsData.clientes.length;

  const stats = useMemo(() => {
    const inmuebles = inmData.inmuebles;
    const byEstatus = (e: string) => inmuebles.filter((i) => i.estatus === e);
    const activos = byEstatus("Activo");
    const reservados = byEstatus("Reservado");
    const vendidos = byEstatus("Vendido");
    const alquilados = byEstatus("Alquilado");
    const valorCartera = activos.reduce((s, i) => s + (i.precio ?? 0), 0);

    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let k = 11; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("es-ES", { month: "short" });
      months.push({ key, label });
    }
    const captCount: Record<string, number> = {};
    const ventaCount: Record<string, number> = {};
    months.forEach((m) => { captCount[m.key] = 0; ventaCount[m.key] = 0; });
    inmuebles.forEach((i) => {
      if (i.fechaInicio) {
        const k = i.fechaInicio.slice(0, 7);
        if (k in captCount) captCount[k]++;
      }
      if (i.fechaEscritura) {
        const k = i.fechaEscritura.slice(0, 7);
        if (k in ventaCount) ventaCount[k]++;
      }
    });
    const seriesData = months.map((m) => ({
      mes: m.label,
      Captaciones: captCount[m.key],
      Ventas: ventaCount[m.key],
    }));

    const lastCapt = seriesData[seriesData.length - 1]?.Captaciones ?? 0;
    const prevCapt = seriesData[seriesData.length - 2]?.Captaciones ?? 0;
    const captDelta = prevCapt === 0 ? (lastCapt > 0 ? 100 : 0) : Math.round(((lastCapt - prevCapt) / prevCapt) * 100);
    const sparkCapt = seriesData.slice(-8).map((d, i) => ({ i, v: d.Captaciones }));

    const recientes = [...inmuebles]
      .filter((i) => i.fechaInicio)
      .sort((a, b) => (b.fechaInicio ?? "").localeCompare(a.fechaInicio ?? ""))
      .slice(0, 6);

    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const curYear = String(now.getFullYear());
    let comisionMes = 0;
    let comisionAnual = 0;
    let comisionPipeline = 0;
    inmuebles.forEach((i) => {
      if (isAlquiler(i.tipo)) return;
      const precio = i.precioFinal ?? i.precio ?? 0;
      if (!precio) return;
      const fee = precio * COMISION_VENTA;
      if (i.estatus === "Vendido") {
        if (i.fechaEscritura?.startsWith(curMonth)) comisionMes += fee;
        if (i.fechaEscritura?.startsWith(curYear)) comisionAnual += fee;
      }
      if (i.estatus === "Activo" || i.estatus === "Reservado") comisionPipeline += fee;
    });

    const ahora = Date.now();
    const estancados = activos
      .map((i) => {
        if (!i.fechaInicio) return null;
        const dias = Math.floor((ahora - new Date(i.fechaInicio).getTime()) / 86400000);
        return dias > 90 ? { i, dias } : null;
      })
      .filter((x): x is { i: Inmueble; dias: number } => !!x)
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 5);

    const prospectosWeb = inmuebles.filter((i) => i.publicacion === "PROSPECTO").length;

    return {
      inmuebles, activos, reservados, vendidos, alquilados,
      valorCartera, seriesData, sparkCapt, captDelta,
      recientes, comisionMes, comisionAnual, comisionPipeline,
      estancados, prospectosWeb,
    };
  }, [inmData]);

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
    const ventas = stats.vendidos.length + stats.alquilados.length;
    const tasaCierre = v.length ? Math.round((ventas / v.length) * 100) : 0;
    return { proximas, tasaCierre };
  }, [visData, stats]);

  // ── Pulso del mes ──
  const pulso = useMemo(() => {
    const inmuebles = inmData.inmuebles;
    const visitas = visData.visitas as VisRow[];
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevMonthKey = now.getMonth() === 0
      ? `${now.getFullYear() - 1}-12`
      : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}`;

    const captMes = inmuebles.filter(i => i.fechaInicio?.startsWith(curMonth)).length;
    const captPrev = inmuebles.filter(i => i.fechaInicio?.startsWith(prevMonthKey)).length;
    const cierresMes = inmuebles.filter(i => i.fechaEscritura?.startsWith(curMonth) && !isAlquiler(i.tipo)).length;
    const cierresPrev = inmuebles.filter(i => i.fechaEscritura?.startsWith(prevMonthKey) && !isAlquiler(i.tipo)).length;
    const visitasMes = visitas.filter(v => v.estado === "Realizada" && v.fecha?.startsWith(curMonth)).length;
    const visitasPrev = visitas.filter(v => v.estado === "Realizada" && v.fecha?.startsWith(prevMonthKey)).length;
    const reservasTotal = inmuebles.filter(i => i.estatus === "Reservado").length;

    return { captMes, captPrev, cierresMes, cierresPrev, visitasMes, visitasPrev, reservasTotal };
  }, [inmData, visData]);

  // ── Actividad por zona ──
  const departamentos = useMemo(() => {
    const inmuebles = inmData.inmuebles;
    // Normaliza acentos y espacios para unificar variantes del mismo municipio
    function normalizeKey(s: string): string {
      return s.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ");
    }
    const map = new Map<string, { display: string; captaciones: number; ventas: number; activos: number }>();
    inmuebles.forEach(i => {
      const raw = i.localidad || "Sin zona";
      const key = normalizeKey(raw);
      if (!map.has(key)) map.set(key, { display: raw, captaciones: 0, ventas: 0, activos: 0 });
      const d = map.get(key)!;
      if (i.fechaInicio) d.captaciones++;
      if (i.estatus === "Vendido") d.ventas++;
      if (i.estatus === "Activo") d.activos++;
    });
    return [...map.values()]
      .filter(d => d.captaciones > 0 || d.activos > 0)
      .sort((a, b) => b.captaciones - a.captaciones)
      .slice(0, 7);
  }, [inmData]);

  // ── Cartera por tipo ──
  const carteraBreakdown = useMemo(() => {
    const activos = inmData.inmuebles.filter(i => i.estatus === "Activo");
    const map = new Map<string, { count: number; valor: number }>();
    activos.forEach(i => {
      const tipo = i.tipo || "Otros";
      const prev = map.get(tipo) ?? { count: 0, valor: 0 };
      map.set(tipo, { count: prev.count + 1, valor: prev.valor + (i.precio ?? 0) });
    });
    const list = [...map.entries()]
      .map(([tipo, d]) => ({ tipo, ...d }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 7);
    return { list, maxValor: list[0]?.valor ?? 1 };
  }, [inmData]);

  // ── Visitas analytics ──
  const visitasAnalytics = useMemo(() => {
    const visitas = visData.visitas as VisRow[];
    const now = new Date();
    const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 86400000);
    const semanas = Array.from({ length: 8 }, (_, k) => {
      const wStart = new Date(eightWeeksAgo.getTime() + k * 7 * 86400000);
      const wEnd = new Date(wStart.getTime() + 7 * 86400000);
      const label = `${wStart.getDate()}/${wStart.getMonth() + 1}`;
      const count = visitas.filter(v => {
        if (!v.fecha) return false;
        const vd = new Date(v.fecha);
        return vd >= wStart && vd < wEnd;
      }).length;
      return { label, count };
    });

    const inmMap = new Map<string, { id: string; dir: string; count: number }>();
    visitas.forEach(v => {
      const ids = v.inmuebleIds ?? [];
      const calles = v.inmuebleCalles ?? [];
      const numeros = v.inmuebleNumeros ?? [];
      ids.forEach((id, idx) => {
        const prev = inmMap.get(id) ?? { id, dir: `${calles[idx] ?? ""} ${numeros[idx] ?? ""}`.trim(), count: 0 };
        inmMap.set(id, { ...prev, count: prev.count + 1 });
      });
    });
    const topInmuebles = [...inmMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);

    return { semanas, topInmuebles };
  }, [visData]);

  return (
    <AppShell
      title="Dashboard"
      subtitle={`${stats.activos.length} activos · ${cliTotal} clientes · ${visStats.proximas} visitas próximas`}
    >
      {/* ── ROW 1: Hero ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 flex flex-col min-h-[200px]">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium mb-4 flex items-center gap-2">
            Comisiones este mes
            <span className="normal-case tracking-normal text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">est.</span>
          </div>
          <div className="flex-1">
            <div
              className="font-display font-bold text-gold tabular-nums leading-none tracking-tighter"
              style={{ fontSize: "clamp(2.75rem, 7vw, 4.5rem)" }}
            >
              {moneyShort(stats.comisionMes)}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
              <span className="text-muted-foreground">
                Año en curso{" "}
                <strong className="text-foreground font-semibold">{moneyShort(stats.comisionAnual)}</strong>
                <span className="text-[9px] ml-1 opacity-50">est.</span>
              </span>
              <span className="text-muted-foreground">
                Pipeline{" "}
                <strong className="text-foreground font-semibold">{moneyShort(stats.comisionPipeline)}</strong>
                <span className="text-[9px] ml-1 opacity-50">est.</span>
              </span>
              <span className="text-muted-foreground">
                Conversión{" "}
                <strong className="text-foreground font-semibold">{visStats.tasaCierre}%</strong>
              </span>
              {stats.captDelta !== 0 && (
                <span className={`inline-flex items-center gap-0.5 font-semibold ${stats.captDelta > 0 ? "text-emerald-600" : "text-destructive"}`}>
                  {stats.captDelta > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {stats.captDelta > 0 ? "+" : ""}{stats.captDelta}% captaciones MoM
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
                  <Area type="monotone" dataKey="v" stroke="var(--gold)" strokeWidth={1.75} fill="url(#bentospk)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex-1 rounded-2xl bg-sidebar p-5 flex flex-col" style={{ color: "var(--sidebar-foreground)" }}>
            <div className="text-[10px] uppercase tracking-[0.22em] font-medium mb-3" style={{ opacity: 0.45 }}>
              Cartera activa
            </div>
            <div className="flex-1">
              <div className="text-[2.75rem] font-display font-bold tabular-nums leading-none">
                {stats.activos.length}
              </div>
              <div className="text-xs mt-1.5" style={{ opacity: 0.45 }}>
                {stats.reservados.length} reservados · {moneyShort(stats.valorCartera)}
              </div>
            </div>
            <Link to="/inmuebles" className="mt-3 text-xs font-medium inline-flex items-center gap-1 transition-opacity hover:opacity-100" style={{ opacity: 0.40 }}>
              Ver cartera <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="flex-1 rounded-2xl border border-border bg-card p-5 grid grid-cols-3 divide-x divide-border">
            <div className="pr-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Clientes</div>
              <div className="text-3xl font-display font-bold tabular-nums leading-none">{cliTotal}</div>
              <Link to="/clientes" search={{ id: undefined }} className="mt-2 text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors">
                Ver todos <ArrowRight className="size-2.5" />
              </Link>
            </div>
            <div className="px-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Visitas / 7d</div>
              <div className="text-3xl font-display font-bold tabular-nums leading-none">{visStats.proximas}</div>
              <Link to="/visitas" className="mt-2 text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors">
                Ver agenda <ArrowRight className="size-2.5" />
              </Link>
            </div>
            <div className="pl-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Prospectos</div>
              <div className={`text-3xl font-display font-bold tabular-nums leading-none ${stats.prospectosWeb > 0 ? "text-violet-600 dark:text-violet-400" : ""}`}>
                {stats.prospectosWeb}
              </div>
              <Link to="/prospectos" className="mt-2 text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors">
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
          iconColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-500/10"
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
          iconColor="text-violet-600 dark:text-violet-400"
          iconBg="bg-violet-500/10"
        />
      </div>

      {/* ── ROW 2: Evolución + Actividad por zona ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <Suspense fallback={<div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 h-[284px] animate-pulse bg-muted/30" />}>
          <EvolucionChart seriesData={stats.seriesData} />
        </Suspense>
        <DepartamentosPanel data={departamentos} />
      </div>

      {/* ── ROW 2.5: Pipeline ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Link to="/mis-leads" className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-foreground/20 transition-colors group">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center justify-center size-8 rounded-xl bg-muted">
              <UserRound className="size-4 text-foreground" />
            </span>
            <ArrowRight className="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
          </div>
          <div>
            <div className="text-2xl font-display font-bold tabular-nums leading-none">{leadsCount}</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mt-1.5">Leads activos</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Pendientes de cualificar</div>
          </div>
        </Link>
        <Link to="/clientes" search={{ id: undefined }} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-foreground/20 transition-colors group">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center justify-center size-8 rounded-xl bg-emerald-500/10">
              <Users className="size-4 text-emerald-600 dark:text-emerald-400" />
            </span>
            <ArrowRight className="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
          </div>
          <div>
            <div className="text-2xl font-display font-bold tabular-nums leading-none">{cliTotal}</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mt-1.5">En seguimiento</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Activos · Prospectos</div>
          </div>
        </Link>
        <Link to="/inmuebles" className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-foreground/20 transition-colors group">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center justify-center size-8 rounded-xl bg-gold/10">
              <HandCoins className="size-4 text-gold" />
            </span>
            <ArrowRight className="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
          </div>
          <div>
            <div className="text-2xl font-display font-bold tabular-nums leading-none">{stats.reservados.length}</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mt-1.5">Reservados</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Inmuebles en reserva</div>
          </div>
        </Link>
        <Link to="/visitas" className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3 hover:border-foreground/20 transition-colors group">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center justify-center size-8 rounded-xl bg-primary/10">
              <CalendarCheck className="size-4 text-primary" />
            </span>
            <ArrowRight className="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
          </div>
          <div>
            <div className="text-2xl font-display font-bold tabular-nums leading-none">{visStats.proximas}</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mt-1.5">Visitas · 7 días</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Agendadas próxima semana</div>
          </div>
        </Link>
      </div>

      {/* ── ROW 3: Cartera tipo + Visitas analytics + SilvIA ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <CarteraBreakdown data={carteraBreakdown.list} maxValor={carteraBreakdown.maxValor} />
        <Suspense fallback={<div className="rounded-2xl border border-border bg-card p-5 h-64 animate-pulse bg-muted/30" />}>
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
            <div className="text-sm text-muted-foreground mt-0.5">{leadsCount} leads en seguimiento</div>
            <div className="text-xs text-muted-foreground mt-1">Gestionados por IA</div>
          </div>
          <div className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-gold group-hover:gap-2 transition-all">
            Revisar leads <ArrowRight className="size-3" />
          </div>
        </Link>
      </div>

      {/* ── ROW 4: Recientes + Estancados ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 className="text-sm font-semibold">Captaciones recientes</h3>
            <Link to="/inmuebles" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors">
              Ver todas <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {stats.recientes.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Sin captaciones recientes.</div>
            ) : (
              stats.recientes.map((i) => <RecentRow key={i.id} i={i} />)
            )}
          </div>
        </div>
        <AlertasPanel estancados={stats.estancados} />
      </div>
    </AppShell>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function PulsoChip({
  label, value, prev, icon: Icon, iconColor, iconBg,
}: {
  label: string; value: number; prev?: number;
  icon: LucideIcon; iconColor: string; iconBg: string;
}) {
  const d = prev !== undefined ? calcDelta(value, prev) : null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
      <span className={`inline-flex items-center justify-center size-9 rounded-xl shrink-0 ${iconBg}`}>
        <Icon className={`size-4 ${iconColor}`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-2xl font-display font-bold tabular-nums leading-none">{value}</div>
        <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-1 leading-tight">{label}</div>
      </div>
      {d !== null && (
        <div className={`shrink-0 text-xs font-semibold ${d >= 0 ? "text-emerald-600" : "text-destructive"}`}>
          {d >= 0 ? "+" : ""}{d}%
        </div>
      )}
    </div>
  );
}

function DepartamentosPanel({ data }: {
  data: { display: string; captaciones: number; ventas: number; activos: number }[];
}) {
  const maxCap = Math.max(1, ...data.map(d => d.captaciones));
  const totalCapt = data.reduce((s, d) => s + d.captaciones, 0);
  const totalVentas = data.reduce((s, d) => s + d.ventas, 0);
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MapPin className="size-4 text-gold" /> Actividad por zona
        </h3>
        <div className="text-[10px] text-muted-foreground tabular-nums text-right leading-tight">
          <span className="font-semibold text-foreground">{totalCapt}</span> capt<br />
          <span className="font-semibold text-foreground">{totalVentas}</span> vtas
        </div>
      </div>
      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Sin datos.</div>
      ) : (
        <div className="flex-1 space-y-2.5">
          {data.map(d => (
            <div key={d.display}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium truncate">{d.display}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded bg-gold/15 text-gold text-[10px] font-bold tabular-nums">
                    {d.captaciones}
                  </span>
                  {d.ventas > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold tabular-nums">
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
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-gold inline-block" />Captaciones</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-emerald-500/40 inline-block" />Ventas</span>
      </div>
    </div>
  );
}

function CarteraBreakdown({ data, maxValor }: {
  data: { tipo: string; count: number; valor: number }[];
  maxValor: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-4">Cartera activa · por tipo</h3>
      {data.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Sin activos.</div>
      ) : (
        <div className="space-y-3">
          {data.map(d => (
            <div key={d.tipo}>
              <div className="flex items-baseline justify-between text-xs mb-1.5">
                <span className="font-medium truncate max-w-[55%]">{d.tipo}</span>
                <span className="text-muted-foreground tabular-nums shrink-0 text-[11px]">
                  <span className="font-semibold text-foreground">{d.count}</span> · {moneyShort(d.valor)}
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
        <p className="text-[11px] text-muted-foreground mt-0.5">Activos sin escritura tras +90 días.</p>
      </div>
      {estancados.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">Sin alertas. Cartera saludable.</div>
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
                  <div className="text-xs font-medium truncate">{i.calle || "Sin dirección"} {i.numero}</div>
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
          {i.ref && <span className="ml-2 text-[11px] font-mono text-muted-foreground">#{cleanRef(i.ref)}</span>}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {[i.barrio, i.localidad].filter(Boolean).join(" · ") || "—"} · {i.tipo || "—"}
          {i.agentesNombres.length > 0 && ` · ${i.agentesNombres.join(", ")}`}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold tabular-nums">{i.precio ? moneyFull(i.precio) : "—"}</div>
        <div className="text-[11px] text-muted-foreground">{fmtDate(i.fechaInicio)}</div>
      </div>
    </Link>
  );
}
