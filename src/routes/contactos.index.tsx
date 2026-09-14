import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useRef } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { UserCog, Search, Mail, Users, Inbox, LayoutList, Columns3, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SectionTabs } from "@/components/SectionTabs";
import { RouteError } from "@/components/RouteError";
import { NewClienteDialog } from "@/components/CreateDialogs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Pagination } from "@/components/pagination/Pagination";
import { KanbanView, LeadCard } from "@/components/contactos/LeadsBoard";
import { ClienteRow, ClienteDetallePanel } from "@/components/contactos/ClientesPanel";
import { DuplicadosTab } from "@/components/contactos/DuplicadosPanel";
import {
  agentesQuery,
  leadsQueryOpts,
  clientesPageQuery,
  clientesStatsQuery,
  contactosPageQuery,
} from "@/lib/queries";
import type { Cliente, Segmento } from "@/lib/clientes.functions";
import { restaurarContactoDeHistorico } from "@/lib/clientes-ciclo-vida.functions";
import type { EstadoSeguimiento } from "@/lib/mutations.functions";
import {
  ESTADO_META,
  ORIGEN_META,
  SEG_META,
  CLIENTE_SEGS,
  inferEstado,
  formatFechaCorta,
  initials,
} from "@/lib/contactos-format";

const PAGE_SIZE = 50;

type ContactosTab = "leads" | "clientes" | "historico" | "descartado" | "duplicados";

const TAB_CONFIG: Array<{ key: ContactosTab; label: string }> = [
  { key: "leads", label: "Leads" },
  { key: "clientes", label: "Clientes" },
  { key: "historico", label: "Histórico" },
  { key: "descartado", label: "Descartado" },
  { key: "duplicados", label: "Duplicados" },
];

const searchSchema = z.object({
  tab: z.enum(["leads", "clientes", "historico", "descartado", "duplicados"]).optional(),
  page: z.number().min(1).optional(),
  q: z.string().optional(),
  seg: z.string().optional(),
  agente: z.string().optional(),
  id: z.string().optional(),
});

export const Route = createFileRoute("/contactos/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Contactos · El Sol Grupo CRM" },
      {
        name: "description",
        content: "Gestión unificada de leads, clientes, histórico y descartados.",
      },
    ],
  }),
  loader: ({ context, location }) => {
    const tab = (location.search as { tab?: string }).tab ?? "leads";
    if (tab === "clientes") {
      return Promise.all([
        context.queryClient.ensureQueryData(
          clientesPageQuery({ page: 1, pageSize: PAGE_SIZE, seg: "Todos", q: "" }),
        ),
        context.queryClient.ensureQueryData(clientesStatsQuery),
      ]);
    }
    // leadsQueryOpts ya no se prefetchea aquí: necesita agenteId, que
    // depende de localStorage (no disponible en el loader) — se resuelve y
    // se pide dentro de LeadsTab, una vez se conoce el comercial elegido.
    return context.queryClient.ensureQueryData(agentesQuery);
  },
  component: ContactosPage,
  errorComponent: ({ error }) => (
    <AppShell title="Contactos">
      <RouteError error={error} />
    </AppShell>
  ),
});

