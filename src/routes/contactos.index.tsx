import { createFileRoute } from "@tanstack/react-router";
import {
  useSuspenseQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useRef } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import {
  UserCog,
  Search,
  Phone,
  Mail,
  CalendarDays,
  Tag,
  MessageSquare,
  CheckCircle2,
  Clock,
  XCircle,
  CalendarPlus,
  Users,
  Inbox,
  Home,
  ShoppingCart,
  KeyRound,
  Search as SearchIcon,
  HelpCircle,
  Ban,
  LayoutList,
  Columns3,
  GripVertical,
  Zap,
  Trash2,
  Building2,
  Euro,
  MapPin,
  Download,
  TrendingUp,
  ChevronRight,
  UserPlus,
  Loader2,
  StickyNote,
  Pencil,
  ArrowUpRight,
  PencilLine,
  Plus,
  X,
  IdCard,
  Paperclip,
  FileText,
  Briefcase,
  Dog,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AppShell } from "@/components/AppShell";
import { RouteError } from "@/components/RouteError";
import { NewVisitaDialog } from "@/components/CreateDialogs";
import { NewClienteDialog } from "@/components/CreateDialogs";
import { AsignarLeadButton } from "@/components/AsignarLeadButton";
import { AsociarInmuebleButton } from "@/components/AsociarInmuebleButton";
import { SafeImage } from "@/components/SafeImage";
import { Pagination } from "@/components/pagination/Pagination";
import {
  CanalChip,
  Transcripcion,
  inferCanal,
  hasSilviaConversation,
} from "@/components/silvia/conversation";
import {
  agentesQuery,
  leadsQueryOpts,
  clientesPageQuery,
  clientesStatsQuery,
  clienteDetailQuery,
  contactosPageQuery,
} from "@/lib/queries";
import {
  type Cliente,
  type ClienteRow,
  type MiniInmueble,
  type Segmento,
  type Etapa,
  ETAPAS,
  deleteContacto,
  actualizarCicloVida,
  gestionarRol,
  buscarInmuebles,
  getContactoActividad,
} from "@/lib/clientes.functions";
import { updateClienteSeguimiento, type EstadoSeguimiento } from "@/lib/mutations.functions";

const PAGE_SIZE = 50;

type ContactosTab = "leads" | "clientes" | "historico" | "descartado";

const TAB_CONFIG: Array<{ key: ContactosTab; label: string }> = [
  { key: "leads", label: "Leads" },
  { key: "clientes", label: "Clientes" },
  { key: "historico", label: "Histórico" },
  { key: "descartado", label: "Descartado" },
];

const searchSchema = z.object({
  tab: z
    .enum(["leads", "clientes", "historico", "descartado"])
    .optional(),
  page: z.number().min(1).optional(),
  q: z.string().optional(),
  seg: z.string().optional(),
  agente: z.string().optional(),
  id: z.string().optional(),
});

export const Route = createFileRoute("/contactos/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Contactos · El Sol Grupo CRM" },
      {
        name: "description",
        content:
          "Gestión unificada de leads, clientes, histórico y descartados.",
      },
    ],
  }),
  loader: ({ context, location }) => {
    const tab =
      (location.search as { tab?: string }).tab ?? "leads";
    if (tab === "clientes") {
      return Promise.all([
        context.queryClient.ensureQueryData(
          clientesPageQuery({ page: 1, pageSize: PAGE_SIZE, seg: "Todos", q: "" }),
        ),
        context.queryClient.ensureQueryData(clientesStatsQuery),
      ]);
    }
    return Promise.all([
      context.queryClient.ensureQueryData(leadsQueryOpts),
      context.queryClient.ensureQueryData(agentesQuery),
    ]);
  },
  component: ContactosPage,
  errorComponent: ({ error }) => (
    <AppShell title="Contactos">
      <RouteError error={error} />
    </AppShell>
  ),
});

