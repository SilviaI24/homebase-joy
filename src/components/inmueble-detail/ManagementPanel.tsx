// M-03: extraído de src/routes/inmuebles.$id.tsx.
import { useMemo, useState } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { Check, Loader2, Trash2 } from "lucide-react";
import { listAgentes, ESTATUS_OPCIONES, PUBLICACION_OPCIONES } from "@/lib/inmuebles.functions";

const agentesQuery = queryOptions({
  queryKey: ["agentes"],
  queryFn: () => listAgentes(),
  staleTime: 5 * 60_000,
});

export function ManagementPanel(props: {
  estatus: string;
  setEstatus: (s: string) => void;
  publicacion: string;
  setPublicacion: (s: string) => void;
  precio: string;
  setPrecio: (s: string) => void;
  precioFinal: string;
  setPrecioFinal: (s: string) => void;
  agentesIds: string[];
  setAgentesIds: (fn: (prev: string[]) => string[]) => void;
  observaciones: string;
  setObservaciones: (s: string) => void;
  detailReady: boolean;
  dirty: boolean;
  mutation: { isPending: boolean; isError: boolean; isSuccess: boolean; error: unknown };
  onSave: () => void;
  onDelete: () => Promise<void>;
}) {
  const {
    estatus,
    setEstatus,
    publicacion,
    setPublicacion,
    precio,
    setPrecio,
    precioFinal,
    setPrecioFinal,
    agentesIds,
    setAgentesIds,
    observaciones,
    setObservaciones,
    detailReady,
    dirty,
    mutation,
    onDelete,
  } = props;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Lazy load agentes only when the user expands the picker.
  const [agentesOpen, setAgentesOpen] = useState(false);
  const agentesQ = useQuery({ ...agentesQuery, enabled: agentesOpen });

  const selectedNames = useMemo(() => {
    const list = agentesQ.data?.agentes ?? [];
    return agentesIds
      .map((id) => list.find((a) => a.id === id)?.nombre)
      .filter(Boolean) as string[];
  }, [agentesIds, agentesQ.data]);

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm sticky top-4">
      <h3 className="font-display text-base font-semibold mb-4">Gestión</h3>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Estatus</label>
          <select
            value={estatus}
            onChange={(e) => setEstatus(e.target.value)}
            className="mt-1 w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
          >
            {ESTATUS_OPCIONES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Publicación</label>
          <select
            value={publicacion}
            onChange={(e) => setPublicacion(e.target.value)}
            className="mt-1 w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
          >
            {PUBLICACION_OPCIONES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Precio (€)</label>
            <input
              type="number"
              min={0}
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              className="mt-1 w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Precio final (€)</label>
            <input
              type="number"
              min={0}
              value={precioFinal}
              onChange={(e) => setPrecioFinal(e.target.value)}
              className="mt-1 w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Agentes asignados</label>
          {!agentesOpen ? (
            <button
              type="button"
              disabled={!detailReady}
              onClick={() => setAgentesOpen(true)}
              className="mt-1 w-full text-left h-auto min-h-9 px-2 py-1.5 rounded-md border border-input bg-background text-sm hover:bg-accent disabled:opacity-50"
            >
              {detailReady ? (
                agentesIds.length === 0 ? (
                  <span className="text-muted-foreground">Sin asignar — clic para editar</span>
                ) : (
                  `${agentesIds.length} asignado${agentesIds.length === 1 ? "" : "s"} — editar`
                )
              ) : (
                <span className="text-muted-foreground">Esperando datos…</span>
              )}
            </button>
          ) : agentesQ.isLoading ? (
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Cargando agentes…
            </div>
          ) : (
            <div className="mt-1 max-h-48 overflow-auto rounded-md border border-input bg-background p-2 space-y-1">
              {(agentesQ.data?.agentes ?? []).map((a) => {
                const checked = agentesIds.includes(a.id);
                return (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent rounded px-1 py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setAgentesIds((prev) =>
                          e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id),
                        );
                      }}
                    />
                    <span>{a.nombre}</span>
                  </label>
                );
              })}
            </div>
          )}
          {!agentesOpen && selectedNames.length > 0 && (
            <div className="text-[11px] text-muted-foreground mt-1 truncate">
              {selectedNames.join(", ")}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Observaciones</label>
          <textarea
            rows={3}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            className="mt-1 w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm"
          />
        </div>

        {mutation.isError && (
          <div className="text-xs text-destructive">{(mutation.error as Error).message}</div>
        )}
        {mutation.isSuccess && !dirty && (
          <div className="text-xs text-success flex items-center gap-1">
            <Check className="size-3" /> Guardado correctamente
          </div>
        )}
        {dirty && (
          <div className="text-xs text-warning">
            Cambios pendientes — usa la barra inferior para guardar.
          </div>
        )}

        <div className="pt-2 border-t border-border">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="size-3.5" /> Eliminar inmueble
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-destructive font-medium">
                ¿Eliminar este inmueble? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await onDelete();
                    } finally {
                      setDeleting(false);
                    }
                  }}
                  className="flex-1 h-8 text-xs font-semibold rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {deleting ? "Eliminando…" : "Sí, eliminar"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 h-8 text-xs rounded-md border border-input hover:bg-accent"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
