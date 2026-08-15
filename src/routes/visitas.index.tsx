import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { RouteError } from "@/components/RouteError";
import { NewVisitaDialog } from "@/components/CreateDialogs";
import { Input } from "@/components/ui/input";

import { visitasQuery, allInmueblesQuery, agentesQuery } from "@/lib/queries";
import type { VisitaFull } from "@/lib/visitas.functions";
import { updateVisitaEstado } from "@/lib/mutations.functions";
import {
  CalendarDays,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  Building2,
  UserCog,
  Activity,
  ArrowRight,
  Search,
  XCircle,
  CheckCheck,
  Ban,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/visitas/")({
  // El dashboard depende de `Date.now()` y de la zona horaria del cliente,
  // por lo que el render del servidor difería del cliente (heatmap, KPIs,
  // "próximas 14d") y provocaba mismatches de hidratación.
  ssr: false,
  head: () => ({
    meta: [
      { title: "Visitas · El Sol Grupo CRM" },
      {
        name: "description",
        content:
          "Panel de visitas y actividad comercial: KPIs, calendario, evolución y desempeño por agente e inmueble.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(visitasQuery);
    context.queryClient.ensureQueryData(allInmueblesQuery);
    context.queryClient.ensureQueryData(agentesQuery);
  },
  component: VisitasPage,
  pendingComponent: () => (
    <AppShell title="Visitas">
      <div className="text-sm text-muted-foreground py-10 text-center">Cargando panel…</div>
    </AppShell>
  ),
  errorComponent: ({ error }) => (
    <AppShell title="Visitas">
      <RouteError error={error} />
    </AppShell>
  ),
});

// Estados canónicos de ESGI. La UI no inventa estados que la base no puede
// conservar al recargar.
const ESTADO_COLORS: Record<string, string> = {
  Programada: "var(--gold)",
  Realizada: "var(--chart-1)",
  Cancelada: "var(--destructive)",
};

const ESTADOS = ["Programada", "Realizada", "Cancelada"] as const;
const ESTADOS_EXITO = new Set(["Realizada"]);
const ESTADOS_CANCELACION = new Set(["Cancelada"]);
const ESTADOS_AGENDADA = new Set(["Programada"]);

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--foreground)",
  boxShadow: "0 8px 24px -8px rgb(0 0 0 / 0.12)",
} as const;

