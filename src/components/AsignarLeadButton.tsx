import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Search, UserCog, Loader2 } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { agentesQuery } from "@/lib/queries";
import { assignClienteAgentes } from "@/lib/mutations.functions";

export function AsignarLeadButton({
  clienteId,
  agentesActuales,
  size = "sm",
}: {
  clienteId: string;
  agentesActuales: string[];
  size?: "sm" | "xs";
}) {
  const qc = useQueryClient();
  const fn = useServerFn(assignClienteAgentes);
  const { data: ag } = useQuery(agentesQuery);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>(agentesActuales);

  const mut = useMutation({
    mutationFn: (ids: string[]) =>
      fn({ data: { clienteId, agentesIds: ids } }),
    onSuccess: () => {
      toast.success("Lead asignado");
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo asignar"),
  });

  const list = useMemo(() => {
    const all = ag?.agentes ?? [];
    const ql = q.trim().toLowerCase();
    if (!ql) return all;
    return all.filter(
      (a) =>
        a.nombre.toLowerCase().includes(ql) ||
        a.mail.toLowerCase().includes(ql),
    );
  }, [ag?.agentes, q]);

  function toggle(id: string) {
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  const sizeCls =
    size === "xs"
      ? "text-[10px] px-2 py-0.5"
      : "text-[11px] font-medium px-2.5 py-1";

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSelected(agentesActuales);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20 cursor-pointer transition-colors ${sizeCls}`}
        >
          <UserCog className="size-3" />
          {agentesActuales.length > 0 ? "Reasignar" : "Asignar"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar comercial…"
              className="w-full h-8 pl-7 pr-2 rounded-md border border-input bg-background text-xs outline-none focus:border-foreground/30"
            />
          </div>
        </div>
        <ul className="max-h-64 overflow-y-auto py-1">
          {list.length === 0 && (
            <li className="px-3 py-4 text-xs text-muted-foreground text-center">
              Sin coincidencias
            </li>
          )}
          {list.map((a) => {
            const checked = selected.includes(a.id);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => toggle(a.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent/60 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{a.nombre}</div>
                    {a.mail && (
                      <div className="truncate text-[10px] text-muted-foreground">
                        {a.mail}
                      </div>
                    )}
                  </div>
                  <span
                    className={`size-4 rounded border flex items-center justify-center shrink-0 ${
                      checked
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-border"
                    }`}
                  >
                    {checked && <Check className="size-3" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-border p-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            {selected.length} seleccionado{selected.length === 1 ? "" : "s"}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] px-2 py-1 rounded-md hover:bg-muted text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={mut.isPending}
              onClick={() => mut.mutate(selected)}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 cursor-pointer disabled:opacity-60"
            >
              {mut.isPending && <Loader2 className="size-3 animate-spin" />}
              Guardar
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
