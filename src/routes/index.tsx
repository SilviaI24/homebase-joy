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
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { getCategoria, CATEGORIAS, type Inmueble } from "@/lib/inmuebles.functions";
import { allInmueblesQuery, clientesQueryOpts, visitasQuery } from "@/lib/queries";
import {
  Building2,
  Users,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Wallet,
  Clock,
  ArrowRight,
  UserCog,
  CalendarCheck2,
  Target,
  Trophy,
  Activity,
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

const C_PRIMARY = "var(--primary)";
const C_GOLD = "var(--gold)";

// Comisiones estimadas
const COMISION_VENTA = 0.03; // 3% sobre precio venta
const COMISION_ALQUILER_MESES = 1; // 1 mes de renta

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
    months.forEach((m) => {
      captCount[m.key] = 0;
      ventaCount[m.key] = 0;
    });
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

    // Captaciones MoM delta
    const last = seriesData[seriesData.length - 1]?.Captaciones ?? 0;
    const prev = seriesData[seriesData.length - 2]?.Captaciones ?? 0;
    const captDelta = prev === 0 ? (last > 0 ? 100 : 0) : Math.round(((last - prev) / prev) * 100);

    // sparklines (last 8 months)
    const spark = seriesData.slice(-8);
    const sparkCapt = spark.map((d, i) => ({ i, v: d.Captaciones }));
    const sparkVentas = spark.map((d, i) => ({ i, v: d.Ventas }));

    const recientes = [...inmuebles]
      .filter((i) => i.fechaInicio)
      .sort((a, b) => (b.fechaInicio ?? "").localeCompare(a.fechaInicio ?? ""))
      .slice(0, 6);

    // Top agentes (cartera activa)
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

    // Comisiones estimadas (mes actual + año en curso)
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const curYear = String(now.getFullYear());
    let comisionMes = 0;
    let comisionAnual = 0;
    let comisionPipeline = 0; // activos + reservados
    inmuebles.forEach((i) => {
      const precio = i.precioFinal ?? i.precio ?? 0;
      if (!precio) return;
      const fee = isAlquilerTipo(i.tipo)
        ? precio * COMISION_ALQUILER_MESES
        : precio * COMISION_VENTA;
      if (i.estatus === "Vendido" || i.estatus === "Alquilado") {
        if (i.fechaEscritura?.startsWith(curMonth)) comisionMes += fee;
        if (i.fechaEscritura?.startsWith(curYear)) comisionAnual += fee;
      }
      if (i.estatus === "Activo" || i.estatus === "Reservado") {
        comisionPipeline += fee;
      }
    });

    // Inmuebles estancados: activos con captación > 90 días sin escritura
    const stalledThreshold = 90;
    const ahora = Date.now();
    const estancados = activos
      .map((i) => {
        if (!i.fechaInicio) return null;
        const dias = Math.floor((ahora - new Date(i.fechaInicio).getTime()) / 86400000);
        return dias > stalledThreshold ? { i, dias } : null;
      })
      .filter((x): x is { i: Inmueble; dias: number } => !!x)
      .sort((a, b) => b.dias - a.dias)
      .slice(0, 5);

    return {
      inmuebles,
      activos,
      reservados,
      vendidos,
      alquilados,
      valorCartera,
      valorVendido,
      precioMedio,
      pieData,
      barData,
      seriesData,
      sparkCapt,
      sparkVentas,
      captDelta,
      lastCapt: last,
      recientes,
      topAgentes,
      maxAgValor,
      comisionMes,
      comisionAnual,
      comisionPipeline,
      estancados,
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

    // funnel: visitas -> reservas -> ventas
    const reservas = stats.reservados.length + stats.vendidos.length + stats.alquilados.length;
    const ventas = stats.vendidos.length + stats.alquilados.length;
    const funnel = [
      { name: "Visitas", value: v.length, fill: "#3b82f6" },
      { name: "Reservas", value: reservas, fill: "#f59e0b" },
      { name: "Cierres", value: ventas, fill: "#10b981" },
    ];
    return { total: v.length, proximas, realizadas, tasaRealizadas, funnel };
  }, [visData, stats]);

  return (
    <AppShell title="Dashboard">
      {/* KPIs principales con sparklines */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          icon={Building2}
          label="Inmuebles activos"
          value={stats.activos.length.toString()}
          hint={`${stats.inmuebles.length} en base · ${stats.reservados.length} reservados`}
          to="/inmuebles"
          tone="primary"
          sparkData={stats.sparkCapt}
          sparkColor="#3b82f6"
          delta={stats.captDelta}
          deltaLabel="captaciones MoM"
        />
        <KpiCard
          icon={Wallet}
          label="Valor de cartera"
          value={moneyShort(stats.valorCartera)}
          hint={`Medio: ${moneyShort(stats.precioMedio)} · Vendido: ${moneyShort(stats.valorVendido)}`}
          tone="emerald"
          sparkData={stats.sparkVentas}
          sparkColor="#10b981"
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
          icon={CalendarCheck2}
          label="Visitas"
          value={visStats.total.toString()}
          hint={`${visStats.proximas} en 7 días · ${visStats.tasaRealizadas}% realizadas`}
          to="/visitas"
          tone="violet"
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <ChartCard title="Distribución por estado" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={stats.pieData}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={92}
                paddingAngle={3}
                stroke="hsl(var(--card))"
                strokeWidth={2}
              >
                {stats.pieData.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#cbd5e1"} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} inmuebles`, ""]} />
              <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Valor de cartera por categoría" icon={Wallet} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.barData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="cat" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}M`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}M €`, "Valor"]} />
              <Bar dataKey="valorM" fill="url(#gBar)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2 — evolución (area) */}
      <div className="mb-6">
        <ChartCard
          title="Evolución de captaciones y ventas"
          subtitle="Últimos 12 meses"
          icon={Activity}
        >
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={stats.seriesData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gCapt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gVent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                type="monotone"
                dataKey="Captaciones"
                stroke="#3b82f6"
                strokeWidth={2.5}
                fill="url(#gCapt)"
                activeDot={{ r: 5 }}
              />
              <Area
                type="monotone"
                dataKey="Ventas"
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#gVent)"
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Funnel + Top agentes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <ChartCard title="Embudo comercial" icon={Target}>
          <ResponsiveContainer width="100%" height={240}>
            <RadialBarChart
              innerRadius="30%"
              outerRadius="100%"
              data={visStats.funnel}
              startAngle={90}
              endAngle={-270}
            >
              <PolarAngleAxis type="number" domain={[0, Math.max(...visStats.funnel.map((f) => f.value), 1)]} tick={false} />
              <RadialBar background dataKey="value" cornerRadius={8} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </RadialBarChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="lg:col-span-2 rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Trophy className="size-4 text-amber-500" /> Top comerciales por cartera activa
          </h3>
          {stats.topAgentes.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Sin datos de cartera asignada.</div>
          ) : (
            <div className="space-y-3">
              {stats.topAgentes.map((a, idx) => {
                const pct = Math.max(4, Math.round((a.valor / stats.maxAgValor) * 100));
                const medalTone =
                  idx === 0
                    ? "bg-amber-500 text-white"
                    : idx === 1
                      ? "bg-slate-300 text-slate-900"
                      : idx === 2
                        ? "bg-orange-700 text-white"
                        : "bg-muted text-muted-foreground";
                return (
                  <div key={a.nombre} className="flex items-center gap-3">
                    <div className={`size-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${medalTone}`}>
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-sm font-medium truncate">{a.nombre}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {a.activos} · <span className="font-semibold text-foreground">{moneyShort(a.valor)}</span>
                        </div>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary to-blue-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Link
            to="/comerciales"
            className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Ver ranking completo <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>

      {/* Acceso comerciales + SilvIA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Link
          to="/comerciales"
          className="rounded-lg border border-border bg-gradient-to-br from-primary/10 to-primary/5 p-5 hover:border-primary/40 hover:shadow-md transition-all group"
        >
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow">
              <UserCog className="size-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">Rendimiento por comercial</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Cartera, valor gestionado y conversión por agente.
              </div>
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:underline">
                Ver ranking <ArrowRight className="size-3" />
              </div>
            </div>
          </div>
        </Link>

        <Link
          to="/silvia"
          className="rounded-lg border border-border bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 p-5 hover:border-violet-500/40 hover:shadow-md transition-all group"
        >
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow">
              <Sparkles className="size-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">SilvIA tiene {cliStats.leadsSilvia} conversaciones</div>
              <div className="text-xs text-muted-foreground mt-0.5">Revisa los leads y cualifícalos.</div>
              <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-700 dark:text-violet-300 group-hover:underline">
                Ir a la bandeja <ArrowRight className="size-3" />
              </div>
            </div>
          </div>
        </Link>
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
  sparkData,
  sparkColor,
  delta,
  deltaLabel,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  hint?: string;
  to?: string;
  tone?: "primary" | "emerald" | "blue" | "violet";
  sparkData?: { i: number; v: number }[];
  sparkColor?: string;
  delta?: number;
  deltaLabel?: string;
}) {
  const toneMap: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    blue: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
    violet: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
  };
  const positive = (delta ?? 0) >= 0;
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground font-medium">{label}</div>
        <div className={`size-8 rounded-md flex items-center justify-center ${toneMap[tone]}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {typeof delta === "number" && (
          <div
            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold rounded-full px-1.5 py-0.5 ${
              positive
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-destructive/10 text-destructive"
            }`}
            title={deltaLabel}
          >
            {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {positive ? "+" : ""}
            {delta}%
          </div>
        )}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">{hint}</div>}
      {sparkData && sparkData.length > 1 && (
        <div className="mt-2 -mx-1 h-9">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparkColor ?? "#3b82f6"} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={sparkColor ?? "#3b82f6"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={sparkColor ?? "#3b82f6"}
                strokeWidth={1.75}
                fill={`url(#spark-${label})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
  if (to) {
    return (
      <Link
        to={to as "/"}
        className="rounded-lg border border-border bg-card p-4 hover:border-foreground/20 hover:shadow-md transition-all"
      >
        {inner}
      </Link>
    );
  }
  return <div className="rounded-lg border border-border bg-card p-4">{inner}</div>;
}

function ChartCard({
  title,
  subtitle,
  icon: Icon,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  icon: typeof TrendingUp;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Icon className="size-4 text-muted-foreground" /> {title}
          </h3>
          {subtitle && <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>}
        </div>
      </div>
      {children}
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
