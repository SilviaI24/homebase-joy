// Rediseño de navegación (17 sep 2026): extraído de la antigua ruta
// /operaciones (retirada del menú — ver OperacionesPanel en el Dashboard,
// que abre este mismo componente en un Dialog vía "Ver todas"). Contenido
// sin cambios: mismos KPIs, filtros, alta y cierre de operación de siempre.
import { useSuspenseQuery, useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { KpiCard } from "@/components/KpiCard";
import { Input } from "@/components/ui/input";
import { Banknote, TrendingUp, CheckCircle2, Clock, Plus, X, Building2 } from "lucide-react";

import { operacionesQuery, agentesQuery, searchInmueblesQuery } from "@/lib/queries";
import {
  createOperacion,
  closeOperacion,
  updateOperacionEstado,
  type OperacionTipo,
  type OperacionEstado,
} from "@/lib/operaciones.functions";
import { searchContactos } from "@/lib/seguimiento.functions";
import { TIPOS, ESTADOS, fmtEur } from "@/lib/operaciones-format";
import { ContactPicker, OperacionRow } from "@/components/operaciones/OperacionesPanels";

export function OperacionesWorkspace() {
  const { data } = useSuspenseQuery(operacionesQuery);
  const { data: agData } = useSuspenseQuery(agentesQuery);
  const qc = useQueryClient();
  const { canSeeFinanciero, canCreate, canClose } = data.permissions;

  const [estadoFilter, setEstadoFilter] = useState<OperacionEstado | "Todas">("Todas");
  const [tipoFilter, setTipoFilter] = useState<OperacionTipo | "Todos">("Todos");
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [fTipo, setFTipo] = useState<OperacionTipo>("Venta");
  const [fPrecio, setFPrecio] = useState("");
  const [fComisionPct, setFComisionPct] = useState("3");
  const [fAgenteId, setFAgenteId] = useState("");
  const [fVendedorQ, setFVendedorQ] = useState("");
  const [fVendedor, setFVendedor] = useState<{ id: string; nombre: string } | null>(null);
  const [fCompradorQ, setFCompradorQ] = useState("");
  const [fComprador, setFComprador] = useState<{ id: string; nombre: string } | null>(null);
  const [fPropertyQ, setFPropertyQ] = useState("");
  const [fProperty, setFProperty] = useState<{ id: string; label: string } | null>(null);
  const [fNotas, setFNotas] = useState("");

  // Búsqueda server-side (antes cargaba las 5.817 filas de allInmueblesQuery
  // al navegador y filtraba en memoria).
  const propertyEsAlquiler = fTipo === "Venta" ? false : fTipo === "Alquiler" ? true : undefined;
  const { data: propertySearchData } = useQuery({
    ...searchInmueblesQuery({ q: fPropertyQ, limit: 8, esAlquiler: propertyEsAlquiler }),
    enabled: fPropertyQ.trim().length >= 2,
  });
  const propertyResults = useMemo(() => {
    if (!fPropertyQ.trim() || fPropertyQ.trim().length < 2) return [];
    return (propertySearchData?.inmuebles ?? []).map((p) => ({
      id: p.id,
      label: `${p.ref} — ${p.calle} ${p.numero ?? ""}`.trim(),
    }));
  }, [fPropertyQ, propertySearchData]);

  const createFn = useServerFn(createOperacion);
  const closeFn = useServerFn(closeOperacion);
  const updateEstadoFn = useServerFn(updateOperacionEstado);
  const searchFn = useServerFn(searchContactos);

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

  const precio = parseFloat(fPrecio.replace(/\./g, "").replace(",", ".")) || null;
  const pct = parseFloat(fComisionPct) || null;
  const comisionCalc = precio && pct ? (precio * pct) / 100 : null;

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          tipo: fTipo,
          precioOperacion: canClose ? precio : null,
          comisionPct: canClose ? pct : null,
          propertyId: fProperty?.id ?? null,
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
      setFPrecio("");
      setFComisionPct("3");
      setFAgenteId("");
      setFVendedor(null);
      setFVendedorQ("");
      setFComprador(null);
      setFCompradorQ("");
      setFProperty(null);
      setFPropertyQ("");
      setFNotas("");
    },
    onError: (e: Error) => {
      console.error("No se pudo crear la operación", e);
      toast.error(e.message || "No se pudo crear la operación. Revisa los datos.");
    },
  });

  const estadoMut = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: OperacionEstado }) =>
      updateEstadoFn({ data: { id, estado } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operaciones"] });
      toast.success("Estado actualizado");
    },
    onError: (e: Error) => {
      console.error("No se pudo actualizar la operación", e);
      toast.error(e.message || "No se pudo actualizar el estado de la operación.");
    },
  });

  const closeMut = useMutation({
    mutationFn: (id: string) => closeFn({ data: { id } }),
    onSuccess: (result) => {
      void Promise.all([
        qc.invalidateQueries({ queryKey: ["operaciones"] }),
        qc.invalidateQueries({ queryKey: ["all-inmuebles"] }),
        qc.invalidateQueries({ queryKey: ["clientes"] }),
        qc.invalidateQueries({ queryKey: ["seguimientos"] }),
      ]);
      toast.success(result.alreadyClosed ? "La operación ya estaba cerrada" : "Operación cerrada");
    },
    onError: (e: Error) => {
      console.error("No se pudo cerrar la operación", e);
      toast.error(e.message || "No se pudo cerrar la operación de forma segura.");
    },
  });

  const filtered = useMemo(() => {
    let rows = data.operaciones;
    if (estadoFilter !== "Todas") rows = rows.filter((r) => r.estado === estadoFilter);
    if (tipoFilter !== "Todos") rows = rows.filter((r) => r.tipo === tipoFilter);
    return rows;
  }, [data.operaciones, estadoFilter, tipoFilter]);

  // KPIs
  const kpis = useMemo(() => {
    const ops = data.operaciones;
    const cerradas = ops.filter((o) => o.estado === "Cerrada");
    const activas = ops.filter((o) => o.estado === "Abierta" || o.estado === "En negociación");
    const totalComision = cerradas.reduce((s, o) => s + (o.comisionTotal ?? 0), 0);
    const pipelineValor = activas.reduce((s, o) => s + (o.precioOperacion ?? 0), 0);
    return {
      total: ops.length,
      cerradas: cerradas.length,
      activas: activas.length,
      totalComision,
      pipelineValor,
    };
  }, [data.operaciones]);

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard icon={Banknote} label="Total" value={kpis.total.toString()} />
        <KpiCard icon={Clock} label="En curso" value={kpis.activas.toString()} tone="warning" />
        <KpiCard
          icon={CheckCircle2}
          label="Cerradas"
          value={kpis.cerradas.toString()}
          tone="success"
        />
        <KpiCard
          icon={canSeeFinanciero ? TrendingUp : X}
          label={canSeeFinanciero ? "Comisiones" : "Canceladas"}
          value={
            canSeeFinanciero
              ? fmtEur(kpis.totalComision)
              : data.operaciones.filter((op) => op.estado === "Cancelada").length.toString()
          }
          tone={canSeeFinanciero ? "gold" : "primary"}
        />
      </div>

      {/* Filters + new button */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {(["Todas", ...ESTADOS] as const).map((e) => (
            <button
              key={e}
              onClick={() => setEstadoFilter(e as OperacionEstado | "Todas")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                estadoFilter === e
                  ? "bg-primary text-primary-foreground border-transparent"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {e}
            </button>
          ))}
          <span className="w-px h-5 bg-border self-center" />
          {(["Todos", ...TIPOS] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTipoFilter(t as OperacionTipo | "Todos")}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                tipoFilter === t
                  ? "bg-foreground text-background border-transparent"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-input bg-background text-xs font-medium hover:bg-accent transition-colors shrink-0"
          >
            {showForm ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            {showForm ? "Cancelar" : "Nueva operación"}
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-5 mb-5">
          <h3 className="text-sm font-semibold mb-4">Nueva operación</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Tipo */}
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">
                Tipo *
              </label>
              <div className="flex flex-wrap gap-1.5">
                {TIPOS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFTipo(t)}
                    className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-all ${fTipo === t ? "bg-primary text-primary-foreground border-transparent" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Inmueble */}
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">
                Inmueble
              </label>
              {fProperty ? (
                <div className="flex items-center gap-2 h-9 rounded-md border border-input bg-muted/40 px-3 text-sm">
                  <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{fProperty.label}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFProperty(null);
                      setFPropertyQ("");
                    }}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    value={fPropertyQ}
                    onChange={(e) => setFPropertyQ(e.target.value)}
                    placeholder="Buscar por ref, calle o barrio…"
                  />
                  {propertyResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md overflow-hidden">
                      {propertyResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setFProperty(p);
                            setFPropertyQ("");
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                        >
                          <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">{p.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Agente */}
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">
                Agente responsable
              </label>
              <select
                value={fAgenteId}
                onChange={(e) => setFAgenteId(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Automático · agente actual</option>
                {agData.agentes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>

            {/* Vendedor (propietario) */}
            <ContactPicker
              label="Vendedor / Propietario"
              value={fVendedor}
              query={fVendedorQ}
              results={vendedorResults?.contacts ?? []}
              onQuery={setFVendedorQ}
              onSelect={setFVendedor}
              onClear={() => {
                setFVendedor(null);
                setFVendedorQ("");
              }}
            />

            {/* Comprador / Inquilino */}
            <ContactPicker
              label="Comprador / Inquilino"
              value={fComprador}
              query={fCompradorQ}
              results={compradorResults?.contacts ?? []}
              onQuery={setFCompradorQ}
              onSelect={setFComprador}
              onClear={() => {
                setFComprador(null);
                setFCompradorQ("");
              }}
            />

            {canClose && (
              <>
                {/* Precio */}
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">
                    Precio operación (€)
                  </label>
                  <Input
                    value={fPrecio}
                    onChange={(e) => setFPrecio(e.target.value)}
                    placeholder="Ej: 185000"
                    type="text"
                    inputMode="decimal"
                  />
                </div>

                {/* Comisión % */}
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">
                    Comisión (%)
                  </label>
                  <Input
                    value={fComisionPct}
                    onChange={(e) => setFComisionPct(e.target.value)}
                    placeholder="Ej: 3"
                    type="text"
                    inputMode="decimal"
                  />
                  {comisionCalc !== null && (
                    <p className="text-xs text-success mt-1 font-medium">
                      = {fmtEur(comisionCalc)}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Notas */}
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground uppercase tracking-wide font-medium block mb-1.5">
                Notas
              </label>
              <textarea
                value={fNotas}
                onChange={(e) => setFNotas(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none"
                placeholder="Observaciones…"
              />
            </div>
          </div>

          <button
            onClick={() => createMut.mutate()}
            disabled={!fTipo || createMut.isPending}
            className="mt-4 h-9 px-6 inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-opacity"
          >
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
          {filtered.map((op) => (
            <OperacionRow
              key={op.id}
              op={op}
              onEstadoChange={(estado) => estadoMut.mutate({ id: op.id, estado })}
              onClose={() => closeMut.mutate(op.id)}
              isPending={estadoMut.isPending || closeMut.isPending}
              canClose={canClose}
            />
          ))}
        </div>
      )}
    </>
  );
}
