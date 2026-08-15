import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { RouteError } from "@/components/RouteError";
import { NewClienteDialog } from "@/components/CreateDialogs";
import { SafeImage } from "@/components/SafeImage";
import { Pagination } from "@/components/pagination/Pagination";
import {
  deleteContacto,
  actualizarCicloVida,
  gestionarRol,
  buscarInmuebles,
  getContactoActividad,
  type Cliente,
  type ClienteRow,
  type MiniInmueble,
  type Segmento,
  type Etapa,
  ETAPAS,
} from "@/lib/clientes.functions";
import { clientesPageQuery, clientesStatsQuery, clienteDetailQuery } from "@/lib/queries";

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
  MessageSquare,
  StickyNote,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Home,
  ShoppingCart,
  KeyRound,
  UserPlus,
  TrendingUp,
  Trash2,
  PencilLine,
  Plus,
  X,
  Download,
} from "lucide-react";
import {
  CanalChip,
  Transcripcion,
  inferCanal,
  hasSilviaConversation,
} from "@/components/silvia/conversation";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/clientes/")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { id?: string; page?: number; seg?: string; q?: string } => ({
    id: typeof s.id === "string" ? s.id : undefined,
    page: typeof s.page === "number" && s.page >= 1 ? Math.floor(s.page) : undefined,
    seg: ["Todos", "Propietario", "Comprador", "Inquilino"].includes(s.seg as string)
      ? (s.seg as string)
      : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Clientes · El Sol Grupo CRM" },
      { name: "description", content: "Gestión de clientes activos e historial." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        clientesPageQuery({ page: 1, pageSize: PAGE_SIZE, seg: "Todos", q: "" }),
      ),
      context.queryClient.ensureQueryData(clientesStatsQuery),
    ]),
  component: ClientesPage,
  errorComponent: ({ error }) => (
    <AppShell title="Clientes">
      <RouteError error={error} />
    </AppShell>
  ),
});

// ─── Visual config ─────────────────────────────────────────────────────────────

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
    color: "text-teal-600 dark:text-teal-400",
    chip: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/20",
    ring: "ring-teal-500/30",
    tone: "from-teal-500/10 to-transparent",
  },
  Lead: {
    label: "Leads",
    icon: UserPlus,
    color: "text-slate-600 dark:text-slate-400",
    chip: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/20",
    ring: "ring-slate-500/30",
    tone: "from-slate-500/10 to-transparent",
  },
};

const SEG_BAR: Record<Segmento, string> = {
  Propietario: "bg-emerald-500",
  Comprador: "bg-blue-500",
  Inquilino: "bg-teal-500",
  Lead: "bg-slate-400",
};

const CLIENTE_SEGS: Segmento[] = ["Propietario", "Comprador", "Inquilino"];

