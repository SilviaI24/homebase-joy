import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
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
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { NewVisitaDialog } from "@/components/CreateDialogs";
import { AsignarLeadButton } from "@/components/AsignarLeadButton";
import { agentesQuery } from "@/lib/queries";
import { listClientes, type Cliente } from "@/lib/clientes.functions";
import {
  ESTADOS_SEGUIMIENTO,
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

function MisLeadsPage() {
  const { data } = useSuspenseQuery(clientesQuery);
  const { data: ag } = useSuspenseQuery(agentesQuery);
  const navigate = useNavigate({ from: "/mis-leads" });
  const { agente: agenteParam } = Route.useSearch();
  const [q, setQ] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EstadoSeguimiento | "Todos">(
    "Pendiente",
  );

  const agentes = ag.agentes;
  const agenteId = agenteParam ?? agentes[0]?.id ?? "";
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

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return misLeads.filter(({ cliente: c, estado }) => {
      if (estadoFilter !== "Todos" && estado !== estadoFilter) return false;
      if (!ql) return true;
      return (
        c.nombre.toLowerCase().includes(ql) ||
        c.telefono.toLowerCase().includes(ql) ||
        c.email.toLowerCase().includes(ql) ||
        c.motivo.toLowerCase().includes(ql)
      );
    });
  }, [misLeads, q, estadoFilter]);

  return (
    <AppShell title="Mis leads" subtitle="Bandeja personal del comercial">
      {/* Selector de comercial */}
      <div className="mb-5 rounded-xl border border-border bg-card p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UserCog className="size-4 text-muted-foreground" />
          Comercial
        </div>
        <select
          value={agenteId}
          onChange={(e) =>
            navigate({ search: { agente: e.target.value || undefined } })
          }
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
        <Link
          to="/comerciales"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <Users className="size-3" /> Ver equipo
        </Link>
      </div>

      {/* KPIs estado */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["Pendiente", "Contactado", "Descartado", "Todos"] as const).map(
          (e) => {
            const active = estadoFilter === e;
            const meta = e !== "Todos" ? ESTADO_META[e] : null;
            return (
              <button
                key={e}
                onClick={() => setEstadoFilter(e)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                  active
                    ? meta
                      ? meta.cls
                      : "bg-foreground text-background border-foreground"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {meta && <meta.icon className="size-3" />}
                {e}
                <span className="opacity-70">· {counts[e]}</span>
              </button>
            );
          },
        )}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, teléfono o motivo…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Lista de leads */}
      {filtered.length === 0 ? (
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
    </AppShell>
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

  return (
    <article className="rounded-lg border border-border bg-card hover:border-foreground/20 transition-colors">
      <header className="flex items-start justify-between gap-3 p-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-amber-200/30 text-primary text-sm font-semibold">
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
              {cliente.tipo && (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {cliente.tipo}
                </span>
              )}
              {cliente.segmento && cliente.segmento !== "Lead" && (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {cliente.segmento}
                </span>
              )}
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
              className="inline-flex items-center gap-1 text-[11px] bg-violet-500/10 text-violet-700 dark:text-violet-400 px-2 py-0.5 rounded-full"
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
