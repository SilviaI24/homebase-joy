import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SafeImage } from "@/components/SafeImage";
import { NewInmuebleDialog } from "@/components/CreateDialogs";

import type { Inmueble } from "@/lib/inmuebles.functions";
import type { Cliente } from "@/lib/clientes.functions";
import { allInmueblesQuery, clientesQueryOpts } from "@/lib/queries";
import {
  Search, KeyRound, Home, CheckCircle2, TrendingUp,
  User, Phone, Mail, Building2, Users,
} from "lucide-react";

export const Route = createFileRoute("/alquileres/")({
  head: () => ({
    meta: [
      { title: "Alquiler · El Sol Grupo CRM" },
      { name: "description", content: "Hub de gestión de alquileres." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(allInmueblesQuery),
  component: AlquileresPage,
  errorComponent: ({ error }) => (
    <AppShell title="Alquiler">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Error: {error.message}
      </div>
    </AppShell>
  ),
});

const DAY_MS = 1000 * 60 * 60 * 24;
function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY_MS);
}

function formatEuro(n: number | null) {
  if (n == null || n === 0) return "—";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function DiasBadge({ dias }: { dias: number | null }) {
  if (dias === null) return null;
  const cls =
    dias > 90 ? "bg-destructive/15 text-destructive" :
    dias > 30 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" :
    "bg-muted text-muted-foreground";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cls}`}>
      {dias}d en cartera
    </span>
  );
}

function StatusBadge({ estatus }: { estatus: string }) {
  const map: Record<string, string> = {
    Activo: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    Baja: "bg-muted text-muted-foreground",
    Reservado: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    Alquilado: "bg-[var(--gold)]/20 text-[color:var(--gold-foreground,theme(colors.amber.700))]",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${map[estatus] ?? "bg-secondary text-secondary-foreground"}`}>
      {estatus || "—"}
    </span>
  );
}

type Tab = "disponible" | "inquilinos" | "activos";

function AlquileresPage() {
  const { data: all } = useSuspenseQuery(allInmueblesQuery);
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("disponible");
  const [q, setQ] = useState("");

  // Clientes loaded client-side only (avoids SSR server fn failure)
  const { data: cliData } = useQuery({
    ...clientesQueryOpts,
    enabled: tab === "inquilinos" || tab === "activos",
  });

  const disponibles = useMemo(
    () => all.alquileres.filter((i) => i.estatus === "Activo" || i.estatus === "Reservado"),
    [all],
  );
  const alquilados = useMemo(
    () => all.alquileres.filter((i) => i.estatus === "Alquilado"),
    [all],
  );
  // Inquilino real = tiene una propiedad en alquiler vinculada.
  // "Interesado alquiler" sin propiedad vinculada es un Lead, no un inquilino.
  const inquilinos = useMemo(
    () => (cliData?.clientes ?? []).filter((c) => c.propiedadAlquilerIds.length > 0),
    [cliData],
  );

  // Mapa id→inmueble para enriquecer la vista de inquilinos
  const alquilerById = useMemo(() => {
    const m = new Map<string, Inmueble>();
    all.alquileres.forEach((i) => m.set(i.id, i));
    return m;
  }, [all.alquileres]);

  const kpis = useMemo(() => ({
    disponibles: disponibles.length,
    alquilados: alquilados.length,
    inquilinos: inquilinos.length,
    ingresos: alquilados.reduce((s, i) => s + (i.precioFinal || i.precio || 0), 0),
  }), [disponibles, alquilados, inquilinos]);

  // Filtered lists based on search query
  const needle = q.trim().toLowerCase();

  const filteredDisponibles = useMemo(() => {
    if (!needle) return disponibles;
    return disponibles.filter((i) =>
      i.ref.toLowerCase().includes(needle) ||
      i.calle.toLowerCase().includes(needle) ||
      i.localidad.toLowerCase().includes(needle) ||
      i.barrio.toLowerCase().includes(needle) ||
      i.tipo.toLowerCase().includes(needle),
    );
  }, [disponibles, needle]);

  const filteredInquilinos = useMemo(() => {
    if (!needle) return inquilinos;
    return inquilinos.filter((c) =>
      c.nombre.toLowerCase().includes(needle) ||
      c.email.toLowerCase().includes(needle) ||
      c.telefono.toLowerCase().includes(needle),
    );
  }, [inquilinos, needle]);

  const activos = useMemo(() => {
    const clientes = cliData?.clientes ?? [];
    return alquilados.map((inmueble) => ({
      inmueble,
      inquilino: clientes.find((c) => c.propiedadAlquilerIds.includes(inmueble.id)) ?? null,
    }));
  }, [alquilados, cliData]);

  const filteredActivos = useMemo(() => {
    if (!needle) return activos;
    return activos.filter(({ inmueble, inquilino }) =>
      inmueble.ref.toLowerCase().includes(needle) ||
      inmueble.calle.toLowerCase().includes(needle) ||
      (inquilino?.nombre ?? "").toLowerCase().includes(needle),
    );
  }, [activos, needle]);

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "disponible", label: "Disponible", count: disponibles.length },
    { key: "inquilinos", label: "Inquilinos", count: inquilinos.length },
    { key: "activos", label: "Activos", count: alquilados.length },
  ];

  return (
    <AppShell title="Alquiler">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard icon={Home} label="Disponibles" value={String(kpis.disponibles)} tone="primary" />
        <KpiCard icon={Users} label="Inquilinos" value={String(kpis.inquilinos)} />
        <KpiCard icon={CheckCircle2} label="Alquilados" value={String(kpis.alquilados)} tone="gold" />
        <KpiCard icon={TrendingUp} label="Ingresos / mes" value={formatEuro(kpis.ingresos)} />
      </div>

      {/* Tab bar + toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setQ(""); }}
              className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium transition-colors ${
                tab === t.key
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full leading-none ${
                tab === t.key ? "bg-primary/10 text-primary" : "bg-border text-muted-foreground"
              }`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          onClick={() => router.invalidate()}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent ml-auto"
        >
          Refrescar
        </button>
        {tab === "disponible" && <NewInmuebleDialog defaultAlquiler />}
      </div>

      {/* Tab content */}
      {tab === "disponible" && (
        <DisponibleTab items={filteredDisponibles} />
      )}
      {tab === "inquilinos" && (
        <InquilinosTab items={filteredInquilinos} alquilerById={alquilerById} />
      )}
      {tab === "activos" && (
        <ActivosTab items={filteredActivos} />
      )}
    </AppShell>
  );
}