const ETAPA_META: Record<Etapa, { icon: typeof Clock; chip: string }> = {
  Cliente: {
    icon: TrendingUp,
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  Histórico: {
    icon: CheckCircle2,
    chip: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  },
  Lead: {
    icon: UserPlus,
    chip: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
  },
  Prospecto: {
    icon: Sparkles,
    chip: "bg-primary/15 text-primary",
  },
  Descartado: {
    icon: Clock,
    chip: "bg-destructive/15 text-destructive",
  },
};

// ─── CSV export ─────────────────────────────────────────────────────────────────

function csvEsc(v: string) {
  return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
}

function exportCSV(clientes: ClienteRow[]) {
  const header = "Nombre,Email,Teléfono,Ciclo de vida,Canal origen,Creado";
  const rows = clientes.map((c) => {
    const cols = [
      c.nombre,
      c.email,
      c.telefono,
      c.etapa,
      c.canalOrigen,
      c.fecha ? new Date(c.fecha).toLocaleDateString("es-ES") : "",
    ];
    return cols.map(csvEsc).join(",");
  });
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contactos_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function initials(name: string): string {
  if (!name) return "—";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
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

function EtapaBadge({ e }: { e: Etapa }) {
  const m = ETAPA_META[e];
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

// ─── Page ───────────────────────────────────────────────────────────────────────

function ClientesPage() {
  const router = useRouter();
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  // Apply defaults for optional search params.
  const search = {
    id: rawSearch.id,
    page: rawSearch.page ?? 1,
    seg: rawSearch.seg ?? "Todos",
    q: rawSearch.q ?? "",
  };

  const { data: listData, isFetching } = useQuery(
    clientesPageQuery({
      page: search.page,
      pageSize: PAGE_SIZE,
      seg: search.seg,
      q: search.q,
    }),
  );

  const { data: statsData } = useQuery(clientesStatsQuery);

  const clientes = listData?.clientes ?? [];
  const total = listData?.total ?? 0;
  const segmentoCounts = statsData ?? { Propietario: 0, Comprador: 0, Inquilino: 0, total: 0 };

  const [selectedId, setSelectedId] = useState<string | null>(search.id ?? null);

  useEffect(() => {
    if (search.id) setSelectedId(search.id);
  }, [search.id]);

  function selectCliente(id: string | null) {
    setSelectedId(id);
    navigate({ search: (prev) => ({ ...prev, id: id ?? undefined }), replace: true });
  }

  function goPage(p: number) {
    navigate({ search: (prev) => ({ ...prev, page: p }) });
  }

  function changeSeg(s: string) {
    navigate({ search: (prev) => ({ ...prev, seg: s, page: 1 }) });
  }

  function changeQ(q: string) {
    navigate({ search: (prev) => ({ ...prev, q, page: 1 }) });
  }

  const { data: detailData, isLoading: detailLoading } = useQuery(clienteDetailQuery(selectedId));
  const selected = detailData?.cliente ?? null;

  const activoCount = segmentoCounts.total;

  const segmentosTabs: string[] = ["Todos", "Propietario", "Comprador", "Inquilino"];

  return (
    <AppShell title="Clientes">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        {CLIENTE_SEGS.map((s) => {
          const m = SEG_META[s];
          const Icon = m.icon;
          const count = (segmentoCounts as Record<string, number>)[s] ?? 0;
          const pct = activoCount ? Math.round((count / activoCount) * 100) : 0;
          const active = search.seg === s;
          return (
            <button
              key={s}
              onClick={() => changeSeg(active ? "Todos" : s)}
              className={`group relative text-left rounded-xl border border-border bg-card p-3 overflow-hidden transition-all hover:border-foreground/20 hover:shadow-sm ${active ? `ring-2 ${m.ring}` : ""}`}
            >
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${m.tone} opacity-60`}
              />
              <div className="relative flex items-start justify-between gap-2">
                <div>
                  <div
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${m.color}`}
                  >
                    <Icon className="size-3.5" />
                    {m.label}
                  </div>
                  <div className="mt-1 text-2xl font-bold tracking-tight">{count}</div>
                  <div className="text-[11px] text-muted-foreground">{pct}% del total activo</div>
                </div>
                <ChevronRight
                  className={`size-4 text-muted-foreground transition-transform ${active ? "rotate-90 text-foreground" : "group-hover:translate-x-0.5"}`}
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

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={search.q}
            onChange={(e) => changeQ(e.target.value)}
            aria-label="Buscar clientes"
            placeholder="Buscar por nombre, email o teléfono…"
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
          <button
            onClick={() => exportCSV(clientes)}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent inline-flex items-center gap-1.5"
          >
            <Download className="size-4" />
            Exportar CSV
          </button>
          <NewClienteDialog />
        </div>
      </div>

      {/* Segmento tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
          {segmentosTabs.map((s) => {
            const active = search.seg === s;
            const count =
              s === "Todos"
                ? segmentoCounts.total
                : ((segmentoCounts as Record<string, number>)[s] ?? 0);
            return (
              <button
                key={s}
                onClick={() => changeSeg(s)}
                className={`px-2.5 h-7 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1 ${active ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-accent"}`}
              >
                {s}
                <span className={`text-[10px] ${active ? "opacity-80" : "text-muted-foreground"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto text-xs text-muted-foreground">{total} en esta página</div>
      </div>

      {/* Table */}
      <ClientesTable clientes={clientes} selectedId={selectedId} onSelect={selectCliente} />

      {/* Pagination */}
      <Pagination
        page={search.page}
        pageSize={PAGE_SIZE}
        total={total}
        onPage={goPage}
        isFetching={isFetching}
        className="mt-2"
      />

      {/* Detail panel */}
      <Sheet
        open={!!selectedId}
        onOpenChange={(o) => {
          if (!o) selectCliente(null);
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 overflow-y-auto">
          {detailLoading && (
            <div className="flex items-center justify-center h-full min-h-[200px] text-sm text-muted-foreground animate-pulse">
              Cargando…
            </div>
          )}
          {selected && !detailLoading && (
            <ClienteDetalle cliente={selected} onDeleted={() => selectCliente(null)} />
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

// ─── Tabla compartida ──────────────────────────────────────────────────────────

function ClientesTable({
  clientes,
  selectedId,
  onSelect,
  dimmed = false,
}: {
  clientes: ClienteRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  dimmed?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-card overflow-hidden ${dimmed ? "opacity-80" : ""}`}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr className="text-left text-[11px] uppercase tracking-wide">
              <th className="px-3 py-2.5 font-medium">Cliente</th>
              <th className="px-3 py-2.5 font-medium">Tipo</th>
              <th className="px-3 py-2.5 font-medium hidden md:table-cell">Inmuebles</th>
              <th className="px-3 py-2.5 font-medium hidden lg:table-cell">Alta</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => {
              const active = c.id === selectedId;
              const m = SEG_META[c.segmento];
              return (
                <tr
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`border-t border-border cursor-pointer transition-colors ${active ? "bg-accent/60" : "hover:bg-accent/30"}`}
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
                          {c.hasSilvia && (
                            <Link
                              to="/silvia"
                              search={{}}
                              onClick={(e) => e.stopPropagation()}
                              title="Ver conversación con SilvIA"
                              className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full bg-primary/10 text-primary px-1.5 py-0.5 hover:bg-primary/20"
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
                  <td className="px-3 py-2.5 text-xs hidden md:table-cell">
                    {c.inmueblesActivosCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <Building2 className="size-3.5" />
                        {c.inmueblesActivosCount} activo
                        {c.inmueblesActivosCount !== 1 ? "s" : ""}
                      </span>
                    ) : c.inmueblesHistoricoCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                        <CheckCircle2 className="size-3.5" />
                        {c.inmueblesHistoricoCount} cerrado
                        {c.inmueblesHistoricoCount !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground hidden lg:table-cell">
                    {c.diasDesdeAlta != null ? `hace ${c.diasDesdeAlta}d` : "—"}
                  </td>
                </tr>
              );
            })}
            {clientes.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-12 text-center text-sm text-muted-foreground">
                  Sin resultados con los filtros actuales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Edición inline ────────────────────────────────────────────────────────────

const TIPOS_ROL = ["Propietario", "Arrendador", "Comprador", "Inquilino"] as const;

function EditableEtapaBadge({
  contactId,
  etapa,
  onUpdated,
}: {
  contactId: string;
  etapa: Etapa;
  onUpdated: () => Promise<void>;
}) {
  const updateFn = useServerFn(actualizarCicloVida);
  const [saving, setSaving] = useState(false);
  const m = ETAPA_META[etapa];
  return (
    <select
      value={etapa}
      disabled={saving}
      title="Cambiar etapa manualmente"
      onChange={async (e) => {
        setSaving(true);
        try {
          await updateFn({ data: { contactId, cicloVida: e.target.value } });
          await onUpdated();
        } finally {
          setSaving(false);
        }
      }}
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium cursor-pointer border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring appearance-none ${m.chip} ${saving ? "opacity-50" : ""}`}
    >
      {ETAPAS.map((e) => (
        <option key={e} value={e}>
          {e}
        </option>
      ))}
    </select>
  );
}

function PropertyRolEditor({
  p,
  contactId,
  onChanged,
}: {
  p: MiniInmueble;
  contactId: string;
  onChanged: () => Promise<void>;
}) {
  const rolFn = useServerFn(gestionarRol);
  const [saving, setSaving] = useState(false);
  const tiposPermitidos = p.esAlquiler
    ? (["Arrendador", "Inquilino"] as const)
    : (["Propietario", "Comprador"] as const);
  return (
    <div className="mt-1.5 flex items-center gap-2 px-1">
      <select
        value={p.rolTipo ?? "Comprador"}
        disabled={saving}
        aria-label="Rol del contacto en el inmueble"
        onChange={async (e) => {
          setSaving(true);
          try {
            await rolFn({ data: { contactId, propertyId: p.id, tipo: e.target.value } });
            await onChanged();
          } finally {
            setSaving(false);
          }
        }}
        className="text-[10px] h-6 rounded border border-input bg-background px-1.5 cursor-pointer"
      >
        {tiposPermitidos.map((t) => (
          <option key={t} value={t}>
            {t === "Arrendador" ? "Propietario (alquiler)" : t}
          </option>
        ))}
      </select>
      <button
        disabled={saving}
        onClick={async () => {
          if (!confirm("¿Desvincular este inmueble del contacto?")) return;
          setSaving(true);
          try {
            await rolFn({ data: { contactId, propertyId: p.id, tipo: null } });
            await onChanged();
          } finally {
            setSaving(false);
          }
        }}
        title="Desvincular"
        aria-label="Desvincular inmueble"
        className="h-6 px-1.5 rounded border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50"
      >
        <X className="size-3" />
      </button>
      {saving && <span className="text-[10px] text-muted-foreground">Guardando…</span>}
    </div>
  );
}

function AñadirInmueblePanel({
  contactId,
  onAdded,
}: {
  contactId: string;
  onAdded: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MiniInmueble[]>([]);
  const [tipo, setTipo] = useState<string>("Comprador");
  const [saving, setSaving] = useState(false);
  const buscarFn = useServerFn(buscarInmuebles);
  const rolFn = useServerFn(gestionarRol);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await buscarFn({ data: { q } });
      setResults(res.results as MiniInmueble[]);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-primary hover:underline"
      >
        <Plus className="size-3.5" /> Añadir vinculación
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Vincular inmueble
        </span>
        <button
          onClick={() => {
            setOpen(false);
            setQ("");
            setResults([]);
          }}
          aria-label="Cerrar panel de vincular inmueble"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar inmueble por ref o dirección"
          placeholder="Ref o dirección…"
          autoFocus
          className="flex-1 h-8 px-2 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          aria-label="Tipo de rol del contacto en el inmueble"
          className="h-8 px-2 text-xs rounded border border-input bg-background"
        >
          {TIPOS_ROL.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {results.length > 0 && (
        <ul className="space-y-1 max-h-48 overflow-auto">
          {results.map((p) => (
            <li key={p.id}>
              <button
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await rolFn({ data: { contactId, propertyId: p.id, tipo } });
                    await onAdded();
                    setOpen(false);
                    setQ("");
                    setResults([]);
                  } finally {
                    setSaving(false);
                  }
                }}
                className="w-full text-left rounded-md border border-border bg-background px-2.5 py-2 text-xs hover:bg-accent disabled:opacity-50"
              >
                <span className="font-semibold text-primary">#{p.ref || p.id.slice(0, 6)}</span> —{" "}
                {[p.calle, p.numero].filter(Boolean).join(" ") || "Sin dirección"}
                <span
                  className={`ml-2 text-[10px] rounded-full px-1.5 py-0.5 ${estatusClase(p.estatus)}`}
                >
                  {p.estatus}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.length >= 2 && results.length === 0 && (
        <p className="text-[11px] text-muted-foreground">Sin resultados para "{q}"</p>
      )}
    </div>
  );
}

// ─── Panel lateral de detalle ──────────────────────────────────────────────────

function estatusClase(estatus: string) {
  const map: Record<string, string> = {
    Activo: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    Reservado: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    Vendido: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    Alquilado: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    Baja: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
    Prospección: "bg-primary/10 text-primary",
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
              <span
                className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${estatusClase(p.estatus)}`}
              >
                {p.estatus}
              </span>
            )}
            <span
              className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${p.esAlquiler ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-blue-500/10 text-blue-600 dark:text-blue-400"}`}
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

function parseNotas(obs: string): Array<{ fecha: string; texto: string }> {
  if (!obs?.trim()) return [];
  return obs
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const m = line.match(/^\[([^\]]+)\]\s*(.+)$/);
      return m ? [{ fecha: m[1], texto: m[2] }] : [];
    })
    .reverse();
}

function ClienteTimeline({ cliente }: { cliente: Cliente }) {
  const notas = parseNotas(cliente.observaciones);
  const feedbacks = parseNotas(cliente.feedback);
  const todos = [
    ...notas.map((n) => ({ ...n, tipo: "nota" as const })),
    ...feedbacks.map((n) => ({ ...n, tipo: "feedback" as const })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));

  if (todos.length === 0 && cliente.inmueblesVinculados.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-3 font-medium">
        Historial
      </div>
      <ol className="relative border-l border-border ml-2 space-y-4">
        <li className="ml-4">
          <span className="absolute -left-1.5 flex items-center justify-center size-3 rounded-full bg-primary/20 border border-primary/40">
            <span className="size-1.5 rounded-full bg-primary" />
          </span>
          <div className="text-[11px] text-muted-foreground">
            {cliente.fecha
              ? new Date(cliente.fecha).toLocaleDateString("es-ES", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "Fecha desconocida"}
          </div>
          <div className="text-xs font-medium text-foreground">Contacto registrado</div>
        </li>
        {cliente.inmueblesVinculados.map((p) => (
          <li key={p.id} className="ml-4">
            <span className="absolute -left-1.5 flex items-center justify-center size-3 rounded-full bg-blue-500/20 border border-blue-500/40">
              <Building2 className="size-1.5 text-blue-500" />
            </span>
            <div className="text-xs font-medium text-foreground">
              {p.esAlquiler ? "Alquiler vinculado" : "Inmueble vinculado"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {[p.calle, p.numero].filter(Boolean).join(" ") || "Sin dirección"} · {p.estatus}
            </div>
          </li>
        ))}
        {todos.map((n, i) => (
          <li key={i} className="ml-4">
            <span
              className={`absolute -left-1.5 flex items-center justify-center size-3 rounded-full ${n.tipo === "feedback" ? "bg-amber-500/20 border-amber-500/40" : "bg-muted border-border"}`}
            >
              {n.tipo === "feedback" ? (
                <StickyNote className="size-1.5 text-amber-500" />
              ) : (
                <MessageSquare className="size-1.5 text-muted-foreground" />
              )}
            </span>
            <div className="text-[11px] text-muted-foreground">{n.fecha}</div>
            <div className="text-xs text-foreground leading-snug">{n.texto}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ClienteDetalle({ cliente, onDeleted }: { cliente: Cliente; onDeleted: () => void }) {
  const segMeta = SEG_META[cliente.segmento];
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteContacto);
  const getActividadFn = useServerFn(getContactoActividad);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["clientes-page"] }),
      qc.invalidateQueries({ queryKey: ["clientes-stats"] }),
      qc.invalidateQueries({ queryKey: ["cliente-detail", cliente.id] }),
    ]);
  };

  const { data: actividadData, isLoading: actividadLoading } = useQuery({
    queryKey: ["actividad", cliente.id],
    queryFn: () => getActividadFn({ data: { contactId: cliente.id } }),
    enabled: !!cliente.id,
  });

  return (
    <aside className="bg-card">
      <header className="relative p-5 border-b border-border overflow-hidden">
        <div
          className={`absolute inset-0 bg-gradient-to-br ${segMeta.tone} opacity-70 pointer-events-none`}
        />
        <div className="relative flex items-start gap-3">
          <div
            className={`shrink-0 size-12 rounded-full grid place-items-center text-sm font-bold border ${segMeta.chip}`}
          >
            {initials(cliente.nombre)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-base truncate flex-1">
                {cliente.nombre || "Sin nombre"}
              </h2>
              <button
                onClick={() => setEditMode((v) => !v)}
                title={editMode ? "Salir del modo edición" : "Editar relaciones y etapa"}
                className={`shrink-0 h-7 w-7 rounded-md flex items-center justify-center transition-colors ${editMode ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-accent"}`}
              >
                <PencilLine className="size-3.5" />
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <SegmentoBadge s={cliente.segmento} />
              {editMode ? (
                <EditableEtapaBadge
                  contactId={cliente.id}
                  etapa={cliente.etapa}
                  onUpdated={refresh}
                />
              ) : (
                <EtapaBadge e={cliente.etapa} />
              )}
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
          <Row
            icon={<Briefcase className="size-3.5" />}
            label="Profesión"
            value={cliente.profesion}
          />
          <Row
            icon={<CalendarDays className="size-3.5" />}
            label="Fecha alta"
            value={
              cliente.fecha
                ? `${new Date(cliente.fecha).toLocaleDateString("es-ES")}${cliente.diasDesdeAlta != null ? ` · hace ${cliente.diasDesdeAlta}d` : ""}`
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
                <span
                  key={z}
                  className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full bg-gold/15 text-foreground px-2.5 py-1 capitalize"
                >
                  {z}
                </span>
              ))}
              {cliente.duplicados > 1 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2.5 py-1">
                  {cliente.duplicados} posibles registros duplicados
                </span>
              )}
            </div>
          </Section>
        )}

        {(cliente.inmueblesActivos.length > 0 || editMode) && (
          <Section title={`Propiedades activas (${cliente.inmueblesActivos.length})`}>
            <ul className="space-y-3">
              {cliente.inmueblesActivos.map((p) => (
                <li key={p.id}>
                  <InmuebleCard p={p} />
                  {editMode && (
                    <PropertyRolEditor p={p} contactId={cliente.id} onChanged={refresh} />
                  )}
                </li>
              ))}
            </ul>
            {editMode && (
              <div className="mt-3">
                <AñadirInmueblePanel contactId={cliente.id} onAdded={refresh} />
              </div>
            )}
          </Section>
        )}

        {cliente.inmueblesHistorico.length > 0 && (
          <Section title={`Operaciones cerradas (${cliente.inmueblesHistorico.length})`}>
            <ul className="space-y-3">
              {cliente.inmueblesHistorico.map((p) => (
                <li key={p.id}>
                  <InmuebleCard p={p} />
                  {editMode && (
                    <PropertyRolEditor p={p} contactId={cliente.id} onChanged={refresh} />
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {editMode && cliente.inmueblesActivos.length === 0 && (
          <Section title="Vincular inmueble">
            <AñadirInmueblePanel contactId={cliente.id} onAdded={refresh} />
          </Section>
        )}

        {cliente.etapa !== "Histórico" &&
          cliente.inmueblesActivos.length === 0 &&
          cliente.matches.length > 0 && (
            <Section
              title={
                <span className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary" />
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
                          className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full bg-primary/10 text-primary px-2 py-0.5"
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
                <Sparkles className="size-3.5 text-primary" />
                Conversación con SilvIA
                <CanalChip canal={inferCanal(cliente)} />
                <Link
                  to="/silvia"
                  search={{}}
                  className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
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
            <Row
              icon={<ShieldCheck className="size-3.5" />}
              label="Contrato"
              value={cliente.contratoTrabajo}
            />
            <Row icon={<Dog className="size-3.5" />} label="Mascota" value={cliente.mascota} />
            <Row label="Avalista" value={cliente.avalista} />
          </Section>
        )}

        <ClienteTimeline cliente={cliente} />

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

        <Section title="Actividad reciente">
          {actividadLoading ? (
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 rounded-md bg-muted" />
              ))}
            </div>
          ) : !actividadData?.eventos?.length ? (
            <p className="text-xs text-muted-foreground">Sin actividad registrada</p>
          ) : (
            <ol className="max-h-64 overflow-y-auto space-y-2 pr-1">
              {actividadData.eventos.map((ev) => {
                const Icon = ev.tipo === "seguimiento" ? MessageSquare : CalendarDays;
                const fecha = new Date(ev.fecha).toLocaleDateString("es-ES", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                });
                const texto = ev.texto.length > 80 ? ev.texto.slice(0, 80) + "…" : ev.texto;
                return (
                  <li key={ev.id} className="flex items-start gap-2.5 text-xs">
                    <div
                      className={`shrink-0 mt-0.5 size-6 rounded-full flex items-center justify-center ${ev.tipo === "seguimiento" ? "bg-primary/10 text-primary" : "bg-blue-500/10 text-blue-500"}`}
                    >
                      <Icon className="size-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">{fecha}</span>
                        <span
                          className={`text-[10px] font-medium rounded-full px-1.5 py-0.5 ${ev.tipo === "seguimiento" ? "bg-primary/10 text-primary" : "bg-blue-500/10 text-blue-600 dark:text-blue-400"}`}
                        >
                          {ev.subtipo}
                        </span>
                        {ev.extra && (
                          <span className="text-[10px] text-muted-foreground">{ev.extra}</span>
                        )}
                      </div>
                      {texto && <p className="text-foreground/80 leading-snug mt-0.5">{texto}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>

        <div className="pt-2 border-t border-border">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs text-destructive hover:underline"
            >
              <Trash2 className="size-3.5" />
              Eliminar contacto
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                ¿Seguro? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await deleteFn({ data: { id: cliente.id } });
                      await Promise.all([
                        qc.invalidateQueries({ queryKey: ["clientes-page"] }),
                        qc.invalidateQueries({ queryKey: ["clientes-stats"] }),
                      ]);
                      onDeleted();
                    } finally {
                      setDeleting(false);
                    }
                  }}
                  disabled={deleting}
                  className="h-8 px-3 text-xs font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {deleting ? "Eliminando…" : "Sí, eliminar"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="h-8 px-3 text-xs font-medium rounded-md border border-input hover:bg-accent disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

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
