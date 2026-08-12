import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SafeImage } from "@/components/SafeImage";
import { NewInmuebleDialog } from "@/components/CreateDialogs";
import { RecordatoriosEstancados } from "@/components/RecordatoriosEstancados";
import { useServerFn } from "@tanstack/react-start";

import { getCategoria, CATEGORIAS, geocodeInmuebles, type Inmueble } from "@/lib/inmuebles.functions";
import { allInmueblesQuery } from "@/lib/queries";
import { cleanRef } from "@/lib/format";
import {
  Search, LayoutGrid, Columns3, Clock, AlertTriangle, Hourglass, Map as MapIcon, Loader2,
} from "lucide-react";

const STALE_DAYS = 90;
const DAY_MS = 1000 * 60 * 60 * 24;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY_MS);
}

type KanbanCol = "Pendientes" | "Activos" | "Reservados" | "Cerrados" | "Estancados";
const KANBAN_COLS: { key: KanbanCol; label: string; tone: string; icon: any }[] = [
  { key: "Pendientes", label: "Pendientes", tone: "border-slate-400/40 bg-slate-500/5", icon: Hourglass },
  { key: "Activos", label: "Activos", tone: "border-emerald-500/40 bg-emerald-500/5", icon: LayoutGrid },
  { key: "Reservados", label: "Reservados", tone: "border-amber-500/40 bg-amber-500/5", icon: Clock },
  { key: "Cerrados", label: "Cerrados", tone: "border-blue-500/40 bg-blue-500/5", icon: Columns3 },
  { key: "Estancados", label: `Estancados (>${STALE_DAYS}d)`, tone: "border-destructive/40 bg-destructive/5", icon: AlertTriangle },
];

function classifyKanban(i: Inmueble): KanbanCol | null {
  const e = i.estatus;
  if (e === "Pendiente") return "Pendientes";
  if (e === "Reservado") return "Reservados";
  if (e === "Vendido" || e === "Alquilado") return "Cerrados";
  if (e === "Activo" || e === "Prospección") {
    const d = daysSince(i.fechaInicio);
    if (d !== null && d > STALE_DAYS) return "Estancados";
    return "Activos";
  }
  return null;
}