function ContactosPage() {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab = rawSearch.tab ?? "leads";

  function setTab(t: ContactosTab) {
    navigate({ search: () => ({ tab: t, page: 1 }) });
  }

  return (
    <AppShell title="Contactos">
      {/* Tab nav */}
      <div className="mb-6 flex items-center gap-0 border-b border-border overflow-x-auto">
        {TAB_CONFIG.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px cursor-pointer ${
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "leads" && <LeadsTab />}
      {tab === "clientes" && <ClientesTab />}
      {tab === "historico" && (
        <SimpleContactsTab etapa="Histórico" />
      )}
      {tab === "descartado" && (
        <SimpleContactsTab etapa="Descartado" />
      )}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADS TAB (KanbanView + ListaView)
// ─────────────────────────────────────────────────────────────────────────────

const ESTADO_META: Record<EstadoSeguimiento, { cls: string; icon: typeof Clock; label: string }> = {
  Pendiente: {
    cls: "bg-warning/10 text-warning border-warning/30",
    icon: Clock,
    label: "Pendiente",
  },
  Contactado: {
    cls: "bg-success/10 text-success border-success/30",
    icon: CheckCircle2,
    label: "Contactado",
  },
  Descartado: {
    cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
    icon: XCircle,
    label: "Descartado",
  },
};

const ORIGEN_META: Record<
  string,
  { cls: string; icon: typeof Clock; label: string; descripcion: string }
> = {
  Propietario: {
    cls: "bg-info/10 text-info border-info/30",
    icon: Home,
    label: "Propietario",
    descripcion: "Dueño de un inmueble que quiere vender o alquilar con nosotros",
  },
  Comprador: {
    cls: "bg-accent/20 text-accent-foreground border-accent/40",
    icon: ShoppingCart,
    label: "Comprador",
    descripcion: "Ha cerrado una compra con nosotros",
  },
  "Busca compra": {
    cls: "bg-warning/10 text-warning border-warning/30",
    icon: ShoppingCart,
    label: "Busca compra",
    descripcion: "Lead interesado en comprar — operación aún no cerrada",
  },
  Inquilino: {
    cls: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/30",
    icon: KeyRound,
    label: "Inquilino",
    descripcion: "Arrendatario con contrato firmado",
  },
  "Busca alquiler": {
    cls: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
    icon: KeyRound,
    label: "Busca alquiler",
    descripcion: "Lead interesado en alquilar — sin contrato firmado",
  },
  Prospecto: {
    cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
    icon: SearchIcon,
    label: "Prospección",
    descripcion: "Captación: posible propietario a contactar para incorporar a cartera",
  },
  Lead: {
    cls: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30",
    icon: HelpCircle,
    label: "Lead sin clasificar",
    descripcion: "Contacto entrante sin tipo definido todavía",
  },
  Descartado: {
    cls: "bg-destructive/10 text-destructive border-destructive/30",
    icon: Ban,
    label: "Descartado",
    descripcion: "Contacto descartado o anulado",
  },
};

function inferEstado(c: Cliente): EstadoSeguimiento {
  const t = c.trabajado.toLowerCase();
  if (t.includes("descart")) return "Descartado";
  if (t.includes("contact")) return "Contactado";
  if (c.observaciones && c.observaciones.trim().length > 0) return "Contactado";
  return "Pendiente";
}

function formatFechaLead(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function extraerUltimaNota(obs: string): { fecha: string; texto: string } | null {
  if (!obs || !obs.trim()) return null;
  const lines = obs.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].trim().match(/^\[([^\]]+)\]\s*(.+)$/);
    if (m) return { fecha: m[1], texto: m[2] };
  }
  return null;
}

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / 86400000);
}

const PIPELINE_STAGES: Array<{
  id: EstadoSeguimiento;
  label: string;
  dot: string;
  headerCls: string;
}> = [
  { id: "Pendiente", label: "Nuevos", dot: "bg-warning", headerCls: "border-warning/40" },
  {
    id: "Contactado",
    label: "En seguimiento",
    dot: "bg-info",
    headerCls: "border-info/40",
  },
  { id: "Descartado", label: "Archivados", dot: "bg-slate-400", headerCls: "border-slate-400/40" },
];

function filterLeadsFn(
  leads: Array<{ cliente: Cliente; estado: EstadoSeguimiento }>,
  q: string,
  origenFilter: string,
) {
  const ql = q.trim().toLowerCase();
  return leads.filter(({ cliente: c }) => {
    if (origenFilter !== "Todos") {
      const seg = ORIGEN_META[c.segmento] ? c.segmento : "Lead";
      if (seg !== origenFilter) return false;
    }
    if (!ql) return true;
    return (
      c.nombre.toLowerCase().includes(ql) ||
      c.telefono.toLowerCase().includes(ql) ||
      c.email.toLowerCase().includes(ql) ||
      c.motivo.toLowerCase().includes(ql)
    );
  });
}

