import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { type Inmueble } from "@/lib/inmuebles.functions";
import { allInmueblesQuery, agentesQuery, visitasQuery } from "@/lib/queries";
import {
  Users,
  Building2,
  Wallet,
  CalendarCheck,
  MapPin,
  Mail,
  Search,
  Sparkles,
  Activity,
  KeyRound,
  HandCoins,
  FileSignature,
  ArrowRight,
  Inbox,
} from "lucide-react";

export const Route = createFileRoute("/comerciales/")({
  head: () => ({
    meta: [
      { title: "Equipo comercial · El Sol Grupo CRM" },
      {
        name: "description",
        content:
          "Transparencia total: directorio del equipo, métricas agregadas y actividad del grupo El Sol.",
      },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(allInmueblesQuery),
      context.queryClient.ensureQueryData(agentesQuery),
      context.queryClient.ensureQueryData(visitasQuery),
    ]),
  component: ComercialesPage,
  errorComponent: ({ error }) => (
    <AppShell title="Equipo comercial">
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

const SIN_ASIGNAR = "Sin asignar";

type AgenteCard = {
  id: string | null; // null para "Sin asignar" o agentes externos
  nombre: string;
  mail: string;
  activos: number;
  reservados: number;
  cerrados: number; // vendidos + alquilados
  valorActivo: number;
  visitas30d: number;
  zonas: string[];
  inmuebles: Inmueble[];
};


const ESTADO_COLORS: Record<string, string> = {
  Activo: "#10b981",
  Reservado: "#f59e0b",
  Vendido: "#3b82f6",
  Alquilado: "#8b5cf6",
  Prospección: "#06b6d4",
  Baja: "#94a3b8",
};

function ComercialesPage() {
  const { data: all } = useSuspenseQuery(allInmueblesQuery);
  const { data: ag } = useSuspenseQuery(agentesQuery);
  const { data: vs } = useSuspenseQuery(visitasQuery);

  const inmuebles = all.inmuebles;
  const visitas = vs.visitas;
  const [query, setQuery] = useState("");

  // Map mail -> nombre para resolver visitas (visitas traen mails de agentes)
  const mailToNombre = useMemo(() => {
    const m = new Map<string, string>();
    ag.agentes.forEach((a) => {
      if (a.mail) m.set(a.mail.toLowerCase(), a.nombre);
    });
    return m;
  }, [ag.agentes]);

  // KPIs agregados del grupo
  const totals = useMemo(() => {
    const now = new Date();
    const d30 = new Date(now);
    d30.setDate(d30.getDate() - 30);
    const dMes = new Date(now.getFullYear(), now.getMonth(), 1);

    let activos = 0;
    let valorActivo = 0;
    let captacionesMes = 0;
    let cierresMes = 0;
    inmuebles.forEach((i) => {
      if (i.estatus === "Activo") {
        activos++;
        valorActivo += i.precio ?? 0;
      }
      if (i.fechaInicio && new Date(i.fechaInicio) >= dMes) captacionesMes++;
      if (
        i.fechaEscritura &&
        new Date(i.fechaEscritura) >= dMes &&
        (i.estatus === "Vendido" || i.estatus === "Alquilado")
      )
        cierresMes++;
    });
    const visitas30 = visitas.filter(
      (v) => v.fecha && new Date(v.fecha) >= d30,
    ).length;

    return {
      comerciales: ag.agentes.length,
      activos,
      valorActivo,
      visitas30,
      captacionesMes,
      cierresMes,
    };
  }, [inmuebles, visitas, ag.agentes]);

  // Mix por estado
  const mixEstado = useMemo(() => {
    const m = new Map<string, number>();
    inmuebles.forEach((i) => m.set(i.estatus || "—", (m.get(i.estatus || "—") ?? 0) + 1));
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [inmuebles]);

  // Distribución por zona (top localidades)
  const mixZona = useMemo(() => {
    const m = new Map<string, number>();
    inmuebles.forEach((i) => {
      const z = i.localidad?.trim() || "Sin zona";
      m.set(z, (m.get(z) ?? 0) + 1);
    });
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [inmuebles]);

  // Directorio del equipo (alfabético, sin ranking)
  const directorio = useMemo<AgenteCard[]>(() => {
    const byName = new Map<string, AgenteCard>();
    ag.agentes.forEach((a) => {
      byName.set(a.nombre, {
        id: a.id,
        nombre: a.nombre,
        mail: a.mail,
        activos: 0,
        reservados: 0,
        cerrados: 0,
        valorActivo: 0,
        visitas30d: 0,
        zonas: [],
        inmuebles: [],
      });

    });
    const zonaSet = new Map<string, Set<string>>();
    inmuebles.forEach((i) => {
      const nombres = i.agentesNombres.length > 0 ? i.agentesNombres : [SIN_ASIGNAR];
      nombres.forEach((n) => {
        const key = n.trim() || SIN_ASIGNAR;
        let card = byName.get(key);
        if (!card) {
          card = {
            id: null,
            nombre: key,
            mail: "",
            activos: 0,
            reservados: 0,
            cerrados: 0,
            valorActivo: 0,
            visitas30d: 0,
            zonas: [],
            inmuebles: [],
          };
          byName.set(key, card);
        }

        card.inmuebles.push(i);
        if (i.estatus === "Activo") {
          card.activos++;
          card.valorActivo += i.precio ?? 0;
        } else if (i.estatus === "Reservado") {
          card.reservados++;
        } else if (i.estatus === "Vendido" || i.estatus === "Alquilado") {
          card.cerrados++;
        }
        if (i.localidad) {
          if (!zonaSet.has(key)) zonaSet.set(key, new Set());
          zonaSet.get(key)!.add(i.localidad);
        }
      });
    });
    // Visitas últimos 30 días por comercial (vía mail)
    const now = new Date();
    const d30 = new Date(now);
    d30.setDate(d30.getDate() - 30);
    visitas.forEach((v) => {
      if (!v.fecha || new Date(v.fecha) < d30) return;
      v.agentesMails.forEach((m) => {
        const nombre = mailToNombre.get(m.toLowerCase());
        if (!nombre) return;
        const c = byName.get(nombre);
        if (c) c.visitas30d++;
      });
    });
    const list = Array.from(byName.values()).map((c) => ({
      ...c,
      zonas: Array.from(zonaSet.get(c.nombre) ?? []).slice(0, 4),
    }));
    list.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return list;
  }, [ag.agentes, inmuebles, visitas, mailToNombre]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return directorio;
    return directorio.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        c.mail.toLowerCase().includes(q) ||
        c.zonas.some((z) => z.toLowerCase().includes(q)),
    );
  }, [directorio, query]);

  // Actividad reciente (timeline transversal)
  const actividad = useMemo(() => {
    type Evt = {
      key: string;
      fecha: Date;
      tipo: "captacion" | "reserva" | "cierre" | "visita";
      titulo: string;
      sub: string;
      agentes: string[];
      to?: { id: string };
    };
    const evts: Evt[] = [];
    inmuebles.forEach((i) => {
      if (i.fechaInicio) {
        evts.push({
          key: `c-${i.id}`,
          fecha: new Date(i.fechaInicio),
          tipo: "captacion",
          titulo: `Captación · ${i.calle} ${i.numero}`.trim(),
          sub: i.localidad || "",
          agentes: i.agentesNombres,
          to: { id: i.id },
        });
      }
      if (i.fechaReserva) {
        evts.push({
          key: `r-${i.id}`,
          fecha: new Date(i.fechaReserva),
          tipo: "reserva",
          titulo: `Reserva · ${i.calle} ${i.numero}`.trim(),
          sub: i.localidad || "",
          agentes: i.agentesNombres,
          to: { id: i.id },
        });
      }
      if (i.fechaEscritura) {
        evts.push({
          key: `e-${i.id}`,
          fecha: new Date(i.fechaEscritura),
          tipo: "cierre",
          titulo: `${i.estatus === "Alquilado" ? "Alquiler firmado" : "Escritura"} · ${i.calle} ${i.numero}`.trim(),
          sub: i.localidad || "",
          agentes: i.agentesNombres,
          to: { id: i.id },
        });
      }
    });
    visitas.forEach((v) => {
      if (!v.fecha) return;
      const nombres = v.agentesMails
        .map((m) => mailToNombre.get(m.toLowerCase()))
        .filter((n): n is string => !!n);
      evts.push({
        key: `v-${v.id}`,
        fecha: new Date(v.fecha),
        tipo: "visita",
        titulo: `Visita · ${v.inmuebleCalles[0] ?? "Inmueble"} ${v.inmuebleNumeros[0] ?? ""}`.trim(),
        sub: v.clientesNombres.join(", ") || v.estado,
        agentes: nombres,
        to: v.inmuebleIds[0] ? { id: v.inmuebleIds[0] } : undefined,
      });
    });
    evts.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
    return evts.slice(0, 30);
  }, [inmuebles, visitas, mailToNombre]);

  return (
    <AppShell title="Equipo comercial">
      {/* Banner transparencia */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4 flex items-start gap-3">
        <div className="size-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Sparkles className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">Transparencia total del Grupo El Sol</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Todo el equipo accede a la misma información: cartera completa, actividad reciente y métricas agregadas. Sin rankings, sin silos.
          </div>
        </div>
      </div>

      {/* KPIs agregados del grupo */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-6">
        <Kpi icon={Users} label="Comerciales" value={totals.comerciales.toString()} tone="primary" />
        <Kpi icon={Building2} label="Inmuebles activos" value={totals.activos.toString()} tone="emerald" />
        <Kpi icon={Wallet} label="Valor cartera" value={moneyShort(totals.valorActivo)} tone="blue" />
        <Kpi icon={CalendarCheck} label="Visitas (30d)" value={totals.visitas30.toString()} tone="violet" />
        <Kpi icon={KeyRound} label="Captaciones mes" value={totals.captacionesMes.toString()} tone="amber" />
        <Kpi icon={FileSignature} label="Cierres mes" value={totals.cierresMes.toString()} tone="rose" />
      </div>

      {/* Métricas agregadas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ChartCard title="Mix de cartera por estado" icon={Activity}>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={mixEstado}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={2}
              >
                {mixEstado.map((e) => (
                  <Cell key={e.name} fill={ESTADO_COLORS[e.name] ?? "#64748b"} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Distribución por zona (top 8)" icon={MapPin}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={mixZona} layout="vertical" margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                stroke="hsl(var(--muted-foreground))"
                width={110}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Directorio del equipo + actividad */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Directorio */}
        <div className="xl:col-span-2 rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" /> Directorio del equipo
              <span className="text-xs text-muted-foreground font-normal">· {filtered.length} comerciales</span>
            </h3>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, mail o zona"
                className="h-8 w-64 max-w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:border-foreground/30"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
            {filtered.map((c) => (
              <AgenteCardView key={c.nombre} card={c} />
            ))}
            {filtered.length === 0 && (
              <div className="col-span-full text-center text-xs text-muted-foreground py-8">
                Sin coincidencias.
              </div>
            )}
          </div>
        </div>

        {/* Actividad reciente */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="size-4 text-muted-foreground" /> Actividad reciente
            </h3>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Grupo</span>
          </div>
          <ol className="divide-y divide-border max-h-[640px] overflow-y-auto">
            {actividad.map((e) => (
              <li key={e.key} className="px-4 py-3 hover:bg-accent/40 transition-colors">
                <div className="flex items-start gap-3">
                  <ActividadIcon tipo={e.tipo} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{e.titulo}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {e.sub}
                      {e.agentes.length > 0 && <> · {e.agentes.join(", ")}</>}
                    </div>
                    <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                      {e.fecha.toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                  {e.to && (
                    <Link
                      to="/inmuebles/$id"
                      params={{ id: e.to.id }}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <ArrowRight className="size-3.5" />
                    </Link>
                  )}
                </div>
              </li>
            ))}
            {actividad.length === 0 && (
              <li className="px-4 py-8 text-center text-xs text-muted-foreground">
                Sin actividad reciente.
              </li>
            )}
          </ol>
        </div>
      </div>
    </AppShell>
  );
}

function AgenteCardView({ card }: { card: AgenteCard }) {
  const isSinAsignar = card.nombre === SIN_ASIGNAR;
  const initials = card.nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  return (
    <div className="rounded-lg border border-border bg-background p-4 hover:border-foreground/30 transition-colors">
      <div className="flex items-start gap-3">
        <div
          className={`size-10 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
            isSinAsignar ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
          }`}
        >
          {initials || "—"}
        </div>
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-semibold truncate ${isSinAsignar ? "italic text-muted-foreground" : ""}`}>
            {card.nombre}
          </div>
          {card.mail && (
            <a
              href={`mailto:${card.mail}`}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 truncate"
            >
              <Mail className="size-3" /> {card.mail}
            </a>
          )}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 mt-3">
        <Mini label="Activos" value={card.activos} tone="emerald" />
        <Mini label="Reserv." value={card.reservados} tone="amber" />
        <Mini label="Cerrados" value={card.cerrados} tone="blue" />
        <Mini label="Visitas 30d" value={card.visitas30d} tone="violet" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
        <div className="text-muted-foreground truncate">
          <Wallet className="size-3 inline mr-1" />
          {moneyShort(card.valorActivo)} <span className="text-muted-foreground/70">en cartera</span>
        </div>
        {card.zonas.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap justify-end">
            {card.zonas.slice(0, 2).map((z) => (
              <span
                key={z}
                className="px-1.5 py-0.5 rounded border border-border bg-muted/40 text-[10px] truncate max-w-[90px]"
              >
                {z}
              </span>
            ))}
            {card.zonas.length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{card.zonas.length - 2}</span>
            )}
          </div>
        )}
      </div>
      {card.id && (
        <Link
          to="/mis-leads"
          search={{ agente: card.id }}
          className="mt-3 inline-flex items-center justify-center gap-1 w-full text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-border bg-card hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
        >
          <Inbox className="size-3" /> Ver leads asignados <ArrowRight className="size-3" />
        </Link>
      )}
    </div>
  );
}


function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "blue" | "violet";
}) {
  const toneMap: Record<string, string> = {
    emerald: "text-emerald-700 dark:text-emerald-400",
    amber: "text-amber-700 dark:text-amber-400",
    blue: "text-blue-700 dark:text-blue-400",
    violet: "text-violet-700 dark:text-violet-400",
  };
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1.5 text-center">
      <div className={`text-sm font-semibold tabular-nums ${toneMap[tone]}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground leading-none mt-0.5">{label}</div>
    </div>
  );
}

function ActividadIcon({ tipo }: { tipo: "captacion" | "reserva" | "cierre" | "visita" }) {
  const map = {
    captacion: { Icon: KeyRound, cls: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400" },
    reserva: { Icon: HandCoins, cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
    cierre: { Icon: FileSignature, cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
    visita: { Icon: CalendarCheck, cls: "bg-violet-500/10 text-violet-700 dark:text-violet-400" },
  } as const;
  const { Icon, cls } = map[tipo];
  return (
    <div className={`size-7 rounded-md flex items-center justify-center shrink-0 ${cls}`}>
      <Icon className="size-3.5" />
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone = "primary",
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  tone?: "primary" | "emerald" | "blue" | "violet" | "amber" | "rose";
}) {
  const toneMap: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    blue: "text-blue-600 dark:text-blue-400 bg-blue-500/10",
    violet: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    rose: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-muted-foreground font-medium truncate">{label}</div>
        <div className={`size-7 rounded-md flex items-center justify-center ${toneMap[tone]}`}>
          <Icon className="size-3.5" />
        </div>
      </div>
      <div className="mt-1.5 text-xl font-semibold tabular-nums truncate">{value}</div>
    </div>
  );
}

function ChartCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Activity;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" /> {title}
      </h3>
      {children}
    </div>
  );
}
