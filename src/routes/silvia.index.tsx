import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SafeImage } from "@/components/SafeImage";
import { NewVisitaDialog } from "@/components/CreateDialogs";
import { listClientes } from "@/lib/clientes.functions";
import { allInmueblesQuery } from "@/lib/queries";
import type { Inmueble } from "@/lib/inmuebles.functions";
import {
  Sparkles,
  Phone,
  Search,
  Mail,
  ChevronDown,
  ChevronUp,
  Building2,
  MapPin,
  Euro,
  ArrowRight,
  UserCheck,
  Archive,
  UserCog,
  Tag,
  CalendarDays,
  MessageSquare,
  CalendarPlus,
} from "lucide-react";
import {
  CanalChip,
  Transcripcion,
  inferCanal,
  type Canal,
} from "@/components/silvia/conversation";

const clientesQuery = queryOptions({
  queryKey: ["clientes"],
  queryFn: () => listClientes(),
});

// Detecta inmuebles mencionados en el texto libre de la conversación buscando
// coincidencias de la calle, referencia o barrio del inmueble.
function findMentionedInmuebles(text: string, inmuebles: Inmueble[]): Inmueble[] {
  const haystack = (text || "").toLowerCase();
  if (!haystack.trim()) return [];
  const found = new Map<string, Inmueble>();
  for (const inm of inmuebles) {
    if (found.has(inm.id)) continue;
    const candidatos: string[] = [];
    // Referencia (#1234)
    if (inm.ref && inm.ref.length >= 3) candidatos.push(inm.ref.toLowerCase());
    // Calle (sin "calle", "av", "c/", etc.) — usamos la palabra clave principal
    const calle = (inm.calle || "")
      .toLowerCase()
      .replace(/^(calle|c\/|c\.|avda?\.?|avenida|plaza|paseo|camino|carretera|ctra\.?|ronda|travesía|travesia)\s+/i, "")
      .trim();
    if (calle.length >= 4) candidatos.push(calle);
    for (const needle of candidatos) {
      // Match con límite de palabra para evitar falsos positivos
      const re = new RegExp(`(?:^|[^a-záéíóúñ0-9])${escapeReg(needle)}(?:[^a-záéíóúñ0-9]|$)`, "i");
      if (re.test(haystack)) {
        found.set(inm.id, inm);
        break;
      }
    }
  }
  return Array.from(found.values()).slice(0, 6);
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


export const Route = createFileRoute("/silvia/")({
  head: () => ({
    meta: [
      { title: "SilvIA · Conversaciones · El Sol Grupo CRM" },
      {
        name: "description",
        content: "Bandeja de conversaciones gestionadas por Silvia, agente de IA.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(clientesQuery);
    context.queryClient.ensureQueryData(allInmueblesQuery);
  },
  component: SilviaPage,
  errorComponent: ({ error }) => (
    <AppShell title="SilvIA">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Error cargando conversaciones: {error.message}
      </div>
    </AppShell>
  ),
});

function formatFecha(f: string | null): string {
  if (!f) return "Sin fecha";
  try {
    return new Date(f).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return f;
  }
}

function moneyShort(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M €`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k €`;
  return `${v} €`;
}

const ESTADO_TABS = ["Pendientes", "Cualificados", "Archivados", "Todos"] as const;
type EstadoTab = (typeof ESTADO_TABS)[number];

function SilviaPage() {
  const { data } = useSuspenseQuery(clientesQuery);
  const { data: inmData } = useSuspenseQuery(allInmueblesQuery);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<EstadoTab>("Pendientes");
  const [canalFilter, setCanalFilter] = useState<Canal | "Todos">("Todos");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [archivados, setArchivados] = useState<Set<string>>(new Set());
  const [cualificados, setCualificados] = useState<Set<string>>(new Set());

  const todosInmuebles = useMemo(
    () => [...inmData.inmuebles, ...inmData.alquileres],
    [inmData],
  );

  // Solo clientes con conversación significativa de Silvia, con detección de
  // inmuebles mencionados en el texto libre.
  const leads = useMemo(() => {
    return data.clientes
      .filter((c) => (c.motivo?.trim().length ?? 0) > 0 || (c.conversaciones?.trim().length ?? 0) > 0)
      .map((c) => {
        const blob = `${c.motivo ?? ""}\n${c.solicitud ?? ""}\n${c.conversaciones ?? ""}`;
        const mencionados = findMentionedInmuebles(blob, todosInmuebles);
        return { cliente: c, canal: inferCanal(c), mencionados };
      });
  }, [data.clientes, todosInmuebles]);

  const filtered = useMemo(() => {
    const ql = q.toLowerCase().trim();
    return leads.filter(({ cliente: c, canal }) => {
      // Estado
      if (tab === "Archivados" && !archivados.has(c.id)) return false;
      if (tab === "Cualificados" && !cualificados.has(c.id)) return false;
      if (tab === "Pendientes" && (archivados.has(c.id) || cualificados.has(c.id))) return false;
      // Canal
      if (canalFilter !== "Todos" && canal !== canalFilter) return false;
      // Búsqueda
      if (!ql) return true;
      return (
        c.nombre.toLowerCase().includes(ql) ||
        c.telefono.toLowerCase().includes(ql) ||
        c.email.toLowerCase().includes(ql) ||
        c.motivo.toLowerCase().includes(ql) ||
        c.conversaciones.toLowerCase().includes(ql) ||
        c.solicitud.toLowerCase().includes(ql)
      );
    });
  }, [leads, q, tab, canalFilter, archivados, cualificados]);

  const counts = useMemo(() => {
    const pend = leads.filter(
      ({ cliente: c }) => !archivados.has(c.id) && !cualificados.has(c.id),
    ).length;
    return {
      Pendientes: pend,
      Cualificados: cualificados.size,
      Archivados: archivados.size,
      Todos: leads.length,
    } as Record<EstadoTab, number>;
  }, [leads, archivados, cualificados]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function archivar(id: string) {
    setArchivados((p) => new Set(p).add(id));
    setCualificados((p) => {
      const n = new Set(p);
      n.delete(id);
      return n;
    });
  }
  function cualificar(id: string) {
    setCualificados((p) => new Set(p).add(id));
    setArchivados((p) => {
      const n = new Set(p);
      n.delete(id);
      return n;
    });
  }

  return (
    <AppShell title="SilvIA · Conversaciones">
      {/* Header con stats */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow">
            <Sparkles className="size-5" />
          </div>
          <div>
            <div className="text-sm font-medium">Bandeja de Silvia</div>
            <div className="text-xs text-muted-foreground">
              Conversaciones de WhatsApp y llamadas gestionadas por la agente de IA
            </div>
          </div>
        </div>
        <div className="flex gap-4 text-xs">
          <div className="rounded-md border border-border bg-card px-3 py-2">
            <div className="text-muted-foreground">Pendientes</div>
            <div className="text-lg font-semibold text-foreground">{counts.Pendientes}</div>
          </div>
          <div className="rounded-md border border-border bg-card px-3 py-2">
            <div className="text-muted-foreground">Cualificados</div>
            <div className="text-lg font-semibold text-emerald-600">{counts.Cualificados}</div>
          </div>
          <div className="rounded-md border border-border bg-card px-3 py-2">
            <div className="text-muted-foreground">Total</div>
            <div className="text-lg font-semibold text-foreground">{counts.Todos}</div>
          </div>
        </div>
      </div>

      {/* Tabs + filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-muted p-1">
          {ESTADO_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                tab === t
                  ? "bg-background text-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t} <span className="ml-1 text-[10px] opacity-70">{counts[t]}</span>
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-border p-1 bg-card">
          {(["Todos", "WhatsApp", "Llamada", "Idealista"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCanalFilter(c)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                canalFilter === c
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, teléfono, conversación…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          <Sparkles className="mx-auto mb-2 size-6 opacity-50" />
          No hay conversaciones {tab.toLowerCase()}.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(({ cliente: c, canal, mencionados }) => {
            const isOpen = expanded.has(c.id);
            const isArchived = archivados.has(c.id);
            const isCualified = cualificados.has(c.id);
            return (
              <article
                key={c.id}
                className={`rounded-lg border bg-card transition-colors ${
                  isArchived
                    ? "border-border opacity-60"
                    : isCualified
                      ? "border-emerald-500/40"
                      : "border-border hover:border-foreground/20"
                }`}
              >
                {/* Header tarjeta */}
                <header className="flex items-start justify-between gap-3 p-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 text-violet-700 dark:text-violet-300 text-sm font-semibold">
                      {c.nombre.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm truncate">{c.nombre || "Sin nombre"}</span>
                        <CanalChip canal={canal} />
                        {c.tipo && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {c.tipo}
                          </span>
                        )}
                        {isCualified && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            <UserCheck className="size-3" /> Cualificado
                          </span>
                        )}
                        {isArchived && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            <Archive className="size-3" /> Archivado
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        {c.telefono && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3" />
                            {c.telefono}
                          </span>
                        )}
                        {c.email && (
                          <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                            <Mail className="size-3" />
                            <span>{c.email.trim()}</span>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3" />
                          {formatFecha(c.fecha)}
                        </span>
                      </div>
                    </div>
                  </div>
                </header>

                {/* Motivo (siempre visible, resumen) */}
                {c.motivo && (
                  <div className="px-4 pb-3">
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      Motivo
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed">{c.motivo}</p>
                  </div>
                )}

                {/* Datos extraídos */}
                {(c.categoria.length > 0 || c.solicitud) && (
                  <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                    {c.categoria.map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1 text-[11px] bg-violet-500/10 text-violet-700 dark:text-violet-400 px-2 py-0.5 rounded-full"
                      >
                        <Tag className="size-3" />
                        {cat}
                      </span>
                    ))}
                    {c.solicitud && (
                      <span className="text-[11px] text-muted-foreground italic">
                        “{c.solicitud.slice(0, 100)}{c.solicitud.length > 100 ? "…" : ""}”
                      </span>
                    )}
                  </div>
                )}

                {/* Transcripción colapsable */}
                {c.conversaciones && (
                  <div className="px-4 pb-3">
                    <button
                      onClick={() => toggleExpand(c.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {isOpen ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                      {isOpen ? "Ocultar transcripción" : "Ver transcripción"}
                    </button>
                    {isOpen && (
                      <div className="mt-2 rounded-md bg-muted/40 border border-border p-3 max-h-96 overflow-auto">
                        <Transcripcion text={c.conversaciones} />
                      </div>
                    )}
                  </div>
                )}

                {/* Matches de propiedades */}
                {c.matches.length > 0 && (
                  <div className="px-4 pb-3 border-t border-border pt-3">
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Sparkles className="size-3 text-violet-500" />
                      Posibles matches ({c.matches.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {c.matches.slice(0, 4).map((m) => (
                        <Link
                          key={m.inmueble.id}
                          to="/inmuebles/$id"
                          params={{ id: m.inmueble.id }}
                          className="group flex items-start gap-2 rounded-md border border-border bg-background p-2 hover:border-foreground/30 transition-colors"
                        >
                          <div className="flex size-8 shrink-0 items-center justify-center rounded bg-muted">
                            <Building2 className="size-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium truncate">
                              {m.inmueble.ref} · {m.inmueble.calle} {m.inmueble.numero}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <MapPin className="size-3" /> {m.inmueble.barrio || m.inmueble.localidad}
                              <Euro className="size-3 ml-1" />
                              {moneyShort(m.inmueble.precioFinal ?? m.inmueble.precio)}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {m.razones.slice(0, 2).map((r, i) => (
                                <span
                                  key={i}
                                  className="text-[9px] bg-violet-500/10 text-violet-700 dark:text-violet-400 px-1.5 py-0.5 rounded"
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          </div>
                          <ArrowRight className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity self-center" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* Acciones */}
                <footer className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-border bg-muted/20 rounded-b-lg">
                  <Link
                    to="/clientes"
                    search={{ id: c.id }}
                    className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    Ver ficha completa <ArrowRight className="size-3" />
                  </Link>
                  <div className="flex items-center gap-1.5">
                    {!isCualified && (
                      <button
                        onClick={() => cualificar(c.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 cursor-pointer transition-colors"
                      >
                        <UserCheck className="size-3" /> Cualificar
                      </button>
                    )}
                    <button
                      className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20 cursor-pointer transition-colors"
                      title="Próximamente"
                    >
                      <UserCog className="size-3" /> Asignar
                    </button>
                    {!isArchived && (
                      <button
                        onClick={() => archivar(c.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                      >
                        <Archive className="size-3" /> Archivar
                      </button>
                    )}
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

