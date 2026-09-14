// M-03: extraído de src/routes/contactos.index.tsx.
// DUPLICADOS TAB (M-05) — fusión siempre con revisión humana, nunca automática.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Users } from "lucide-react";
import {
  listContactosDuplicados,
  fusionarContactosDuplicados,
  type GrupoDuplicado,
} from "@/lib/clientes-duplicados.functions";
import { eligeSupervivientePorDefecto } from "@/lib/contactos-format";

function GrupoDuplicadoCard({ grupo }: { grupo: GrupoDuplicado }) {
  const qc = useQueryClient();
  const fusionarFn = useServerFn(fusionarContactosDuplicados);
  const [survivorId, setSurvivorId] = useState(() => eligeSupervivientePorDefecto(grupo));

  const mutation = useMutation({
    mutationFn: () =>
      fusionarFn({
        data: {
          survivorId,
          loserIds: grupo.contactos.filter((c) => c.id !== survivorId).map((c) => c.id),
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contactos-duplicados"] });
      toast.success(`Fusionados en ${grupo.contactos.find((c) => c.id === survivorId)?.nombre}`);
    },
    onError: (error: Error) => toast.error(error.message || "No se pudo fusionar el grupo"),
  });

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground">{grupo.telNorm}</span>
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => {
            const nombre = grupo.contactos.find((c) => c.id === survivorId)?.nombre;
            if (
              confirm(
                `Fusionar los otros ${grupo.contactos.length - 1} en "${nombre}"? No se puede deshacer.`,
              )
            ) {
              mutation.mutate();
            }
          }}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-40"
        >
          {mutation.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Users className="size-3" />
          )}
          Fusionar en el elegido
        </button>
      </div>
      <div className="space-y-1">
        {grupo.contactos.map((c) => (
          <label
            key={c.id}
            className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs cursor-pointer ${
              c.id === survivorId ? "bg-success/10" : "hover:bg-muted/40"
            }`}
          >
            <input
              type="radio"
              name={`survivor-${grupo.telNorm}`}
              checked={c.id === survivorId}
              onChange={() => setSurvivorId(c.id)}
              className="accent-success"
            />
            <span className="font-medium truncate max-w-[160px]">{c.nombre}</span>
            <span className="text-muted-foreground truncate max-w-[180px]">
              {c.email || "sin email"}
            </span>
            <span className="text-muted-foreground/70">{c.cicloVida}</span>
            {c.tieneActividad && (
              <span className="rounded-full bg-info/10 text-info px-1.5 py-0.5 text-[9px] font-semibold">
                con historial
              </span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

export function DuplicadosTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["contactos-duplicados"],
    queryFn: () => listContactosDuplicados(),
    staleTime: 60_000,
  });

  const grupos = data ?? [];

  return (
    <div>
      <div className="mb-4 text-xs text-muted-foreground">
        {isLoading
          ? "Buscando coincidencias por teléfono…"
          : `${grupos.length} grupos de posibles duplicados. Elige quién se queda antes de fusionar — nunca se hace solo.`}
      </div>
      {!isLoading && grupos.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 size-6 opacity-50" />
          No hay duplicados pendientes de revisar.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {grupos.map((g) => (
            <GrupoDuplicadoCard key={g.telNorm} grupo={g} />
          ))}
        </div>
      )}
    </div>
  );
}
