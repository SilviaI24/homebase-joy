import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { statsQuery, operacionesQuery } from "@/lib/queries";
import {
  Users, TrendingUp, CalendarCheck, Banknote,
  Filter, ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/estadisticas/")({
  head: () => ({
    meta: [{ title: "Estadísticas · El Sol Grupo CRM" }],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(statsQuery);
    context.queryClient.ensureQueryData(operacionesQuery);
  },
  component: EstadisticasPage,
  pendingComponent: () => (
    <AppShell title="Estadísticas">
      <div className="text-sm text-muted-foreground py-10 text-center">Cargando…</div>
    </AppShell>
  ),
  errorComponent: ({ error }) => (
    <AppShell title="Estadísticas">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {error.message}
      </div>
    </AppShell>
  ),
});

const GOLD = "var(--gold, #c9a94a)";
const PALETTE = [
  "#c9a94a", "#60a5fa", "#34d399", "#f472b6",
  "#a78bfa", "#fb923c", "#38bdf8", "#4ade80",
];

function fmtMes(mes: string) {
  const [y, m] = mes.split("-");
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
}

function fmtEur(n: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function EstadisticasPage() {
  const { data: stats } = useSuspenseQuery(statsQuery);
  const { data: opsData } = useSuspenseQuery(operacionesQuery);

  const pipeline = [
    { label: "Lead",       value: stats.pipeline["Lead"] ?? 0,       color: "#94a3b8" },
    { label: "Prospecto",  value: stats.pipeline["Prospecto"] ?? 0,  color: "#60a5fa" },
    { label: "Cliente",    value: stats.pipeline["Cliente"] ?? 0,    color: "#c9a94a" },
    { label: "Histórico",  value: stats.pipeline["Histórico"] ?? 0,  color: "#34d399" },
    { label: "Descartado", value: stats.pipeline["Descartado"] ?? 0, color: "#f87171" },
  ];
  const totalContactos = pipeline.reduce((s, p) => s + p.value, 0);

  const canalData = useMemo(() =>
    Object.entries(stats.canales)
      .map(([name, value]) => ({ name: name === "null" ? "Sin canal" : name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
    [stats.canales]
  );

  const ops = opsData.operaciones;
  const opsCerradas = ops.filter(o => o.estado === "Cerrada");
  const totalComision = opsCerradas.reduce((s, o) => s + (o.comisionTotal ?? 0), 0);
  const pipelineValor = ops
    .filter(o => o.estado === "Abierta" || o.estado === "En negociación")
    .reduce((s, o) => s + (o.precioOperacion ?? 0), 0);

  const kpis = [
    { icon: Users,        label: "Contactos",         value: totalContactos.toString() },
    { icon: TrendingUp,   label: "Clientes activos",  value: (stats.pipeline["Cliente"] ?? 0).toString(), tone: "gold" as const },
    { icon: CalendarCheck,label: "Visitas realizadas", value: stats.visitasPorMes.reduce((s, m) => s + m.realizadas, 0).toString(), tone: "emerald" as const },
    { icon: Banknote,     label: "Comisiones cerradas", value: fmtEur(totalComision), tone: "amber" as const },
  ];

  const visitasData = stats.visitasPorMes.map(m => ({
    ...m, mes: fmtMes(m.mes),
  }));
  const leadsData = stats.leadsPorMes.map(m => ({
    total: m.total, mes: fmtMes(m.mes),
  }));

  const convRate = totalContactos
    ? Math.round(((stats.pipeline["Cliente"] ?? 0) / totalContactos) * 100)
    : 0;

  return (
    <AppShell title="Estadísticas" subtitle="Métricas comerciales">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Pipeline funnel */}
        <ChartCard title="Pipeline de contactos" subtitle={`${totalContactos} contactos · Conv. ${convRate}%`}>
          <div className="space-y-2">
            {pipeline.filter(p => p.value > 0).map((p) => (
              <div key={p.label} className="flex items-center gap-3">
                <span className="text-[11px] w-20 text-muted-foreground shrink-0">{p.label}</span>
                <div className="flex-1 h-5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(2, Math.round((p.value / Math.max(...pipeline.map(x => x.value), 1)) * 100))}%`,
                      background: p.color,
                    }}
                  />
                </div>
                <span className="text-[12px] font-semibold tabular-nums w-8 text-right">{p.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-border flex flex-wrap gap-x-6 gap-y-1">
            <Metric label="Pipeline (valor)" value={fmtEur(pipelineValor)} />
            <Metric label="Operaciones cerradas" value={opsCerradas.length.toString()} />
            <Metric label="Tasa conversión" value={`${convRate}%`} />
          </div>
        </ChartCard>

        {/* Canal captación */}
        <ChartCard title="Canal de captación" subtitle="Distribución por origen">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={canalData} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
              <YAxis
                type="category" dataKey="name" width={96}
                tick={{ fontSize: 9 }} stroke="var(--color-muted-foreground)"
              />
              <Tooltip
                contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }}
                cursor={{ fill: "var(--color-accent)" }}
              />
              <Bar dataKey="value" name="Contactos" radius={[0, 4, 4, 0]}>
                {canalData.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Leads por mes */}
        <ChartCard title="Leads captados" subtitle="Últimos 12 meses">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={leadsData} margin={{ left: -16, right: 4, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 9 }} stroke="var(--color-muted-foreground)" />
              <YAxis tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }}
                cursor={{ fill: "var(--color-accent)" }}
              />
              <Bar dataKey="total" name="Leads" fill={GOLD} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Visitas por mes */}
        <ChartCard title="Visitas" subtitle="Realizadas vs canceladas · 12 meses">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={visitasData} margin={{ left: -16, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 9 }} stroke="var(--color-muted-foreground)" />
              <YAxis tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 11 }}
                cursor={{ stroke: "var(--color-border)" }}
              />
              <Line dataKey="realizadas" name="Realizadas" stroke={GOLD} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
              <Line dataKey="canceladas" name="Canceladas" stroke="#f87171" strokeWidth={2} dot={{ r: 2 }} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Leads por agente */}
      {stats.agentes.length > 0 && (
        <ChartCard title="Actividad por agente" subtitle="Leads y clientes asignados">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.agentes.filter(a => a.leads + a.clientes > 0).map((a) => (
              <div key={a.nombre} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
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
                <ArrowRight className="size-3.5 text-muted-foreground/40 shrink-0" />
              </div>
            ))}
          </div>
        </ChartCard>
      )}
    </AppShell>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, tone = "default" }: {
  icon: typeof Users; label: string; value: string;
  tone?: "default" | "gold" | "emerald" | "amber";
}) {
  const toneMap = {
    default:  "text-primary bg-primary/10",
    gold:     "text-[var(--gold)] bg-[var(--gold)]/10",
    emerald:  "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    amber:    "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <div className={`size-8 rounded-md flex items-center justify-center ${toneMap[tone]}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="text-2xl font-semibold tabular-nums truncate">{value}</div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: {
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-[13px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}