function ContactosPage() {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab = rawSearch.tab ?? "leads";

  function setTab(t: ContactosTab) {
    navigate({ search: () => ({ tab: t, page: 1 }) });
  }

  return (
    <AppShell title="Contactos">
      <SectionTabs tabs={TAB_CONFIG} value={tab} onChange={setTab} />

      {tab === "leads" && <LeadsTab />}
      {tab === "clientes" && <ClientesTab />}
      {tab === "historico" && <SimpleContactsTab etapa="Histórico" />}
      {tab === "descartado" && <SimpleContactsTab etapa="Descartado" />}
      {tab === "duplicados" && <DuplicadosTab />}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADS TAB (KanbanView + ListaView) — metadatos y helpers puros en
// contactos-format.ts; KanbanCard/KanbanView/LeadCard en components/contactos/LeadsBoard.tsx
// ─────────────────────────────────────────────────────────────────────────────

function LeadsTab() {
  const { data: ag } = useSuspenseQuery(agentesQuery);
  const navigate = useNavigate({ from: "/contactos/" });
  const { agente: agenteParam } = Route.useSearch();
  const [q, setQ] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<EstadoSeguimiento | "Todos">("Todos");
  const [origenFilter, setOrigenFilter] = useState<string>("Todos");
  const [view, setView] = useState<"lista" | "kanban">("kanban");

  const agentes = ag.agentes;
  const [savedAgenteId] = useState<string>(() =>
    typeof window !== "undefined" ? (localStorage.getItem("homebase.contactos.agente") ?? "") : "",
  );
  const agenteId =
    agenteParam ??
    (savedAgenteId && agentes.some((a) => a.id === savedAgenteId) ? savedAgenteId : null) ??
    agentes[0]?.id ??
    "";
  const agenteSel = agentes.find((a) => a.id === agenteId);

  // El servidor ya filtra por agenteId (auditoría 12 sep 2026 — antes se
  // traían los ~2.800 Leads de toda la empresa para quedarse, tras filtrar
  // aquí, con los de un solo comercial), así que ya no hace falta repetir
  // ese filtro en el navegador.
  const { data } = useSuspenseQuery(leadsQueryOpts(agenteId));
  const misLeads = useMemo(() => {
    return data.clientes.map((c) => ({ cliente: c, estado: inferEstado(c) }));
  }, [data.clientes]);

  const counts = useMemo(() => {
    const m: Record<EstadoSeguimiento | "Todos", number> = {
      Pendiente: 0,
      Contactado: 0,
      Descartado: 0,
      Todos: misLeads.length,
    };
    misLeads.forEach((l) => (m[l.estado] += 1));
    return m;
  }, [misLeads]);

  const origenCounts = useMemo(() => {
    const m: Record<string, number> = { Todos: misLeads.length };
    Object.keys(ORIGEN_META).forEach((k) => (m[k] = 0));
    misLeads.forEach(({ cliente }) => {
      const k = ORIGEN_META[cliente.segmento] ? cliente.segmento : "Lead";
      m[k] = (m[k] ?? 0) + 1;
    });
    return m;
  }, [misLeads]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return misLeads.filter(({ cliente: c, estado }) => {
      if (estadoFilter !== "Todos" && estado !== estadoFilter) return false;
      if (origenFilter !== "Todos") {
        const seg = ORIGEN_META[c.segmento] ? c.segmento : "Lead";
        if (seg !== origenFilter) return false;
      }
      if (!ql) return true;
      return (
        c.nombre.toLowerCase().includes(ql) ||
        c.telefono.toLowerCase().includes(ql) ||
        c.email.toLowerCase().includes(ql) ||
        c.motivo.toLowerCase().includes(ql)
      );
    });
  }, [misLeads, q, estadoFilter, origenFilter]);

  return (
    <div>
      {/* Selector de comercial + toggle vista */}
      <div className="mb-5 rounded-xl border border-border bg-card p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UserCog className="size-4 text-muted-foreground" />
          Comercial
        </div>
        <select
          value={agenteId}
          onChange={(e) => {
            const val = e.target.value || undefined;
            if (typeof window !== "undefined" && val) {
              localStorage.setItem("homebase.contactos.agente", val);
            }
            navigate({ search: (prev) => ({ ...prev, agente: val }) });
          }}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-foreground/30 min-w-[220px]"
        >
          {agentes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nombre}
            </option>
          ))}
        </select>
        {agenteSel?.mail && (
          <a
            href={`mailto:${agenteSel.mail}`}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Mail className="size-3" /> {agenteSel.mail}
          </a>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Link
            to="/comerciales"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <Users className="size-3" /> Ver equipo
          </Link>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setView("lista")}
              title="Vista lista"
              className={`px-2.5 py-1.5 transition-colors ${view === "lista" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutList className="size-3.5" />
            </button>
            <button
              onClick={() => setView("kanban")}
              title="Vista kanban"
              className={`px-2.5 py-1.5 border-l border-border transition-colors ${view === "kanban" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"}`}
            >
              <Columns3 className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {view === "lista" &&
          (["Pendiente", "Contactado", "Descartado", "Todos"] as const).map((e) => {
            const active = estadoFilter === e;
            const meta = e !== "Todos" ? ESTADO_META[e] : null;
            return (
              <button
                key={e}
                onClick={() => setEstadoFilter(e)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${active ? (meta ? meta.cls : "bg-foreground text-background border-foreground") : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
              >
                {meta && <meta.icon className="size-3" />}
                {e}
                <span className="opacity-70">· {counts[e]}</span>
              </button>
            );
          })}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, teléfono o motivo…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium mr-1">
          Origen
        </span>
        {(["Todos", ...Object.keys(ORIGEN_META)] as const).map((k) => {
          const active = origenFilter === k;
          const meta = k !== "Todos" ? ORIGEN_META[k as string] : null;
          const count = origenCounts[k as string] ?? 0;
          return (
            <button
              key={k}
              onClick={() => setOrigenFilter(k as string)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${active ? (meta ? meta.cls : "bg-foreground text-background border-foreground") : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
            >
              {meta && <meta.icon className="size-3" />}
              {meta ? meta.label : k}
              <span className="opacity-70">· {count}</span>
            </button>
          );
        })}
      </div>

      {view === "kanban" ? (
        <KanbanView leads={misLeads} q={q} origenFilter={origenFilter} />
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          <Inbox className="mx-auto mb-2 size-6 opacity-50" />
          {misLeads.length === 0
            ? "Este comercial todavía no tiene leads asignados."
            : "Sin leads en este estado."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(({ cliente, estado }) => (
            <LeadCard key={cliente.id} cliente={cliente} estado={estado} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTES TAB — metadatos y helpers puros en contactos-format.ts;
// ClienteRow/ClienteDetallePanel en components/contactos/ClientesPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────

function ClientesTab() {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const page = rawSearch.page ?? 1;
  const seg = rawSearch.seg ?? "Todos";
  const q = rawSearch.q ?? "";
  const selectedId = rawSearch.id ?? null;

  const { data: pageData, isFetching } = useQuery(
    clientesPageQuery({ page, pageSize: PAGE_SIZE, seg, q }),
  );
  const { data: statsData } = useQuery(clientesStatsQuery);

  const clientes = pageData?.clientes ?? [];
  const total = pageData?.total ?? 0;

  function goPage(p: number) {
    navigate({ search: (prev) => ({ ...prev, page: p }) });
  }
  function setSeg(s: string) {
    navigate({ search: (prev) => ({ ...prev, seg: s, page: 1 }) });
  }
  function setQ(val: string) {
    navigate({ search: (prev) => ({ ...prev, q: val, page: 1 }) });
  }
  function openDetail(id: string) {
    navigate({ search: (prev) => ({ ...prev, id }) });
  }
  function closeDetail() {
    navigate({ search: (prev) => ({ ...prev, id: undefined }) });
  }

  return (
    <div>
      {/* KPI tiles */}
      {statsData && (
        <div className="mb-5 grid grid-cols-3 gap-3">
          {(["Propietario", "Comprador", "Inquilino"] as const).map((s) => {
            const cfg = SEG_META[s];
            const count = statsData[s.toLowerCase() as keyof typeof statsData] ?? 0;
            const total = statsData.total ?? 1;
            const pct = Math.round((Number(count) / Number(total)) * 100);
            return (
              <button
                key={s}
                onClick={() => setSeg(seg === s ? "Todos" : s)}
                className={`rounded-xl border p-4 text-left transition-colors cursor-pointer ${seg === s ? "border-primary/50 bg-primary/[0.03]" : "border-border bg-card hover:border-foreground/20"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <cfg.icon className="size-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{cfg.label}</span>
                </div>
                <div className="text-2xl font-semibold">{count}</div>
                <div className="text-[11px] text-muted-foreground">{pct}% del total</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Controles */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-muted p-1">
          {CLIENTE_SEGS.map((s) => (
            <button
              key={s}
              onClick={() => setSeg(s)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                seg === s
                  ? "bg-background text-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, email o teléfono…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <NewClienteDialog />
      </div>

      {/* Tabla */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="py-2.5 pl-4 pr-2 text-left font-medium">Nombre</th>
                <th className="py-2.5 px-2 text-left font-medium">Teléfono</th>
                <th className="py-2.5 px-2 text-left font-medium">Segmento</th>
                <th className="py-2.5 px-2 text-left font-medium">Alta</th>
                <th className="py-2.5 pl-2 pr-4 text-right font-medium">Activos</th>
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 && !isFetching ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    <Users className="mx-auto mb-2 size-6 opacity-50" />
                    Sin clientes en este filtro.
                  </td>
                </tr>
              ) : (
                clientes.map((c) => (
                  <ClienteRow key={c.id} c={c} onClick={() => openDetail(c.id)} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={goPage}
          isFetching={isFetching}
        />
      </div>

      {/* Detail Sheet */}
      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && closeDetail()}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {selectedId && <ClienteDetallePanel id={selectedId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIMPLE CONTACTS TAB (Histórico / Descartado)
// ─────────────────────────────────────────────────────────────────────────────

function SimpleContactsTab({ etapa }: { etapa: string }) {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const restaurarFn = useServerFn(restaurarContactoDeHistorico);
  const page = rawSearch.page ?? 1;
  const q = rawSearch.q ?? "";

  const { data, isFetching } = useQuery(
    contactosPageQuery({ page, pageSize: PAGE_SIZE, etapa, q }),
  );

  const restaurarMutation = useMutation({
    mutationFn: (contactId: string) => restaurarFn({ data: { contactId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contactos-page"] });
      toast.success("Contacto restaurado a su etapa anterior");
    },
    onError: () => toast.error("No se pudo restaurar el contacto"),
  });

  const clientes = data?.clientes ?? [];
  const total = data?.total ?? 0;

  function goPage(p: number) {
    navigate({ search: (prev) => ({ ...prev, page: p }) });
  }
  function setQ(val: string) {
    navigate({ search: (prev) => ({ ...prev, q: val, page: 1 }) });
  }

  return (
    <div>
      {/* Search */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, email o teléfono…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {total} {etapa === "Histórico" ? "históricos" : "descartados"}
        </span>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="py-2.5 pl-4 pr-2 text-left font-medium">Nombre</th>
                <th className="py-2.5 px-2 text-left font-medium">Teléfono</th>
                <th className="py-2.5 px-2 text-left font-medium">Email</th>
                <th className="py-2.5 px-2 text-left font-medium">Segmento</th>
                <th className="py-2.5 pl-2 pr-4 text-left font-medium">Alta</th>
                {etapa === "Histórico" && (
                  <th className="py-2.5 pl-2 pr-4 text-right font-medium">Acción</th>
                )}
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 && !isFetching ? (
                <tr>
                  <td
                    colSpan={etapa === "Histórico" ? 6 : 5}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    <Users className="mx-auto mb-2 size-6 opacity-50" />
                    No hay contactos en {etapa.toLowerCase()}.
                  </td>
                </tr>
              ) : (
                clientes.map((c) => {
                  const segCfg = SEG_META[c.segmento as Segmento] ?? SEG_META.Lead;
                  const Icon = segCfg.icon;
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-border hover:bg-muted/40 transition-colors"
                    >
                      <td className="py-3 pl-4 pr-2">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                            {initials(c.nombre) || "?"}
                          </span>
                          <span className="text-sm font-medium truncate max-w-[180px]">
                            {c.nombre || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-xs text-muted-foreground">
                        {c.telefono || "—"}
                      </td>
                      <td className="py-3 px-2 text-xs text-muted-foreground truncate max-w-[180px]">
                        {c.email || "—"}
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={`inline-flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 font-medium ${segCfg.chip}`}
                        >
                          <Icon className="size-3" />
                          {segCfg.label.replace("s", "")}
                        </span>
                      </td>
                      <td className="py-3 pl-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                        {formatFechaCorta(c.fecha)}
                        {c.diasDesdeAlta !== null && (
                          <span className="text-muted-foreground/50 ml-1">
                            ({c.diasDesdeAlta}d)
                          </span>
                        )}
                      </td>
                      {etapa === "Histórico" && (
                        <td className="py-3 pl-2 pr-4 text-right">
                          <button
                            type="button"
                            disabled={restaurarMutation.isPending}
                            onClick={() => restaurarMutation.mutate(c.id)}
                            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md px-2 py-1 transition-colors disabled:opacity-50"
                          >
                            <RotateCcw className="size-3" />
                            Restaurar
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={goPage}
          isFetching={isFetching}
        />
      </div>
    </div>
  );
}

// DuplicadosTab: ver components/contactos/DuplicadosPanel.tsx
