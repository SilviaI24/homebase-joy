import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { visitasQuery, allInmueblesQuery } from "@/lib/queries";
import type { VisitaFull } from "@/lib/visitas.functions";
import {
  CalendarDays,
  TrendingUp,
  CheckCircle2,
  Clock,
  Building2,
  UserCog,
  Activity,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/visitas/")({
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
  errorComponent: ({ error }) => (
    <AppShell title="Visitas">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Error cargando visitas: {error.message}
      </div>
    </AppShell>
  ),
});

const ESTADO_COLORS: Record<string, string> = {
  Confirmada: "#10b981",
  Pendiente: "#f59e0b",
  Realizada: "#3b82f6",
  Cancelada: "#ef4444",
  "No realizada": "#94a3b8",
};

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

  const visitas = vData.visitas;

  // Mapa id -> nombre/calle de inmueble para mostrar nombres legibles.
  const inmIndex = useMemo(() => {
    const m = new Map<string, { calle: string; numero: string; barrio: string }>();
    [...inmData.inmuebles, ...inmData.alquileres].forEach((i) =>
      m.set(i.id, { calle: i.calle, numero: i.numero, barrio: i.barrio }),
    );
    return m;
  }, [inmData]);

  const now = Date.now();
  const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime();
  const periodoStart =
    periodo === "30d"
      ? now - 30 * 86400000
      : periodo === "90d"
        ? now - 90 * 86400000
        : periodo === "ytd"
          ? startOfYear
          : now - 365 * 86400000;

  const stats = useMemo(() => {
    const enPeriodo = visitas.filter((v) => {
      if (!v.fecha) return false;
      const t = new Date(v.fecha).getTime();
      return t >= periodoStart && t <= now + 30 * 86400000;
    });

    const proximas = visitas
      .filter((v) => v.fecha && new Date(v.fecha).getTime() >= now)
      .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
    const proximas14 = proximas.filter(
      (v) => v.fecha && new Date(v.fecha).getTime() <= now + 14 * 86400000,
    );

    const pasadasPeriodo = enPeriodo.filter(
      (v) => v.fecha && new Date(v.fecha).getTime() < now,
    );
    const confirmadas = pasadasPeriodo.filter(
      (v) => v.estado === "Confirmada" || v.estado === "Realizada",
    );
    const canceladas = pasadasPeriodo.filter(
      (v) => v.estado === "Cancelada" || v.estado === "No realizada",
    );

    const ratioConfirm = pasadasPeriodo.length
      ? Math.round((confirmadas.length / pasadasPeriodo.length) * 100)
      : 0;

    // Pie estados
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
      months.push({
        key,
        label: d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" }),
      });
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

    // Top inmuebles por # visitas en periodo
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
        return { id, label: label.slice(0, 28), count, barrio: meta?.barrio ?? "" };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top agentes por # visitas en periodo
    const agCount = new Map<string, number>();
    enPeriodo.forEach((v) =>
      v.agentesMails.forEach((m) => {
        if (!m) return;
        agCount.set(m, (agCount.get(m) ?? 0) + 1);
      }),
    );
    const topAgentes = Array.from(agCount.entries())
      .map(([mail, count]) => ({ mail, label: mail.split("@")[0], count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      enPeriodo,
      proximas,
      proximas14,
      confirmadas,
      canceladas,
      ratioConfirm,
      pieData,
      seriesData,
      topInmuebles,
      topAgentes,
    };
  }, [visitas, periodoStart, inmIndex, now]);

  return (
    <AppShell title="Visitas y actividad">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          Visualización del desempeño comercial: visitas, calendario y rendimiento por inmueble y agente.
        </div>
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
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          icon={CalendarDays}
          label="Visitas en periodo"
          value={stats.enPeriodo.length.toString()}
          hint={`${visitas.length} totales`}
          tone="primary"
        />
        <KpiCard
          icon={Clock}
          label="Próximas (14 días)"
          value={stats.proximas14.length.toString()}
          hint={`${stats.proximas.length} futuras`}
          tone="violet"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Confirmadas / Realizadas"
          value={stats.confirmadas.length.toString()}
          hint={`Ratio ${stats.ratioConfirm}%`}
          tone="emerald"
        />
        <KpiCard
          icon={Activity}
          label="Canceladas / No realizadas"
          value={stats.canceladas.length.toString()}
          hint="En el periodo"
          tone="amber"
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <ChartCard title="Distribución por estado" icon={TrendingUp}>
          {stats.pieData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={stats.pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {stats.pieData.map((e) => (
                    <Cell key={e.name} fill={ESTADO_COLORS[e.name] ?? "#cbd5e1"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => [`${v} visitas`, ""]}
                />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Evolución mensual (12 meses)" icon={TrendingUp} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.seriesData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Confirmadas" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Canceladas" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Total" fill="#3b82f6" radius={[6, 6, 0, 0]} opacity={0} hide />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2: top inmuebles + agentes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ChartCard title="Inmuebles más visitados" icon={Building2}>
          {stats.topInmuebles.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, stats.topInmuebles.length * 28)}>
              <BarChart
                data={stats.topInmuebles}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  width={150}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} visitas`, ""]} />
                <Bar dataKey="count" fill="#10b981" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Actividad por agente" icon={UserCog}>
          {stats.topAgentes.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, stats.topAgentes.length * 32)}>
              <BarChart
                data={stats.topAgentes}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  width={120}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} visitas`, ""]} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Calendario / agenda próximas */}
      <CalendarAgenda visitas={stats.proximas14} inmIndex={inmIndex} />

      {/* Tabla actividad reciente */}
      <div className="rounded-lg border border-border bg-card overflow-hidden mt-6">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" /> Actividad reciente
          </h3>
          <div className="text-xs text-muted-foreground">
            {stats.enPeriodo.length} en el periodo
          </div>
        </div>
        <div className="divide-y divide-border max-h-[480px] overflow-auto">
          {stats.enPeriodo.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Sin visitas en el periodo seleccionado.
            </div>
          ) : (
            stats.enPeriodo
              .slice()
              .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
              .slice(0, 50)
              .map((v) => <VisitaRow key={v.id} v={v} inmIndex={inmIndex} />)
          )}
        </div>
      </div>
    </AppShell>
  );
}

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
} as const;

function EmptyChart() {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
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
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  hint?: string;
  tone?: "primary" | "emerald" | "violet" | "amber";
}) {
  const toneMap: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    violet: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground font-medium">{label}</div>
        <div className={`size-8 rounded-md flex items-center justify-center ${toneMap[tone]}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ChartCard({
  title,
  icon: Icon,
  children,
  className = "",
}: {
  title: string;
  icon: typeof TrendingUp;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card p-5 ${className}`}>
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" /> {title}
      </h3>
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
  // Agrupa por día (próximos 14 días)
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
  return (
    <div className={`bg-card p-2 min-h-[110px] ${isToday ? "ring-2 ring-primary/40 ring-inset" : ""}`}>
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
