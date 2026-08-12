import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import {
  Banknote,
  TrendingUp,
  CheckCircle2,
  Clock,
  Plus,
  X,
  ChevronDown,
  Building2,
  User,
  Users,
  Calendar,
} from "lucide-react";

import { operacionesQuery, agentesQuery } from "@/lib/queries";
import {
  createOperacion,
  updateOperacionEstado,
  type OperacionTipo,
  type OperacionEstado,
  type OperacionRow,
} from "@/lib/operaciones.functions";
import { searchContactos } from "@/lib/seguimiento.functions";

export const Route = createFileRoute("/operaciones/")({
  head: () => ({
    meta: [
      { title: "Operaciones · El Sol Grupo CRM" },
      { name: "description", content: "Gestión de operaciones inmobiliarias: ventas, alquileres y comisiones." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(operacionesQuery);
    context.queryClient.ensureQueryData(agentesQuery);
  },
  component: OperacionesPage,
  pendingComponent: () => (
    <AppShell title="Operaciones">
      <div className="text-sm text-muted-foreground py-10 text-center">Cargando operaciones…</div>
    </AppShell>
  ),
  errorComponent: ({ error }) => (
    <AppShell title="Operaciones">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Error: {error.message}
      </div>
    </AppShell>
  ),
});

const TIPOS: OperacionTipo[]   = ["Venta", "Alquiler", "Valoración", "Servicio"];
const ESTADOS: OperacionEstado[] = ["Abierta", "En negociación", "Cerrada", "Cancelada"];

const ESTADO_STYLE: Record<OperacionEstado, string> = {
  "Abierta":         "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "En negociación":  "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  "Cerrada":         "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "Cancelada":       "bg-zinc-500/10 text-zinc-500",
};

function fmtEur(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s.slice(0, 10); }
}

function OperacionesPage() {
  const { data }    = useSuspenseQuery(operacionesQuery);
  const { data: agData } = useSuspenseQuery(agentesQuery);
  const qc          = useQueryClient();

  const [estadoFilter, setEstadoFilter] = useState<OperacionEstado | "Todas">("Todas");
  const [tipoFilter,   setTipoFilter]   = useState<OperacionTipo | "Todos">("Todos");
  const [showForm,     setShowForm]     = useState(false);

  // Form state
  const [fTipo,        setFTipo]        = useState<OperacionTipo>("Venta");
  const [fPrecio,      setFPrecio]      = useState("");
  const [fComisionPct, setFComisionPct] = useState("3");
  const [fAgenteId,    setFAgenteId]    = useState("");
  const [fVendedorQ,   setFVendedorQ]   = useState("");
  const [fVendedor,    setFVendedor]    = useState<{ id: string; nombre: string } | null>(null);
  const [fCompradorQ,  setFCompradorQ]  = useState("");
  const [fComprador,   setFComprador]   = useState<{ id: string; nombre: string } | null>(null);
  const [fNotas,       setFNotas]       = useState("");

  const createFn        = useServerFn(createOperacion);
  const updateEstadoFn  = useServerFn(updateOperacionEstado);
  const searchFn        = useServerFn(searchContactos);

  const { data: vendedorResults } = useQuery({
    queryKey: ["contact-search-v", fVendedorQ],
    queryFn: () => searchFn({ data: { q: fVendedorQ } }),
    enabled: fVendedorQ.length >= 2,
    staleTime: 10_000,
  });
  const { data: compradorResults } = useQuery({
    queryKey: ["contact-search-c", fCompradorQ],
    queryFn: () => searchFn({ data: { q: fCompradorQ } }),
    enabled: fCompradorQ.length >= 2,
    staleTime: 10_000,
  });

  const precio     = parseFloat(fPrecio.replace(/\./g, "").replace(",", ".")) || null;
  const pct        = parseFloat(fComisionPct) || null;
  const comisionCalc = precio && pct ? precio * pct / 100 : null;

  const createMut = useMutation({
    mutationFn: () => createFn({
      data: {
        tipo: fTipo,
        precioOperacion: precio,
        comisionPct: pct,
        agenteId: fAgenteId || null,
        vendedorId: fVendedor?.id ?? null,
        compradorId: fComprador?.id ?? null,
        notas: fNotas,
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operaciones"] });
      toast.success("Operación creada");
      setShowForm(false);
      setFPrecio(""); setFComisionPct("3"); setFAgenteId("");
      setFVendedor(null); setFVendedorQ("");
      setFComprador(null); setFCompradorQ("");
      setFNotas("");
    },
    onError: (e: Error) => toast.error(e.message || "Error al crear"),
  });

  const estadoMut = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: OperacionEstado }) =>
      updateEstadoFn({ data: { id, estado } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operaciones"] });
      toast.success("Estado actualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    let rows = data.operaciones;
    if (estadoFilter !== "Todas") rows = rows.filter(r => r.estado === estadoFilter);
    if (tipoFilter !== "Todos")   rows = rows.filter(r => r.tipo === tipoFilter);
    return rows;
  }, [data.operaciones, estadoFilter, tipoFilter]);

  // KPIs
  const kpis = useMemo(() => {
    const ops = data.operaciones;
    const cerradas = ops.filter(o => o.estado === "Cerrada");
    const activas  = ops.filter(o => o.estado === "Abierta" || o.estado === "En negociación");
    const totalComision = cerradas.reduce((s, o) => s + (o.comisionTotal ?? 0), 0);
    const pipelineValor = activas.reduce((s, o) => s + (o.precioOperacion ?? 0), 0);
    return { total: ops.length, cerradas: cerradas.length, activas: activas.length, totalComision, pipelineValor };
  }, [data.operaciones]);

  return (
    <AppShell title="Operaciones">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard icon={Banknote}     label="Total"          value={kpis.total.toString()} />
        <KpiCard icon={Clock}        label="En curso"       value={kpis.activas.toString()} tone="amber" />
        <KpiCard icon={CheckCircle2} label="Cerradas"       value={kpis.cerradas.toString()} tone="emerald" />
        <KpiCard icon={TrendingUp}   label="Comisiones"     value={fmtEur(kpis.totalComision)} tone="gold" />
      </div>

      {/* Filters + new button */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {(["Todas", ...ESTADOS] as const).map(e => (
            <button key={e} onClick={() => setEstadoFilter(e as OperacionEstado | "Todas")}
              className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${
                estadoFilter === e ? "bg-primary text-primary-foreground border-transparent" : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}>{e}</button>
          ))}
          <span className="w-px h-5 bg-border self-center" />
          {(["Todos", ...TIPOS] as const).map(t => (
            <button key={t} onClick={() => setTipoFilter(t as OperacionTipo | "Todos")}
              className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${
                tipoFilter === t ? "bg-foreground text-background border-transparent" : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}>{t}</button>
          ))}
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-input bg-background text-xs font-medium hover:bg-accent transition-colors shrink-0">
          {showForm ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          {showForm ? "Cancelar" : "Nueva operación"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-5 mb-5">
          <h3 className="text-sm font-semibold mb-4">Nueva operación</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Tipo */}
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">Tipo *</label>
              <div className="flex flex-wrap gap-1.5">
                {TIPOS.map(t => (
                  <button key={t} type="button" onClick={() => setFTipo(t)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${fTipo === t ? "bg-primary text-primary-foreground border-transparent" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Agente */}
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">Agente responsable</label>
              <select value={fAgenteId} onChange={e => setFAgenteId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring">
                <option value="">Sin asignar</option>
                {agData.agentes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>

            {/* Vendedor (propietario) */}
            <ContactPicker label="Vendedor / Propietario" value={fVendedor} query={fVendedorQ}
              results={vendedorResults?.contacts ?? []}
              onQuery={setFVendedorQ} onSelect={setFVendedor} onClear={() => { setFVendedor(null); setFVendedorQ(""); }} />

            {/* Comprador / Inquilino */}
            <ContactPicker label="Comprador / Inquilino" value={fComprador} query={fCompradorQ}
              results={compradorResults?.contacts ?? []}
              onQuery={setFCompradorQ} onSelect={setFComprador} onClear={() => { setFComprador(null); setFCompradorQ(""); }} />

            {/* Precio */}
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">Precio operación (€)</label>
              <Input value={fPrecio} onChange={e => setFPrecio(e.target.value)}
                placeholder="Ej: 185000" type="text" inputMode="decimal" />
            </div>

            {/* Comisión % */}
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">Comisión (%)</label>
              <Input value={fComisionPct} onChange={e => setFComisionPct(e.target.value)}
                placeholder="Ej: 3" type="text" inputMode="decimal" />
              {comisionCalc !== null && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                  = {fmtEur(comisionCalc)}
                </p>
              )}
            </div>

            {/* Notas */}
            <div className="sm:col-span-2">
              <label className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">Notas</label>
              <textarea value={fNotas} onChange={e => setFNotas(e.target.value)} rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none"
                placeholder="Observaciones…" />
            </div>
          </div>

          <button onClick={() => createMut.mutate()} disabled={!fTipo || createMut.isPending}
            className="mt-4 h-9 px-6 inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-opacity">
            {createMut.isPending ? "Creando…" : "Crear operación"}
          </button>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          Sin operaciones para los filtros seleccionados.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
          {filtered.map(op => (
            <OperacionRow key={op.id} op={op}
              onEstadoChange={(estado) => estadoMut.mutate({ id: op.id, estado })}
              isPending={estadoMut.isPending} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, tone = "default" }: {
  icon: typeof Banknote; label: string; value: string;
  tone?: "default" | "amber" | "emerald" | "gold";
}) {
  const toneMap = {
    default: "text-primary bg-primary/10",
    amber:   "text-amber-600 dark:text-amber-400 bg-amber-500/10",
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    gold:    "text-[var(--gold)] bg-[var(--gold)]/10",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <div className={`size-8 rounded-md flex items-center justify-center ${toneMap[tone]}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ContactPicker({ label, value, query, results, onQuery, onSelect, onClear }: {
  label: string;
  value: { id: string; nombre: string } | null;
  query: string;
  results: { id: string; nombre: string }[];
  onQuery: (q: string) => void;
  onSelect: (c: { id: string; nombre: string }) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">{label}</label>
      {value ? (
        <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
          <span className="text-sm font-medium">{value.nombre}</span>
          <button type="button" onClick={onClear} className="text-[11px] text-muted-foreground hover:text-foreground">cambiar</button>
        </div>
      ) : (
        <div className="relative">
          <Input value={query} onChange={e => onQuery(e.target.value)} placeholder="Buscar contacto…" className="text-sm" />
          {query.length >= 2 && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md overflow-hidden z-20 shadow-xl">
              {results.map(c => (
                <button key={c.id} type="button" onClick={() => onSelect(c)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors border-b border-border last:border-0">
                  {c.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OperacionRow({ op, onEstadoChange, isPending }: {
  op: OperacionRow;
  onEstadoChange: (e: OperacionEstado) => void;
  isPending: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="px-4 py-3.5 hover:bg-accent/20 transition-colors">
      <div className="flex items-start gap-3">
        {/* Estado + tipo */}
        <div className="flex flex-col items-start gap-1.5 shrink-0 min-w-[100px]">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${ESTADO_STYLE[op.estado]}`}>
            {op.estado}
          </span>
          <span className="text-[11px] text-muted-foreground">{op.tipo}</span>
        </div>

        {/* Detalles */}
        <div className="flex-1 min-w-0">
          {/* Inmueble */}
          {op.propertyCalle && (
            <div className="flex items-center gap-1.5 text-xs font-medium mb-1">
              <Building2 className="size-3 text-muted-foreground shrink-0" />
              {op.propertyId ? (
                <Link to="/inmuebles/$id" params={{ id: op.propertyId }} className="hover:text-primary transition-colors truncate">
                  {op.propertyCalle}{op.propertyBarrio ? ` · ${op.propertyBarrio}` : ""}
                  {op.propertyRef ? <span className="text-muted-foreground ml-1">({op.propertyRef})</span> : null}
                </Link>
              ) : (
                <span className="truncate">{op.propertyCalle}</span>
              )}
            </div>
          )}

          {/* Partes */}
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {op.vendedorNombre && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <User className="size-3 shrink-0" /> {op.vendedorNombre}
              </span>
            )}
            {op.compradorNombre && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Users className="size-3 shrink-0" /> {op.compradorNombre}
              </span>
            )}
            {op.agenteNombre && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <User className="size-3 shrink-0 text-primary/60" />
                <span className="text-primary/70">{op.agenteNombre}</span>
              </span>
            )}
          </div>

          {op.notas && (
            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1 italic">{op.notas}</p>
          )}
        </div>

        {/* Financiero */}
        <div className="text-right shrink-0 flex flex-col gap-0.5">
          {op.precioOperacion !== null && (
            <span className="text-sm font-semibold tabular-nums">{fmtEur(op.precioOperacion)}</span>
          )}
          {op.comisionTotal !== null && (
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">
              {fmtEur(op.comisionTotal)} ({op.comisionPct}%)
            </span>
          )}
          {op.fechaApertura && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1 justify-end">
              <Calendar className="size-2.5" />{fmtDate(op.fechaApertura)}
            </span>
          )}
        </div>
      </div>

      {/* Estado inline change */}
      <div className="mt-2.5 pt-2 border-t border-border/50 relative">
        <button onClick={() => setOpen(v => !v)} disabled={isPending}
          className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
          Cambiar estado <ChevronDown className="size-3" />
        </button>
        {open && (
          <div className="absolute bottom-full left-0 mb-1 bg-card border border-border rounded-md overflow-hidden z-10 shadow-lg flex">
            {ESTADOS.filter(e => e !== op.estado).map(e => (
              <button key={e} onClick={() => { onEstadoChange(e); setOpen(false); }}
                className={`px-3 py-2 text-[11px] font-medium hover:bg-accent transition-colors border-r border-border last:border-0 ${ESTADO_STYLE[e]}`}>
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
