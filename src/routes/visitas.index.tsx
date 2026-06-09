import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ResponsiveContainer as RC,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { NewVisitaDialog } from "@/components/CreateDialogs";
import { Input } from "@/components/ui/input";

import { visitasQuery, allInmueblesQuery } from "@/lib/queries";
import type { VisitaFull } from "@/lib/visitas.functions";
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
  Flame,
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
    context.queryClient.ensureQueryData(visitasQuery);
    context.queryClient.ensureQueryData(allInmueblesQuery);
  },
  component: VisitasPage,
  pendingComponent: () => (
    <AppShell title="Visitas">
      <div className="text-sm text-muted-foreground py-10 text-center">Cargando panel…</div>
    </AppShell>
  ),
  errorComponent: ({ error }) => (
    <AppShell title="Visitas">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Error cargando visitas: {error.message}
      </div>
    </AppShell>
  ),
});

// Estados reales de Airtable, ordenados por ciclo de vida de la visita:
// Pendiente → Confirmada → Completado · Anulada / Borrada (terminales negativos)
const ESTADO_COLORS: Record<string, string> = {
  Pendiente: "#f59e0b",   // ámbar — a la espera de confirmación
  Confirmada: "#3b82f6",  // azul — agendada y confirmada
  Completado: "#10b981",  // verde — visita realizada con éxito
  Anulada: "#ef4444",     // rojo — cancelada por cliente / agente
  Borrada: "#94a3b8",     // gris — descartada del sistema
};

