import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useRef } from "react";
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
  StickyNote,
  Loader2,
  ArrowRight,
  Users,
  Inbox,
  Home,
  ShoppingCart,
  KeyRound,
  Search as SearchIcon,
  HelpCircle,
  Ban,
  Pencil,
  LayoutList,
  Columns3,
  GripVertical,
  Zap,
} from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { AppShell } from "@/components/AppShell";
import { NewVisitaDialog } from "@/components/CreateDialogs";
import { AsignarLeadButton } from "@/components/AsignarLeadButton";
import { agentesQuery } from "@/lib/queries";
import { listClientes, type Cliente } from "@/lib/clientes.functions";
import {
  
  updateClienteSeguimiento,
  type EstadoSeguimiento,
} from "@/lib/mutations.functions";

const clientesQuery = queryOptions({
  queryKey: ["clientes"],
  queryFn: () => listClientes(),
});

const searchSchema = z.object({
  agente: z.string().optional(),
});

export const Route = createFileRoute("/mis-leads/")({
  head: () => ({
    meta: [
      { title: "Mis leads · El Sol Grupo CRM" },
      {
        name: "description",
        content:
          "Bandeja personal del comercial: leads asignados, estado de seguimiento y próximas acciones.",
      },
    ],
  }),
  validateSearch: searchSchema,
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(clientesQuery),
      context.queryClient.ensureQueryData(agentesQuery),
    ]),
  component: MisLeadsPage,
  errorComponent: ({ error }) => (
    <AppShell title="Mis leads">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Error cargando: {error.message}
      </div>
    </AppShell>
  ),
});

const ESTADO_META: Record<
  EstadoSeguimiento,
  { cls: string; icon: typeof Clock; label: string }
> = {
  Pendiente: {
    cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    icon: Clock,
    label: "Pendiente",
  },
  Contactado: {
    cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
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
    cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
    icon: Home,
    label: "Propietario",
    descripcion: "Dueño de un inmueble que quiere vender o alquilar con nosotros",
  },
  Comprador: {
    cls: "bg-accent/20 text-accent-foreground border-accent/40",
    icon: ShoppingCart,
    label: "Comprador",
    descripcion: "Interesado en comprar un inmueble",
  },
  Inquilino: {
    cls: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/30",
    icon: KeyRound,
    label: "Inquilino",
    descripcion: "Interesado en alquilar un inmueble",
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
  // Si ya hay notas de seguimiento, el lead está en tratamiento
  if (c.observaciones && c.observaciones.trim().length > 0) return "Contactado";
  return "Pendiente";
}

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function extraerUltimaNota(
  obs: string,
): { fecha: string; texto: string } | null {
  if (!obs || !obs.trim()) return null;
  const lines = obs.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].trim().match(/^\[([^\]]+)\]\s*(.+)$/);
    if (m) return { fecha: m[1], texto: m[2] };
  }
  return null;
}

