import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { RouteError } from "@/components/RouteError";
import { Pagination } from "@/components/pagination/Pagination";
import { comerciablesInmueblesQuery, iaConversationsPageQuery } from "@/lib/queries";
import { updateClienteSeguimiento, sendWhatsAppReply } from "@/lib/mutations.functions";
import {
  comercialStatus,
  compileInmueblePatterns,
  findMentionedInmuebles,
  type InmuebleWithPatterns,
} from "@/lib/bandeja-format";
import { Sparkles, Search, Mail } from "lucide-react";
import { inferCanal } from "@/components/silvia/conversation";
import { AsistenteSilviaPanel } from "@/components/bandeja/AsistenteSilviaPanel";
import { ConversationCard } from "@/components/bandeja/ConversationCard";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/bandeja/")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { page?: number; tab?: string; q?: string; canal?: string } => ({
    page: typeof s.page === "number" && s.page >= 1 ? Math.floor(s.page) : undefined,
    tab: ["Pendientes", "Cualificados", "Archivados", "Antiguos", "Todos"].includes(s.tab as string)
      ? (s.tab as string)
      : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
    canal: ["Todos", "WhatsApp", "Voz", "Email"].includes(s.canal as string)
      ? (s.canal as string)
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Bandeja operativa · El Sol Grupo CRM" },
      {
        name: "description",
        content:
          "Bandeja operativa de conversaciones gestionadas por SilvIA (WhatsApp, voz y email).",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient
      .ensureQueryData(
        iaConversationsPageQuery({ page: 1, pageSize: PAGE_SIZE, tab: "Pendientes" }),
      )
      .catch(() => {});
    context.queryClient.ensureQueryData(comerciablesInmueblesQuery).catch(() => {});
  },
  component: BandejaPage,
  errorComponent: ({ error }) => (
    <AppShell title="Bandeja">
      <RouteError error={error} />
    </AppShell>
  ),
});

const ESTADO_TABS = ["Pendientes", "Cualificados", "Archivados", "Antiguos", "Todos"] as const;
type EstadoTab = (typeof ESTADO_TABS)[number];

