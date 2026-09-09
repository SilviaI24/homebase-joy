// M-03: extraído de src/routes/contactos.index.tsx.
import { useMemo, useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Phone,
  Mail,
  CalendarDays,
  Tag,
  MessageSquare,
  CalendarPlus,
  GripVertical,
  Zap,
  Trash2,
  StickyNote,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NewVisitaDialog } from "@/components/CreateDialogs";
import { AsignarLeadButton } from "@/components/AsignarLeadButton";
import { AsociarInmuebleButton } from "@/components/AsociarInmuebleButton";
import type { Cliente } from "@/lib/clientes.functions";
import { deleteContacto } from "@/lib/clientes-ciclo-vida.functions";
import { updateClienteSeguimiento, type EstadoSeguimiento } from "@/lib/mutations.functions";
import {
  ESTADO_META,
  PIPELINE_STAGES,
  diasDesde,
  extraerUltimaNota,
  filterLeadsFn,
  formatFechaCorta,
} from "@/lib/contactos-format";

export function KanbanCard({
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

export function KanbanView({
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

export function LeadCard({ cliente, estado }: { cliente: Cliente; estado: EstadoSeguimiento }) {
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
              {formatFechaCorta(cliente.fecha)}
              {dias !== null && <span className="text-muted-foreground/60">(hace {dias}d)</span>}
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