function MisLeadsPage() {
  const { data } = useSuspenseQuery(clientesQuery);
  const { data: ag } = useSuspenseQuery(agentesQuery);
  const navigate = useNavigate({ from: "/mis-leads" });
  const { agente: agenteParam } = Route.useSearch();
  const [q, setQ] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EstadoSeguimiento | "Todos">("Todos");
  const [origenFilter, setOrigenFilter] = useState<string>("Todos");
  const [view, setView] = useState<"lista" | "kanban">("kanban");

  const agentes = ag.agentes;
  const [savedAgenteId] = useState<string>(() =>
    typeof window !== "undefined" ? (localStorage.getItem("homebase.misleads.agente") ?? "") : ""
  );
  const agenteId =
    agenteParam ??
    (savedAgenteId && agentes.some((a) => a.id === savedAgenteId) ? savedAgenteId : null) ??
    agentes[0]?.id ??
    "";
  const agenteSel = agentes.find((a) => a.id === agenteId);

  const misLeads = useMemo(() => {
    return data.clientes
      .filter((c) => c.agentesIds.includes(agenteId))
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
    <AppShell title="Mis leads" subtitle="Bandeja personal del comercial">
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
              localStorage.setItem("homebase.misleads.agente", val);
            }
            navigate({ search: { agente: val } });
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

      {/* Barra de filtros compartida */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {view === "lista" && (["Pendiente", "Contactado", "Descartado", "Todos"] as const).map((e) => {
          const active = estadoFilter === e;
          const meta = e !== "Todos" ? ESTADO_META[e] : null;
          return (
            <button key={e} onClick={() => setEstadoFilter(e)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${active ? meta ? meta.cls : "bg-foreground text-background border-foreground" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
            >
              {meta && <meta.icon className="size-3" />}
              {e}<span className="opacity-70">· {counts[e]}</span>
            </button>
          );
        })}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, teléfono o motivo…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Filtros por origen */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mr-1">Origen</span>
        {(["Todos", ...Object.keys(ORIGEN_META)] as const).map((k) => {
          const active = origenFilter === k;
          const meta = k !== "Todos" ? ORIGEN_META[k as string] : null;
          const count = origenCounts[k as string] ?? 0;
          return (
            <button key={k} onClick={() => setOrigenFilter(k as string)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${active ? meta ? meta.cls : "bg-foreground text-background border-foreground" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
            >
              {meta && <meta.icon className="size-3" />}
              {meta ? meta.label : k}
              <span className="opacity-70">· {count}</span>
            </button>
          );
        })}
      </div>

      {/* Contenido según vista */}
      {view === "kanban" ? (
        <KanbanView leads={misLeads} q={q} origenFilter={origenFilter} />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          <Inbox className="mx-auto mb-2 size-6 opacity-50" />
          {misLeads.length === 0 ? "Este comercial todavía no tiene leads asignados." : "Sin leads en este estado."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(({ cliente, estado }) => (
            <LeadCard key={cliente.id} cliente={cliente} estado={estado} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

// ── Kanban ────────────────────────────────────────────────────────────────────

const PIPELINE_STAGES: Array<{
  id: EstadoSeguimiento;
  label: string;
  dot: string;
  headerCls: string;
}> = [
  { id: "Pendiente",  label: "Nuevos",        dot: "bg-amber-400",  headerCls: "border-amber-400/40" },
  { id: "Contactado", label: "En seguimiento", dot: "bg-blue-500",   headerCls: "border-blue-500/40" },
  { id: "Descartado", label: "Archivados",     dot: "bg-slate-400",  headerCls: "border-slate-400/40" },
];

function filterLeadsFn(
  leads: Array<{ cliente: Cliente; estado: EstadoSeguimiento }>,
  q: string,
  origenFilter: string,
) {
  const ql = q.trim().toLowerCase();
  return leads.filter(({ cliente: c, estado }) => {
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

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / 86400000);
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
  const qc = useQueryClient();
  const fn = useServerFn(updateClienteSeguimiento);

  const filtered = useMemo(
    () => filterLeadsFn(leads, q, origenFilter),
    [leads, q, origenFilter],
  );

  const pendientes = filtered.filter((l) => l.estado === "Pendiente").length;

  function handleDrop(targetStage: EstadoSeguimiento) {
    if (!draggingId || !targetStage) return;
    const lead = filtered.find((l) => l.cliente.id === draggingId);
    if (!lead || lead.estado === targetStage) return;
    fn({ data: { clienteId: draggingId, estado: targetStage } })
      .then(() => {
        toast.success("Lead movido");
        qc.invalidateQueries({ queryKey: ["clientes"] });
      })
      .catch((e: Error) => toast.error(e.message));
    setDraggingId(null);
    setOverStage(null);
  }

  return (
    <div className="space-y-4">
      {/* Foco del día */}
      {pendientes > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-2.5">
          <Zap className="size-4 text-amber-500 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <span className="font-semibold">Tu foco hoy</span>
            {" · "}{pendientes} lead{pendientes !== 1 ? "s" : ""} sin contactar
          </p>
        </div>
      )}

      {/* Columnas */}
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = filtered.filter((l) => l.estado === stage.id);
          const isOver = overStage === stage.id;
          return (
            <div
              key={stage.id}
              onDragOver={(e) => { e.preventDefault(); setOverStage(stage.id); }}
              onDragLeave={() => setOverStage(null)}
              onDrop={() => handleDrop(stage.id)}
              className={`flex flex-col min-w-[280px] w-[280px] shrink-0 rounded-xl border transition-colors ${isOver ? "border-primary/50 bg-primary/[0.03]" : `border-border ${stage.headerCls}`}`}
            >
              {/* Column header */}
              <div className={`flex items-center gap-2 px-3 py-2.5 border-b border-border rounded-t-xl bg-muted/30`}>
                <span className={`size-2 rounded-full ${stage.dot}`} />
                <span className="text-sm font-medium">{stage.label}</span>
                <span className="ml-auto text-xs text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5 font-mono">
                  {stageLeads.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 overflow-y-auto max-h-[calc(100vh-320px)] p-2 space-y-2 min-h-[120px]">
                {stageLeads.length === 0 ? (
                  <div className={`flex items-center justify-center h-16 rounded-lg border-2 border-dashed text-xs text-muted-foreground transition-colors ${isOver ? "border-primary/40 bg-primary/[0.03]" : "border-border"}`}>
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
                      onDragEnd={() => { setDraggingId(null); setOverStage(null); }}
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
      qc.invalidateQueries({ queryKey: ["clientes"] });
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
    mut.mutate({ data: { clienteId: cliente.id, nota: t, observacionesActuales: cliente.observaciones } });
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`rounded-lg border bg-card select-none transition-all ${isDragging ? "opacity-40 scale-[0.98]" : "hover:border-foreground/20 hover:shadow-sm cursor-grab active:cursor-grabbing"}`}
    >
      {/* Drag handle + header */}
      <div className="flex items-start gap-2 p-3">
        <GripVertical className="size-3.5 text-muted-foreground/40 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium truncate">{cliente.nombre || "Sin nombre"}</span>
            {dias != null && (
              <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${dias > 14 ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" : dias > 7 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>
                {dias}d
              </span>
            )}
          </div>
          {cliente.motivo && (
            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
              {cliente.motivo}
            </p>
          )}
        </div>
      </div>

      {/* Tags */}
      {cliente.categoria.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {cliente.categoria.slice(0, 2).map((cat) => (
            <span key={cat} className="inline-flex items-center gap-0.5 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
              <Tag className="size-2.5" />{cat}
            </span>
          ))}
        </div>
      )}

      {/* Última nota */}
      {ultimaNota && (
        <div className="mx-3 mb-2 rounded-md bg-muted/50 px-2 py-1.5 text-[10px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground/70">{ultimaNota.fecha}:</span>{" "}
          <span className="line-clamp-1">{ultimaNota.texto}</span>
        </div>
      )}

      {/* Nota inline */}
      {notaOpen && (
        <div className="px-3 pb-2">
          <textarea
            ref={notaRef}
            autoFocus
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota de seguimiento…"
            rows={2}
            className="w-full text-xs rounded-md border border-input bg-background p-2 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <div className="flex justify-end gap-1 mt-1">
            <button onClick={() => { setNotaOpen(false); setNota(""); }}
              className="text-[10px] px-2 py-0.5 rounded hover:bg-muted text-muted-foreground">
              Cancelar
            </button>
            <button disabled={!nota.trim() || mut.isPending} onClick={guardarNota}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-primary text-primary-foreground disabled:opacity-60">
              {mut.isPending && <Loader2 className="size-2.5 animate-spin" />} Guardar
            </button>
          </div>
        </div>
      )}

      {/* Footer acciones */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-border bg-muted/20 rounded-b-lg">
        {cliente.telefono && (
          <a href={`tel:${cliente.telefono.replace(/\s+/g, "")}`}
            className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground">
            <Phone className="size-3" />{cliente.telefono}
          </a>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => { setNotaOpen((o) => !o); }}
            className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <StickyNote className="size-3" />
          </button>
          <NewVisitaDialog
            defaultClienteId={cliente.id}
            trigger={
              <button type="button"
                className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                <CalendarPlus className="size-3" />
              </button>
            }
          />
          <Link to="/clientes" search={{ id: cliente.id }}
            className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground px-1 py-1 rounded hover:bg-muted transition-colors">
            <ArrowRight className="size-3" />
          </Link>
        </div>
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
  const qc = useQueryClient();
  const fn = useServerFn(updateClienteSeguimiento);
  const [notaOpen, setNotaOpen] = useState(false);
  const [nota, setNota] = useState("");
  const meta = ESTADO_META[estado];

  const mut = useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success("Lead actualizado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setNotaOpen(false);
      setNota("");
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar"),
  });

  function cambiarEstado(nuevo: EstadoSeguimiento) {
    if (nuevo === estado) return;
    mut.mutate({ data: { clienteId: cliente.id, estado: nuevo } });
  }

  function guardarNota() {
    const t = nota.trim();
    if (!t) return;
    mut.mutate({
      data: {
        clienteId: cliente.id,
        nota: t,
        observacionesActuales: cliente.observaciones,
      },
    });
  }

  const ultimaNota = extraerUltimaNota(cliente.observaciones);
  const esContactado = estado === "Contactado";

  return (
    <article
      className={`rounded-lg border bg-card hover:border-foreground/20 transition-colors ${
        esContactado
          ? "border-emerald-500/40 ring-1 ring-emerald-500/20 shadow-sm"
          : "border-border"
      }`}
    >
      <header className="flex items-start justify-between gap-3 p-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
              esContactado
                ? "bg-emerald-500/15 text-emerald-600"
                : "bg-gradient-to-br from-primary/20 to-amber-200/30 text-primary"
            }`}
          >
            {cliente.nombre.charAt(0).toUpperCase() || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-sm truncate">
                {cliente.nombre || "Sin nombre"}
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${meta.cls}`}
              >
                <meta.icon className="size-3" /> {meta.label}
              </span>
              {ultimaNota && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-accent/20 text-accent-foreground border-accent/40"
                  title={ultimaNota.texto}
                >
                  <MessageSquare className="size-3" />
                  <span className="truncate max-w-[140px]">
                    {ultimaNota.texto}
                  </span>
                  <span className="opacity-70">· {ultimaNota.fecha}</span>
                </span>
              )}
              <OrigenBadgeEditor cliente={cliente} mut={mut} />

            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              {cliente.telefono && (
                <a
                  href={`tel:${cliente.telefono.replace(/\s+/g, "")}`}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <Phone className="size-3" /> {cliente.telefono}
                </a>
              )}
              {cliente.email && (
                <a
                  href={`mailto:${cliente.email.trim()}`}
                  className="inline-flex items-center gap-1 truncate max-w-[220px] hover:text-foreground"
                >
                  <Mail className="size-3" /> {cliente.email.trim()}
                </a>
              )}
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3" /> {formatFecha(cliente.fecha)}
              </span>
            </div>
          </div>
        </div>
      </header>

      {cliente.motivo && (
        <div className="px-4 pb-3">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Motivo
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed line-clamp-3">
            {cliente.motivo}
          </p>
        </div>
      )}

      {cliente.categoria.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {cliente.categoria.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full"
            >
              <Tag className="size-3" /> {cat}
            </span>
          ))}
        </div>
      )}

      {cliente.observaciones && (
        <div className="px-4 pb-3">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1">
            <MessageSquare className="size-3" /> Notas de seguimiento
          </div>
          <pre className="text-[11px] text-foreground/80 whitespace-pre-wrap font-sans bg-muted/40 border border-border rounded-md p-2 max-h-32 overflow-auto">
            {cliente.observaciones}
          </pre>
        </div>
      )}

      {notaOpen && (
        <div className="px-4 pb-3">
          <textarea
            autoFocus
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Añade una nota de seguimiento (qué se habló, próximos pasos…)"
            rows={3}
            className="w-full text-xs rounded-md border border-input bg-background p-2 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <div className="flex justify-end gap-1.5 mt-2">
            <button
              onClick={() => {
                setNotaOpen(false);
                setNota("");
              }}
              className="text-[11px] px-2 py-1 rounded-md hover:bg-muted text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              disabled={!nota.trim() || mut.isPending}
              onClick={guardarNota}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 cursor-pointer disabled:opacity-60"
            >
              {mut.isPending && <Loader2 className="size-3 animate-spin" />}
              Guardar nota
            </button>
          </div>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-border bg-muted/20 rounded-b-lg">
        <Link
          to="/clientes"
          search={{ id: cliente.id }}
          className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          Ver ficha completa <ArrowRight className="size-3" />
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Acciones contextuales según estado */}
          {estado === "Descartado" ? (
            <button
              onClick={() => cambiarEstado("Pendiente")}
              disabled={mut.isPending}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 cursor-pointer transition-colors"
            >
              <Clock className="size-3" /> Reabrir
            </button>
          ) : (
            <>
              {estado === "Pendiente" && (
                <button
                  onClick={() => cambiarEstado("Contactado")}
                  disabled={mut.isPending}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 cursor-pointer transition-colors"
                  title="Marcar como contactado"
                >
                  <CheckCircle2 className="size-3" /> Marcar contactado
                </button>
              )}
              <button
                onClick={() => setNotaOpen((o) => !o)}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 cursor-pointer transition-colors"
              >
                <StickyNote className="size-3" />
                {cliente.observaciones ? "Editar seguimiento" : "Añadir nota"}
              </button>
              <button
                onClick={() => cambiarEstado("Descartado")}
                disabled={mut.isPending}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-400 hover:bg-slate-500/20 cursor-pointer transition-colors"
                title="Descartar lead"
              >
                <XCircle className="size-3" /> Descartar
              </button>
            </>
          )}
          {/* Visita */}
          <NewVisitaDialog
            defaultClienteId={cliente.id}
            trigger={
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 cursor-pointer transition-opacity"
              >
                <CalendarPlus className="size-3" /> Visita
              </button>
            }
          />
          {/* Reasignar */}
          <AsignarLeadButton
            clienteId={cliente.id}
            agentesActuales={cliente.agentesIds}
          />
        </div>
      </footer>
    </article>
  );
}

// Mapeo de segmento UI → valor del campo "Tipo de cliente" en Airtable.
// Inquilino NO aparece aquí: se determina por propiedadAlquilerIds (enlaces a propiedades),
// no por el campo tipo — reclasificar como "Interesado alquiler" los convertiría en Lead.
const SEGMENTO_A_TIPO: Record<string, string> = {
  Propietario: "Propietario",
  Comprador: "Comprador",
  Prospecto: "Prospecciones",
  Descartado: "Anular prospección",
};

function OrigenBadgeEditor({
  cliente,
  mut,
}: {
  cliente: Cliente;
  mut: {
    isPending: boolean;
    mutate: (vars: { data: { clienteId: string; tipo?: string } }) => void;
  };
}) {
  const [open, setOpen] = useState(false);
  const o = ORIGEN_META[cliente.segmento] ?? ORIGEN_META.Lead;
  // Inquilino excluded: status comes from property links, not from "Tipo de cliente" field
  const opciones = ["Propietario", "Comprador", "Prospecto", "Descartado"] as const;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`${o.descripcion}${cliente.segmentoMotivo ? ` · ${cliente.segmentoMotivo}` : ""}${cliente.tipo ? ` · Origen Airtable: ${cliente.tipo}` : ""} · Click para reclasificar`}
          className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border cursor-pointer hover:opacity-80 ${o.cls}`}
        >
          <o.icon className="size-3" /> {o.label}
          <Pencil className="size-2.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2">
        <div className="text-[11px] font-medium text-muted-foreground px-1 pb-1.5">
          Reclasificar origen
        </div>
        <div className="space-y-0.5">
          {opciones.map((seg) => {
            const m = ORIGEN_META[seg];
            const tipoAirtable = SEGMENTO_A_TIPO[seg];
            const isCurrent = cliente.segmento === seg;
            return (
              <button
                key={seg}
                disabled={mut.isPending || isCurrent}
                onClick={() => {
                  mut.mutate({ data: { clienteId: cliente.id, tipo: tipoAirtable } });
                  setOpen(false);
                }}
                className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed ${
                  isCurrent ? "bg-muted" : ""
                }`}
              >
                <span className={`inline-flex items-center justify-center size-5 rounded border ${m.cls}`}>
                  <m.icon className="size-3" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-[10px] text-muted-foreground line-clamp-1">
                    {m.descripcion}
                  </span>
                </span>
                {isCurrent && <CheckCircle2 className="size-3.5 text-emerald-600" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