export const Route = createFileRoute("/inmuebles/")({
  head: () => ({
    meta: [
      { title: "Inmuebles · El Sol Grupo CRM" },
      { name: "description", content: "Listado de inmuebles gestionados por El Sol Grupo." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(allInmueblesQuery),
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
    Activo: "bg-emerald-600 text-white border-emerald-700",
    Baja: "bg-muted text-foreground border-border",
    Reservado: "bg-amber-500 text-white border-amber-600",
    Vendido: "bg-blue-600 text-white border-blue-700",
  };
  const cls = map[estatus] ?? "bg-secondary text-secondary-foreground border-border";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm ${cls}`}>
      {estatus || "—"}
    </span>
  );
}

function prospectoBadge(publicacion: string) {
  if (publicacion !== "PROSPECTO") return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/50 bg-violet-500/20 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:text-violet-400 shadow-sm">
      <Hourglass className="size-3" />
      Prospecto
    </span>
  );
}

function InmueblesPage() {
  const { data: all } = useSuspenseQuery(allInmueblesQuery);
  const data = { inmuebles: all.inmuebles };

  const router = useRouter();
  const [q, setQ] = useState("");
  const [estatus, setEstatus] = useState<string>("Activo");
  const [categoria, setCategoria] = useState<string>("Todas");
  const [agente, setAgente] = useState<string>("Todos");
  const [view, setView] = useState<"grid" | "kanban" | "mapa">("grid");

  const agentes = useMemo(() => {
    const s = new Set<string>();
    data.inmuebles.forEach((i) => i.agentesNombres.forEach((n) => n && s.add(n)));
    return ["Todos", "Sin asignar", ...Array.from(s).sort()];
  }, [data.inmuebles]);

  const matchesAgente = (i: Inmueble) => {
    if (agente === "Todos") return true;
    if (agente === "Sin asignar") return i.agentesNombres.length === 0;
    return i.agentesNombres.includes(agente);
  };

  const estatuses = useMemo(() => {
    const s = new Set<string>();
    data.inmuebles.forEach((i) => i.estatus && s.add(i.estatus));
    return ["Todos", ...Array.from(s).sort()];
  }, [data.inmuebles]);

  const conteoPorCategoria = useMemo(() => {
    // Kanban shows all statuses — counts must match what the kanban actually displays
    const base = view === "kanban"
      ? data.inmuebles.filter((i) => {
          if (!matchesAgente(i)) return false;
          const needle = q.trim().toLowerCase();
          if (!matchesSearch(i, needle)) return false;
          return classifyKanban(i) !== null;
        })
      : data.inmuebles.filter((i) => estatus === "Todos" || i.estatus === estatus);
    const map: Record<string, number> = { Todas: base.length };
    CATEGORIAS.forEach((c) => (map[c] = 0));
    map["Otros"] = 0;
    base.forEach((i) => {
      const c = getCategoria(i.tipo);
      map[c] = (map[c] ?? 0) + 1;
    });
    return map;
  }, [data.inmuebles, estatus, view, agente, q]);

  const matchesSearch = (i: Inmueble, needle: string) => {
    if (!needle) return true;
    return (
      i.ref.toLowerCase().includes(needle) ||
      i.calle.toLowerCase().includes(needle) ||
      i.localidad.toLowerCase().includes(needle) ||
      i.barrio.toLowerCase().includes(needle) ||
      i.tipo.toLowerCase().includes(needle) ||
      i.propietario.toLowerCase().includes(needle)
    );
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return data.inmuebles.filter((i: Inmueble) => {
      if (estatus !== "Todos" && i.estatus !== estatus) return false;
      if (categoria !== "Todas" && getCategoria(i.tipo) !== categoria) return false;
      if (!matchesAgente(i)) return false;
      return matchesSearch(i, needle);
    });
  }, [data.inmuebles, q, estatus, categoria, agente]);

  const kanbanGroups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const groups: Record<KanbanCol, Inmueble[]> = {
      Pendientes: [], Activos: [], Reservados: [], Cerrados: [], Estancados: [],
    };
    data.inmuebles.forEach((i) => {
      if (categoria !== "Todas" && getCategoria(i.tipo) !== categoria) return;
      if (!matchesAgente(i)) return;
      if (!matchesSearch(i, needle)) return;
      const col = classifyKanban(i);
      if (col) groups[col].push(i);
    });
    // Sort oldest first by fechaInicio (precompute timestamps to avoid Date.parse in comparator)
    (Object.keys(groups) as KanbanCol[]).forEach((k) => {
      const withTs = groups[k].map((i) => ({ i, t: i.fechaInicio ? Date.parse(i.fechaInicio) : Infinity }));
      withTs.sort((a, b) => a.t - b.t);
      groups[k] = withTs.map((x) => x.i);
    });
    return groups;
  }, [data.inmuebles, q, categoria, agente]);

  const tabs: string[] = ["Todas", ...CATEGORIAS];

  return (
    <AppShell title="Inmuebles">
      <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por ref, calle, barrio…"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {(view === "grid" || view === "mapa") && (
          <select
            value={estatus}
            onChange={(e) => setEstatus(e.target.value)}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm"
          >
            {estatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        <select
          value={agente}
          onChange={(e) => setAgente(e.target.value)}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm max-w-[180px]"
          title="Filtrar por agente asignado"
        >
          {agentes.map((a) => (
            <option key={a} value={a}>{a === "Todos" ? "Todos los agentes" : a}</option>
          ))}
        </select>
        <div className="inline-flex h-9 rounded-md border border-input bg-background overflow-hidden">
          <button
            onClick={() => setView("grid")}
            className={`px-3 text-xs font-medium inline-flex items-center gap-1.5 ${view === "grid" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
            title="Vista en cuadrícula"
          >
            <LayoutGrid className="size-3.5" /> Lista
          </button>
          <button
            onClick={() => setView("kanban")}
            className={`px-3 text-xs font-medium inline-flex items-center gap-1.5 border-l border-input ${view === "kanban" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
            title="Vista kanban"
          >
            <Columns3 className="size-3.5" /> Kanban
          </button>
          <button
            onClick={() => setView("mapa")}
            className={`px-3 text-xs font-medium inline-flex items-center gap-1.5 border-l border-input ${view === "mapa" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
            title="Vista en mapa"
          >
            <MapIcon className="size-3.5" /> Mapa
          </button>
        </div>
        <div className="ml-auto text-sm text-muted-foreground">
          {view === "grid" || view === "mapa"
            ? `${filtered.length} de ${data.inmuebles.length}`
            : `${(Object.values(kanbanGroups) as Inmueble[][]).reduce((s, col) => s + col.length, 0)} inmuebles`}
        </div>
        <button
          onClick={() => router.invalidate()}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent"
        >
          Refrescar
        </button>
        <NewInmuebleDialog />
      </div>


      <div className="flex flex-wrap gap-1.5 mb-5 border-b border-border pb-2">
        {tabs.map((t) => {
          const active = categoria === t;
          const count = conteoPorCategoria[t] ?? 0;
          return (
            <button
              key={t}
              onClick={() => setCategoria(t)}
              className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground/70 hover:bg-accent"
              }`}
            >
              <span>{t}</span>
              <span
                className={`text-[10px] leading-none px-1.5 py-0.5 rounded-full ${
                  active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {view === "grid" && <RecordatoriosEstancados inmuebles={data.inmuebles} staleDays={STALE_DAYS} />}

      {view === "mapa" && <MapaView inmuebles={filtered} />}

      {view !== "mapa" && (view === "grid" ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((i) => (
              <Link
                key={i.id}
                to="/inmuebles/$id"
                params={{ id: i.id }}
                className="group overflow-hidden rounded-lg border border-border bg-card flex flex-col shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="aspect-video relative overflow-hidden">
                  <SafeImage src={i.imagen} alt={i.calle || i.ref} imgClassName="group-hover:scale-[1.02] transition-transform" />
                  <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                    {statusBadge(i.estatus)}
                    {prospectoBadge(i.publicacion)}
                  </div>
                  {i.ref && (
                    <div className="absolute top-2 right-2 z-10 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-mono font-semibold text-foreground shadow-sm">
                      #{cleanRef(i.ref)}
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
                </div>
                <div className="p-4 flex flex-col gap-2 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-semibold text-sm truncate min-w-0 flex-1">
                      {i.calle || "Sin dirección"} {i.numero && <span className="text-muted-foreground font-normal">{i.numero}</span>}
                    </h3>
                    <div className="text-base font-semibold text-primary whitespace-nowrap shrink-0">
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
                  <div className="mt-auto border-t border-border pt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    {i.propietario ? (
                      <span className="truncate">Prop.: <span className="text-foreground font-medium">{i.propietario}</span></span>
                    ) : <span />}
                    {(() => {
                      const d = daysSince(i.fechaInicio);
                      if (d === null) return null;
                      const cls = d > 90 ? "bg-destructive/15 text-destructive" : d > 30 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground";
                      return <span className={`shrink-0 px-1.5 py-0.5 rounded-full font-medium ${cls}`}>{d}d</span>;
                    })()}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-16">
              Sin resultados para los filtros actuales.
            </div>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {KANBAN_COLS.map(({ key, label, tone, icon: Icon }) => {
            const items = kanbanGroups[key];
            return (
              <div key={key} className={`rounded-lg border ${tone} flex flex-col min-h-[300px]`}>
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Icon className="size-4" />
                    <span>{label}</span>
                  </div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-background/80 border border-border/60">
                    {items.length}
                  </span>
                </div>
                <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[70vh]">
                  {items.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-6">Vacío</div>
                  )}
                  {items.map((i) => {
                    const dias = daysSince(i.fechaInicio);
                    const isStale = key === "Estancados";
                    return (
                      <Link
                        key={i.id}
                        to="/inmuebles/$id"
                        params={{ id: i.id }}
                        className="block rounded-md border border-border bg-card hover:shadow-md transition-shadow p-2.5"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="size-12 shrink-0 rounded overflow-hidden bg-muted">
                            <SafeImage src={i.imagen} alt={i.calle || i.ref} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2">
                              <h4 className="text-xs font-semibold truncate">
                                {i.calle || "Sin dirección"} {i.numero}
                              </h4>
                              <span className="text-[10px] font-mono text-muted-foreground shrink-0">#{cleanRef(i.ref)}</span>
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              {[i.barrio, i.localidad].filter(Boolean).join(" · ") || "—"}
                            </div>
                            <div className="flex items-center justify-between mt-1 gap-2">
                              <span className="text-xs font-semibold text-primary">{formatEuro(i.precio)}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                {i.publicacion === "PROSPECTO" && (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-400 border border-violet-500/30 inline-flex items-center gap-0.5">
                                    <Hourglass className="size-2.5" />Prospecto
                                  </span>
                                )}
                                {dias !== null && (
                                  <span className={`text-[10px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full ${
                                    isStale
                                      ? "bg-destructive/15 text-destructive"
                                      : "bg-muted text-muted-foreground"
                                  }`}>
                                    <Clock className="size-2.5" />{dias}d
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      </>
    </AppShell>
  );
}


function statusColor(estatus: string): string {
  if (estatus === "Vendido" || estatus === "Alquilado") return "#3b82f6";
  if (estatus === "Reservado") return "#f59e0b";
  if (estatus === "Activo") return "#10b981";
  if (estatus === "Pendiente") return "#94a3b8";
  return "#64748b";
}

function MapaView({ inmuebles }: { inmuebles: Inmueble[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const [geocoding, setGeocoding] = useState(false);
  const [geocodePending, setGeocodePending] = useState(0);
  const [localCoords, setLocalCoords] = useState<Map<string, { lat: number; lng: number }>>(new Map());
  const geocodeFn = useServerFn(geocodeInmuebles);
  const qc = useQueryClient();

  const withCoords = useMemo(() => {
    return inmuebles.map((i) => {
      const local = localCoords.get(i.id);
      return { ...i, coordenadas: local ?? i.coordenadas };
    }).filter((i) => i.coordenadas != null);
  }, [inmuebles, localCoords]);

  const withoutCoords = useMemo(
    () => inmuebles.filter((i) => !localCoords.has(i.id) && !i.coordenadas),
    [inmuebles, localCoords]
  );

  useEffect(() => {
    if (!mapRef.current) return;
    let cancelled = false;

    async function init() {
      // Lazy inject leaflet CSS from the local npm package (no external CDN request)
      if (!document.querySelector('link[data-leaflet-css]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.setAttribute("data-leaflet-css", "1");
        link.href = new URL("leaflet/dist/leaflet.css", import.meta.url).href;
        document.head.appendChild(link);
      }
      const L = await import("leaflet");
      if (cancelled) return;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
      const map = L.map(mapRef.current!, { center: [36.51, -4.88], zoom: 12 });
      mapInstanceRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
    }
    init();
    return () => { cancelled = true; mapInstanceRef.current?.remove(); mapInstanceRef.current = null; markersRef.current.clear(); };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    import("leaflet").then((L) => {
      // Remove markers that are no longer in withCoords
      const newIds = new Set(withCoords.map(i => i.id));
      for (const [id, marker] of markersRef.current) {
        if (!newIds.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      }

      // Add only new markers (skip existing ones)
      const bounds: [number, number][] = [];
      for (const i of withCoords) {
        const { lat, lng } = i.coordenadas!;
        bounds.push([lat, lng]);
        if (markersRef.current.has(i.id)) continue;
        const color = statusColor(i.estatus);
        const marker = L.circleMarker([lat, lng], {
          radius: 9,
          color: "#fff",
          weight: 2,
          fillColor: color,
          fillOpacity: 0.9,
        })
          .bindPopup(
            `<div style="min-width:160px"><b>${i.calle || "Sin dirección"} ${i.numero || ""}</b><br>` +
            `<span style="font-size:11px">${i.tipo} · ${i.estatus}</span><br>` +
            `<b style="font-size:13px">${i.precio?.toLocaleString("es-ES") ?? "—"} €</b>` +
            (i.ref ? `<br><span style="font-size:10px;color:#888">#${cleanRef(i.ref)}</span>` : "") +
            `</div>`
          )
          .addTo(map);
        markersRef.current.set(i.id, marker);
      }
      if (bounds.length > 1) {
        map.fitBounds(bounds as any, { padding: [40, 40] });
      }
    });
  }, [withCoords]);

  async function handleGeocode() {
    if (withoutCoords.length === 0 || geocoding) return;
    setGeocoding(true);
    setGeocodePending(withoutCoords.length);
    const items = withoutCoords.map((i) => ({
      id: i.id,
      calle: i.calle,
      numero: i.numero,
      barrio: i.barrio,
      localidad: i.localidad,
    }));
    try {
      const { results } = await geocodeFn({ data: { items } });
      const newCoords = new Map(localCoords);
      for (const r of results) {
        if ("lat" in r) newCoords.set(r.id, { lat: r.lat, lng: r.lng });
      }
      setLocalCoords(newCoords);
      // Invalidate so the next visit to /inmuebles reflects the persisted coordinates
      qc.invalidateQueries({ queryKey: ["all-inmuebles"] });
    } finally {
      setGeocoding(false);
      setGeocodePending(0);
    }
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card text-xs text-muted-foreground">
        <span>{withCoords.length} en mapa · {withoutCoords.length} sin geocodificar</span>
        {withoutCoords.length > 0 && (
          <button
            onClick={handleGeocode}
            disabled={geocoding}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-input bg-background text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
          >
            {geocoding ? (
              <><Loader2 className="size-3 animate-spin" /> Geocodificando {geocodePending}…</>
            ) : (
              <><MapIcon className="size-3" /> Geocodificar ({withoutCoords.length})</>
            )}
          </button>
        )}
      </div>
      <div ref={mapRef} style={{ height: "600px", width: "100%" }} />
    </div>
  );
}