const ESTADOS = ["Pendiente", "Confirmada", "Completado", "Anulada", "Borrada"] as const;
// Agrupaciones semánticas para KPIs
const ESTADOS_EXITO = new Set(["Completado"]);
const ESTADOS_CANCELACION = new Set(["Anulada", "Borrada"]);
const ESTADOS_AGENDADA = new Set(["Confirmada", "Pendiente"]);
const DOW = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  fontSize: 12,
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
    periodo === "30d" ? 30 : periodo === "90d" ? 90 : periodo === "ytd" ? Math.max(1, Math.round((now - startOfYear) / 86400000)) : 365;

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
    const confirmadas = pasadasPeriodo.filter(
      (v) => v.estado === "Confirmada" || v.estado === "Realizada",
    );
    const canceladas = pasadasPeriodo.filter(
      (v) => v.estado === "Cancelada" || v.estado === "No realizada",
    );
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
    const monthCount: Record<string, { total: number; confirmadas: number; canceladas: number }> = {};
    months.forEach((m) => (monthCount[m.key] = { total: 0, confirmadas: 0, canceladas: 0 }));
    visitas.forEach((v) => {
      if (!v.fecha) return;
      const k = v.fecha.slice(0, 7);
      if (!(k in monthCount)) return;
      monthCount[k].total++;
      if (v.estado === "Confirmada" || v.estado === "Realizada") monthCount[k].confirmadas++;
      if (v.estado === "Cancelada" || v.estado === "No realizada") monthCount[k].canceladas++;
    });
    const seriesData = months.map((m) => ({
      mes: m.label,
      Total: monthCount[m.key].total,
      Confirmadas: monthCount[m.key].confirmadas,
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
        const label = meta
          ? `${meta.calle || "—"} ${meta.numero || ""}`.trim()
          : id.slice(0, 6);
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
        if (v.estado === "Realizada" || v.estado === "Confirmada") p.realizadas += 1;
        agCount.set(m, p);
      }),
    );
    const topAgentes = Array.from(agCount.entries())
      .map(([mail, p]) => ({
        mail,
        label: mail.split("@")[0],
        count: p.count,
        ratio: p.count ? Math.round((p.realizadas / p.count) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const maxTopAg = topAgentes[0]?.count ?? 1;

    // Heatmap: día de la semana × franja horaria
    const HOURS = [
      { key: "M", label: "Mañana", from: 8, to: 12 },
      { key: "D", label: "Mediodía", from: 12, to: 16 },
      { key: "T", label: "Tarde", from: 16, to: 20 },
      { key: "N", label: "Noche", from: 20, to: 24 },
    ];
    const heat: number[][] = Array.from({ length: 7 }, () => Array(HOURS.length).fill(0));
    enPeriodo.forEach((v) => {
      if (!v.fecha) return;
      const d = new Date(v.fecha);
      const dow = (d.getDay() + 6) % 7; // Lun=0
      const h = d.getHours();
      const idx = HOURS.findIndex((H) => h >= H.from && h < H.to);
      if (idx >= 0) heat[dow][idx]++;
    });
    const heatMax = Math.max(1, ...heat.flat());

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
      heat,
      heatMax,
      heatHours: HOURS,
    };
  }, [visitas, periodoStart, periodoDays, inmIndex, now]);

  const filteredActividad = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stats.enPeriodo
      .filter((v) => !estadoFilter || v.estado === estadoFilter)
      .filter((v) => {
        if (!q) return true;
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
        return blob.includes(q);
      })
      .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
      .slice(0, 80);
  }, [stats.enPeriodo, estadoFilter, search]);

  return (
    <AppShell title="Visitas y actividad">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          Visualización del desempeño comercial: visitas, calendario y rendimiento por inmueble y agente.
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-md border border-border bg-card overflow-hidden text-xs">
            {(
              [
                ["30d", "30 días"],
                ["90d", "90 días"],
                ["ytd", "Año"],
                ["12m", "12 meses"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setPeriodo(k)}
                className={`px-3 py-1.5 transition-colors ${
                  periodo === k
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-foreground/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <NewVisitaDialog />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          icon={CalendarDays}
          label="Visitas en periodo"
          value={stats.enPeriodo.length.toString()}
          hint={`${visitas.length} totales`}
          tone="primary"
          sparkData={stats.sparkTotal}
          sparkColor="#3b82f6"
          delta={stats.deltaPct}
        />
        <KpiCard
          icon={Clock}
          label="Próximas (14 días)"
          value={stats.proximas14.length.toString()}
          hint={`${stats.hoy.length} hoy · ${stats.proximas.length} futuras`}
          tone="violet"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Tasa realización"
          value={`${stats.ratioConfirm}%`}
          hint={`${stats.confirmadas.length} confirmadas / realizadas`}
          tone="emerald"
          progress={stats.ratioConfirm}
        />
        <KpiCard
          icon={XCircle}
          label="Tasa cancelación"
          value={`${stats.ratioCancel}%`}
          hint={`${stats.canceladas.length} canceladas / no realizadas`}
          tone="amber"
          progress={stats.ratioCancel}
          progressTone="amber"
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <ChartCard title="Distribución por estado" icon={TrendingUp}>
          {stats.pieData.length === 0 ? (
            <EmptyChart />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie
                    data={stats.pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={88}
                    paddingAngle={3}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  >
                    {stats.pieData.map((e) => (
                      <Cell key={e.name} fill={ESTADO_COLORS[e.name] ?? "#cbd5e1"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} visitas`, ""]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {stats.pieData.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => setEstadoFilter(estadoFilter === p.name ? null : p.name)}
                    className={`flex items-center gap-1.5 text-[11px] px-1.5 py-1 rounded transition-colors ${
                      estadoFilter === p.name ? "bg-accent" : "hover:bg-accent/60"
                    }`}
                  >
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ background: ESTADO_COLORS[p.name] ?? "#cbd5e1" }}
                    />
                    <span className="truncate">{p.name}</span>
                    <span className="ml-auto tabular-nums text-muted-foreground">{p.value}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </ChartCard>

        <ChartCard
          title="Evolución mensual"
          subtitle="Últimos 12 meses · confirmadas vs canceladas"
          icon={Activity}
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={stats.seriesData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gConf" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gCanc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="Confirmadas" stroke="#10b981" strokeWidth={2.5} fill="url(#gConf)" />
              <Area type="monotone" dataKey="Canceladas" stroke="#ef4444" strokeWidth={2.5} fill="url(#gCanc)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Heatmap + Top inmuebles + Top agentes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <ChartCard title="Mapa de actividad" subtitle="Cuándo se concentran las visitas" icon={Flame}>
          <div className="mt-2">
            <div className="grid grid-cols-[auto_repeat(4,1fr)] gap-1 text-[10px]">
              <div></div>
              {stats.heatHours.map((h) => (
                <div key={h.key} className="text-center text-muted-foreground font-medium">
                  {h.label}
                </div>
              ))}
              {DOW.map((d, di) => (
                <Fragment key={d}>
                  <div className="text-muted-foreground font-medium pr-1 flex items-center">{d}</div>
                  {stats.heatHours.map((_, hi) => {
                    const v = stats.heat[di][hi];
                    const alpha = v === 0 ? 0 : 0.15 + (v / stats.heatMax) * 0.85;
                    return (
                      <div
                        key={`${di}-${hi}`}
                        className="aspect-square rounded flex items-center justify-center text-[10px] font-semibold"
                        style={{
                          background: v === 0 ? "hsl(var(--muted))" : `rgba(59,130,246,${alpha})`,
                          color: alpha > 0.55 ? "white" : "hsl(var(--foreground))",
                        }}
                        title={`${d} ${stats.heatHours[hi].label}: ${v} visitas`}
                      >
                        {v > 0 ? v : ""}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
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
                        <span className="text-muted-foreground tabular-nums mr-1.5">{idx + 1}.</span>
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
                        <span className="text-muted-foreground tabular-nums mr-1.5">{idx + 1}.</span>
                        {a.label}
                      </div>
                      <div className="text-xs tabular-nums shrink-0">
                        <span className="font-semibold">{a.count}</span>
                        <span className="text-muted-foreground"> · {a.ratio}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-400"
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

      {/* Calendario / agenda próximas */}
      <CalendarAgenda visitas={stats.proximas14} inmIndex={inmIndex} />

      {/* Tabla actividad reciente */}
      <div className="rounded-lg border border-border bg-card overflow-hidden mt-6">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border gap-3 flex-wrap">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" /> Actividad reciente
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              · {filteredActividad.length} de {stats.enPeriodo.length}
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
                className={`px-2 py-1 transition-colors ${
                  !estadoFilter ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                }`}
              >
                Todas
              </button>
              {ESTADOS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEstadoFilter(estadoFilter === e ? null : e)}
                  className={`px-2 py-1 transition-colors border-l border-border ${
                    estadoFilter === e ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="divide-y divide-border max-h-[480px] overflow-auto">
          {filteredActividad.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Sin visitas para los filtros seleccionados.
            </div>
          ) : (
            filteredActividad.map((v) => <VisitaRow key={v.id} v={v} inmIndex={inmIndex} />)
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Fragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
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
    violet: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
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
          <RC width="100%" height="100%">
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
          </RC>
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

function CalendarAgenda({
  visitas,
  inmIndex,
}: {
  visitas: VisitaFull[];
  inmIndex: Map<string, { calle: string; numero: string; barrio: string }>;
}) {
  const days = useMemo(() => {
    const out: { key: string; label: string; date: Date; items: VisitaFull[] }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(today.getTime() + i * 86400000);
      const key = d.toISOString().slice(0, 10);
      out.push({
        key,
        date: d,
        label: d.toLocaleDateString("es-ES", {
          weekday: "short",
          day: "2-digit",
          month: "short",
        }),
        items: [],
      });
    }
    const map = new Map(out.map((d) => [d.key, d]));
    visitas.forEach((v) => {
      if (!v.fecha) return;
      const k = v.fecha.slice(0, 10);
      const day = map.get(k);
      if (day) day.items.push(v);
    });
    out.forEach((d) =>
      d.items.sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? "")),
    );
    return out;
  }, [visitas]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" /> Agenda · próximos 14 días
        </h3>
        <div className="text-xs text-muted-foreground">
          {visitas.length} visitas planificadas
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-7 gap-px bg-border">
        {days.slice(0, 7).map((d) => (
          <DayCell key={d.key} day={d} inmIndex={inmIndex} />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-7 gap-px bg-border border-t border-border">
        {days.slice(7, 14).map((d) => (
          <DayCell key={d.key} day={d} inmIndex={inmIndex} />
        ))}
      </div>
    </div>
  );
}

function DayCell({
  day,
  inmIndex,
}: {
  day: { key: string; label: string; date: Date; items: VisitaFull[] };
  inmIndex: Map<string, { calle: string; numero: string; barrio: string }>;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = day.date.getTime() === today.getTime();
  const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
  return (
    <div
      className={`p-2 min-h-[110px] ${isWeekend ? "bg-muted/30" : "bg-card"} ${
        isToday ? "ring-2 ring-primary/40 ring-inset" : ""
      }`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide mb-1.5 flex items-center justify-between">
        <span className={isToday ? "text-primary" : "text-muted-foreground"}>{day.label}</span>
        {day.items.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-primary/15 text-primary text-[10px] font-semibold">
            {day.items.length}
          </span>
        )}
      </div>
      <div className="space-y-1">
        {day.items.slice(0, 3).map((v) => {
          const inmId = v.inmuebleIds[0];
          const meta = inmId ? inmIndex.get(inmId) : null;
          const title = meta
            ? `${meta.calle || ""} ${meta.numero || ""}`.trim() || v.actividad || "Visita"
            : v.actividad || "Actividad";
          const color = ESTADO_COLORS[v.estado] ?? "#94a3b8";
          const inner = (
            <div className="text-[11px] rounded px-1.5 py-1 bg-muted/60 hover:bg-muted transition-colors truncate flex items-center gap-1.5">
              <span
                className="inline-block size-1.5 rounded-full shrink-0"
                style={{ background: color }}
              />
              <span className="font-medium text-foreground/90">{fmtTime(v.fecha)}</span>
              <span className="truncate text-muted-foreground">{title}</span>
            </div>
          );
          return inmId ? (
            <Link key={v.id} to="/inmuebles/$id" params={{ id: inmId }}>
              {inner}
            </Link>
          ) : (
            <div key={v.id}>{inner}</div>
          );
        })}
        {day.items.length > 3 && (
          <div className="text-[10px] text-muted-foreground pl-1">
            +{day.items.length - 3} más
          </div>
        )}
      </div>
    </div>
  );
}

function VisitaRow({
  v,
  inmIndex,
}: {
  v: VisitaFull;
  inmIndex: Map<string, { calle: string; numero: string; barrio: string }>;
}) {
  const inmId = v.inmuebleIds[0];
  const meta = inmId ? inmIndex.get(inmId) : null;
  const calle = meta ? `${meta.calle || ""} ${meta.numero || ""}`.trim() : "";
  const color = ESTADO_COLORS[v.estado] ?? "#94a3b8";

  const content = (
    <div className="flex items-center gap-3 px-5 py-3 hover:bg-accent/40 transition-colors">
      <div
        className="size-2 rounded-full shrink-0"
        style={{ background: color }}
        aria-label={v.estado}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate flex items-center gap-2">
          {calle || v.actividad || "Actividad sin inmueble"}
          {v.estado && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: `${color}22`, color }}
            >
              {v.estado}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {v.clientesNombres.join(", ") || "—"}
          {v.agentesMails.length > 0 && ` · ${v.agentesMails.map((m) => m.split("@")[0]).join(", ")}`}
          {v.comentarios && ` · ${v.comentarios}`}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm tabular-nums">{fmtDate(v.fecha)}</div>
        <div className="text-[11px] text-muted-foreground">{fmtTime(v.fecha)}</div>
      </div>
      {inmId && <ArrowRight className="size-3 text-muted-foreground" />}
    </div>
  );

  return inmId ? (
    <Link to="/inmuebles/$id" params={{ id: inmId }}>
      {content}
    </Link>
  ) : (
    <div>{content}</div>
  );
}
