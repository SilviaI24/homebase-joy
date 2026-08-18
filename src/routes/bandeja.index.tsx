import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { askSilvia } from "@/lib/silvia.functions";
import { AppShell } from "@/components/AppShell";
import { RouteError } from "@/components/RouteError";
import { SafeImage } from "@/components/SafeImage";
import { NewVisitaDialog } from "@/components/CreateDialogs";
import { Pagination } from "@/components/pagination/Pagination";
import { allInmueblesQuery, iaConversationsPageQuery } from "@/lib/queries";
import {
  updateClienteSeguimiento,
  asociarLeadAInmueble,
  sendWhatsAppReply,
} from "@/lib/mutations.functions";
import type { Inmueble } from "@/lib/inmuebles.functions";
import { cleanRef } from "@/lib/format";
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
  Tag,
  CalendarDays,
  MessageSquare,
  CalendarPlus,
  Send,
  Bot,
  User2,
  Loader2,
  Home,
  KeyRound,
  Link2,
  ShoppingCart,
} from "lucide-react";
import { CanalChip, Transcripcion, inferCanal, type Canal } from "@/components/silvia/conversation";
import { AsignarLeadButton } from "@/components/AsignarLeadButton";

const PAGE_SIZE = 50;

// Normaliza texto: minúsculas, sin acentos/diacríticos, sin signos.
function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[·.,;:()¿?¡!"'`´]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Stopwords que no deben usarse como pista de calle por sí solas.
const STOP_TOKENS = new Set([
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "san",
  "santa",
  "santo",
  "y",
  "o",
  "calle",
  "av",
  "avda",
  "avenida",
  "plaza",
  "pza",
  "paseo",
  "po",
  "camino",
  "carretera",
  "ctra",
  "ronda",
  "travesia",
  "via",
  "vía",
  "urbanizacion",
  "urb",
  "barrio",
  "edificio",
  "edif",
  "bloque",
  "esquina",
  "callejon",
  "callejón",
  "glorieta",
  "parque",
]);

// Prefijos de vía a eliminar al inicio de un nombre de calle.
const PREFIX_RE =
  /^(calle|c\/|c\.|avda?\.?|avenida|av\.?|pza\.?|plaza|paseo|po\.?|camino|carretera|ctra\.?|ronda|travesia|travesía|trav\.?|via|vía|urbanizacion|urbanización|urb\.?|glorieta|callejon|callejón|edif\.?|edificio|bloque)\s+/i;

// Equivalencias bidireccionales para que cualquiera de las variantes en el
// texto del cliente se acepte como mención válida.
const ALIAS_GROUPS: string[][] = [
  ["avenida", "avda", "av"],
  ["calle", "c"],
  ["plaza", "pza"],
  ["paseo", "po"],
  ["carretera", "ctra"],
  ["travesia", "trav"],
  ["urbanizacion", "urb"],
  ["edificio", "edif"],
  ["sant", "san", "santa", "sta", "sto"],
];

function expandAlias(token: string): string[] {
  for (const group of ALIAS_GROUPS) {
    if (group.includes(token)) return group;
  }
  return [token];
}

// Devuelve los tokens "significativos" de un nombre de vía: sin prefijo,
// sin stopwords y con longitud mínima.
function streetTokens(calle: string): string[] {
  const cleaned = normalize(calle).replace(PREFIX_RE, "").trim();
  if (!cleaned) return [];
  return cleaned.split(" ").filter((t) => t.length >= 3 && !STOP_TOKENS.has(t));
}

// Construye un patrón regex con límites de palabra y aliasing.
function tokenPattern(token: string): string {
  const variants = expandAlias(token).map(escapeReg);
  return `(?:${variants.join("|")})`;
}

// Términos geográficos demasiado genéricos para considerarse mención de un
// inmueble concreto (aparecen en casi cualquier conversación).
const GENERIC_LOCATIONS = new Set([
  "centro",
  "gijon",
  "oviedo",
  "asturias",
  "españa",
  "espana",
  "norte",
  "sur",
  "este",
  "oeste",
]);

function comercialStatus(inm: Inmueble): string {
  return normalize(inm.estatus || inm.estado);
}

// Detecta inmuebles mencionados en el texto libre de la conversación.
// Reglas de alta precisión (preferimos no mostrar a mostrar falsos positivos):
//   1. Referencia exacta del inmueble (#1234) — máxima confianza.
//   2. Frase completa del nombre de calle (sin prefijo) con tokens consecutivos.
// Se descartan los matches por barrio / localidad o por una sola palabra
// suelta porque generaban falsos positivos masivos (p.ej. "centro", "gijón").
type InmuebleWithPatterns = Inmueble & { _refRe: RegExp | null; _streetRe: RegExp | null };

function findMentionedInmuebles(text: string, inmuebles: InmuebleWithPatterns[]): Inmueble[] {
  const haystack = ` ${normalize(text)} `;
  if (!haystack.trim()) return [];
  const found = new Map<string, Inmueble>();
  for (const inm of inmuebles) {
    if (found.has(inm.id)) continue;
    if (inm._refRe?.test(haystack)) {
      found.set(inm.id, inm);
      continue;
    }
    if (inm._streetRe?.test(haystack)) {
      found.set(inm.id, inm);
    }
  }
  return Array.from(found.values()).slice(0, 6);
}

// ─── MencionadoCard ────────────────────────────────────────────────────────────
// Tarjeta de inmueble detectado en conversación, con botón para confirmar vínculo.

const TIPO_VINCULAR_VENTA = [
  { value: "Comprador", icon: ShoppingCart, label: "Comprador" },
  { value: "Propietario", icon: Home, label: "Propietario" },
] as const;

const TIPO_VINCULAR_ALQUILER = [
  { value: "Inquilino", icon: KeyRound, label: "Inquilino" },
  { value: "Propietario", icon: Home, label: "Propietario" },
] as const;

function MencionadoCard({
  inm,
  contactId,
  clienteNombre,
  onVinculado,
  readOnly = false,
}: {
  inm: Inmueble;
  contactId: string;
  clienteNombre: string;
  onVinculado: () => void;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(asociarLeadAInmueble);
  const esAlq = inm.esAlquiler;
  const tiposVincular = esAlq ? TIPO_VINCULAR_ALQUILER : TIPO_VINCULAR_VENTA;
  const [tipo, setTipo] = useState<string>(esAlq ? "Inquilino" : "Comprador");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function confirmar() {
    setPending(true);
    try {
      await fn({ data: { contactId, propertyId: inm.id, tipo } });
      setDone(true);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      onVinculado();
      toast.success(`${clienteNombre || "Contacto"} vinculado como ${tipo}`);
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : String(e)) || "Error al vincular");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={`rounded-md border overflow-hidden flex flex-col ${done ? "border-success/40 bg-success/[0.04]" : "border-primary/30 bg-primary/[0.03]"}`}
    >
      <Link
        to="/inmuebles/$id"
        params={{ id: inm.id }}
        className="flex items-stretch gap-2 hover:bg-primary/[0.06] transition-colors"
      >
        <div className="w-16 shrink-0 bg-muted">
          <SafeImage src={inm.imagen} alt={inm.calle || inm.ref} />
        </div>
        <div className="flex-1 min-w-0 py-2 pr-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-muted-foreground">
              #{cleanRef(inm.ref)}
            </span>
            <span className="text-[10px] text-muted-foreground">{inm.estatus}</span>
          </div>
          <div className="text-xs font-semibold truncate">
            {inm.calle} {inm.numero}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="size-2.5" />
              {inm.barrio || inm.localidad || "—"}
            </span>
            <span className="inline-flex items-center gap-0.5 font-semibold text-primary">
              <Euro className="size-2.5" />
              {moneyShort(inm.precioFinal ?? inm.precio)}
            </span>
          </div>
        </div>
      </Link>
      {/* Confirmar vínculo */}
      {readOnly ? null : done ? (
        <div className="px-2 py-1.5 border-t border-success/20 flex items-center gap-1 text-[10px] text-success">
          <Link2 className="size-3" /> Vinculado como {tipo}
        </div>
      ) : (
        <div className="px-2 py-1.5 border-t border-primary/20 flex items-center gap-1 flex-wrap">
          <div className="flex gap-0.5 flex-1 min-w-0">
            {tiposVincular.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTipo(value)}
                className={`inline-flex items-center gap-0.5 text-[9px] font-medium px-1.5 py-0.5 rounded border transition-colors ${tipo === value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent"}`}
              >
                <Icon className="size-2.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 shrink-0">
            <NewVisitaDialog
              defaultInmuebleId={inm.id}
              defaultClienteId={contactId}
              trigger={
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground hover:bg-accent transition-colors"
                >
                  <CalendarPlus className="size-2.5" />
                </button>
              }
            />
            <button
              type="button"
              disabled={pending}
              onClick={confirmar}
              className="inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {pending ? (
                <Loader2 className="size-2.5 animate-spin" />
              ) : (
                <Link2 className="size-2.5" />
              )}
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/bandeja/")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { page?: number; tab?: string; q?: string; canal?: string } => ({
    page: typeof s.page === "number" && s.page >= 1 ? Math.floor(s.page) : undefined,
    tab: ["Pendientes", "Cualificados", "Archivados", "Todos"].includes(s.tab as string)
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
    context.queryClient.ensureQueryData(
      iaConversationsPageQuery({ page: 1, pageSize: PAGE_SIZE, tab: "Pendientes" }),
    );
    context.queryClient.ensureQueryData(allInmueblesQuery);
  },
  component: BandejaPage,
  errorComponent: ({ error }) => (
    <AppShell title="Bandeja">
      <RouteError error={error} />
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

type ChatMessage = { role: "user" | "assistant"; content: string };

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

  const { data: inmData } = useSuspenseQuery(allInmueblesQuery);

  const conversaciones = pageData?.clientes ?? [];
  const total = pageData?.total ?? 0;
  const tabCounts = pageData?.tabCounts ?? {
    Pendientes: 0,
    Cualificados: 0,
    Archivados: 0,
    Todos: 0,
  };

  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showAssistant, setShowAssistant] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const askFn = useServerFn(askSilvia);

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

  async function sendReply(clienteId: string, phone: string) {
    const msg = replyTexts[clienteId]?.trim();
    if (!msg || replySending) return;
    setReplySending(clienteId);
    try {
      await sendWaFn({ data: { phone, message: msg } });
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
    const wb = "(?:^|[^a-z0-9ñ])";
    const we = "(?:[^a-z0-9ñ]|$)";
    return Array.from(porRef.values()).map((inm) => {
      // Pre-compile ref regex
      const _refRe =
        inm.ref && inm.ref.length >= 4
          ? new RegExp(`${wb}#?${escapeReg(normalize(inm.ref))}${we}`)
          : null;
      // Pre-compile street regex
      const _tokens = streetTokens(inm.calle).filter((t) => !GENERIC_LOCATIONS.has(t));
      const _streetRe =
        _tokens.length >= 2
          ? new RegExp(`${wb}${_tokens.map(tokenPattern).join("\\s+")}${we}`)
          : null;
      return { ...inm, _refRe, _streetRe };
    });
  }, [inmData]);

  // Current page conversations enriched with canal detection and property mentions.
  const leads = useMemo(() => {
    return conversaciones.map((c) => {
      const blob = `${c.motivo ?? ""}\n${c.solicitud ?? ""}\n${c.conversaciones ?? ""}`;
      const mencionados = findMentionedInmuebles(blob, todosInmuebles);
      return { cliente: c, canal: inferCanal(c), mencionados };
    });
  }, [conversaciones, todosInmuebles]);

  // Auto-scroll chat to bottom.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function sendChat() {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    const userMsg: ChatMessage = { role: "user", content: msg };
    const history = [...chatMessages, userMsg];
    setChatMessages(history);
    setChatInput("");
    setChatLoading(true);
    setChatError(null);
    try {
      const { reply } = await askFn({ data: { messages: history } });
      setChatMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setChatError("No se pudo completar la consulta. Inténtalo de nuevo en unos segundos.");
    } finally {
      setChatLoading(false);
    }
  }

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

      {/* Consulta asistida: secundaria respecto a la bandeja operativa. */}
      <button
        type="button"
        onClick={() => setShowAssistant((open) => !open)}
        className="mb-3 w-full h-10 px-4 rounded-lg border border-border bg-card flex items-center gap-2 text-sm font-medium hover:bg-accent transition-colors"
      >
        <Bot className="size-4 text-primary" />
        Consulta asistida del CRM
        <span className="ml-auto text-xs text-muted-foreground">
          {showAssistant ? "Ocultar" : "Abrir"}
        </span>
        {showAssistant ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {showAssistant && (
        <div className="mb-6 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            <span className="text-sm font-medium">Pregunta a SilvIA</span>
            <span className="text-[10px] text-muted-foreground ml-auto">CRM · consulta segura</span>
          </div>

          {/* Messages */}
          {chatMessages.length > 0 && (
            <div className="px-4 py-3 max-h-80 overflow-y-auto space-y-3 border-b border-border">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5 ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-gradient-to-br from-primary/20 to-accent/30 text-primary"}`}
                  >
                    {msg.role === "user" ? (
                      <User2 className="size-3.5" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                  </div>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex gap-2">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/30 text-primary mt-0.5">
                    <Sparkles className="size-3.5" />
                  </div>
                  <div className="rounded-lg px-3 py-2 bg-muted">
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          {/* Error */}
          {chatError && (
            <div className="mx-4 my-2 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
              {chatError}
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2 p-3">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendChat();
                }
              }}
              placeholder="Pregunta sobre leads, propiedades, recomendaciones…"
              disabled={chatLoading}
              className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <button
              type="button"
              onClick={sendChat}
              disabled={chatLoading || !chatInput.trim()}
              className="h-9 px-3 rounded-md bg-primary text-primary-foreground inline-flex items-center gap-1.5 text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              <Send className="size-3.5" />
            </button>
          </div>
        </div>
      )}

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
            const isOpen = expanded.has(c.id);
            const isArchived = archivados.has(c.id) || c.trabajado?.toLowerCase() === "descartado";
            const isCualified =
              cualificados.has(c.id) || c.trabajado?.toLowerCase() === "contactado";
            return (
              <article
                key={c.id}
                className={`rounded-lg border bg-card transition-colors ${
                  isArchived
                    ? "border-border opacity-60"
                    : isCualified
                      ? "border-success/40"
                      : "border-border hover:border-foreground/20"
                }`}
              >
                {/* Header tarjeta */}
                <header className="flex items-start justify-between gap-3 p-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/30 text-primary text-sm font-semibold">
                      {c.nombre.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {c.nombre || "Sin nombre"}
                        </span>
                        <CanalChip canal={canal} />
                        {isCualified && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-success bg-success/10 px-1.5 py-0.5 rounded">
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
                        className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full"
                      >
                        <Tag className="size-3" />
                        {cat}
                      </span>
                    ))}
                    {c.solicitud && (
                      <span className="text-[11px] text-muted-foreground italic">
                        “{c.solicitud.slice(0, 100)}
                        {c.solicitud.length > 100 ? "…" : ""}”
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
                      {isOpen ? (
                        <ChevronUp className="size-3" />
                      ) : (
                        <ChevronDown className="size-3" />
                      )}
                      {isOpen ? "Ocultar transcripción" : "Ver transcripción"}
                    </button>
                    {isOpen && (
                      <div className="mt-2 rounded-md bg-muted/40 border border-border p-3 max-h-96 overflow-auto">
                        <Transcripcion text={c.conversaciones} />
                      </div>
                    )}
                  </div>
                )}

                {/* Inmuebles mencionados en la conversación */}
                {mencionados.length > 0 && (
                  <div className="px-4 pb-3 border-t border-border pt-3">
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                      <MessageSquare className="size-3 text-primary" />
                      Inmuebles mencionados ({mencionados.length})
                      <span className="ml-auto text-[10px] text-muted-foreground font-normal">
                        {c.etapa === "Lead"
                          ? "Confirma el vínculo para mover a Clientes"
                          : "Referencias detectadas en la conversación"}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {mencionados.map((inm) => (
                        <MencionadoCard
                          key={inm.id}
                          inm={inm}
                          contactId={c.id}
                          clienteNombre={c.nombre}
                          readOnly={c.etapa !== "Lead"}
                          onVinculado={() => {
                            queryClient.invalidateQueries({ queryKey: ["ia-conversations-page"] });
                            queryClient.invalidateQueries({ queryKey: ["leads"] });
                            queryClient.invalidateQueries({ queryKey: ["clientes-page"] });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Matches de propiedades */}
                {c.matches.length > 0 && (
                  <div className="px-4 pb-3 border-t border-border pt-3">
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                      <Sparkles className="size-3 text-primary" />
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
                              {cleanRef(m.inmueble.ref)} · {m.inmueble.calle} {m.inmueble.numero}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              <MapPin className="size-3" />{" "}
                              {m.inmueble.barrio || m.inmueble.localidad}
                              <Euro className="size-3 ml-1" />
                              {moneyShort(m.inmueble.precioFinal ?? m.inmueble.precio)}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {m.razones.slice(0, 2).map((r, i) => (
                                <span
                                  key={i}
                                  className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded"
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

                {/* Panel respuesta WhatsApp */}
                {canal === "WhatsApp" && c.telefono && replyOpen.has(c.id) && (
                  <div className="px-4 py-3 border-t border-border">
                    <div className="flex gap-2 items-start">
                      <textarea
                        value={replyTexts[c.id] ?? ""}
                        onChange={(e) => setReplyTexts((p) => ({ ...p, [c.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            sendReply(c.id, c.telefono);
                          }
                        }}
                        placeholder={`Responder a ${c.nombre || c.telefono}…`}
                        rows={2}
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                      />
                      <button
                        type="button"
                        disabled={!replyTexts[c.id]?.trim() || replySending === c.id}
                        onClick={() => sendReply(c.id, c.telefono)}
                        className="h-9 px-3 rounded-lg text-white text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50 transition-opacity shrink-0"
                        style={{ backgroundColor: "#25D366" }}
                      >
                        {replySending === c.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Send className="size-3.5" />
                        )}
                        Enviar
                      </button>
                    </div>
                    <p className="mt-1.5 text-[10px] text-muted-foreground">
                      ⌘↵ para enviar · Solo disponible dentro de la ventana de 24 h de WhatsApp
                    </p>
                  </div>
                )}

                {/* Acciones */}
                <footer className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-border bg-muted/20 rounded-b-lg">
                  <span className="text-[11px] text-muted-foreground">
                    {c.etapa === "Lead" ? "Gestión manual del lead" : `Contacto · ${c.etapa}`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {routing === c.id ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[11px] text-muted-foreground mr-0.5">¿Tipo?</span>
                        <button
                          onClick={() => route(c.id, "captacion")}
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-info/10 text-info hover:bg-info/20 cursor-pointer transition-colors"
                        >
                          <Home className="size-3" /> Vende / valora
                        </button>
                        <button
                          onClick={() => route(c.id, "compra")}
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-warning/10 text-warning hover:bg-warning/20 cursor-pointer transition-colors"
                        >
                          <Search className="size-3" /> Busca comprar
                        </button>
                        <button
                          onClick={() => route(c.id, "alquiler")}
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-brand-green/10 text-brand-green hover:bg-brand-green/20 cursor-pointer transition-colors"
                        >
                          <KeyRound className="size-3" /> Busca alquilar
                        </button>
                        <button
                          onClick={() => setRouting(null)}
                          className="text-[11px] text-muted-foreground hover:text-foreground px-1.5 py-1 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      c.etapa === "Lead" &&
                      !isCualified && (
                        <button
                          onClick={() => setRouting(c.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-md bg-success/10 text-success hover:bg-success/20 cursor-pointer transition-colors"
                        >
                          <UserCheck className="size-3" /> Cualificar
                        </button>
                      )
                    )}
                    {c.etapa === "Lead" && (
                      <AsignarLeadButton clienteId={c.id} agentesActuales={c.agentesIds} />
                    )}

                    {canal === "WhatsApp" && c.telefono && (
                      <button
                        onClick={() => toggleReply(c.id)}
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-sm active:scale-95"
                        style={
                          replyOpen.has(c.id)
                            ? {
                                background: "transparent",
                                color: "#128C7E",
                                border: "1.5px solid #25D36640",
                              }
                            : {
                                background: "#25D366",
                                color: "#fff",
                                border: "1.5px solid #20bc5a",
                              }
                        }
                      >
                        <MessageSquare className="size-3.5" />
                        {replyOpen.has(c.id) ? "Cerrar respuesta" : "Responder por WhatsApp"}
                      </button>
                    )}
                    {c.etapa === "Lead" && !isArchived && (
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
