import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { type Inmueble } from "@/lib/inmuebles.functions";
import { allInmueblesQuery } from "@/lib/queries";
import {
  UserCog,
  Building2,
  Wallet,
  TrendingUp,
  Trophy,
  ArrowRight,
  CheckCircle2,
  Clock,
} from "lucide-react";


export const Route = createFileRoute("/comerciales/")({
  head: () => ({
    meta: [
      { title: "Rendimiento por comercial · El Sol Grupo CRM" },
      {
        name: "description",
        content: "Cartera, valor gestionado y conversión por agente comercial.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(allInmueblesQuery),
  component: ComercialesPage,
  errorComponent: ({ error }) => (
    <AppShell title="Comerciales">
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

type AgenteStats = {
  nombre: string;
  total: number;
  activos: Inmueble[];
  reservados: Inmueble[];
  vendidos: Inmueble[];
  bajas: Inmueble[];
  valorActivo: number;
  valorVendido: number;
  conversion: number; // vendidos / cerrables
};

const SIN_ASIGNAR = "Sin asignar";

function ComercialesPage() {
  const { data: all } = useSuspenseQuery(allInmueblesQuery);
  const data = { inmuebles: all.inmuebles };

  const [selected, setSelected] = useState<string | null>(null);

  const agentes = useMemo<AgenteStats[]>(() => {
    const map = new Map<string, Inmueble[]>();
    data.inmuebles.forEach((i) => {
      const nombres = i.agentesNombres.length > 0 ? i.agentesNombres : [SIN_ASIGNAR];
      nombres.forEach((n) => {
        const key = n.trim() || SIN_ASIGNAR;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(i);
      });
    });
    const list: AgenteStats[] = [];
    map.forEach((items, nombre) => {
      const activos = items.filter((i) => i.estatus === "Activo");
      const reservados = items.filter((i) => i.estatus === "Reservado");
      const vendidos = items.filter((i) => i.estatus === "Vendido");
      const bajas = items.filter((i) => i.estatus === "Baja");
      const valorActivo = activos.reduce((s, i) => s + (i.precio ?? 0), 0);
      const valorVendido = vendidos.reduce((s, i) => s + (i.precioFinal ?? i.precio ?? 0), 0);
      const cerrables = activos.length + reservados.length + vendidos.length;
      const conversion = cerrables ? (vendidos.length / cerrables) * 100 : 0;
      list.push({
        nombre,
        total: items.length,
        activos,
        reservados,
        vendidos,
        bajas,
        valorActivo,
        valorVendido,
        conversion,
      });
    });
    list.sort((a, b) => b.valorActivo - a.valorActivo);
    return list;
  }, [data.inmuebles]);

  const totals = useMemo(() => {
    return agentes.reduce(
      (acc, a) => {
        acc.activos += a.activos.length;
        acc.vendidos += a.vendidos.length;
        acc.valorActivo += a.valorActivo;
        return acc;
      },
      { activos: 0, vendidos: 0, valorActivo: 0 },
    );
  }, [agentes]);

  const barData = useMemo(
    () =>
      agentes.slice(0, 10).map((a) => ({
        nombre: a.nombre.split(" ")[0],
        Activos: a.activos.length,
        Reservados: a.reservados.length,
        Vendidos: a.vendidos.length,
      })),
    [agentes],
  );

  const valorData = useMemo(
    () =>
      agentes.slice(0, 10).map((a) => ({
        nombre: a.nombre.split(" ")[0],
        valorM: +(a.valorActivo / 1_000_000).toFixed(2),
      })),
    [agentes],
  );

  const top = agentes[0];

  return (
    <AppShell title="Rendimiento por comercial">
      {/* KPIs globales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Kpi icon={UserCog} label="Comerciales activos" value={agentes.length.toString()} tone="primary" />
        <Kpi icon={Building2} label="Inmuebles activos" value={totals.activos.toString()} tone="emerald" />
        <Kpi icon={Wallet} label="Valor gestionado" value={moneyShort(totals.valorActivo)} tone="blue" />
        <Kpi
          icon={Trophy}
          label="Top comercial"
          value={top ? top.nombre.split(" ")[0] : "—"}
          hint={top ? `${top.activos.length} activos · ${moneyShort(top.valorActivo)}` : ""}
          tone="violet"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ChartCard title="Inmuebles por comercial (top 10)" icon={Building2}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="nombre" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Activos" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Reservados" stackId="a" fill="#f59e0b" />
              <Bar dataKey="Vendidos" stackId="a" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Valor de cartera activa por comercial (M€)" icon={Wallet}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={valorData}
              layout="vertical"
              margin={{ top: 5, right: 10, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                type="category"
                dataKey="nombre"
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                width={80}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${v} M€`, "Valor"]}
              />
              <Bar dataKey="valorM" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Ranking */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="size-4 text-muted-foreground" /> Ranking de comerciales
          </h3>
          <span className="text-xs text-muted-foreground">{agentes.length} comerciales</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left font-medium px-5 py-2">Comercial</th>
                <th className="text-right font-medium px-3 py-2">Activos</th>
                <th className="text-right font-medium px-3 py-2">Reservados</th>
                <th className="text-right font-medium px-3 py-2">Vendidos</th>
                <th className="text-right font-medium px-3 py-2">Valor activo</th>
                <th className="text-right font-medium px-3 py-2">Conversión</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {agentes.map((a, idx) => {
                const isOpen = selected === a.nombre;
                return (
                  <Fragment key={a.nombre}>
                    <tr
                      onClick={() => setSelected(isOpen ? null : a.nombre)}
                      className={`border-b border-border/60 hover:bg-accent/40 cursor-pointer ${
                        isOpen ? "bg-accent/30" : ""
                      }`}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={`flex size-7 items-center justify-center rounded-full text-[11px] font-semibold ${
                              idx === 0
                                ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                                : idx === 1
                                  ? "bg-slate-400/20 text-slate-700 dark:text-slate-300"
                                  : idx === 2
                                    ? "bg-orange-600/20 text-orange-700 dark:text-orange-400"
                                    : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {idx + 1}
                          </div>
                          <span className={`font-medium ${a.nombre === SIN_ASIGNAR ? "italic text-muted-foreground" : ""}`}>
                            {a.nombre}
                          </span>
                        </div>
                      </td>
                      <td className="text-right px-3 py-3 tabular-nums">{a.activos.length}</td>
                      <td className="text-right px-3 py-3 tabular-nums text-amber-600 dark:text-amber-400">
                        {a.reservados.length}
                      </td>
                      <td className="text-right px-3 py-3 tabular-nums text-blue-600 dark:text-blue-400 font-semibold">
                        {a.vendidos.length}
                      </td>
                      <td className="text-right px-3 py-3 tabular-nums font-semibold">
                        {moneyShort(a.valorActivo)}
                      </td>
                      <td className="text-right px-3 py-3">
                        <div className="inline-flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.min(100, a.conversion)}%` }}
                            />
                          </div>
                          <span className="tabular-nums text-xs w-10 text-right">{a.conversion.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        <ArrowRight className={`size-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} className="bg-muted/30 px-5 py-4">
                          <AgenteDetail agente={a} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function AgenteDetail({ agente }: { agente: AgenteStats }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Stat icon={Clock} label="Activos" value={`${agente.activos.length}`} />
        <Stat icon={Clock} label="Reservados" value={`${agente.reservados.length}`} />
        <Stat icon={CheckCircle2} label="Vendidos" value={`${agente.vendidos.length}`} />
        <Stat icon={TrendingUp} label="Valor cerrado" value={moneyShort(agente.valorVendido)} />
      </div>
      {agente.activos.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Cartera activa ({agente.activos.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {agente.activos.slice(0, 9).map((i) => (
              <Link
                key={i.id}
                to="/inmuebles/$id"
                params={{ id: i.id }}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2 hover:border-foreground/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">
                    {i.calle} {i.numero}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">
                    {i.ref && `#${i.ref} · `}{i.tipo}
                  </div>
                </div>
                <div className="text-xs font-semibold tabular-nums shrink-0">
                  {i.precio ? moneyFull(i.precio) : "—"}
                </div>
              </Link>
            ))}
          </div>
          {agente.activos.length > 9 && (
            <div className="text-[11px] text-muted-foreground mt-2">+ {agente.activos.length - 9} más</div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon className="size-3" /> {label}
      </div>
      <div className="text-sm font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = "primary",
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  hint?: string;
  tone?: "primary" | "emerald" | "blue" | "violet";
}) {
  const toneMap: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    blue: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
    violet: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground font-medium">{label}</div>
        <div className={`size-8 rounded-md flex items-center justify-center ${toneMap[tone]}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums truncate">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{hint}</div>}
    </div>
  );
}

function ChartCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof TrendingUp;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" /> {title}
      </h3>
      {children}
    </div>
  );
}
