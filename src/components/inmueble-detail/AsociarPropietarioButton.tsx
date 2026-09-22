// Selector de propietario para la ficha del inmueble — 21 sep 2026. Hasta
// ahora el panel "Propietario" solo mostraba los datos si ya había alguien
// vinculado, sin ningún control para elegirlo cuando estaba vacío (la única
// vía era al crear el inmueble, en NewInmuebleDialog, o desde la ficha del
// contacto con AsociarInmuebleButton — su espejo exacto, mismo patrón de
// Popover + búsqueda, aquí buscando contactos en vez de inmuebles).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2, Search, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchClientesPickerQuery } from "@/lib/queries";
import { asociarLeadAInmueble } from "@/lib/mutations.functions";

export function AsociarPropietarioButton({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(asociarLeadAInmueble);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: searchData } = useQuery(searchClientesPickerQuery({ q, limit: 30 }));
  const clientes = searchData?.clientes ?? [];
  const selected = clientes.find((c) => c.id === selectedId) ?? null;

  const mut = useMutation({
    mutationFn: () => fn({ data: { contactId: selectedId!, propertyId, tipo: "Propietario" } }),
    onSuccess: () => {
      toast.success("Propietario vinculado");
      qc.invalidateQueries({ queryKey: ["inmueble", propertyId] });
      qc.invalidateQueries({ queryKey: ["propietarios-inmueble", propertyId] });
      setOpen(false);
      setQ("");
      setSelectedId(null);
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo vincular"),
  });

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setQ("");
          setSelectedId(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md bg-violet-500/10 text-violet-700 dark:text-violet-400 hover:bg-violet-500/20 cursor-pointer transition-colors"
        >
          <Link2 className="size-3" /> Vincular propietario
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b border-border space-y-2">
          <p className="text-xs font-medium">Vincular un cliente como propietario</p>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o teléfono…"
              className="w-full h-8 pl-7 pr-2 rounded-md border border-input bg-background text-xs outline-none focus:border-foreground/30"
            />
          </div>
        </div>
        <ul className="max-h-56 overflow-y-auto py-1">
          {clientes.length === 0 && (
            <li className="px-3 py-4 text-xs text-muted-foreground text-center">Sin resultados</li>
          )}
          {clientes.map((c) => {
            const isSelected = c.id === selectedId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(isSelected ? null : c.id)}
                  className={`w-full flex items-start gap-2 px-3 py-2 text-left text-xs hover:bg-accent/60 cursor-pointer transition-colors ${
                    isSelected ? "bg-accent" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{c.nombre || "Sin nombre"}</div>
                    {c.telefono && (
                      <div className="text-xs text-muted-foreground truncate">{c.telefono}</div>
                    )}
                  </div>
                  {isSelected && (
                    <span className="shrink-0 size-4 rounded-full bg-primary flex items-center justify-center mt-0.5">
                      <span className="size-2 rounded-full bg-primary-foreground" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-border p-2 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">
            {selected ? selected.nombre : "Selecciona un cliente"}
          </span>
          <div className="flex gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs px-2.5 py-1.5 rounded-md hover:bg-muted text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!selectedId || mut.isPending}
              onClick={() => mut.mutate()}
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {mut.isPending && <Loader2 className="size-3 animate-spin" />}
              Vincular
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