function BandejaPage() {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();

  // Apply defaults for optional search params.
  const search = {
    page: rawSearch.page ?? 1,
    tab: rawSearch.tab ?? "Pendientes",
    q: rawSearch.q ?? "",
    canal: rawSearch.canal ?? "Todos",
  };

  const { data: pageData, isFetching } = useQuery(
    iaConversationsPageQuery({
      page: search.page,
      pageSize: PAGE_SIZE,
      tab: search.tab,
      q: search.q,
      canal: search.canal,
    }),
  );

  const { data: inmData } = useSuspenseQuery(comerciablesInmueblesQuery);

  // Memoizado: `?? []` crea un array nuevo cada render si pageData?.clientes
  // es undefined, lo que invalidaría el useMemo de más abajo que depende de
  // `conversaciones` aunque los datos reales no hayan cambiado.
  const conversaciones = useMemo(() => pageData?.clientes ?? [], [pageData?.clientes]);
  const total = pageData?.total ?? 0;
  const tabCounts = pageData?.tabCounts ?? {
    Pendientes: 0,
    Cualificados: 0,
    Archivados: 0,
    Antiguos: 0,
    Todos: 0,
  };

  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Optimistic local state: server is source of truth after invalidation.
  const [archivados, setArchivados] = useState<Set<string>>(new Set());
  const [cualificados, setCualificados] = useState<Set<string>>(new Set());
  const [routing, setRouting] = useState<string | null>(null);
  const seguimientoFn = useServerFn(updateClienteSeguimiento);

  // WhatsApp reply state
  const [replyOpen, setReplyOpen] = useState<Set<string>>(new Set());
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [replySending, setReplySending] = useState<string | null>(null);
  const sendWaFn = useServerFn(sendWhatsAppReply);

  async function sendReply(clienteId: string) {
    const msg = replyTexts[clienteId]?.trim();
    if (!msg || replySending) return;
    setReplySending(clienteId);
    try {
      // El teléfono ya no viaja desde el cliente: el servidor lo resuelve
      // desde el propio contacto (auditoría 9 sep 2026).
      await sendWaFn({ data: { contactId: clienteId, message: msg } });
      toast.success("Mensaje enviado por WhatsApp");
      setReplyTexts((p) => ({ ...p, [clienteId]: "" }));
      setReplyOpen((p) => {
        const n = new Set(p);
        n.delete(clienteId);
        return n;
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al enviar");
    } finally {
      setReplySending(null);
    }
  }

  function toggleReply(id: string) {
    setReplyOpen((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function goPage(p: number) {
    navigate({ search: (prev) => ({ ...prev, page: p }) });
  }

  function changeTab(t: string) {
    navigate({ search: (prev) => ({ ...prev, tab: t, page: 1 }) });
  }

  function changeCanalFilter(c: string) {
    navigate({ search: (prev) => ({ ...prev, canal: c, page: 1 }) });
  }

  function changeQ(q: string) {
    navigate({ search: (prev) => ({ ...prev, q, page: 1 }) });
  }

  // Solo proponemos inmuebles "comerciables" (excluimos vendidos, dados de
  // baja o ya alquilados). Si existen duplicados de referencia, nos quedamos
  // con el activo.
  const todosInmuebles = useMemo((): InmuebleWithPatterns[] => {
    const ESTADOS_EXCLUIDOS = new Set([
      "vendido",
      "baja",
      "alquilado",
      "prospeccion",
      "prospección",
    ]);
    const activos = [...inmData.inmuebles, ...inmData.alquileres].filter(
      (i) => !ESTADOS_EXCLUIDOS.has(comercialStatus(i)),
    );
    // Dedupe por referencia: si dos inmuebles activos comparten ref,
    // priorizamos el estatus comercial real "Activo" > "Reservado" > resto.
    const prioridad = (i: (typeof activos)[number]) => {
      const status = comercialStatus(i);
      if (status === "activo") return 0;
      if (status === "reservado") return 1;
      return 2;
    };
    const porRef = new Map<string, (typeof activos)[number]>();
    for (const i of activos) {
      const key = (i.ref || "").trim().toLowerCase();
      if (!key) {
        porRef.set(i.id, i);
        continue;
      }
      const prev = porRef.get(key);
      if (!prev || prioridad(i) < prioridad(prev)) {
        porRef.set(key, i);
      }
    }
    return Array.from(porRef.values()).map(compileInmueblePatterns);
  }, [inmData]);

  // Current page conversations enriched with canal detection and property mentions.
  const leads = useMemo(() => {
    return conversaciones.map((c) => {
      const blob = `${c.motivo ?? ""}\n${c.solicitud ?? ""}\n${c.conversaciones ?? ""}`;
      const mencionados = findMentionedInmuebles(blob, todosInmuebles);
      return { cliente: c, canal: inferCanal(c), mencionados };
    });
  }, [conversaciones, todosInmuebles]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function archivar(id: string) {
    setArchivados((p) => new Set(p).add(id));
    setCualificados((p) => {
      const n = new Set(p);
      n.delete(id);
      return n;
    });
    try {
      await seguimientoFn({ data: { clienteId: id, tipo: "Anular prospección" } });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["ia-conversations-page"] });
    } catch (error) {
      setArchivados((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
      toast.error(error instanceof Error ? error.message : "No se pudo archivar");
    }
  }

  async function route(id: string, tipo: "captacion" | "compra" | "alquiler") {
    setRouting(null);
    setCualificados((p) => new Set(p).add(id));
    setArchivados((p) => {
      const n = new Set(p);
      n.delete(id);
      return n;
    });
    const tipoMapped =
      tipo === "captacion" ? "Prospecciones" : tipo === "compra" ? "Comprador" : "Inquilino";
    try {
      await seguimientoFn({ data: { clienteId: id, tipo: tipoMapped, estado: "Contactado" } });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["clientes-page"] });
      queryClient.invalidateQueries({ queryKey: ["ia-conversations-page"] });
      if (tipo === "captacion") queryClient.invalidateQueries({ queryKey: ["prospectos"] });
    } catch (e: unknown) {
      setCualificados((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
      toast.error(e instanceof Error ? e.message : "Error al cualificar el lead");
    }
  }

  return (
    <AppShell title="Bandeja operativa">
      {/* Header con stats */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent text-white shadow">
            <Sparkles className="size-5" />
          </div>
          <div>
            <div className="text-sm font-medium">Bandeja operativa</div>
            <div className="text-xs text-muted-foreground">
              Conversaciones de WhatsApp, voz y email gestionadas por SilvIA
            </div>
          </div>
        </div>
        <div className="flex gap-4 text-xs">
          <div className="rounded-md border border-border bg-card px-3 py-2">
            <div className="text-muted-foreground">Pendientes</div>
            <div className="text-lg font-semibold text-foreground">{tabCounts.Pendientes}</div>
          </div>
          <div className="rounded-md border border-border bg-card px-3 py-2">
            <div className="text-muted-foreground">Cualificados</div>
            <div className="text-lg font-semibold text-success">{tabCounts.Cualificados}</div>
          </div>
          <div className="rounded-md border border-border bg-card px-3 py-2">
            <div className="text-muted-foreground">Total</div>
            <div className="text-lg font-semibold text-foreground">{tabCounts.Todos}</div>
          </div>
        </div>
      </div>

      <AsistenteSilviaPanel />

      {/* Tabs + filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-muted p-1">
          {ESTADO_TABS.map((t) => (
            <button
              key={t}
              onClick={() => changeTab(t)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                search.tab === t
                  ? "bg-background text-foreground shadow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}{" "}
              <span className="ml-1 text-[10px] opacity-70">{tabCounts[t as EstadoTab] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-border p-1 bg-card">
          {(["Todos", "WhatsApp", "Voz", "Email"] as const).map((c) => (
            <button
              key={c}
              onClick={() => changeCanalFilter(c)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                search.canal === c
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
            value={search.q}
            onChange={(e) => changeQ(e.target.value)}
            placeholder="Buscar por nombre, teléfono, conversación…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Feed */}
      {leads.length === 0 && !isFetching ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          <Sparkles className="mx-auto mb-2 size-6 opacity-50" />
          No hay conversaciones {search.tab.toLowerCase()}.
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map(({ cliente: c, canal, mencionados }) => {
            const isArchived = archivados.has(c.id) || c.trabajado?.toLowerCase() === "descartado";
            const isCualified =
              cualificados.has(c.id) || c.trabajado?.toLowerCase() === "contactado";
            return (
              <ConversationCard
                key={c.id}
                cliente={c}
                canal={canal}
                mencionados={mencionados}
                isOpen={expanded.has(c.id)}
                isArchived={isArchived}
                isCualified={isCualified}
                routingActive={routing === c.id}
                replyOpenActive={replyOpen.has(c.id)}
                replyText={replyTexts[c.id] ?? ""}
                replySendingActive={replySending === c.id}
                onToggleExpand={() => toggleExpand(c.id)}
                onArchivar={() => archivar(c.id)}
                onStartRouting={() => setRouting(c.id)}
                onCancelRouting={() => setRouting(null)}
                onRoute={(tipo) => route(c.id, tipo)}
                onToggleReply={() => toggleReply(c.id)}
                onReplyTextChange={(v) => setReplyTexts((p) => ({ ...p, [c.id]: v }))}
                onSendReply={() => sendReply(c.id)}
                onVinculado={() => {
                  queryClient.invalidateQueries({ queryKey: ["ia-conversations-page"] });
                  queryClient.invalidateQueries({ queryKey: ["leads"] });
                  queryClient.invalidateQueries({ queryKey: ["clientes-page"] });
                }}
              />
            );
          })}
          <Pagination
            page={search.page}
            pageSize={PAGE_SIZE}
            total={total}
            onPage={goPage}
            isFetching={isFetching}
          />
        </div>
      )}
    </AppShell>
  );
}
