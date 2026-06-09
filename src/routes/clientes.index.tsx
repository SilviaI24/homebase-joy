import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { NewClienteDialog } from "@/components/CreateDialogs";
import { SafeImage } from "@/components/SafeImage";
import {
  listClientes,
  type Cliente,
  type MiniInmueble,
  type Segmento,
  type EstadoComercial,
} from "@/lib/clientes.functions";

import {
  Search,
  Mail,
  Phone,
  IdCard,
  Building2,
  Paperclip,
  FileText,
  Briefcase,
  Dog,
  ShieldCheck,
  CalendarDays,
  MapPin,
  ChevronRight,
  Euro,
  Sparkles,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Home,
  ShoppingCart,
  KeyRound,
  Flame,
  UserPlus,
  Snowflake,
  XCircle,
  TrendingUp,
} from "lucide-react";
import {
  CanalChip,
  Transcripcion,
  inferCanal,
  hasSilviaConversation,
} from "@/components/silvia/conversation";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const clientesQuery = queryOptions({
  queryKey: ["clientes"],
  queryFn: () => listClientes(),
});

export const Route = createFileRoute("/clientes/")({
  validateSearch: (s: Record<string, unknown>) => ({
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Clientes · El Sol Grupo CRM" },
      { name: "description", content: "Gestión de clientes activos y potenciales." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(clientesQuery),
  component: ClientesPage,
  errorComponent: ({ error }) => (
    <AppShell title="Clientes">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Error cargando clientes: {error.message}
      </div>
    </AppShell>
  ),
});

// =============================================================
// Configuración visual de segmentos y estados
// =============================================================
const SEG_META: Record<
  Segmento,
  { label: string; icon: typeof Home; color: string; chip: string; ring: string; tone: string }
> = {
  Propietario: {
    label: "Propietarios",
    icon: Home,
    color: "text-emerald-600 dark:text-emerald-400",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    ring: "ring-emerald-500/30",
    tone: "from-emerald-500/10 to-transparent",
  },
  Comprador: {
    label: "Compradores",
    icon: ShoppingCart,
    color: "text-blue-600 dark:text-blue-400",
    chip: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20",
    ring: "ring-blue-500/30",
    tone: "from-blue-500/10 to-transparent",
  },
  Inquilino: {
    label: "Inquilinos",
    icon: KeyRound,
    color: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20",
    ring: "ring-amber-500/30",
    tone: "from-amber-500/10 to-transparent",
  },
  Prospecto: {
    label: "Prospectos",
    icon: Flame,
    color: "text-violet-600 dark:text-violet-400",
    chip: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/20",
    ring: "ring-violet-500/30",
    tone: "from-violet-500/10 to-transparent",
  },
  Lead: {
    label: "Leads",
    icon: UserPlus,
    color: "text-slate-600 dark:text-slate-400",
    chip: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/20",
    ring: "ring-slate-500/30",
    tone: "from-slate-500/10 to-transparent",
  },
  Descartado: {
    label: "Descartados",
    icon: XCircle,
    color: "text-rose-600 dark:text-rose-400",
    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/20",
    ring: "ring-rose-500/30",
    tone: "from-rose-500/10 to-transparent",
  },
};

const EST_META: Record<EstadoComercial, { icon: typeof Clock; chip: string; dot: string }> = {
  Cerrado: {
    icon: CheckCircle2,
    chip: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  Activo: {
    icon: TrendingUp,
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  "En curso": {
    icon: Clock,
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  Frío: {
    icon: Snowflake,
    chip: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    dot: "bg-slate-400",
  },
  Descartado: {
    icon: XCircle,
    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
    dot: "bg-rose-500",
  },
};

const SEG_BAR: Record<Segmento, string> = {
  Propietario: "bg-emerald-500",
  Comprador: "bg-blue-500",
  Inquilino: "bg-amber-500",
  Prospecto: "bg-violet-500",
  Lead: "bg-slate-400",
  Descartado: "bg-rose-500",
};

const SEGMENTOS_TABS: Array<Segmento | "Todos"> = [
  "Todos",
  "Propietario",
  "Comprador",
  "Inquilino",
  "Prospecto",
  "Lead",
];
const ESTADOS_TABS: Array<EstadoComercial | "Todos"> = [
  "Todos",
  "Activo",
  "En curso",
  "Cerrado",
  "Frío",
];

function initials(name: string): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function SegmentoBadge({ s }: { s: Segmento }) {
  const m = SEG_META[s];
  const Icon = m.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${m.chip}`}
    >
      <Icon className="size-3" />
      {s}
    </span>
  );
}

function EstadoBadge({ e }: { e: EstadoComercial }) {
  const m = EST_META[e];
  const Icon = m.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${m.chip}`}
    >
      <Icon className="size-3" />
      {e}
    </span>
  );
}

function ClientesPage() {
  const { data } = useSuspenseQuery(clientesQuery);
  const router = useRouter();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState<Segmento | "Todos">("Todos");
  const [estado, setEstado] = useState<EstadoComercial | "Todos">("Todos");
  const [selectedId, setSelectedId] = useState<string | null>(search.id ?? null);

  useEffect(() => {
    if (!search.id) return;
    const c = data.clientes.find((x) => x.id === search.id);
    if (!c) return;
    setSelectedId(c.id);
  }, [search.id, data.clientes]);

  function selectCliente(id: string | null) {
    setSelectedId(id);
    navigate({ search: { id: id ?? undefined }, replace: true });
  }

  // KPIs por segmento (sobre todo el universo)
  const segCounts = useMemo(() => {
    const m: Record<Segmento, number> = {
      Propietario: 0,
      Comprador: 0,
      Inquilino: 0,
      Prospecto: 0,
      Lead: 0,
      Descartado: 0,
    };
    data.clientes.forEach((c) => {
      m[c.segmento]++;
    });
    return m;
  }, [data.clientes]);

  const baseSet = useMemo(() => {
    return data.clientes.filter((c) => {
      if (seg === "Todos" ? c.segmento === "Descartado" : seg !== c.segmento) {
        // Excluir "Descartado" cuando estamos en Todos a menos que se filtre estado descartado
        if (seg === "Todos" && c.segmento === "Descartado" && estado !== "Descartado") return false;
        if (seg !== "Todos" && seg !== c.segmento) return false;
      }
      return true;
    });
  }, [data.clientes, seg, estado]);

  const estadoCounts = useMemo(() => {
    const m: Record<string, number> = { Todos: baseSet.length };
    ESTADOS_TABS.forEach((e) => e !== "Todos" && (m[e] = 0));
    baseSet.forEach((c) => {
      if (m[c.estadoComercial] != null) m[c.estadoComercial]++;
    });
    return m;
  }, [baseSet]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return baseSet.filter((c) => {
      if (estado !== "Todos" && c.estadoComercial !== estado) return false;
      if (!n) return true;
      return (
        c.nombre.toLowerCase().includes(n) ||
        c.email.toLowerCase().includes(n) ||
        c.telefono.toLowerCase().includes(n) ||
        c.dni.toLowerCase().includes(n) ||
        c.propiedadRefs.some((r) => r.toLowerCase().includes(n)) ||
        c.propiedadCalles.some((s) => s.toLowerCase().includes(n))
      );
    });
  }, [baseSet, q, estado]);

  const selected = useMemo(
    () => data.clientes.find((c) => c.id === selectedId) ?? null,
    [data.clientes, selectedId],
  );

  return (
    <AppShell title="Clientes">
      {/* ---------- KPIs por segmento ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {(["Propietario", "Comprador", "Inquilino", "Prospecto", "Lead"] as Segmento[]).map((s) => {
          const m = SEG_META[s];
          const Icon = m.icon;
          const count = segCounts[s];
          const total = data.clientes.length - segCounts.Descartado;
          const pct = total ? Math.round((count / total) * 100) : 0;
          const active = seg === s;
          return (
            <button
              key={s}
              onClick={() => {
                setSeg(active ? "Todos" : s);
                setEstado("Todos");
              }}
              className={`group relative text-left rounded-xl border border-border bg-card p-3 overflow-hidden transition-all hover:border-foreground/20 hover:shadow-sm ${
                active ? `ring-2 ${m.ring}` : ""
              }`}
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${m.tone} opacity-60`} />
              <div className="relative flex items-start justify-between gap-2">
                <div>
                  <div className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${m.color}`}>
                    <Icon className="size-3.5" />
                    {m.label}
                  </div>
                  <div className="mt-1 text-2xl font-bold tracking-tight">{count}</div>
                  <div className="text-[11px] text-muted-foreground">{pct}% del total</div>
                </div>
                <ChevronRight
                  className={`size-4 text-muted-foreground transition-transform ${
                    active ? "rotate-90 text-foreground" : "group-hover:translate-x-0.5"
                  }`}
                />
              </div>
              <div className="relative mt-2 h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full ${SEG_BAR[s]}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* ---------- Toolbar ---------- */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, email, teléfono, DNI o referencia…"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => router.invalidate()}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent"
          >
            Refrescar
          </button>
          <NewClienteDialog />
        </div>
      </div>

      {/* ---------- Filtros: segmento (chips) + estado ---------- */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
          {SEGMENTOS_TABS.map((s) => {
            const active = seg === s;
            const count =
              s === "Todos"
                ? data.clientes.length - segCounts.Descartado
                : segCounts[s as Segmento] ?? 0;
            return (
              <button
                key={s}
                onClick={() => setSeg(s)}
                className={`px-2.5 h-7 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1 ${
                  active ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-accent"
                }`}
              >
                {s}
                <span className={`text-[10px] ${active ? "opacity-80" : "text-muted-foreground"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
          {ESTADOS_TABS.map((e) => {
            const active = estado === e;
            const count = e === "Todos" ? baseSet.length : estadoCounts[e] ?? 0;
            return (
              <button
                key={e}
                onClick={() => setEstado(e)}
                className={`px-2.5 h-7 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1 ${
                  active ? "bg-foreground text-background" : "text-foreground/70 hover:bg-accent"
                }`}
              >
                {e !== "Todos" && <span className={`inline-block size-1.5 rounded-full ${EST_META[e as EstadoComercial].dot}`} />}
                {e}
                <span className={`text-[10px] ${active ? "opacity-80" : "text-muted-foreground"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
        </div>
      </div>

      {/* ---------- Tabla ---------- */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left text-[11px] uppercase tracking-wide">
                <th className="px-3 py-2.5 font-medium">Cliente</th>
                <th className="px-3 py-2.5 font-medium">Segmento</th>
                <th className="px-3 py-2.5 font-medium">Estado</th>
                <th className="px-3 py-2.5 font-medium hidden md:table-cell">Inmuebles</th>
                <th className="px-3 py-2.5 font-medium hidden lg:table-cell">Alta</th>
                <th className="px-3 py-2.5 font-medium hidden xl:table-cell">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const active = c.id === selectedId;
                const hasSilvia = hasSilviaConversation(c);
                const m = SEG_META[c.segmento];
                return (
                  <tr
                    key={c.id}
                    onClick={() => selectCliente(c.id)}
                    className={`border-t border-border cursor-pointer transition-colors ${
                      active ? "bg-accent/60" : "hover:bg-accent/30"
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`shrink-0 size-9 rounded-full grid place-items-center text-[11px] font-bold border ${m.chip}`}
                        >
                          {initials(c.nombre)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium truncate max-w-[200px]">
                              {c.nombre || "—"}
                            </span>
                            {hasSilvia && (
                              <Link
                                to="/silvia"
                                onClick={(e) => e.stopPropagation()}
                                title="Ver conversación con SilvIA"
                                className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-400 px-1.5 py-0.5 hover:bg-violet-500/20"
                              >
                                <Sparkles className="size-2.5" /> SilvIA
                              </Link>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                            {c.telefono || c.email || "Sin contacto"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <SegmentoBadge s={c.segmento} />
                    </td>
                    <td className="px-3 py-2.5">
                      <EstadoBadge e={c.estadoComercial} />
                    </td>
                    <td className="px-3 py-2.5 text-xs hidden md:table-cell">
                      {c.inmueblesActivos.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                          <Building2 className="size-3.5" />
                          {c.inmueblesActivos.length} activo{c.inmueblesActivos.length !== 1 ? "s" : ""}
                        </span>
                      ) : c.matches.length > 0 && c.estadoComercial !== "Cerrado" ? (
                        <span className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400">
                          <Sparkles className="size-3.5" />
                          {c.matches.length} match
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">
                      {c.diasDesdeAlta != null ? `hace ${c.diasDesdeAlta}d` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground hidden xl:table-cell truncate max-w-[260px]">
                      {c.motivo || "—"}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    Sin resultados con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && selectCliente(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 overflow-y-auto">
          {selected && <ClienteDetalle cliente={selected} />}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

// =============================================================
// Panel lateral de detalle
// =============================================================
function estatusClase(estatus: string) {
  const map: Record<string, string> = {
    Activo: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    Reservado: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    Vendido: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    Alquilado: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    Baja: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
    Prospección: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  };
  return map[estatus] ?? "bg-secondary text-secondary-foreground";
}

function InmuebleCard({ p }: { p: MiniInmueble }) {
  return (
    <Link
      to="/inmuebles/$id"
      params={{ id: p.id }}
      className="group flex gap-3 rounded-xl border border-border bg-background p-3 hover:shadow-md hover:border-primary/30 transition-all"
    >
      <div className="shrink-0">
        <SafeImage
          src={p.imagen}
          alt={p.calle || p.ref}
          className="h-20 w-28 rounded-lg"
          imgClassName="object-cover"
        />
      </div>
      <div className="min-w-0 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              #{p.ref || p.id}
            </span>
            {p.estatus && (
              <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${estatusClase(p.estatus)}`}>
                {p.estatus}
              </span>
            )}
            <span
              className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${
                p.esAlquiler
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
              }`}
            >
              {p.esAlquiler ? "Alquiler" : "Venta"}
            </span>
            <span className="text-[10px] text-muted-foreground">{p.categoria}</span>
          </div>
          <div className="text-sm font-semibold text-foreground truncate">
            {[p.calle, p.numero].filter(Boolean).join(" ") || "Sin dirección"}
          </div>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{[p.barrio, p.localidad].filter(Boolean).join(" · ")}</span>
          </div>
          {(p.precio ?? p.precioFinal) != null && (
            <div className="flex items-center gap-0.5 text-xs font-bold text-foreground shrink-0">
              <Euro className="size-3" />
              {(p.precioFinal ?? p.precio)!.toLocaleString("es-ES")}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>
    </Link>
  );
}

function ClienteDetalle({ cliente }: { cliente: Cliente }) {
  const segMeta = SEG_META[cliente.segmento];
  return (
    <aside className="bg-card">
      <header className={`relative p-5 border-b border-border overflow-hidden`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${segMeta.tone} opacity-70 pointer-events-none`} />
        <div className="relative flex items-start gap-3">
          <div
            className={`shrink-0 size-12 rounded-full grid place-items-center text-sm font-bold border ${segMeta.chip}`}
          >
            {initials(cliente.nombre)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-base truncate">{cliente.nombre || "Sin nombre"}</h2>
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <SegmentoBadge s={cliente.segmento} />
              <EstadoBadge e={cliente.estadoComercial} />
              {cliente.trabajado && (
                <span className="text-[10px] bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 rounded-full px-2 py-0.5">
                  {cliente.trabajado}
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5">{cliente.segmentoMotivo}</div>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-5">
        <Section title="Contacto">
          <Row icon={<Phone className="size-3.5" />} label="Teléfono" value={cliente.telefono} />
          <Row icon={<Mail className="size-3.5" />} label="Email" value={cliente.email} />
          <Row icon={<IdCard className="size-3.5" />} label="DNI" value={cliente.dni} />
          <Row icon={<Briefcase className="size-3.5" />} label="Profesión" value={cliente.profesion} />
          <Row
            icon={<CalendarDays className="size-3.5" />}
            label="Fecha alta"
            value={
              cliente.fecha
                ? `${new Date(cliente.fecha).toLocaleDateString("es-ES")}${
                    cliente.diasDesdeAlta != null ? ` · hace ${cliente.diasDesdeAlta}d` : ""
                  }`
                : ""
            }
          />
        </Section>

        {(cliente.preferencias.presupuesto.max != null ||
          cliente.preferencias.habitaciones != null ||
          cliente.preferencias.zonas.length > 0 ||
          cliente.duplicados > 1) && (
          <Section title="Perfil detectado">
            <div className="flex flex-wrap gap-1.5">
              {cliente.preferencias.presupuesto.max != null && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full bg-primary/10 text-primary px-2.5 py-1">
                  Presup. hasta {cliente.preferencias.presupuesto.max.toLocaleString("es-ES")} €
                </span>
              )}
              {cliente.preferencias.habitaciones != null && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full bg-primary/10 text-primary px-2.5 py-1">
                  {cliente.preferencias.habitaciones} hab.
                </span>
              )}
              {cliente.preferencias.zonas.slice(0, 4).map((z) => (
                <span key={z} className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full bg-gold/15 text-foreground px-2.5 py-1 capitalize">
                  {z}
                </span>
              ))}
              {cliente.duplicados > 1 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2.5 py-1">
                  {cliente.duplicados} llamadas registradas
                </span>
              )}
            </div>
          </Section>
        )}

        {cliente.inmueblesActivos.length > 0 && (
          <Section title={`Propiedades activas (${cliente.inmueblesActivos.length})`}>
            <ul className="space-y-3">
              {cliente.inmueblesActivos.map((p) => (
                <li key={p.id}>
                  <InmuebleCard p={p} />
                </li>
              ))}
            </ul>
          </Section>
        )}

        {cliente.estadoComercial !== "Cerrado" && cliente.inmueblesActivos.length === 0 && cliente.matches.length > 0 && (
          <Section
            title={
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-violet-500" />
                Posibles matches ({cliente.matches.length})
              </span>
            }
          >
            <p className="text-[11px] text-muted-foreground mb-2">
              Inmuebles activos que encajan con sus intereses.
            </p>
            <ul className="space-y-3">
              {cliente.matches.map((m) => (
                <li key={m.inmueble.id} className="space-y-1.5">
                  <InmuebleCard p={m.inmueble} />
                  <div className="flex flex-wrap gap-1 pl-1">
                    {m.razones.map((r, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 px-2 py-0.5"
                      >
                        <Sparkles className="size-2.5" />
                        {r}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {hasSilviaConversation(cliente) && (
          <Section
            title={
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-violet-500" />
                Conversación con SilvIA
                <CanalChip canal={inferCanal(cliente)} />
                <Link
                  to="/silvia"
                  className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-violet-700 dark:text-violet-400 hover:underline"
                >
                  Abrir en SilvIA <ArrowUpRight className="size-3" />
                </Link>
              </span>
            }
          >
            {cliente.motivo && (
              <div className="rounded-md bg-muted/40 border border-border p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Motivo
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {cliente.motivo}
                </p>
              </div>
            )}
            {cliente.conversaciones && (
              <div className="rounded-md bg-muted/40 border border-border p-3 max-h-96 overflow-auto">
                <Transcripcion text={cliente.conversaciones} />
              </div>
            )}
          </Section>
        )}

        <Section title="Solicitud e intereses">
          <Row label="Solicitud" value={cliente.solicitud} multiline />
          <Row label="Sección" value={cliente.seccion} multiline />
          {cliente.categoria.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Categoría de interés
              </div>
              <div className="flex flex-wrap gap-1">
                {cliente.categoria.map((c) => (
                  <span
                    key={c}
                    className="text-[10px] rounded-full bg-secondary text-secondary-foreground px-2 py-0.5"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>

        {(cliente.contratoTrabajo || cliente.mascota || cliente.avalista) && (
          <Section title="Perfil alquiler">
            <Row icon={<ShieldCheck className="size-3.5" />} label="Contrato" value={cliente.contratoTrabajo} />
            <Row icon={<Dog className="size-3.5" />} label="Mascota" value={cliente.mascota} />
            <Row label="Avalista" value={cliente.avalista} />
          </Section>
        )}

        {(cliente.observaciones || cliente.feedback) && (
          <Section title="Notas internas">
            <Row label="Observaciones" value={cliente.observaciones} multiline />
            <Row label="Feedback comercial" value={cliente.feedback} multiline />
          </Section>
        )}

        <Section title={`Documentación (${cliente.attachments.length})`}>
          {cliente.attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin documentos adjuntos.</p>
          ) : (
            <ul className="space-y-1">
              {cliente.attachments.map((a, i) => (
                <li key={i}>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs rounded-md border border-border px-2 py-1.5 hover:bg-accent"
                  >
                    {a.type.startsWith("image/") ? (
                      <Paperclip className="size-3.5 text-muted-foreground" />
                    ) : (
                      <FileText className="size-3.5 text-muted-foreground" />
                    )}
                    <span className="truncate flex-1">{a.filename}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {cliente.agentesMails.length > 0 && (
          <Section title="Agentes asignados">
            <div className="flex flex-wrap gap-1">
              {cliente.agentesMails.map((m, i) => (
                <span
                  key={i}
                  className="text-[10px] rounded-full bg-muted text-foreground/80 px-2 py-0.5"
                >
                  {m}
                </span>
              ))}
            </div>
          </Section>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wide mb-2">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  icon,
  multiline,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <div className={multiline ? "whitespace-pre-wrap text-foreground/90" : "text-foreground/90"}>
        {value}
      </div>
    </div>
  );
}
