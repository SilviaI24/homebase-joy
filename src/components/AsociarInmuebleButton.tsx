import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2, Search, Loader2, Home, ShoppingCart, KeyRound } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchInmueblesQuery } from "@/lib/queries";
import { asociarLeadAInmueble } from "@/lib/mutations.functions";

const TIPO_OPTS = [
  { value: "Propietario", label: "Propietario", icon: Home },
  { value: "Comprador", label: "Comprador", icon: ShoppingCart },
  { value: "Inquilino", label: "Inquilino", icon: KeyRound },
] as const;

export function AsociarInmuebleButton({ contactId }: { contactId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(asociarLeadAInmueble);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<string>("Propietario");

  // Búsqueda server-side con límite — antes cargaba las 5.817 filas de
  // allInmueblesQuery al navegador y filtraba/recortaba a 20 en memoria.
  const { data: searchData } = useQuery(searchInmueblesQuery({ q, limit: 20 }));
  const inmuebles = useMemo(() => searchData?.inmuebles ?? [], [searchData]);

  const selected = useMemo(
    () => inmuebles.find((i) => i.id === selectedId) ?? null,
    [inmuebles, selectedId],
  );

  const mut = useMutation({
    mutationFn: () => fn({ data: { contactId, propertyId: selectedId!, tipo } }),
    onSuccess: () => {
      toast.success("Inmueble asociado — el contacto pasa a Clientes");
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setOpen(false);
      setQ("");
      setSelectedId(null);
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo asociar"),
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
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-violet-500/10 text-violet-700 dark:text-violet-400 hover:bg-violet-500/20 cursor-pointer transition-colors"
        >
          <Link2 className="size-3" /> Asociar inmueble
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b border-border space-y-2">
          <p className="text-xs font-medium">Asociar a un inmueble</p>
          {/* Tipo de rol */}
          <div className="flex gap-1">
            {TIPO_OPTS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTipo(value)}
                className={`flex-1 inline-flex items-center justify-center gap-1 text-[10px] font-medium py-1 rounded border transition-colors ${
                  tipo === value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                <Icon className="size-3" /> {label}
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por calle, ref, zona…"
              className="w-full h-8 pl-7 pr-2 rounded-md border border-input bg-background text-xs outline-none focus:border-foreground/30"
            />
          </div>
        </div>
        <ul className="max-h-56 overflow-y-auto py-1">
          {inmuebles.length === 0 && (
            <li className="px-3 py-4 text-xs text-muted-foreground text-center">Sin resultados</li>
          )}
          {inmuebles.map((i) => {
            const isSelected = i.id === selectedId;
            return (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(isSelected ? null : i.id)}
                  className={`w-full flex items-start gap-2 px-3 py-2 text-left text-xs hover:bg-accent/60 cursor-pointer transition-colors ${
                    isSelected ? "bg-accent" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {i.calle}
                      {i.numero ? ` ${i.numero}` : ""}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {[i.barrio, i.localidad].filter(Boolean).join(", ")}
                      {i.ref ? ` · ${i.ref}` : ""}
                      {" · "}
                      {i.estatus}
                    </div>
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
            {selected ? `${selected.calle ?? "Inmueble"} · ${tipo}` : "Selecciona un inmueble"}
          </span>
          <div className="flex gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] px-2 py-1 rounded-md hover:bg-muted text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!selectedId || mut.isPending}
              onClick={() => mut.mutate()}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {mut.isPending && <Loader2 className="size-3 animate-spin" />}
              Asociar
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
