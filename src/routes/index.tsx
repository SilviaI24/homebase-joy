import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { getCategoria, isAlquiler, CATEGORIAS, type Inmueble } from "@/lib/inmuebles.functions";
import { allInmueblesQuery, clientesQueryOpts, visitasQuery } from "@/lib/queries";
import {
  Building2,
  Users,
  TrendingUp,
  TrendingDown,
  Sparkles,
  ArrowRight,
  Trophy,
} from "lucide-react";

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
  } catch {
    return s;
  }
}

const STATUS_COLORS: Record<string, string> = {
  Activo: "var(--primary)",
  Reservado: "var(--gold)",
  Vendido: "var(--chart-1)",
  Baja: "var(--muted-foreground)",
  Alquilado: "var(--chart-3)",
  Prospección: "var(--chart-4)",
};

const COMISION_VENTA = 0.03;
const COMISION_ALQUILER_MESES = 1;

const TOOLTIP_STYLE = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--foreground)",
  boxShadow: "0 8px 24px -8px rgb(0 0 0 / 0.18)",
} as const;

function Dashboard() {
  const { data: inmData } = useSuspenseQuery(inmueblesQuery);
  const { data: cliData } = useSuspenseQuery(clientesQuery);
  const { data: visData } = useSuspenseQuery(visitasQuery);

  const stats = useMemo(() => {
    const inmuebles = inmData.inmuebles;
    const byEstatus = (e: string) => inmuebles.filter((i) => i.estatus === e);
    const activos = byEstatus("Activo");
    const reservados = byEstatus("Reservado");
    const vendidos = byEstatus("Vendido");
    const alquilados = byEstatus("Alquilado");
    const valorCartera = activos.reduce((s, i) => s + (i.precio ?? 0), 0);
    const precios = activos.map((i) => i.precio).filter((p): p is number => !!p && p > 0);
    const precioMedio = precios.length ? Math.round(precios.reduce((a, b) => a + b, 0) / precios.length) : 0;
    const valorVendido = vendidos.reduce((s, i) => s + (i.precioFinal ?? i.precio ?? 0), 0);

    const estatusCount: Record<string, number> = {};
    inmuebles.forEach((i) => {
      if (!i.estatus) return;
      estatusCount[i.estatus] = (estatusCount[i.estatus] ?? 0) + 1;
    });
    const pieData = Object.entries(estatusCount)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const valorPorCat: Record<string, number> = {};
    [...CATEGORIAS, "Otros"].forEach((c) => (valorPorCat[c] = 0));
    activos.forEach((i) => {
      const c = getCategoria(i.tipo);
      valorPorCat[c] = (valorPorCat[c] ?? 0) + (i.precio ?? 0);
    });
    const barData = Object.entries(valorPorCat)
      .map(([cat, valor]) => ({ cat, valor, valorM: +(valor / 1_000_000).toFixed(2) }))
      .filter((d) => d.valor > 0)
      .sort((a, b) => b.valor - a.valor);

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

    const last = seriesData[seriesData.length - 1]?.Captaciones ?? 0;
    const prev = seriesData[seriesData.length - 2]?.Captaciones ?? 0;
    const captDelta = prev === 0 ? (last > 0 ? 100 : 0) : Math.round(((last - prev) / prev) * 100);

    const spark = seriesData.slice(-8);
    const sparkCapt = spark.map((d, i) => ({ i, v: d.Captaciones }));

    const recientes = [...inmuebles]
      .filter((i) => i.fechaInicio)
      .sort((a, b) => (b.fechaInicio ?? "").localeCompare(a.fechaInicio ?? ""))
      .slice(0, 6);

    const agMap = new Map<string, { nombre: string; activos: number; valor: number }>();
    activos.forEach((i) => {
      i.agentesNombres.forEach((n) => {
        const prevA = agMap.get(n) ?? { nombre: n, activos: 0, valor: 0 };
        prevA.activos += 1;
        prevA.valor += i.precio ?? 0;
        agMap.set(n, prevA);
      });
    });
    const topAgentes = [...agMap.values()].sort((a, b) => b.valor - a.valor).slice(0, 5);
    const maxAgValor = topAgentes[0]?.valor ?? 1;

    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const curYear = String(now.getFullYear());
    let comisionMes = 0;
    let comisionAnual = 0;
    let comisionPipeline = 0;
    inmuebles.forEach((i) => {
      const precio = i.precioFinal ?? i.precio ?? 0;
      if (!precio) return;
      const fee = isAlquiler(i.tipo)
        ? precio * COMISION_ALQUILER_MESES
        : precio * COMISION_VENTA;
      if (i.estatus === "Vendido" || i.estatus === "Alquilado") {
        if (i.fechaEscritura?.startsWith(curMonth)) comisionMes += fee;
        if (i.fechaEscritura?.startsWith(curYear)) comisionAnual += fee;
      }
      if (i.estatus === "Activo" || i.estatus === "Reservado") comisionPipeline += fee;
    });

    const stalledThreshold = 90;
    const ahora = Date.now();
    const estancadosFull = activos
      .map((i) => {
        if (!i.fechaInicio) return null;
        const dias = Math.floor((ahora - new Date(i.fechaInicio).getTime()) / 86400000);
        return dias > stalledThreshold ? { i, dias } : null;
      })
      .filter((x): x is { i: Inmueble; dias: number } => !!x)
      .sort((a, b) => b.dias - a.dias);
    const estancados = estancadosFull.slice(0, 5);

    return {
      inmuebles, activos, reservados, vendidos, alquilados,
      valorCartera, valorVendido, precioMedio,
      pieData, barData, seriesData, sparkCapt, captDelta, lastCapt: last,
      recientes, topAgentes, maxAgValor,
      comisionMes, comisionAnual, comisionPipeline,
      estancados, estancadosFull,
    };
  }, [inmData]);

  const cliStats = useMemo(() => {
    const c = cliData.clientes;
    const propietarios = c.filter((x) => x.tipo === "Propietario").length;
    const compradores = c.filter((x) => x.tipo === "Comprador" || x.tipo === "Interesado Propiedades").length;
    const conConv = c.filter((x) => (x.conversaciones?.trim().length ?? 0) > 0 || (x.motivo?.trim().length ?? 0) > 0);
    return { total: c.length, propietarios, compradores, leadsSilvia: conConv.length };
  }, [cliData]);

  const visStats = useMemo(() => {
    const v = visData.visitas;
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 86400000);
    const proximas = v.filter((x) => {
      if (!x.fecha) return false;
      const d = new Date(x.fecha);
      return d >= now && d <= in7;
    }).length;
    const realizadas = v.filter((x) => x.estado === "Realizada").length;
    const tasaRealizadas = v.length ? Math.round((realizadas / v.length) * 100) : 0;
    const ventas = stats.vendidos.length + stats.alquilados.length;
    const tasaCierre = v.length ? Math.round((ventas / v.length) * 100) : 0;
    return { total: v.length, proximas, realizadas, tasaRealizadas, tasaCierre };
  }, [visData, stats]);

  return (
    <AppShell
      title="Dashboard"
      subtitle={`${stats.activos.length} activos · ${cliStats.total} clientes · ${visStats.proximas} visitas próximas`}
    >
      {/* ── ROW 1: Bento hero ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">

        {/* Featured: Comisiones este mes */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 flex flex-col min-h-[200px]">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium mb-4">
            Comisiones este mes
          </div>
          <div className="flex-1">
            <div className="font-display font-bold text-gold tabular-nums leading-none tracking-tighter"
              style={{ fontSize: "clamp(2.75rem, 7vw, 4.5rem)" }}>
              {moneyShort(stats.comisionMes)}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
              <span className="text-muted-foreground">
                Año en curso{" "}
                <strong className="text-foreground font-semibold">{moneyShort(stats.comisionAnual)}</strong>
              </span>
              <span className="text-muted-foreground">
                Pipeline{" "}
                <strong className="text-foreground font-semibold">{moneyShort(stats.comisionPipeline)}</strong>
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

        {/* Right column: dark card + mini grid */}
        <div className="flex flex-col gap-3">
          {/* Dark "cartera activa" card */}
          <div className="flex-1 rounded-2xl bg-foreground p-5 flex flex-col" style={{ color: "var(--background)" }}>
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
            <Link
              to="/inmuebles"
              className="mt-3 text-xs font-medium inline-flex items-center gap-1 transition-opacity hover:opacity-100"
              style={{ opacity: 0.40 }}
            >
              Ver cartera <ArrowRight className="size-3" />
            </Link>
          </div>

          {/* Mini grid: Clientes + Visitas */}
          <div className="flex-1 rounded-2xl border border-border bg-card p-5 grid grid-cols-2 divide-x divide-border">
            <div className="pr-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Clientes</div>
              <div className="text-3xl font-display font-bold tabular-nums leading-none">{cliStats.total}</div>
              <Link to="/clientes" className="mt-2 text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors">
                Ver todos <ArrowRight className="size-2.5" />
              </Link>
            </div>
            <div className="pl-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mb-1.5">Visitas / 7d</div>
              <div className="text-3xl font-display font-bold tabular-nums leading-none">{visStats.proximas}</div>
              <Link to="/visitas" className="mt-2 text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 transition-colors">
                Ver agenda <ArrowRight className="size-2.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 2: Evolución + Top comerciales ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold tracking-tight mb-4">Captaciones y cierres · últimos 12 meses</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={stats.seriesData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gCapt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gVent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="Captaciones" stroke="var(--primary)" strokeWidth={2.5} fill="url(#gCapt)" activeDot={{ r: 5 }} />
              <Area type="monotone" dataKey="Ventas" stroke="var(--gold)" strokeWidth={2.5} fill="url(#gVent)" activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 flex flex-col">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Trophy className="size-4 text-gold" /> Top comerciales
          </h3>
          <div className="flex-1 space-y-3">
            {stats.topAgentes.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Sin datos.</div>
            ) : (
              stats.topAgentes.map((a, idx) => {
                const pct = Math.max(4, Math.round((a.valor / stats.maxAgValor) * 100));
                const medalTone =
                  idx === 0 ? "bg-gold text-gold-foreground"
                  : idx === 1 ? "bg-slate-300 text-slate-900"
                  : idx === 2 ? "bg-orange-700 text-white"
                  : "bg-muted text-muted-foreground";
                return (
                  <div key={a.nombre} className="flex items-center gap-3">
                    <div className={`size-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${medalTone}`}>
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="text-sm font-medium truncate">{a.nombre}</div>
                        <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                          <span className="font-semibold text-foreground">{moneyShort(a.valor)}</span>
                        </div>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-primary to-gold transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <Link to="/comerciales" className="mt-4 text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors">
            Ver ranking completo <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>

      {/* ── ROW 3: Charts + SilvIA ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">

        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-3">Distribución estado</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={stats.pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={86}
                paddingAngle={3}
                stroke="var(--card)"
                strokeWidth={2}
              >
                {stats.pieData.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#cbd5e1"} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}`, ""]} />
              <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-3">Valor por categoría</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats.barData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--gold)" stopOpacity={1} />
                  <stop offset="100%" stopColor="var(--gold)" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="cat" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" tickFormatter={(v) => `${v}M`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}M €`, ""]} />
              <Bar dataKey="valorM" fill="url(#gBar)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* SilvIA CTA */}
        <Link
          to="/silvia"
          className="rounded-2xl border border-gold/25 bg-gradient-to-br from-gold/10 to-transparent p-5 flex flex-col justify-between hover:border-gold/50 hover:shadow-lg transition-all group sm:col-span-2 lg:col-span-1"
        >
          <div className="size-11 rounded-xl bg-gradient-to-br from-gold to-amber-300 flex items-center justify-center shadow-md">
            <Sparkles className="size-5 text-gold-foreground" />
          </div>
          <div className="mt-4">
            <div className="text-base font-semibold tracking-tight">SilvIA</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {cliStats.leadsSilvia} conversaciones activas
            </div>
            <div className="text-xs text-muted-foreground mt-1">Leads cualificados por IA</div>
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

function AlertasPanel({ estancados }: { estancados: { i: Inmueble; dias: number }[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <TrendingDown className="size-4 text-destructive" /> Inmuebles estancados
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
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive text-[11px] font-bold tabular-nums">
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
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Building2 className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">
          {i.calle || "Sin dirección"} {i.numero}
          {i.ref && <span className="ml-2 text-[11px] font-mono text-muted-foreground">#{i.ref}</span>}
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