function KanbanCard({
  cliente,
  estado,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  cliente: Cliente;
  estado: EstadoSeguimiento;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(updateClienteSeguimiento);
  const [notaOpen, setNotaOpen] = useState(false);
  const [nota, setNota] = useState("");
  const notaRef = useRef<HTMLTextAreaElement>(null);

  const mut = useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success("Actualizado");
      qc.invalidateQueries({ queryKey: ["leads"] });
      setNotaOpen(false);
      setNota("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dias = diasDesde(cliente.fecha);
  const ultimaNota = extraerUltimaNota(cliente.observaciones);
  const meta = ESTADO_META[estado];

  function guardarNota() {
    const t = nota.trim();
    if (!t) return;
    mut.mutate({
      data: { clienteId: cliente.id, nota: t, observacionesActuales: cliente.observaciones },
    });
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`rounded-lg border bg-card select-none transition-all ${isDragging ? "opacity-40 scale-[0.98]" : "hover:border-foreground/20 hover:shadow-sm cursor-grab active:cursor-grabbing"}`}
    >
      <div className="flex items-start gap-2 p-3">
        <GripVertical className="size-3.5 text-muted-foreground/40 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold truncate max-w-[160px]">
              {cliente.nombre || "Sin nombre"}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] border rounded-full px-1.5 py-0.5 font-medium ${meta.cls}`}
            >
              <meta.icon className="size-2.5" />
              {meta.label}
            </span>
          </div>
          {cliente.telefono && (
            <div className="mt-1 text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Phone className="size-2.5" />
              {cliente.telefono}
            </div>
          )}
          {dias !== null && (
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {dias === 0 ? "Hoy" : `Hace ${dias}d`}
            </div>
          )}
          {ultimaNota && (
            <div className="mt-1.5 rounded bg-muted/50 px-1.5 py-1 text-[10px] text-muted-foreground line-clamp-1">
              <StickyNote className="size-2.5 inline mr-0.5" />
              {ultimaNota.texto}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 px-3 pb-2 flex-wrap">
        <NewVisitaDialog
          defaultClienteId={cliente.id}
          trigger={
            <button
              type="button"
              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
            >
              <CalendarPlus className="size-3" /> Visita
            </button>
          }
        />
        <Popover open={notaOpen} onOpenChange={setNotaOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
            >
              <StickyNote className="size-3" /> Nota
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-60 p-2">
            <textarea
              ref={notaRef}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Escribe una nota…"
              rows={3}
              className="w-full text-xs rounded border border-input bg-background p-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={guardarNota}
              disabled={mut.isPending || !nota.trim()}
              className="mt-1 w-full h-7 rounded bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {mut.isPending ? "Guardando…" : "Guardar nota"}
            </button>
          </PopoverContent>
        </Popover>
        <AsignarLeadButton clienteId={cliente.id} agentesActuales={cliente.agentesIds} />
        <AsociarInmuebleButton contactId={cliente.id} />
      </div>
    </div>
  );
}

function KanbanView({
  leads,
  q,
  origenFilter,
}: {
  leads: Array<{ cliente: Cliente; estado: EstadoSeguimiento }>;
  q: string;
  origenFilter: string;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<EstadoSeguimiento | null>(null);
  const [optimisticStates, setOptimisticStates] = useState<Record<string, EstadoSeguimiento>>({});
  const qc = useQueryClient();
  const fn = useServerFn(updateClienteSeguimiento);

  const filtered = useMemo(() => filterLeadsFn(leads, q, origenFilter), [leads, q, origenFilter]);

  const getEstado = (l: { cliente: Cliente; estado: EstadoSeguimiento }) =>
    optimisticStates[l.cliente.id] ?? l.estado;

  const pendientes = filtered.filter((l) => getEstado(l) === "Pendiente").length;

  function handleDrop(targetStage: EstadoSeguimiento) {
    if (!draggingId || !targetStage) return;
    const lead = filtered.find((l) => l.cliente.id === draggingId);
    if (!lead || getEstado(lead) === targetStage) return;
    const id = draggingId;
    setOptimisticStates((prev) => ({ ...prev, [id]: targetStage }));
    setDraggingId(null);
    setOverStage(null);
    fn({ data: { clienteId: id, estado: targetStage } })
      .then(() => {
        toast.success("Lead movido");
        qc.invalidateQueries({ queryKey: ["leads"] });
        setOptimisticStates((prev) => {
          const n = { ...prev };
          delete n[id];
          return n;
        });
      })
      .catch((e: Error) => {
        toast.error(e.message);
        setOptimisticStates((prev) => {
          const n = { ...prev };
          delete n[id];
          return n;
        });
      });
  }

  return (
    <div className="space-y-4">
      {pendientes > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-2.5">
          <Zap className="size-4 text-warning shrink-0" />
          <p className="text-sm text-warning">
            <span className="font-semibold">Tu foco hoy</span>
            {" · "}
            {pendientes} lead{pendientes !== 1 ? "s" : ""} sin contactar
          </p>
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = filtered.filter((l) => getEstado(l) === stage.id);
          const isOver = overStage === stage.id;
          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage.id);
              }}
              onDragLeave={() => setOverStage(null)}
              onDrop={() => handleDrop(stage.id)}
              className={`flex flex-col min-w-[280px] w-[280px] shrink-0 rounded-xl border transition-colors ${isOver ? "border-primary/50 bg-primary/[0.03]" : `border-border ${stage.headerCls}`}`}
            >
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border rounded-t-xl bg-muted/30">
                <span className={`size-2 rounded-full ${stage.dot}`} />
                <span className="text-sm font-medium">{stage.label}</span>
                <span className="ml-auto text-xs text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5 font-mono">
                  {stageLeads.length}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto max-h-[calc(100vh-380px)] p-2 space-y-2 min-h-[120px]">
                {stageLeads.length === 0 ? (
                  <div
                    className={`flex items-center justify-center h-16 rounded-lg border-2 border-dashed text-xs text-muted-foreground transition-colors ${isOver ? "border-primary/40 bg-primary/[0.03]" : "border-border"}`}
                  >
                    {isOver ? "Soltar aquí" : "Sin leads"}
                  </div>
                ) : (
                  stageLeads.map(({ cliente, estado }) => (
                    <KanbanCard
                      key={cliente.id}
                      cliente={cliente}
                      estado={estado}
                      isDragging={draggingId === cliente.id}
                      onDragStart={() => setDraggingId(cliente.id)}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverStage(null);
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadCard({
  cliente,
  estado,
}: {
  cliente: Cliente;
  estado: EstadoSeguimiento;
}) {
  const meta = ESTADO_META[estado];
  const dias = diasDesde(cliente.fecha);
  const ultimaNota = extraerUltimaNota(cliente.observaciones);
  const qc = useQueryClient();
  const fn = useServerFn(deleteContacto);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`¿Eliminar a ${cliente.nombre}? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      await fn({ data: { id: cliente.id } });
      toast.success("Contacto eliminado");
      qc.invalidateQueries({ queryKey: ["leads"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 hover:border-foreground/20 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{cliente.nombre || "Sin nombre"}</span>
            <span
              className={`inline-flex items-center gap-1 text-[10px] border rounded-full px-2 py-0.5 font-medium ${meta.cls}`}
            >
              <meta.icon className="size-2.5" />
              {meta.label}
            </span>
            {cliente.categoria.map((cat) => (
              <span
                key={cat}
                className="inline-flex items-center gap-0.5 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full"
              >
                <Tag className="size-2.5" />
                {cat}
              </span>
            ))}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            {cliente.telefono && (
              <a
                href={`tel:${cliente.telefono}`}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Phone className="size-3" />
                {cliente.telefono}
              </a>
            )}
            {cliente.email && (
              <a
                href={`mailto:${cliente.email}`}
                className="inline-flex items-center gap-1 hover:text-foreground truncate max-w-[200px]"
              >
                <Mail className="size-3" />
                {cliente.email}
              </a>
            )}
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" />
              {formatFechaLead(cliente.fecha)}
              {dias !== null && (
                <span className="text-muted-foreground/60">(hace {dias}d)</span>
              )}
            </span>
          </div>
          {cliente.motivo && (
            <p className="mt-2 text-[11px] text-foreground/70 italic line-clamp-2">
              {cliente.motivo}
            </p>
          )}
          {ultimaNota && (
            <div className="mt-1.5 rounded-md bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">
              <MessageSquare className="size-2.5 inline mr-0.5" />
              {ultimaNota.fecha}: {ultimaNota.texto}
            </div>
          )}
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0 disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <NewVisitaDialog
          defaultClienteId={cliente.id}
          trigger={
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <CalendarPlus className="size-3" /> Visita
            </button>
          }
        />
        <AsignarLeadButton clienteId={cliente.id} agentesActuales={cliente.agentesIds} />
        <AsociarInmuebleButton contactId={cliente.id} />
      </div>
    </div>
  );
}

function LeadsTab() {
  const { data } = useSuspenseQuery(leadsQueryOpts);
  const { data: ag } = useSuspenseQuery(agentesQuery);
  const navigate = useNavigate({ from: "/contactos/" });
  const { agente: agenteParam } = Route.useSearch();
  const [q, setQ] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EstadoSeguimiento | "Todos">("Todos");
  const [origenFilter, setOrigenFilter] = useState<string>("Todos");
  const [view, setView] = useState<"lista" | "kanban">("kanban");

  const agentes = ag.agentes;
  const [savedAgenteId] = useState<string>(() =>
    typeof window !== "undefined"
      ? (localStorage.getItem("homebase.contactos.agente") ?? "")
      : "",
  );
  const agenteId =
    agenteParam ??
    (savedAgenteId && agentes.some((a) => a.id === savedAgenteId) ? savedAgenteId : null) ??
    agentes[0]?.id ??
    "";
  const agenteSel = agentes.find((a) => a.id === agenteId);

  const misLeads = useMemo(() => {
    return data.clientes
      .filter((c) => c.agentesIds.includes(agenteId) && c.etapa === "Lead")
      .map((c) => ({ cliente: c, estado: inferEstado(c) }));
  }, [data.clientes, agenteId]);

  const counts = useMemo(() => {
    const m: Record<EstadoSeguimiento | "Todos", number> = {
      Pendiente: 0,
      Contactado: 0,
      Descartado: 0,
      Todos: misLeads.length,
    };
    misLeads.forEach((l) => (m[l.estado] += 1));
    return m;
  }, [misLeads]);

  const origenCounts = useMemo(() => {
    const m: Record<string, number> = { Todos: misLeads.length };
    Object.keys(ORIGEN_META).forEach((k) => (m[k] = 0));
    misLeads.forEach(({ cliente }) => {
      const k = ORIGEN_META[cliente.segmento] ? cliente.segmento : "Lead";
      m[k] = (m[k] ?? 0) + 1;
    });
    return m;
  }, [misLeads]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return misLeads.filter(({ cliente: c, estado }) => {
      if (estadoFilter !== "Todos" && estado !== estadoFilter) return false;
      if (origenFilter !== "Todos") {
        const seg = ORIGEN_META[c.segmento] ? c.segmento : "Lead";
        if (seg !== origenFilter) return false;
      }
      if (!ql) return true;
      return (
        c.nombre.toLowerCase().includes(ql) ||
        c.telefono.toLowerCase().includes(ql) ||
        c.email.toLowerCase().includes(ql) ||
        c.motivo.toLowerCase().includes(ql)
      );
    });
  }, [misLeads, q, estadoFilter, origenFilter]);

  return (
    <div>
      {/* Selector de comercial + toggle vista */}
      <div className="mb-5 rounded-xl border border-border bg-card p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UserCog className="size-4 text-muted-foreground" />
          Comercial
        </div>
        <select
          value={agenteId}
          onChange={(e) => {
            const val = e.target.value || undefined;
            if (typeof window !== "undefined" && val) {
              localStorage.setItem("homebase.contactos.agente", val);
            }
            navigate({ search: (prev) => ({ ...prev, agente: val }) });
          }}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-foreground/30 min-w-[220px]"
        >
          {agentes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        {agenteSel?.mail && (
          <a
            href={`mailto:${agenteSel.mail}`}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Mail className="size-3" /> {agenteSel.mail}
          </a>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/comerciales"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Users className="size-3" /> Ver equipo
          </Link>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setView("lista")}
              title="Vista lista"
              className={`px-2.5 py-1.5 transition-colors ${view === "lista" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutList className="size-3.5" />
            </button>
            <button
              onClick={() => setView("kanban")}
              title="Vista kanban"
              className={`px-2.5 py-1.5 border-l border-border transition-colors ${view === "kanban" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"}`}
            >
              <Columns3 className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {view === "lista" &&
          (["Pendiente", "Contactado", "Descartado", "Todos"] as const).map((e) => {
            const active = estadoFilter === e;
            const meta = e !== "Todos" ? ESTADO_META[e] : null;
            return (
              <button
                key={e}
                onClick={() => setEstadoFilter(e)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${active ? (meta ? meta.cls : "bg-foreground text-background border-foreground") : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
              >
                {meta && <meta.icon className="size-3" />}
                {e}
                <span className="opacity-70">· {counts[e]}</span>
              </button>
            );
          })}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, teléfono o motivo…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mr-1">
          Origen
        </span>
        {(["Todos", ...Object.keys(ORIGEN_META)] as const).map((k) => {
          const active = origenFilter === k;
          const meta = k !== "Todos" ? ORIGEN_META[k as string] : null;
          const count = origenCounts[k as string] ?? 0;
          return (
            <button
              key={k}
              onClick={() => setOrigenFilter(k as string)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${active ? (meta ? meta.cls : "bg-foreground text-background border-foreground") : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
            >
              {meta && <meta.icon className="size-3" />}
              {meta ? meta.label : k}
              <span className="opacity-70">· {count}</span>
            </button>
          );
        })}
      </div>

      {view === "kanban" ? (
        <KanbanView leads={misLeads} q={q} origenFilter={origenFilter} />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          <Inbox className="mx-auto mb-2 size-6 opacity-50" />
          {misLeads.length === 0
            ? "Este comercial todavía no tiene leads asignados."
            : "Sin leads en este estado."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(({ cliente, estado }) => (
            <LeadCard key={cliente.id} cliente={cliente} estado={estado} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTES TAB
// ─────────────────────────────────────────────────────────────────────────────

const SEG_META: Record<
  Segmento,
  { label: string; icon: typeof Home; chip: string }
> = {
  Propietario: {
    label: "Propietarios",
    icon: Home,
    chip: "bg-success/15 text-success border-success/20",
  },
  Comprador: {
    label: "Compradores",
    icon: ShoppingCart,
    chip: "bg-info/15 text-info border-info/20",
  },
  Inquilino: {
    label: "Inquilinos",
    icon: KeyRound,
    chip: "bg-brand-green/15 text-brand-green border-brand-green/20",
  },
  Lead: {
    label: "Leads",
    icon: HelpCircle,
    chip: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20",
  },
};

const CLIENTE_SEGS = ["Todos", "Propietario", "Comprador", "Inquilino"] as const;

function formatFechaCorta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function initials(nombre: string): string {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function ClienteRow({ c, onClick }: { c: ClienteRow; onClick: () => void }) {
  const segCfg = SEG_META[c.segmento as Segmento] ?? SEG_META.Lead;
  const Icon = segCfg.icon;
  return (
    <tr
      onClick={onClick}
      className="border-b border-border hover:bg-muted/40 transition-colors cursor-pointer group"
    >
      <td className="py-3 pl-4 pr-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground group-hover:bg-background transition-colors">
            {initials(c.nombre) || "?"}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium truncate max-w-[200px]">{c.nombre || "—"}</div>
            {c.email && (
              <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">{c.email}</div>
            )}
          </div>
        </div>
      </td>
      <td className="py-3 px-2 text-[11px] text-muted-foreground whitespace-nowrap">
        {c.telefono || "—"}
      </td>
      <td className="py-3 px-2">
        <span
          className={`inline-flex items-center gap-1 text-[10px] border rounded-full px-2 py-0.5 font-medium ${segCfg.chip}`}
        >
          <Icon className="size-3" />
          {segCfg.label.replace("s", "")}
        </span>
      </td>
      <td className="py-3 px-2 text-[11px] text-muted-foreground whitespace-nowrap">
        {formatFechaCorta(c.fecha)}
      </td>
      <td className="py-3 pl-2 pr-4 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {c.inmueblesActivosCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
              <Building2 className="size-2.5" />
              {c.inmueblesActivosCount}
            </span>
          )}
          <ChevronRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </td>
    </tr>
  );
}

function ClientesTab() {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const page = rawSearch.page ?? 1;
  const seg = rawSearch.seg ?? "Todos";
  const q = rawSearch.q ?? "";
  const selectedId = rawSearch.id ?? null;

  const { data: pageData, isFetching } = useQuery(
    clientesPageQuery({ page, pageSize: PAGE_SIZE, seg, q }),
  );
  const { data: statsData } = useQuery(clientesStatsQuery);

  const clientes = pageData?.clientes ?? [];
  const total = pageData?.total ?? 0;

  function goPage(p: number) {
    navigate({ search: (prev) => ({ ...prev, page: p }) });
  }
  function setSeg(s: string) {
    navigate({ search: (prev) => ({ ...prev, seg: s, page: 1 }) });
  }
  function setQ(val: string) {
    navigate({ search: (prev) => ({ ...prev, q: val, page: 1 }) });
  }
  function openDetail(id: string) {
    navigate({ search: (prev) => ({ ...prev, id }) });
  }
  function closeDetail() {
    navigate({ search: (prev) => ({ ...prev, id: undefined }) });
  }

  return (
    <div>
      {/* KPI tiles */}
      {statsData && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          {(["Propietario", "Comprador", "Inquilino"] as const).map((s) => {
            const cfg = SEG_META[s];
            const count = statsData[s.toLowerCase() as keyof typeof statsData] ?? 0;
            const total = statsData.total ?? 1;
            const pct = Math.round((Number(count) / Number(total)) * 100);
            return (
              <button
                key={s}
                onClick={() => setSeg(seg === s ? "Todos" : s)}
                className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${seg === s ? "border-primary/50 bg-primary/[0.03]" : "border-border bg-card hover:border-foreground/20"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <cfg.icon className="size-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{cfg.label}</span>
                </div>
                <div className="text-2xl font-semibold">{count}</div>
                <div className="text-[11px] text-muted-foreground">{pct}% del total</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Controles */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-muted p-1">
          {CLIENTE_SEGS.map((s) => (
            <button
              key={s}
              onClick={() => setSeg(s)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                seg === s
                  ? "bg-background text-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, email o teléfono…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <NewClienteDialog />
      </div>

      {/* Tabla */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="py-2.5 pl-4 pr-2 text-left font-medium">Nombre</th>
                <th className="py-2.5 px-2 text-left font-medium">Teléfono</th>
                <th className="py-2.5 px-2 text-left font-medium">Segmento</th>
                <th className="py-2.5 px-2 text-left font-medium">Alta</th>
                <th className="py-2.5 pl-2 pr-4 text-right font-medium">Activos</th>
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 && !isFetching ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    <Users className="mx-auto mb-2 size-6 opacity-50" />
                    Sin clientes en este filtro.
                  </td>
                </tr>
              ) : (
                clientes.map((c) => (
                  <ClienteRow key={c.id} c={c} onClick={() => openDetail(c.id)} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={goPage}
          isFetching={isFetching}
        />
      </div>

      {/* Detail Sheet */}
      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && closeDetail()}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedId && <ClienteDetallePanel id={selectedId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ClienteDetallePanel({ id }: { id: string }) {
  const { data: result, isFetching } = useQuery(clienteDetailQuery(id));
  if (isFetching) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const cliente = result?.cliente;
  if (!cliente) return <div className="text-sm text-muted-foreground p-4">No encontrado.</div>;

  const segCfg = SEG_META[cliente.segmento as keyof typeof SEG_META] ?? SEG_META.Lead;
  const canal = inferCanal(cliente);

  return (
    <div className="space-y-5 p-1">
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-base font-semibold">
          {initials(cliente.nombre) || "?"}
        </span>
        <div>
          <div className="text-base font-semibold">{cliente.nombre || "Sin nombre"}</div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-flex items-center gap-1 text-[11px] border rounded-full px-2 py-0.5 font-medium ${segCfg.chip}`}
            >
              <segCfg.icon className="size-3" />
              {segCfg.label.replace("s", "")}
            </span>
            {hasSilviaConversation(cliente) && <CanalChip canal={canal} />}
          </div>
        </div>
      </div>

      {/* Contacto */}
      <div className="space-y-1.5 text-sm">
        {cliente.telefono && (
          <a
            href={`tel:${cliente.telefono}`}
            className="flex items-center gap-2 text-foreground hover:text-primary"
          >
            <Phone className="size-4 text-muted-foreground" />
            {cliente.telefono}
          </a>
        )}
        {cliente.email && (
          <a
            href={`mailto:${cliente.email}`}
            className="flex items-center gap-2 text-foreground hover:text-primary"
          >
            <Mail className="size-4 text-muted-foreground" />
            {cliente.email}
          </a>
        )}
        {cliente.fecha && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="size-4" />
            Alta: {formatFechaCorta(cliente.fecha)}
          </div>
        )}
      </div>

      {/* Inmuebles vinculados */}
      {cliente.inmueblesVinculados.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Inmuebles
          </div>
          <div className="space-y-2">
            {cliente.inmueblesVinculados.map((inm) => (
              <Link
                key={inm.id}
                to="/inmuebles/$id"
                params={{ id: inm.id }}
                className="flex items-center gap-2 rounded-lg border border-border p-2 hover:border-foreground/30 transition-colors"
              >
                <div className="size-10 shrink-0 rounded bg-muted overflow-hidden">
                  <SafeImage src={inm.imagen} alt={inm.ref} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">
                    {inm.calle} {inm.numero}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {inm.rolTipo} · {inm.estatus}
                  </div>
                </div>
                <ArrowUpRight className="size-3.5 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Motivo */}
      {cliente.motivo && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Motivo
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{cliente.motivo}</p>
        </div>
      )}

      {/* Transcripción SilvIA */}
      {cliente.conversaciones && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Conversación SilvIA
          </div>
          <div className="rounded-md bg-muted/40 border border-border p-3 max-h-60 overflow-auto">
            <Transcripcion text={cliente.conversaciones} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMPLE CONTACTS TAB (Histórico / Descartado)
// ─────────────────────────────────────────────────────────────────────────────

function SimpleContactsTab({ etapa }: { etapa: string }) {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const page = rawSearch.page ?? 1;
  const q = rawSearch.q ?? "";

  const { data, isFetching } = useQuery(
    contactosPageQuery({ page, pageSize: PAGE_SIZE, etapa, q }),
  );

  const clientes = data?.clientes ?? [];
  const total = data?.total ?? 0;

  function goPage(p: number) {
    navigate({ search: (prev) => ({ ...prev, page: p }) });
  }
  function setQ(val: string) {
    navigate({ search: (prev) => ({ ...prev, q: val, page: 1 }) });
  }

  return (
    <div>
      {/* Search */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, email o teléfono…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {total} {etapa === "Histórico" ? "históricos" : "descartados"}
        </span>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="py-2.5 pl-4 pr-2 text-left font-medium">Nombre</th>
                <th className="py-2.5 px-2 text-left font-medium">Teléfono</th>
                <th className="py-2.5 px-2 text-left font-medium">Email</th>
                <th className="py-2.5 px-2 text-left font-medium">Segmento</th>
                <th className="py-2.5 pl-2 pr-4 text-left font-medium">Alta</th>
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 && !isFetching ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    <Users className="mx-auto mb-2 size-6 opacity-50" />
                    No hay contactos en {etapa.toLowerCase()}.
                  </td>
                </tr>
              ) : (
                clientes.map((c) => {
                  const segCfg = SEG_META[c.segmento as Segmento] ?? SEG_META.Lead;
                  const Icon = segCfg.icon;
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-border hover:bg-muted/40 transition-colors"
                    >
                      <td className="py-3 pl-4 pr-2">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                            {initials(c.nombre) || "?"}
                          </span>
                          <span className="text-sm font-medium truncate max-w-[180px]">
                            {c.nombre || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-[11px] text-muted-foreground">
                        {c.telefono || "—"}
                      </td>
                      <td className="py-3 px-2 text-[11px] text-muted-foreground truncate max-w-[180px]">
                        {c.email || "—"}
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] border rounded-full px-2 py-0.5 font-medium ${segCfg.chip}`}
                        >
                          <Icon className="size-3" />
                          {segCfg.label.replace("s", "")}
                        </span>
                      </td>
                      <td className="py-3 pl-2 pr-4 text-[11px] text-muted-foreground whitespace-nowrap">
                        {formatFechaCorta(c.fecha)}
                        {c.diasDesdeAlta !== null && (
                          <span className="text-muted-foreground/50 ml-1">
                            ({c.diasDesdeAlta}d)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={goPage}
          isFetching={isFetching}
        />
      </div>
    </div>
  );
}
