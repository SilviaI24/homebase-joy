import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { Search, Users, RotateCcw, LayoutList, Columns3 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { HeaderStats } from "@/components/HeaderStats";
import { SectionTabs } from "@/components/SectionTabs";
import { RouteError } from "@/components/RouteError";
import { NewClienteDialog } from "@/components/CreateDialogs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Pagination } from "@/components/pagination/Pagination";
import { ClienteRow, ClienteDetallePanel } from "@/components/contactos/ClientesPanel";
import { DuplicadosTab } from "@/components/contactos/DuplicadosPanel";
import { PipelineInteresados } from "@/components/contactos/PipelineInteresados";
import { clientesPageQuery, clientesStatsQuery, contactosPageQuery } from "@/lib/queries";
import type { ContactosTabCounts, Segmento } from "@/lib/clientes.functions";
import { restaurarContactoDeHistorico } from "@/lib/clientes-ciclo-vida.functions";
import {
  SEG_META,
  formatFechaCorta,
  initials,
  avatarColorClass,
  motivoDescarteLabel,
} from "@/lib/contactos-format";

const PAGE_SIZE = 50;

// Circuito del lead (aprobado por David, 24 sep 2026): los leads viven en la
// Bandeja hasta que se cualifican o se descartan, así que Contactos ya no
// tiene pestaña de Leads. Se organiza por lo que quiere cada persona; una
// misma persona puede aparecer en dos pestañas (p. ej. propietaria de un piso
// e interesada en comprar otro).
const TABS = [
  "compra",
  "alquiler",
  "propietarios",
  "descartado",
  "historico",
  "duplicados",
] as const;
type ContactosTab = (typeof TABS)[number];

const INTERES_TABS: Partial<
  Record<ContactosTab, { seg: "Comprador" | "Inquilino" | "Propietario"; label: string }>
> = {
  compra: { seg: "Comprador", label: "Interesados compra" },
  alquiler: { seg: "Inquilino", label: "Interesados alquiler" },
  propietarios: { seg: "Propietario", label: "Propietarios" },
};

function tabLabel(label: string, n: number | undefined) {
  return (
    <>
      {label}
      {n !== undefined && (
        <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
          {n.toLocaleString("es-ES")}
        </span>
      )}
    </>
  );
}

function tabConfig(counts: ContactosTabCounts | undefined) {
  return [
    { key: "compra" as const, label: tabLabel("Interesados compra", counts?.Comprador) },
    { key: "alquiler" as const, label: tabLabel("Interesados alquiler", counts?.Inquilino) },
    { key: "propietarios" as const, label: tabLabel("Propietarios", counts?.Propietario) },
    { key: "descartado" as const, label: tabLabel("Descartados", counts?.Descartado) },
    { key: "historico" as const, label: tabLabel("Histórico", counts?.Historico) },
    { key: "duplicados" as const, label: "Duplicados" },
  ];
}

// `.catch`: enlaces antiguos (?tab=leads, ?tab=clientes) abren la pestaña por
// defecto en vez de una página de error.
const searchSchema = z.object({
  tab: z.enum(TABS).optional().catch(undefined),
  vista: z.enum(["lista", "pipeline"]).optional().catch(undefined),
  page: z.number().min(1).optional(),
  q: z.string().optional(),
  id: z.string().optional(),
});

export const Route = createFileRoute("/contactos/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Contactos · El Sol Grupo CRM" },
      {
        name: "description",
        content: "Interesados en compra y alquiler, propietarios, descartados e histórico.",
      },
    ],
  }),
  loader: ({ context, location }) => {
    const tab = ((location.search as { tab?: string }).tab ?? "compra") as ContactosTab;
    const interes = INTERES_TABS[tab];
    const stats = context.queryClient.ensureQueryData(clientesStatsQuery);
    if (!interes) return stats;
    return Promise.all([
      context.queryClient.ensureQueryData(
        clientesPageQuery({ page: 1, pageSize: PAGE_SIZE, seg: interes.seg, q: "" }),
      ),
      stats,
    ]);
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
  const tab = rawSearch.tab ?? "compra";
  const { data: counts } = useQuery(clientesStatsQuery);
  const interes = INTERES_TABS[tab];

  function setTab(t: ContactosTab) {
    navigate({ search: () => ({ tab: t, page: 1 }) });
  }

  return (
    <AppShell title="Contactos">
      <HeaderStats />

      <SectionTabs tabs={tabConfig(counts)} value={tab} onChange={setTab} />

      {interes && <InteresTab key={tab} seg={interes.seg} />}
      {tab === "historico" && <SimpleContactsTab etapa="Histórico" />}
      {tab === "descartado" && <SimpleContactsTab etapa="Descartado" />}
      {tab === "duplicados" && <DuplicadosTab />}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PESTAÑAS POR INTERÉS — ClienteRow/ClienteDetallePanel en
// components/contactos/ClientesPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────

function InteresTab({ seg }: { seg: "Comprador" | "Inquilino" | "Propietario" }) {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const page = rawSearch.page ?? 1;
  const q = rawSearch.q ?? "";
  const selectedId = rawSearch.id ?? null;
  const tienePipeline = seg === "Comprador" || seg === "Inquilino";
  const vista = tienePipeline ? (rawSearch.vista ?? "lista") : "lista";

  const { data: pageData, isFetching } = useQuery({
    ...clientesPageQuery({ page, pageSize: PAGE_SIZE, seg, q }),
    enabled: vista === "lista",
  });

  const clientes = pageData?.clientes ?? [];
  const total = pageData?.total ?? 0;

  function goPage(p: number) {
    navigate({ search: (prev) => ({ ...prev, page: p }) });
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
  function setVista(v: "lista" | "pipeline") {
    navigate({ search: (prev) => ({ ...prev, vista: v, page: 1 }) });
  }

  const detalle = (
    <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && closeDetail()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {selectedId && <ClienteDetallePanel id={selectedId} />}
      </SheetContent>
    </Sheet>
  );

  const selectorVista = tienePipeline && (
    <div
      className="inline-flex rounded-md border border-border overflow-hidden"
      role="group"
      aria-label="Vista"
    >
      <button
        type="button"
        onClick={() => setVista("lista")}
        aria-pressed={vista === "lista"}
        className={`px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${vista === "lista" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"}`}
      >
        <LayoutList className="size-3.5" /> Lista
      </button>
      <button
        type="button"
        onClick={() => setVista("pipeline")}
        aria-pressed={vista === "pipeline"}
        className={`px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 border-l border-border transition-colors ${vista === "pipeline" ? "bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground"}`}
      >
        <Columns3 className="size-3.5" /> Pipeline
      </button>
    </div>
  );

  if (vista === "pipeline") {
    return (
      <div>
        <div className="mb-4 flex justify-end">{selectorVista}</div>
        <PipelineInteresados tipo={seg as "Comprador" | "Inquilino"} onOpen={openDetail} />
        {detalle}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {selectorVista}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, email o teléfono…"
            aria-label={`Buscar en ${SEG_META[seg].label}`}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <NewClienteDialog />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="py-2.5 pl-4 pr-2 text-left font-medium">Nombre</th>
                <th className="py-2.5 px-2 text-left font-medium">Teléfono</th>
                <th className="py-2.5 px-2 text-left font-medium">Estado</th>
                <th className="py-2.5 px-2 text-left font-medium">Alta</th>
                <th className="py-2.5 pl-2 pr-4 text-right font-medium">Activos</th>
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 && !isFetching ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                    <Users className="mx-auto mb-2 size-6 opacity-50" />
                    {q
                      ? "Nadie coincide con la búsqueda."
                      : "Todavía no hay nadie en esta pestaña."}
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

      {detalle}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTÓRICO / DESCARTADOS
// ─────────────────────────────────────────────────────────────────────────────

function SimpleContactsTab({ etapa }: { etapa: "Histórico" | "Descartado" }) {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const restaurarFn = useServerFn(restaurarContactoDeHistorico);
  const page = rawSearch.page ?? 1;
  const q = rawSearch.q ?? "";
  const esDescartado = etapa === "Descartado";

  const { data, isFetching } = useQuery(
    contactosPageQuery({ page, pageSize: PAGE_SIZE, etapa, q }),
  );

  const restaurarMutation = useMutation({
    mutationFn: (contactId: string) => restaurarFn({ data: { contactId } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["contactos-page"] }),
        qc.invalidateQueries({ queryKey: ["clientes-stats"] }),
        qc.invalidateQueries({ queryKey: ["ia-conversations-page"] }),
      ]);
      toast.success(
        esDescartado
          ? "Descarte deshecho: el lead vuelve a Pendientes en la Bandeja"
          : "Contacto restaurado a su etapa anterior",
      );
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
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, email o teléfono…"
            aria-label={esDescartado ? "Buscar en descartados" : "Buscar en histórico"}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {esDescartado
            ? "Descartados desde la Bandeja, con su motivo"
            : "Sin actividad en 18 meses (archivado automático)"}
        </span>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="py-2.5 pl-4 pr-2 text-left font-medium">Nombre</th>
                <th className="py-2.5 px-2 text-left font-medium">Teléfono</th>
                <th className="py-2.5 px-2 text-left font-medium">Email</th>
                <th className="py-2.5 px-2 text-left font-medium">
                  {esDescartado ? "Motivo" : "Tipo"}
                </th>
                <th className="py-2.5 px-2 text-left font-medium">
                  {esDescartado ? "Descartado" : "Alta"}
                </th>
                <th className="py-2.5 pl-2 pr-4 text-right font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 && !isFetching ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    <Users className="mx-auto mb-2 size-6 opacity-50" />
                    {esDescartado
                      ? "Nadie descartado todavía. Se descarta desde la Bandeja."
                      : "No hay contactos en histórico."}
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
                          <span
                            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColorClass(c.nombre)}`}
                          >
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
                        {esDescartado ? (
                          <span className="text-xs">
                            {motivoDescarteLabel(c.motivoDescarte) ?? (
                              <span className="text-muted-foreground">Sin motivo</span>
                            )}
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 text-xs border rounded-full px-2.5 py-1 font-medium ${segCfg.chip}`}
                          >
                            <Icon className="size-3" />
                            {segCfg.singular}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-xs text-muted-foreground whitespace-nowrap">
                        {formatFechaCorta(esDescartado ? c.descartadoAt : c.fecha)}
                      </td>
                      <td className="py-3 pl-2 pr-4 text-right">
                        <button
                          type="button"
                          disabled={restaurarMutation.isPending}
                          onClick={() => restaurarMutation.mutate(c.id)}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md px-2 py-1 transition-colors disabled:opacity-50"
                        >
                          <RotateCcw className="size-3" />
                          {esDescartado ? "Deshacer descarte" : "Restaurar"}
                        </button>
                      </td>
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
