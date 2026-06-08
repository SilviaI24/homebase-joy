import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { getCategoria, CATEGORIAS, type Inmueble } from "@/lib/inmuebles.functions";
import { allInmueblesQuery, clientesQueryOpts } from "@/lib/queries";
import {
  Building2,
  Users,
  TrendingUp,
  Sparkles,
  Wallet,
  Clock,
  ArrowRight,
  UserCog,
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
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M €`;
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
  Activo: "#10b981",
  Reservado: "#f59e0b",
  Vendido: "#3b82f6",
  Baja: "#94a3b8",
  Alquilado: "#a855f7",
  Prospección: "#ec4899",
};

function Dashboard() {
  const { data: inmData } = useSuspenseQuery(inmueblesQuery);
  const { data: cliData } = useSuspenseQuery(clientesQuery);

  const stats = useMemo(() => {
    const inmuebles = inmData.inmuebles;
    const byEstatus = (e: string) => inmuebles.filter((i) => i.estatus === e);
    const activos = byEstatus("Activo");
    const reservados = byEstatus("Reservado");
    const vendidos = byEstatus("Vendido");
    const valorCartera = activos.reduce((s, i) => s + (i.precio ?? 0), 0);
    const precios = activos.map((i) => i.precio).filter((p): p is number => !!p && p > 0);
    const precioMedio = precios.length ? Math.round(precios.reduce((a, b) => a + b, 0) / precios.length) : 0;

    // Pie: distribución por estatus
    const estatusCount: Record<string, number> = {};
    inmuebles.forEach((i) => {
      if (!i.estatus) return;
      estatusCount[i.estatus] = (estatusCount[i.estatus] ?? 0) + 1;
    });
    const pieData = Object.entries(estatusCount)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Bar: valor cartera activa por categoría
    const valorPorCat: Record<string, number> = {};
    [...CATEGORIAS, "Otros"].forEach((c) => (valorPorCat[c] = 0));
    activos.forEach((i) => {
      const c = getCategoria(i.tipo);
      valorPorCat[c] = (valorPorCat[c] ?? 0) + (i.precio ?? 0);
    });
    const barData = Object.entries(valorPorCat)
      .map(([cat, valor]) => ({ cat, valor, valorM: +(valor / 1_000_000).toFixed(2) }))
      .filter((d) => d.valor > 0);

    // Series: captaciones por mes (últimos 12 meses)
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let k = 11; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
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

    const recientes = [...inmuebles]
      .filter((i) => i.fechaInicio)
      .sort((a, b) => (b.fechaInicio ?? "").localeCompare(a.fechaInicio ?? ""))
      .slice(0, 6);

    return {
      inmuebles,
      activos,
      reservados,
      vendidos,
      valorCartera,
      precioMedio,
      pieData,
      barData,
      seriesData,
      recientes,
    };
  }, [inmData]);

  const cliStats = useMemo(() => {
    const c = cliData.clientes;
    const propietarios = c.filter((x) => x.tipo === "Propietario").length;
    const compradores = c.filter((x) => x.tipo === "Comprador" || x.tipo === "Interesado Propiedades").length;
    const conConv = c.filter((x) => (x.conversaciones?.trim().length ?? 0) > 0 || (x.motivo?.trim().length ?? 0) > 0);
    return { total: c.length, propietarios, compradores, leadsSilvia: conConv.length };
  }, [cliData]);

  return (
    <AppShell title="Dashboard">
      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          icon={Building2}
          label="Inmuebles activos"
          value={stats.activos.length.toString()}
          hint={`${stats.inmuebles.length} en base`}
          to="/inmuebles"
          tone="primary"
        />
        <KpiCard
          icon={Wallet}
          label="Valor de cartera"
          value={moneyShort(stats.valorCartera)}
          hint={`Medio: ${moneyShort(stats.precioMedio)}`}
          tone="emerald"
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
          icon={Sparkles}
          label="Leads de SilvIA"
          value={cliStats.leadsSilvia.toString()}
          hint="Conversaciones con motivo"
          to="/silvia"
          tone="violet"
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <ChartCard title="Distribución por estado" icon={TrendingUp} className="lg:col-span-1">
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
                {stats.pieData.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#cbd5e1"} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${v} inmuebles`, ""]}
              />
              <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Valor de cartera activa por categoría" icon={Wallet} className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats.barData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="cat" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                tickFormatter={(v) => `${v}M`}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${v}M €`, "Valor"]}
              />
              <Bar dataKey="valorM" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts row 2 — evolución */}
      <div className="mb-6">
        <ChartCard title="Evolución de captaciones y ventas (últimos 12 meses)" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={stats.seriesData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
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
              <Line
                type="monotone"
                dataKey="Captaciones"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="Ventas"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Acceso comerciales + SilvIA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Link
          to="/comerciales"
          className="rounded-lg border border-border bg-gradient-to-br from-primary/10 to-primary/5 p-5 hover:border-primary/40 transition-colors group"
        >
          <div className="flex items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow">
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
          className="rounded-lg border border-border bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 p-5 hover:border-violet-500/40 transition-colors group"
        >
          <div className="flex items-start gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow">
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
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  hint?: string;
  to?: string;
  tone?: "primary" | "emerald" | "blue" | "violet";
}) {
  const toneMap: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    blue: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
    violet: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
  };
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground font-medium">{label}</div>
        <div className={`size-8 rounded-md flex items-center justify-center ${toneMap[tone]}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </>
  );
  if (to) {
    return (
      <Link
        to={to as "/"}
        className="rounded-lg border border-border bg-card p-4 hover:border-foreground/20 hover:shadow-sm transition-all"
      >
        {inner}
      </Link>
    );
  }
  return <div className="rounded-lg border border-border bg-card p-4">{inner}</div>;
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
