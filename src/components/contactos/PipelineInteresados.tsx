import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Loader2, UserRound } from "lucide-react";
import { agentesQuery, pipelineInteresadosQuery } from "@/lib/queries";
import type { PipelineInteresado } from "@/lib/clientes.functions";
import {
  PIPELINE_ETAPAS,
  type PipelineEtapa,
  formatFechaCorta,
  initials,
  avatarColorClass,
} from "@/lib/contactos-format";

const MAX_POR_COLUMNA = 40;
const STORAGE_KEY = "homebase.pipeline.comercial";

const ETAPA_META: Record<PipelineEtapa, { dot: string; ayuda: string }> = {
  Cualificado: { dot: "bg-muted-foreground", ayuda: "Sin actividad registrada todavía" },
  Contactado: { dot: "bg-info", ayuda: "Marcado como contactado o con seguimiento" },
  Visita: { dot: "bg-warning", ayuda: "Tiene al menos una visita no cancelada" },
  Oferta: { dot: "bg-gold", ayuda: "Ha hecho una oferta" },
  Cierre: { dot: "bg-success", ayuda: "Operación cerrada" },
};

function leerComercialGuardado(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "todos";
  } catch {
    return "todos";
  }
}

export function PipelineInteresados({
  tipo,
  onOpen,
}: {
  tipo: "Comprador" | "Inquilino";
  onOpen: (id: string) => void;
}) {
  const { data, isLoading } = useQuery(pipelineInteresadosQuery(tipo));
  const { data: ag } = useQuery(agentesQuery);
  const [comercial, setComercial] = useState<string>(leerComercialGuardado);

  const agentes = useMemo(() => ag?.agentes ?? [], [ag?.agentes]);
  const nombreAgente = useMemo(() => new Map(agentes.map((a) => [a.id, a.nombre])), [agentes]);

  const todos = useMemo(() => data?.interesados ?? [], [data?.interesados]);
  const sinComercial = useMemo(() => todos.filter((i) => !i.agenteId).length, [todos]);

  const columnas = useMemo(() => {
    const visibles = todos.filter((i) =>
      comercial === "todos" ? true : comercial === "sin" ? !i.agenteId : i.agenteId === comercial,
    );
    const m = new Map<PipelineEtapa, PipelineInteresado[]>(PIPELINE_ETAPAS.map((e) => [e, []]));
    for (const i of visibles) m.get(i.etapa)?.push(i);
    return m;
  }, [todos, comercial]);

  function elegir(v: string) {
    setComercial(v);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      // preferencia de pantalla, no crítica
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor="pipeline-comercial" className="text-sm font-medium flex items-center gap-2">
          <UserRound className="size-4 text-muted-foreground" />
          Comercial
        </label>
        <select
          id="pipeline-comercial"
          value={comercial}
          onChange={(e) => elegir(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring min-w-[200px]"
        >
          <option value="todos">Todos los comerciales</option>
          <option value="sin">Sin comercial ({sinComercial.toLocaleString("es-ES")})</option>
          {agentes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        {sinComercial > 0 && (
          <span className="text-xs text-muted-foreground">
            {sinComercial.toLocaleString("es-ES")} sin comercial: asígnalo desde la ficha o
            vinculándolo a un inmueble con comercial.
          </span>
        )}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="grid grid-cols-5 gap-3 min-w-[900px]">
          {PIPELINE_ETAPAS.map((etapa) => {
            const items = columnas.get(etapa) ?? [];
            return (
              <section
                key={etapa}
                aria-label={etapa}
                className="rounded-xl border border-border bg-muted/20 p-2.5 flex flex-col gap-2"
              >
                <header className="px-1 pt-0.5" title={ETAPA_META[etapa].ayuda}>
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span className="inline-flex items-center gap-2">
                      <span className={`size-2 rounded-full ${ETAPA_META[etapa].dot}`} />
                      {etapa}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {items.length.toLocaleString("es-ES")}
                    </span>
                  </div>
                </header>
                {items.length === 0 ? (
                  <p className="px-1 py-4 text-xs text-muted-foreground text-center">Nadie aquí</p>
                ) : (
                  items.slice(0, MAX_POR_COLUMNA).map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => onOpen(i.id)}
                      className="text-left rounded-lg border border-border bg-card p-2.5 hover:border-foreground/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${avatarColorClass(i.nombre)}`}
                        >
                          {initials(i.nombre) || "?"}
                        </span>
                        <span className="text-sm font-medium truncate">
                          {i.nombre || "Sin nombre"}
                        </span>
                      </div>
                      {i.inmueble && (
                        <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground truncate">
                          <Building2 className="size-3 shrink-0" />
                          <span className="truncate">{i.inmueble}</span>
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="truncate">
                          {i.agenteId
                            ? `${nombreAgente.get(i.agenteId) ?? "Comercial inactivo"}${
                                i.agenteOrigen === "inmueble" ? " · del inmueble" : ""
                              }`
                            : "Sin comercial"}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {formatFechaCorta(i.ultimaFecha)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
                {items.length > MAX_POR_COLUMNA && (
                  <p className="px-1 text-xs text-muted-foreground">
                    y {(items.length - MAX_POR_COLUMNA).toLocaleString("es-ES")} más (usa la vista
                    de lista para buscarlos)
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