function KpiCard({
  icon: Icon, label, value, tone = "default",
}: {
  icon: any; label: string; value: string; tone?: "default" | "primary" | "gold";
}) {
  const toneCls = {
    default: "bg-card",
    primary: "bg-primary/5 border-primary/20",
    gold: "bg-[var(--gold)]/10 border-[var(--gold)]/30",
  }[tone];
  return (
    <div className={`rounded-xl border border-border ${toneCls} p-4 flex items-start gap-3`}>
      <div className="size-9 rounded-lg bg-background border border-border flex items-center justify-center shrink-0">
        <Icon className="size-4 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
        <div className="text-xl font-bold tracking-tight truncate">{value}</div>
      </div>
    </div>
  );
}

function DisponibleTab({ items }: { items: Inmueble[] }) {
  if (items.length === 0) {
    return <Empty text="Sin propiedades disponibles." />;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {items.map((i) => {
        const dias = daysSince(i.fechaInicio);
        return (
          <Link
            key={i.id}
            to="/inmuebles/$id"
            params={{ id: i.id }}
            className="group rounded-lg border border-border bg-card overflow-hidden flex flex-col hover:shadow-md transition-shadow"
          >
            <div className="aspect-video relative overflow-hidden">
              <SafeImage src={i.imagen} alt={i.calle || i.ref} imgClassName="group-hover:scale-[1.02] transition-transform" />
              <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
                <StatusBadge estatus={i.estatus} />
              </div>
              {i.ref && (
                <div className="absolute top-2 right-2 z-10 text-[11px] font-mono bg-background/90 text-foreground border border-border/60 backdrop-blur px-1.5 py-0.5 rounded shadow-sm">
                  #{i.ref}
                </div>
              )}
            </div>
            <div className="p-4 flex flex-col gap-2 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold text-sm truncate min-w-0 flex-1">
                  {i.calle || "Sin dirección"} {i.numero && <span className="text-muted-foreground font-normal">{i.numero}</span>}
                </h3>
                <div className="text-base font-semibold text-primary whitespace-nowrap shrink-0">
                  {formatEuro(i.precio)}
                  <span className="text-[11px] font-normal text-muted-foreground">/mes</span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {[i.barrio, i.localidad].filter(Boolean).join(" · ") || "—"}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                {i.tipo && <span>{i.tipo}</span>}
                {i.habitaciones && <span>{i.habitaciones} hab.</span>}
                {i.superficie && <span>{i.superficie} m²</span>}
              </div>
              <div className="mt-auto pt-2 flex items-center justify-between border-t border-border/60">
                {i.propietario ? (
                  <span className="text-[11px] text-muted-foreground truncate">
                    Prop.: <span className="text-foreground/80">{i.propietario}</span>
                  </span>
                ) : <span />}
                <DiasBadge dias={dias} />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function InquilinosTab({ items, alquilerById }: { items: Cliente[]; alquilerById: Map<string, Inmueble> }) {
  if (items.length === 0) {
    return <Empty text="Sin inquilinos con propiedad vinculada." />;
  }
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        {items.length} inquilino{items.length !== 1 ? "s" : ""}
      </div>
      <ul className="divide-y divide-border">
        {items.map((c) => {
          const propiedades = c.propiedadAlquilerIds
            .map((id) => alquilerById.get(id))
            .filter((i): i is Inmueble => !!i);
          return (
            <li key={c.id} className="flex items-start gap-4 px-4 py-3 hover:bg-accent/40 transition-colors">
              <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <User className="size-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.nombre}</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-3 mt-0.5 flex-wrap">
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
                      <Mail className="size-3" />{c.email}
                    </a>
                  )}
                  {c.telefono && (
                    <a href={`tel:${c.telefono}`} className="inline-flex items-center gap-1 hover:text-primary transition-colors">
                      <Phone className="size-3" />{c.telefono}
                    </a>
                  )}
                </div>
                {/* Propiedades alquiladas vinculadas */}
                {propiedades.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {propiedades.map((inm) => (
                      <Link
                        key={inm.id}
                        to="/inmuebles/$id"
                        params={{ id: inm.id }}
                        className="flex items-center gap-2 text-[11px] rounded-md bg-muted/60 border border-border/60 px-2 py-1 hover:bg-muted transition-colors"
                      >
                        <Building2 className="size-3 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate">{inm.calle} {inm.numero}</span>
                        <span className="text-muted-foreground shrink-0">{[inm.barrio, inm.localidad].filter(Boolean).join(", ")}</span>
                        <span className="ml-auto font-semibold text-primary shrink-0">{formatEuro(inm.precioFinal || inm.precio)}<span className="font-normal text-muted-foreground">/mes</span></span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ActivosTab({ items }: { items: { inmueble: Inmueble; inquilino: Cliente | null }[] }) {
  if (items.length === 0) {
    return <Empty text="Sin alquileres activos." />;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map(({ inmueble: i, inquilino }) => (
        <div key={i.id} className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
          {/* Property header */}
          <Link
            to="/inmuebles/$id"
            params={{ id: i.id }}
            className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-accent/40 transition-colors"
          >
            <div className="size-10 rounded-md overflow-hidden shrink-0 bg-muted">
              <SafeImage src={i.imagen} alt={i.calle || i.ref} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">
                {i.calle || "Sin dirección"} {i.numero}
                {i.ref && <span className="ml-1.5 text-[11px] font-mono text-muted-foreground">#{i.ref}</span>}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {[i.barrio, i.localidad].filter(Boolean).join(" · ") || i.tipo}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold text-primary">
                {formatEuro(i.precioFinal || i.precio)}
                <span className="text-[10px] font-normal text-muted-foreground">/mes</span>
              </div>
              <StatusBadge estatus={i.estatus} />
            </div>
          </Link>

          {/* Tenant info */}
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="size-8 rounded-full bg-[var(--gold)]/15 flex items-center justify-center shrink-0">
              <User className="size-4 text-[color:var(--gold-foreground,theme(colors.amber.700))]" />
            </div>
            {inquilino ? (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{inquilino.nombre}</div>
                <div className="text-[11px] text-muted-foreground flex gap-3 flex-wrap mt-0.5">
                  {inquilino.telefono && (
                    <a href={`tel:${inquilino.telefono}`} className="inline-flex items-center gap-1 hover:text-primary">
                      <Phone className="size-3" />{inquilino.telefono}
                    </a>
                  )}
                  {inquilino.email && (
                    <a href={`mailto:${inquilino.email}`} className="inline-flex items-center gap-1 hover:text-primary">
                      <Mail className="size-3" />{inquilino.email}
                    </a>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground italic">Inquilino no vinculado</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="text-center text-sm text-muted-foreground py-16">{text}</div>
  );
}
