import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { KpiCard } from "@/components/KpiCard";
import { RouteError } from "@/components/RouteError";
import { Input } from "@/components/ui/input";

import { visitasQuery, agentesQuery } from "@/lib/queries";
import { ESTADO_COLORS } from "@/lib/visitas-format";
import { EmptyChart, ChartCard, CalendarSemanal } from "@/components/visitas/ChartsPanel";
import { ListaDiaria } from "@/components/visitas/ListaDiariaPanel";
import {
  CalendarDays,
  TrendingUp,
  CheckCircle2,
  Clock,
  Building2,
  UserCog,
  Activity,
  Search,
  XCircle,
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
    context.queryClient.ensureQueryData(visitasQuery).catch(() => {});
    context.queryClient.ensureQueryData(agentesQuery).catch(() => {});
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

const ESTADOS = ["Programada", "Realizada", "Cancelada"] as const;
const ESTADOS_EXITO = new Set(["Realizada"]);
const ESTADOS_CANCELACION = new Set(["Cancelada"]);

const tooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--foreground)",
  boxShadow: "0 8px 24px -8px rgb(0 0 0 / 0.12)",
} as const;

function VisitasPage() {
  const { data: vData } = useSuspenseQuery(visitasQuery);
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

  // La propia consulta de visitas ya trae calle/numero/barrio del inmueble
  // vinculado (join en listVisitas) — ya no hace falta traer las 5.817 filas
  // de properties solo para enriquecer estos 3 campos de display.
  const inmIndex = useMemo(() => {
    const m = new Map<string, { calle: string; numero: string; barrio: string }>();
    visitas.forEach((v) => {
      const id = v.inmuebleIds[0];
      if (!id || m.has(id)) return;
      m.set(id, {
        calle: v.inmuebleCalles[0] ?? "",
        numero: v.inmuebleNumeros[0] ?? "",
        barrio: v.inmuebleBarrios[0] ?? "",
      });
    });
    return m;
  }, [visitas]);

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
          tone="primary"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Tasa realización"
          value={`${stats.ratioConfirm}%`}
          hint={`${stats.confirmadas.length} realizadas`}
          tone="success"
          progress={stats.ratioConfirm}
        />
        <KpiCard
          icon={XCircle}
          label="Tasa cancelación"
          value={`${stats.ratioCancel}%`}
          hint={`${stats.canceladas.length} canceladas`}
          tone="warning"
          progress={stats.ratioCancel}
          progressTone="warning"
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
            <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
              <button
                onClick={() => setEstadoFilter(null)}
                className={`px-2.5 py-1.5 transition-colors ${!estadoFilter ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
              >
                Todas
              </button>
              {ESTADOS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEstadoFilter(estadoFilter === e ? null : e)}
                  className={`px-2.5 py-1.5 transition-colors border-l border-border ${estadoFilter === e ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
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
                          className="h-full bg-gradient-to-r from-success to-brand-green"
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
