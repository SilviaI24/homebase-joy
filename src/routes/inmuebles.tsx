import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { listInmuebles, type Inmueble } from "@/lib/inmuebles.functions";
import { Building2, Search } from "lucide-react";

const inmueblesQuery = queryOptions({
  queryKey: ["inmuebles"],
  queryFn: () => listInmuebles(),
});

export const Route = createFileRoute("/inmuebles")({
  head: () => ({
    meta: [
      { title: "Inmuebles · El Sol Grupo CRM" },
      { name: "description", content: "Listado de inmuebles gestionados por El Sol Grupo." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(inmueblesQuery),
  component: InmueblesPage,
  errorComponent: ({ error }) => (
    <AppShell title="Inmuebles">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Error cargando inmuebles: {error.message}
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell title="Inmuebles">
      <div className="text-muted-foreground">Sin inmuebles.</div>
    </AppShell>
  ),
});

function formatEuro(n: number | null) {
  if (n == null || n === 0) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function statusBadge(estatus: string) {
  const map: Record<string, string> = {
    Activo: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    Baja: "bg-muted text-muted-foreground",
    Reservado: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    Vendido: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  };
  const cls = map[estatus] ?? "bg-secondary text-secondary-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {estatus || "—"}
    </span>
  );
}

function InmueblesPage() {
  const { data } = useSuspenseQuery(inmueblesQuery);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [estatus, setEstatus] = useState<string>("Todos");

  const estatuses = useMemo(() => {
    const s = new Set<string>();
    data.inmuebles.forEach((i) => i.estatus && s.add(i.estatus));
    return ["Todos", ...Array.from(s).sort()];
  }, [data.inmuebles]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.inmuebles.filter((i: Inmueble) => {
      if (estatus !== "Todos" && i.estatus !== estatus) return false;
      if (!needle) return true;
      return (
        i.ref.toLowerCase().includes(needle) ||
        i.calle.toLowerCase().includes(needle) ||
        i.localidad.toLowerCase().includes(needle) ||
        i.barrio.toLowerCase().includes(needle) ||
        i.tipo.toLowerCase().includes(needle) ||
        i.propietario.toLowerCase().includes(needle)
      );
    });
  }, [data.inmuebles, q, estatus]);

  return (
    <AppShell title="Inmuebles">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por ref, calle, barrio…"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={estatus}
          onChange={(e) => setEstatus(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm"
        >
          {estatuses.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="ml-auto text-sm text-muted-foreground">
          {filtered.length} de {data.inmuebles.length}
        </div>
        <button
          onClick={() => router.invalidate()}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent"
        >
          Refrescar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((i) => (
          <Link
            key={i.id}
            to="/inmuebles/$id"
            params={{ id: i.id }}
            className="group rounded-lg border border-border bg-card overflow-hidden flex flex-col hover:shadow-md transition-shadow"
          >
            <div className="aspect-video bg-muted relative overflow-hidden">
              {i.imagen ? (
                <img
                  src={i.imagen}
                  alt={i.calle || i.ref}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <Building2 className="size-8" />
                </div>
              )}
              <div className="absolute top-2 left-2">{statusBadge(i.estatus)}</div>
              {i.ref && (
                <div className="absolute top-2 right-2 text-[11px] font-mono bg-background/85 backdrop-blur px-1.5 py-0.5 rounded">
                  #{i.ref}
                </div>
              )}
            </div>
            <div className="p-4 flex flex-col gap-2 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold text-sm truncate">
                  {i.calle || "Sin dirección"} {i.numero && <span className="text-muted-foreground font-normal">{i.numero}</span>}
                </h3>
                <div className="text-base font-semibold text-primary whitespace-nowrap">
                  {formatEuro(i.precio)}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {[i.barrio, i.localidad].filter(Boolean).join(" · ") || "—"}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                {i.tipo && <span>{i.tipo}</span>}
                {i.habitaciones && <span>{i.habitaciones} hab.</span>}
                {i.banos && <span>{i.banos} baños</span>}
                {i.superficie && <span>{i.superficie} m²</span>}
              </div>
              {i.propietario && (
                <div className="mt-auto pt-2 text-[11px] text-muted-foreground border-t border-border/60">
                  Propietario: <span className="text-foreground/80">{i.propietario}</span>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-16">
          Sin resultados para los filtros actuales.
        </div>
      )}
    </AppShell>
  );
}