function fmtDate(s: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(
      "es-ES",
      opts ?? { day: "2-digit", month: "short", year: "numeric" },
    );
  } catch {
    return s;
  }
}
function fmtTime(s: string | null) {
  if (!s) return "";
  try {
    return new Date(s).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function VisitasPage() {
  const { data: vData } = useSuspenseQuery(visitasQuery);
  const { data: inmData } = useSuspenseQuery(allInmueblesQuery);
  const { data: agData } = useSuspenseQuery(agentesQuery);
  const mailToNombre = useMemo(() => {
    const m = new Map<string, string>();
    agData.agentes.forEach((a) => {
      if (a.mail) m.set(a.mail.toLowerCase(), a.nombre);
    });
    return m;
  }, [agData]);
  const [periodo, setPeriodo] = useState<"30d" | "90d" | "ytd" | "12m">("90d");
  const [estadoFilter, setEstadoFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const visitas = vData.visitas;

  const inmIndex = useMemo(() => {
    const m = new Map<string, { calle: string; numero: string; barrio: string }>();
    [...inmData.inmuebles, ...inmData.alquileres].forEach((i) =>
      m.set(i.id, { calle: i.calle, numero: i.numero, barrio: i.barrio }),
    );
    return m;
  }, [inmData]);

  // Estabilizamos `now` para que los useMemo no se recalculen en cada render.
  const [now] = useState(() => Date.now());
  const startOfYear = useMemo(() => new Date(new Date(now).getFullYear(), 0, 1).getTime(), [now]);
  const periodoStart =
    periodo === "30d"
      ? now - 30 * 86400000
      : periodo === "90d"
        ? now - 90 * 86400000
        : periodo === "ytd"
          ? startOfYear
          : now - 365 * 86400000;
  const periodoDays =
    periodo === "30d"
      ? 30
      : periodo === "90d"
        ? 90
        : periodo === "ytd"
          ? Math.max(1, Math.round((now - startOfYear) / 86400000))
          : 365;

  const stats = useMemo(() => {
    const enPeriodo = visitas.filter((v) => {
      if (!v.fecha) return false;
      const t = new Date(v.fecha).getTime();
      return t >= periodoStart && t <= now + 30 * 86400000;
    });
    const periodoAnterior = visitas.filter((v) => {
      if (!v.fecha) return false;
      const t = new Date(v.fecha).getTime();
      return t >= periodoStart - periodoDays * 86400000 && t < periodoStart;
    });
    const deltaPct = periodoAnterior.length
      ? Math.round(((enPeriodo.length - periodoAnterior.length) / periodoAnterior.length) * 100)
      : enPeriodo.length > 0
        ? 100
        : 0;

    const proximas = visitas
      .filter((v) => v.fecha && new Date(v.fecha).getTime() >= now)
      .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
    const proximas14 = proximas.filter(
      (v) => v.fecha && new Date(v.fecha).getTime() <= now + 14 * 86400000,
    );
    const hoy = proximas.filter(
      (v) => v.fecha && new Date(v.fecha).toDateString() === new Date().toDateString(),
    );

    const pasadasPeriodo = enPeriodo.filter((v) => v.fecha && new Date(v.fecha).getTime() < now);
    const confirmadas = pasadasPeriodo.filter((v) => ESTADOS_EXITO.has(v.estado));
    const canceladas = pasadasPeriodo.filter((v) => ESTADOS_CANCELACION.has(v.estado));
    const ratioConfirm = pasadasPeriodo.length
      ? Math.round((confirmadas.length / pasadasPeriodo.length) * 100)
      : 0;
    const ratioCancel = pasadasPeriodo.length
      ? Math.round((canceladas.length / pasadasPeriodo.length) * 100)
      : 0;

    // Pie estados (periodo)
    const estadoCount: Record<string, number> = {};
    enPeriodo.forEach((v) => {
      if (!v.estado) return;
      estadoCount[v.estado] = (estadoCount[v.estado] ?? 0) + 1;
    });
    const pieData = Object.entries(estadoCount)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Serie por mes (12 meses)
    const months: { key: string; label: string }[] = [];
    const today = new Date();
    for (let k = 11; k >= 0; k--) {
      const d = new Date(today.getFullYear(), today.getMonth() - k, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleDateString("es-ES", { month: "short" }) });
    }
    const monthCount: Record<string, { total: number; confirmadas: number; canceladas: number }> =
      {};
    months.forEach((m) => (monthCount[m.key] = { total: 0, confirmadas: 0, canceladas: 0 }));
    visitas.forEach((v) => {
      if (!v.fecha) return;
      const k = v.fecha.slice(0, 7);
      if (!(k in monthCount)) return;
      monthCount[k].total++;
      if (ESTADOS_EXITO.has(v.estado)) monthCount[k].confirmadas++;
      if (ESTADOS_CANCELACION.has(v.estado)) monthCount[k].canceladas++;
    });
    const seriesData = months.map((m) => ({
      mes: m.label,
      Total: monthCount[m.key].total,
      Realizadas: monthCount[m.key].confirmadas,
      Canceladas: monthCount[m.key].canceladas,
    }));
    const sparkTotal = seriesData.slice(-8).map((d, i) => ({ i, v: d.Total }));

    // Top inmuebles
    const inmCount = new Map<string, number>();
    enPeriodo.forEach((v) =>
      v.inmuebleIds.forEach((id) => inmCount.set(id, (inmCount.get(id) ?? 0) + 1)),
    );
    const topInmuebles = Array.from(inmCount.entries())
      .map(([id, count]) => {
        const meta = inmIndex.get(id);
        const label = meta ? `${meta.calle || "—"} ${meta.numero || ""}`.trim() : id.slice(0, 6);
        return { id, label, count, barrio: meta?.barrio ?? "" };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const maxTopInm = topInmuebles[0]?.count ?? 1;

    // Top agentes
    const agCount = new Map<string, { count: number; realizadas: number }>();
    enPeriodo.forEach((v) =>
      v.agentesMails.forEach((m) => {
        if (!m) return;
        const p = agCount.get(m) ?? { count: 0, realizadas: 0 };
        p.count += 1;
        if (ESTADOS_EXITO.has(v.estado)) p.realizadas += 1;
        agCount.set(m, p);
      }),
    );
    const topAgentes = Array.from(agCount.entries())
      .map(([mail, p]) => ({
        mail,
        label: mailToNombre.get(mail.toLowerCase()) ?? mail.split("@")[0],
        count: p.count,
        ratio: p.count ? Math.round((p.realizadas / p.count) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const maxTopAg = topAgentes[0]?.count ?? 1;

    return {
      enPeriodo,
      proximas,
      proximas14,
      hoy,
      confirmadas,
      canceladas,
      ratioConfirm,
      ratioCancel,
      deltaPct,
      pieData,
      seriesData,
      sparkTotal,
      topInmuebles,
      maxTopInm,
      topAgentes,
      maxTopAg,
    };
  }, [visitas, periodoStart, periodoDays, inmIndex, now, mailToNombre]);

  const filteredActividad = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return visitas
      .filter((v) => !estadoFilter || v.estado === estadoFilter)
      .filter((v) => {
        if (!needle) return true;
        const blob = [
          v.estado,
          v.comentarios,
          v.actividad,
          ...v.clientesNombres,
          ...v.inmuebleCalles,
          ...v.agentesMails,
        ]
          .join(" ")
          .toLowerCase();
        return blob.includes(needle);
      })
      .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
  }, [visitas, estadoFilter, search]);

  const pieTotal = stats.pieData.reduce((s, p) => s + p.value, 0) || 1;

  return (
    <AppShell title="Visitas y actividad">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="inline-flex rounded-md border border-border bg-card overflow-hidden text-xs">
          {(["30d", "90d", "ytd", "12m"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setPeriodo(k)}
              className={`px-3 py-1.5 transition-colors ${periodo === k ? "bg-primary text-primary-foreground" : "hover:bg-accent text-foreground/80"}`}
            >
              {{ "30d": "30 días", "90d": "90 días", ytd: "Este año", "12m": "12 meses" }[k]}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard
          icon={CalendarDays}
          label="Visitas en periodo"
          value={stats.enPeriodo.length.toString()}
          hint={`${visitas.length} totales`}
          tone="primary"
          sparkData={stats.sparkTotal}
          sparkColor="var(--chart-5)"
          delta={stats.deltaPct}
        />
        <KpiCard
          icon={Clock}
          label="Próximas 14 días"
          value={stats.proximas14.length.toString()}
          hint={`${stats.hoy.length} hoy · ${stats.proximas.length} en total`}
          tone="violet"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Tasa realización"
          value={`${stats.ratioConfirm}%`}
          hint={`${stats.confirmadas.length} realizadas`}
          tone="emerald"
          progress={stats.ratioConfirm}
        />
        <KpiCard
          icon={XCircle}
          label="Tasa cancelación"
          value={`${stats.ratioCancel}%`}
          hint={`${stats.canceladas.length} canceladas`}
          tone="amber"
          progress={stats.ratioCancel}
          progressTone="amber"
        />
      </div>

      {/* ── Calendario ── */}
      <div className="mb-5">
        <CalendarSemanal visitas={visitas} inmIndex={inmIndex} now={now} />
      </div>

      {/* ── Lista diaria ── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            Todas las visitas
            <span className="text-xs font-normal text-muted-foreground">
              · {filteredActividad.length}
            </span>
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente, calle, agente…"
                className="h-8 pl-7 w-56 text-xs"
              />
            </div>
            <div className="inline-flex rounded-md border border-border overflow-hidden text-[11px]">
              <button
                onClick={() => setEstadoFilter(null)}
                className={`px-2 py-1 transition-colors ${!estadoFilter ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
              >
                Todas
              </button>
              {ESTADOS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEstadoFilter(estadoFilter === e ? null : e)}
                  className={`px-2 py-1 transition-colors border-l border-border ${estadoFilter === e ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>
        <ListaDiaria visitas={filteredActividad} inmIndex={inmIndex} now={now} />
      </div>

      {/* ── Análisis del periodo ── */}
      <div className="border-t border-border pt-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Análisis del periodo</span>
        </div>

        {/* Distribución compacta por estado */}
        {stats.pieData.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Distribución por estado
              </span>
              <span className="text-xs text-muted-foreground">
                {stats.enPeriodo.length} visitas
              </span>
            </div>
            {/* Stacked bar */}
            <div className="flex h-3 rounded-full overflow-hidden gap-px mb-3">
              {stats.pieData.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setEstadoFilter(estadoFilter === p.name ? null : p.name)}
                  style={{
                    width: `${(p.value / pieTotal) * 100}%`,
                    background: ESTADO_COLORS[p.name] ?? "#cbd5e1",
                  }}
                  className={`transition-opacity ${estadoFilter && estadoFilter !== p.name ? "opacity-25" : "opacity-100"}`}
                  title={`${p.name}: ${p.value}`}
                />
              ))}
            </div>
            {/* Legend pills */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {stats.pieData.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setEstadoFilter(estadoFilter === p.name ? null : p.name)}
                  className={`flex items-center gap-1.5 text-[11px] transition-opacity ${estadoFilter && estadoFilter !== p.name ? "opacity-40" : ""}`}
                >
                  <span
                    className="inline-block size-2 rounded-full shrink-0"
                    style={{ background: ESTADO_COLORS[p.name] ?? "#cbd5e1" }}
                  />
                  <span className="text-foreground/80">{p.name}</span>
                  <span className="font-semibold tabular-nums">{p.value}</span>
                  <span className="text-muted-foreground">
                    ({Math.round((p.value / pieTotal) * 100)}%)
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Evolución + ranking */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard
            title="Evolución mensual"
            subtitle="12 meses · realizadas vs canceladas"
            icon={TrendingUp}
            className="lg:col-span-1"
          >
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart
                data={stats.seriesData}
                margin={{ top: 4, right: 6, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gConf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gCanc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  stroke="var(--border)"
                  allowDecimals={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area
                  type="monotone"
                  dataKey="Realizadas"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#gConf)"
                />
                <Area
                  type="monotone"
                  dataKey="Canceladas"
                  stroke="var(--destructive)"
                  strokeWidth={2}
                  fill="url(#gCanc)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Inmuebles más visitados" icon={Building2}>
            {stats.topInmuebles.length === 0 ? (
              <EmptyChart />
            ) : (
              <div className="space-y-2.5">
                {stats.topInmuebles.map((t, idx) => {
                  const pct = Math.max(6, Math.round((t.count / stats.maxTopInm) * 100));
                  return (
                    <Link
                      key={t.id}
                      to="/inmuebles/$id"
                      params={{ id: t.id }}
                      className="block group"
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <div className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                          <span className="text-muted-foreground tabular-nums mr-1.5">
                            {idx + 1}.
                          </span>
                          {t.label}
                          {t.barrio && <span className="text-muted-foreground"> · {t.barrio}</span>}
                        </div>
                        <div className="text-xs font-semibold tabular-nums shrink-0">{t.count}</div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </ChartCard>

          <ChartCard title="Actividad por agente" icon={UserCog}>
            {stats.topAgentes.length === 0 ? (
              <EmptyChart />
            ) : (
              <div className="space-y-2.5">
                {stats.topAgentes.map((a, idx) => {
                  const pct = Math.max(6, Math.round((a.count / stats.maxTopAg) * 100));
                  return (
                    <div key={a.mail}>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <div className="text-xs font-medium truncate">
                          <span className="text-muted-foreground tabular-nums mr-1.5">
                            {idx + 1}.
                          </span>
                          {a.label}
                        </div>
                        <div className="text-xs tabular-nums shrink-0">
                          <span className="font-semibold">{a.count}</span>
                          <span className="text-muted-foreground"> · {a.ratio}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-primary to-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ChartCard>
        </div>
      </div>
    </AppShell>
  );
}

function EmptyChart() {
  return (
    <div className="h-[210px] flex items-center justify-center text-sm text-muted-foreground">
      Sin datos para el periodo
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "primary",
  sparkData,
  sparkColor,
  delta,
  progress,
  progressTone = "emerald",
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  hint?: string;
  tone?: "primary" | "emerald" | "violet" | "amber";
  sparkData?: { i: number; v: number }[];
  sparkColor?: string;
  delta?: number;
  progress?: number;
  progressTone?: "emerald" | "amber";
}) {
  const toneMap: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    violet: "text-primary bg-primary/10",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  };
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
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
          >
            {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {positive ? "+" : ""}
            {delta}%
          </div>
        )}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1">{hint}</div>}
      {sparkData && sparkData.length > 1 && (
        <div className="mt-2 -mx-1 h-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
              <defs>
                <linearGradient id={`vsp-${label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparkColor ?? "#3b82f6"} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={sparkColor ?? "#3b82f6"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={sparkColor ?? "#3b82f6"}
                strokeWidth={1.75}
                fill={`url(#vsp-${label})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {typeof progress === "number" && (
        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full ${
              progressTone === "amber"
                ? "bg-gradient-to-r from-amber-500 to-orange-400"
                : "bg-gradient-to-r from-emerald-500 to-teal-400"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
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
      <div className="mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" /> {title}
        </h3>
        {subtitle && <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────────

function getMonday(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d.getTime();
}

// ── CalendarSemanal ────────────────────────────────────────────────────────────

const HOUR_START = 8;
const HOUR_END = 21;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

function CalendarSemanal({
  visitas,
  inmIndex,
  now,
}: {
  visitas: VisitaFull[];
  inmIndex: Map<string, { calle: string; numero: string; barrio: string }>;
  now: number;
}) {
  const [weekStart, setWeekStart] = useState(() => getMonday(now));
  const todayStr = new Date(now).toISOString().slice(0, 10);
  const [selectedDay, setSelectedDay] = useState(todayStr);
  const [miniMonth, setMiniMonth] = useState(() => ({
    year: new Date(now).getFullYear(),
    month: new Date(now).getMonth(),
  }));

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart + i * 86400000);
        return {
          key: d.toISOString().slice(0, 10),
          date: d,
          label: d.toLocaleDateString("es-ES", { weekday: "short" }).toUpperCase().slice(0, 3),
          num: d.getDate(),
        };
      }),
    [weekStart],
  );

  const visitsByDayHour = useMemo(() => {
    const map = new Map<string, VisitaFull[]>();
    visitas.forEach((v) => {
      if (!v.fecha) return;
      const d = new Date(v.fecha);
      const hourKey = `${d.toISOString().slice(0, 10)}-${d.getHours()}`;
      if (!map.has(hourKey)) map.set(hourKey, []);
      map.get(hourKey)!.push(v);
    });
    return map;
  }, [visitas]);

  const daysWithVisits = useMemo(() => {
    const s = new Set<string>();
    visitas.forEach((v) => v.fecha && s.add(v.fecha.slice(0, 10)));
    return s;
  }, [visitas]);

  const selectedVisits = useMemo(
    () =>
      visitas
        .filter((v) => v.fecha?.slice(0, 10) === selectedDay)
        .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "")),
    [visitas, selectedDay],
  );

  const weekStats = useMemo(() => {
    const keys = new Set(weekDays.map((d) => d.key));
    const inWeek = visitas.filter((v) => v.fecha && keys.has(v.fecha.slice(0, 10)));
    return {
      total: inWeek.length,
      realizadas: inWeek.filter((v) => v.estado === "Realizada").length,
      pendientes: inWeek.filter((v) => v.estado === "Programada").length,
    };
  }, [visitas, weekDays]);

  const weekLabel = (() => {
    const a = weekDays[0];
    const z = weekDays[6];
    if (a.date.getMonth() === z.date.getMonth())
      return `${a.num} – ${z.num} ${z.date.toLocaleDateString("es-ES", { month: "short" })}`;
    return `${a.num} ${a.date.toLocaleDateString("es-ES", { month: "short" })} – ${z.num} ${z.date.toLocaleDateString("es-ES", { month: "short" })}`;
  })();

  function prevWeek() {
    setWeekStart((w) => w - 7 * 86400000);
  }
  function nextWeek() {
    setWeekStart((w) => w + 7 * 86400000);
  }
  function goToday() {
    setWeekStart(getMonday(now));
    setSelectedDay(todayStr);
  }

  function handleDaySelect(dateStr: string) {
    setSelectedDay(dateStr);
    setWeekStart(getMonday(new Date(dateStr + "T12:00:00").getTime()));
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/20">
        <CalendarDays className="size-4 text-muted-foreground shrink-0" />
        <h3 className="text-sm font-semibold flex-1">Calendario</h3>
        <button
          onClick={goToday}
          className="px-3 h-7 rounded-md border border-border text-xs font-medium hover:bg-accent transition-colors"
        >
          Hoy
        </button>
        <button
          onClick={prevWeek}
          className="size-7 rounded-md border border-border flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground"
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <span className="text-xs font-semibold min-w-[120px] text-center">{weekLabel}</span>
        <button
          onClick={nextWeek}
          className="size-7 rounded-md border border-border flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground"
        >
          <ChevronRight className="size-3.5" />
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <NewVisitaDialog />
      </div>

      {/* Body: left | grid | right */}
      <div className="grid grid-cols-[200px_1fr_190px] divide-x divide-border">
        {/* ── Left sidebar ── */}
        <div className="p-3 space-y-5 overflow-y-auto max-h-[620px]">
          <MiniCalendar
            year={miniMonth.year}
            month={miniMonth.month}
            today={todayStr}
            selected={selectedDay}
            weekStart={weekStart}
            daysWithVisits={daysWithVisits}
            onSelectDay={handleDaySelect}
            onPrevMonth={() =>
              setMiniMonth(({ year, month }) =>
                month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
              )
            }
            onNextMonth={() =>
              setMiniMonth(({ year, month }) =>
                month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
              )
            }
          />
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold mb-2">
              Tipo de evento
            </div>
            {Object.entries(ESTADO_COLORS).map(([estado, color]) => (
              <div key={estado} className="flex items-center gap-1.5 mb-1.5">
                <span
                  className="inline-block size-2 rounded-full shrink-0"
                  style={{ background: color }}
                />
                <span className="text-xs text-foreground/80">{estado}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Week grid ── */}
        <div className="overflow-auto max-h-[620px]">
          {/* Day headers */}
          <div className="grid grid-cols-[44px_repeat(7,1fr)] sticky top-0 bg-card z-10 border-b border-border">
            <div />
            {weekDays.map((d) => {
              const isToday = d.key === todayStr;
              const isSel = d.key === selectedDay;
              const isWeekend = d.date.getDay() === 0 || d.date.getDay() === 6;
              return (
                <button
                  key={d.key}
                  onClick={() => setSelectedDay(d.key)}
                  className={`flex flex-col items-center py-2 border-l border-border transition-colors hover:bg-accent/40 ${isSel ? "bg-primary/5" : isWeekend ? "bg-muted/30" : ""}`}
                >
                  <span className="text-[9px] font-semibold tracking-widest text-muted-foreground">
                    {d.label}
                  </span>
                  <span
                    className={`mt-1 w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold transition-colors ${isToday ? "bg-primary text-primary-foreground" : ""}`}
                  >
                    {d.num}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Hour rows */}
          {HOURS.map((h) => (
            <div
              key={h}
              className="grid grid-cols-[44px_repeat(7,1fr)] border-b border-border/40 min-h-[56px]"
            >
              <div className="text-[9px] text-muted-foreground px-1.5 pt-1 text-right border-r border-border/40 select-none">
                {String(h).padStart(2, "0")}:00
              </div>
              {weekDays.map((d) => {
                const isWeekend = d.date.getDay() === 0 || d.date.getDay() === 6;
                const isSel = d.key === selectedDay;
                const isToday = d.key === todayStr;
                const cellVisits = visitsByDayHour.get(`${d.key}-${h}`) ?? [];
                return (
                  <div
                    key={d.key}
                    className={`border-l border-border/40 p-0.5 ${
                      isSel
                        ? "bg-primary/[0.04]"
                        : isToday
                          ? "bg-primary/[0.02]"
                          : isWeekend
                            ? "bg-muted/20"
                            : ""
                    }`}
                  >
                    {cellVisits.map((v) => {
                      const color = ESTADO_COLORS[v.estado] ?? "#94a3b8";
                      const inmId = v.inmuebleIds[0];
                      const meta = inmId ? inmIndex.get(inmId) : null;
                      const label = meta ? meta.calle.trim() : v.actividad || "Visita";
                      const mins = v.fecha ? new Date(v.fecha).getMinutes() : 0;
                      const timeStr = `${String(h).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
                      const chip = (
                        <div
                          className="text-[9px] leading-tight rounded px-1 py-0.5 mb-0.5 cursor-pointer hover:opacity-75 transition-opacity overflow-hidden"
                          style={{ background: `${color}18`, borderLeft: `2px solid ${color}` }}
                          title={`${timeStr} · ${label}`}
                        >
                          <div className="font-semibold tabular-nums" style={{ color }}>
                            {timeStr}
                          </div>
                          <div className="truncate text-foreground/80">{label}</div>
                        </div>
                      );
                      return inmId ? (
                        <Link key={v.id} to="/inmuebles/$id" params={{ id: inmId }}>
                          {chip}
                        </Link>
                      ) : (
                        <div key={v.id}>{chip}</div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* ── Right sidebar ── */}
        <div className="p-3 space-y-5 overflow-y-auto max-h-[620px]">
          {/* Selected day detail */}
          <div>
            <div className="text-sm font-semibold">
              {selectedDay === todayStr
                ? "Hoy"
                : new Date(selectedDay + "T12:00:00").toLocaleDateString("es-ES", {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                  })}
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              {selectedVisits.length === 0
                ? "Sin eventos"
                : `${selectedVisits.length} ${selectedVisits.length === 1 ? "evento" : "eventos"}`}
            </div>
            {selectedVisits.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                Día sin eventos.
              </div>
            ) : (
              <div className="space-y-1.5">
                {selectedVisits.map((v) => {
                  const color = ESTADO_COLORS[v.estado] ?? "#94a3b8";
                  const inmId = v.inmuebleIds[0];
                  const meta = inmId ? inmIndex.get(inmId) : null;
                  const label = meta
                    ? `${meta.calle} ${meta.numero || ""}`.trim()
                    : v.actividad || "Visita";
                  return (
                    <div
                      key={v.id}
                      className="rounded-md border border-border p-2 text-[10px] leading-snug"
                      style={{ borderLeftColor: color, borderLeftWidth: 2 }}
                    >
                      <div className="font-semibold tabular-nums text-foreground">
                        {fmtTime(v.fecha) || "—"}
                      </div>
                      {inmId ? (
                        <Link
                          to="/inmuebles/$id"
                          params={{ id: inmId }}
                          className="truncate text-foreground/80 hover:text-primary transition-colors block"
                        >
                          {label}
                        </Link>
                      ) : (
                        <div className="truncate text-foreground/80">{label}</div>
                      )}
                      {v.clientesNombres.length > 0 && (
                        <div className="truncate text-muted-foreground">{v.clientesNombres[0]}</div>
                      )}
                      <div className="font-medium mt-0.5" style={{ color }}>
                        {v.estado}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Week stats */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold mb-3">
              Esta semana
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              {[
                { label: "Visitas", val: weekStats.total, color: "" },
                { label: "Realizadas", val: weekStats.realizadas, color: "" },
                {
                  label: "Pendientes",
                  val: weekStats.pendientes,
                  color: weekStats.pendientes > 0 ? "text-amber-500" : "",
                },
              ].map(({ label, val, color }) => (
                <div key={label} className="rounded-md border border-border p-2">
                  <div className={`text-xl font-semibold tabular-nums ${color}`}>{val}</div>
                  <div className="text-[10px] text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MiniCalendar ───────────────────────────────────────────────────────────────

function MiniCalendar({
  year,
  month,
  today,
  selected,
  weekStart,
  daysWithVisits,
  onSelectDay,
  onPrevMonth,
  onNextMonth,
}: {
  year: number;
  month: number;
  today: string;
  selected: string;
  weekStart: number;
  daysWithVisits: Set<string>;
  onSelectDay: (d: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const monthLabel = new Date(year, month, 1).toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });

  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function isInWeek(day: number) {
    const ts = new Date(year, month, day).getTime();
    return ts >= weekStart && ts < weekStart + 7 * 86400000;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={onPrevMonth}
          className="size-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground transition-colors"
        >
          <ChevronLeft className="size-3" />
        </button>
        <span className="text-[11px] font-semibold capitalize">{monthLabel}</span>
        <button
          onClick={onNextMonth}
          className="size-5 flex items-center justify-center rounded hover:bg-accent text-muted-foreground transition-colors"
        >
          <ChevronRight className="size-3" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[9px]">
        {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
          <div key={d} className="text-muted-foreground font-semibold pb-1">
            {d}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const ds = dateStr(day);
          const isTod = ds === today;
          const isSel = ds === selected;
          const inWk = isInWeek(day);
          const hasV = daysWithVisits.has(ds);
          return (
            <button
              key={day}
              onClick={() => onSelectDay(ds)}
              className={`relative h-6 w-full flex items-center justify-center rounded text-[10px] transition-colors leading-none
                ${
                  isSel
                    ? "bg-primary text-primary-foreground font-bold"
                    : isTod
                      ? "bg-primary/20 text-primary font-semibold"
                      : inWk
                        ? "bg-primary/8 text-foreground"
                        : "text-foreground/70 hover:bg-accent"
                }`}
            >
              {day}
              {hasV && !isSel && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-primary opacity-60" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const ESTADOS_ACTIVOS = new Set(["Programada"]);

type DayGroup = {
  key: string;
  label: string;
  isToday: boolean;
  isFuture: boolean;
  items: VisitaFull[];
};

function buildDayGroups(visitas: VisitaFull[], now: number): DayGroup[] {
  const todayStr = new Date(now).toISOString().slice(0, 10);
  const tomorrowStr = new Date(now + 86400000).toISOString().slice(0, 10);
  const in7 = new Date(now + 7 * 86400000).toISOString().slice(0, 10);

  const byDay = new Map<string, VisitaFull[]>();
  visitas.forEach((v) => {
    const k = (v.fecha ?? "sin-fecha").slice(0, 10);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(v);
  });

  const keys = Array.from(byDay.keys()).sort();
  return keys.map((k) => {
    const isFuture = k >= todayStr;
    let label: string;
    if (k === "sin-fecha") label = "Sin fecha";
    else if (k === todayStr) label = "Hoy";
    else if (k === tomorrowStr) label = "Mañana";
    else {
      const d = new Date(k + "T12:00:00");
      const dow = d.toLocaleDateString("es-ES", { weekday: "long" });
      const fecha = d.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
      if (k <= in7 && isFuture) label = `${dow.charAt(0).toUpperCase() + dow.slice(1)}, ${fecha}`;
      else label = `${dow.charAt(0).toUpperCase() + dow.slice(1)} ${fecha}`;
    }
    return { key: k, label, isToday: k === todayStr, isFuture, items: byDay.get(k)! };
  });
}

function ListaDiaria({
  visitas,
  inmIndex,
  now,
}: {
  visitas: VisitaFull[];
  inmIndex: Map<string, { calle: string; numero: string; barrio: string }>;
  now: number;
}) {
  const [collapsedPast, setCollapsedPast] = useState(true);
  const groups = useMemo(() => buildDayGroups(visitas, now), [visitas, now]);
  const futureGroups = groups.filter((g) => g.isFuture);
  const pastGroups = groups.filter((g) => !g.isFuture).reverse();
  const pastCount = pastGroups.reduce((s, g) => s + g.items.length, 0);
  const pastVisible = collapsedPast ? pastGroups.slice(0, 5) : pastGroups;

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Sin visitas para los filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
      {futureGroups.map((g) => (
        <DaySection key={g.key} group={g} inmIndex={inmIndex} now={now} />
      ))}

      {pastGroups.length > 0 && (
        <>
          {/* Historial toggle row */}
          <button
            onClick={() => setCollapsedPast((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-2 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
          >
            {collapsedPast ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronUp className="size-3.5 text-muted-foreground" />
            )}
            <span className="text-[11px] font-medium text-muted-foreground">
              Historial · {pastCount} visitas
            </span>
          </button>
          {!collapsedPast &&
            pastVisible.map((g) => (
              <DaySection key={g.key} group={g} inmIndex={inmIndex} now={now} past />
            ))}
          {collapsedPast &&
            pastGroups.length > 0 &&
            /* preview: show last 3 past visits compactly */
            pastVisible
              .slice(0, 2)
              .map((g) => <DaySection key={g.key} group={g} inmIndex={inmIndex} now={now} past />)}
        </>
      )}
    </div>
  );
}

function DaySection({
  group,
  inmIndex,
  now,
  past = false,
}: {
  group: DayGroup;
  inmIndex: Map<string, { calle: string; numero: string; barrio: string }>;
  now: number;
  past?: boolean;
}) {
  return (
    <>
      {/* Separator row */}
      <div
        className={`flex items-center gap-3 px-4 py-1.5 select-none ${group.isToday ? "bg-primary/5" : "bg-muted/30"}`}
      >
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${group.isToday ? "text-primary" : "text-muted-foreground"}`}
        >
          {group.label}
        </span>
        <span
          className={`text-[10px] tabular-nums ${group.isToday ? "text-primary/70" : "text-muted-foreground/60"}`}
        >
          {group.items.length}
        </span>
      </div>
      {/* Visit rows */}
      {group.items.map((v) => (
        <VisitaRowDiaria key={v.id} v={v} inmIndex={inmIndex} now={now} past={past} />
      ))}
    </>
  );
}

function VisitaRowDiaria({
  v,
  inmIndex,
  now,
  past,
}: {
  v: VisitaFull;
  inmIndex: Map<string, { calle: string; numero: string; barrio: string }>;
  now: number;
  past: boolean;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateVisitaEstado);

  const mut = useMutation({
    mutationFn: (estado: string) => updateFn({ data: { visitaId: v.id, estado } }),
    onSuccess: async (_result, estado) => {
      await qc.invalidateQueries({ queryKey: ["visitas-all"] });
      await qc.invalidateQueries({ queryKey: ["visitas", "inmueble"] });
      toast.success(`Visita marcada como ${estado}`);
    },
    onError: (e: Error) => toast.error(e.message || "Error al actualizar"),
  });

  const inmId = v.inmuebleIds[0];
  const meta = inmId ? inmIndex.get(inmId) : null;
  const calle = meta ? `${meta.calle || ""} ${meta.numero || ""}`.trim() : "";
  const label = calle || v.actividad || "Sin dirección";
  const color = ESTADO_COLORS[v.estado] ?? "#94a3b8";
  const isActive = ESTADOS_ACTIVOS.has(v.estado);
  const pending = mut.isPending;

  const addressEl = inmId ? (
    <Link
      to="/inmuebles/$id"
      params={{ id: inmId }}
      className="truncate hover:text-primary transition-colors"
    >
      {label}
    </Link>
  ) : (
    <span className="truncate">{label}</span>
  );

  return (
    <div
      className={`flex items-center gap-3 px-4 h-10 hover:bg-accent/30 transition-colors ${past ? "opacity-70" : ""}`}
    >
      {/* Hora */}
      <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground font-medium">
        {fmtTime(v.fecha) || "—"}
      </span>

      {/* Estado dot */}
      <span
        className="size-2 rounded-full shrink-0"
        style={{ background: color }}
        title={v.estado}
      />

      {/* Dirección */}
      <span className="flex-1 min-w-0 text-xs font-medium text-foreground truncate">
        {addressEl}
      </span>

      {/* Cliente */}
      {v.clientesNombres.length > 0 && (
        <span className="hidden md:block w-36 shrink-0 text-[11px] text-muted-foreground truncate">
          {v.clientesNombres[0]}
        </span>
      )}

      {/* Estado badge (solo en historial / terminales) */}
      {!isActive && (
        <span
          className="hidden sm:inline-flex shrink-0 items-center text-[10px] font-medium rounded-full px-2 py-0.5"
          style={{ background: `${color}18`, color }}
        >
          {v.estado}
        </span>
      )}

      {/* Acciones */}
      {isActive ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => mut.mutate("Realizada")}
            disabled={pending}
            title="Realizada"
            className="size-7 flex items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            <CheckCheck className="size-3.5" />
          </button>
          <button
            onClick={() => mut.mutate("Cancelada")}
            disabled={pending}
            title="Anular"
            className="size-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
          >
            <Ban className="size-3.5" />
          </button>
        </div>
      ) : (
        inmId && <ArrowRight className="size-3.5 text-muted-foreground/50 shrink-0" />
      )}
    </div>
  );
}
