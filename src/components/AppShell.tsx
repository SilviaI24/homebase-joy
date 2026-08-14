import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Building2,
  LayoutDashboard,
  Users,
  CalendarDays,
  KeyRound,
  Sparkles,
  Inbox,
  Hourglass,
  MessageSquare,
  Banknote,
  TrendingUp,
  Menu,
  Sun,
  Moon,
  X,
  Send,
  Mic,
  MicOff,
  Bell,
  CalendarCheck,
  AlertTriangle,
  Clock,
  UserPlus,
  LogOut,
  UserCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { prospectoQuery, notificationsQuery } from "@/lib/queries";
import { askSilvia } from "@/lib/silvia.functions";
import type { Notif } from "@/lib/notifications.functions";
import { useAuth } from "@/context/auth";

// ── Theme ─────────────────────────────────────────────────────────────────────

function useTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = stored ? stored === "dark" : prefersDark;
    setDark(initial);
    document.documentElement.classList.toggle("dark", initial);
  }, []);

  function toggle() {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  }

  return { dark, toggle };
}

// ── Nav config ────────────────────────────────────────────────────────────────

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard };
type NavGroup = { label?: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  { items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Cartera",
    items: [
      { to: "/inmuebles", label: "Ventas", icon: Building2 },
      { to: "/alquileres", label: "Alquiler", icon: KeyRound },
    ],
  },
  {
    label: "Contactos",
    items: [
      { to: "/mis-leads", label: "Leads", icon: Inbox },
      { to: "/prospectos", label: "Prospectos", icon: Hourglass },
      { to: "/clientes", label: "Clientes", icon: Users },
    ],
  },
  {
    label: "Gestión",
    items: [
      { to: "/visitas",      label: "Visitas",      icon: CalendarDays },
      { to: "/seguimiento",  label: "Seguimiento",  icon: MessageSquare },
      { to: "/operaciones",  label: "Operaciones",  icon: Banknote },
    ],
  },
  {
    label: "Análisis",
    items: [{ to: "/estadisticas", label: "Estadísticas", icon: TrendingUp }],
  },
  {
    label: "IA",
    items: [{ to: "/silvia", label: "SilvIA", icon: Sparkles }],
  },
  {
    label: "Cuenta",
    items: [{ to: "/perfil", label: "Mi perfil", icon: UserCircle }],
  },
];

const mobileNav: NavItem[] = [
  { to: "/",           label: "Dashboard",  icon: LayoutDashboard },
  { to: "/mis-leads",  label: "Leads",      icon: Inbox },
  { to: "/visitas",    label: "Visitas",    icon: CalendarDays },
  { to: "/seguimiento",label: "Acciones",   icon: MessageSquare },
  { to: "/silvia",     label: "SilvIA",     icon: Sparkles },
];

// ── Prospectos badge ──────────────────────────────────────────────────────────

function ProspectosBadge() {
  const { data } = useQuery(prospectoQuery);
  const count = data?.prospectos.length ?? 0;
  if (!count) return null;
  return (
    <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-violet-500 text-white text-[10px] font-bold leading-none px-1">
      {count > 9 ? "9+" : count}
    </span>
  );
}

// ── Notification bell ─────────────────────────────────────────────────────────

const TIPO_ICON: Record<Notif["tipo"], typeof Bell> = {
  visita_hoy: CalendarCheck,
  propiedad_estancada: AlertTriangle,
  reserva_larga: Clock,
  lead_nuevo: UserPlus,
};

const PRIO_COLOR: Record<Notif["prioridad"], string> = {
  urgente: "text-red-500",
  atencion: "text-amber-500",
  info: "text-blue-500",
};

const PRIO_LABEL: Record<Notif["prioridad"], string> = {
  urgente: "Hoy",
  atencion: "Atención",
  info: "Novedades",
};

function NotificationBell() {
  const { data } = useQuery(notificationsQuery);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const total = data?.total ?? 0;
  const urgente = data?.urgente ?? 0;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const notifs = data?.notifs ?? [];

  // Group by prioridad
  const groups: Array<{ key: Notif["prioridad"]; items: Notif[] }> = [];
  for (const prio of ["urgente", "atencion", "info"] as const) {
    const items = notifs.filter((n) => n.prioridad === prio);
    if (items.length) groups.push({ key: prio, items });
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notificaciones"
        className={`relative inline-flex items-center justify-center size-8 rounded-lg border transition-all duration-150 ${
          open
            ? "border-border bg-accent text-foreground"
            : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
      >
        <Bell className="size-[15px]" />
        {total > 0 && (
          <span
            className={`absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full text-white text-[9px] font-bold leading-none px-0.5 ${
              urgente > 0 ? "bg-red-500" : "bg-amber-500"
            }`}
          >
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-[300px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-2xl overflow-hidden z-50">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-sidebar/60">
            <span className="text-[12px] font-semibold text-foreground">Notificaciones</span>
            {total === 0 && (
              <span className="text-[10px] text-muted-foreground">Sin pendientes</span>
            )}
            {total > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {total} pendiente{total !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {total === 0 ? (
            <div className="py-8 text-center text-[11px] text-muted-foreground">Todo al día ✓</div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto">
              {groups.map(({ key, items }) => (
                <div key={key}>
                  <div
                    className={`px-4 py-1.5 text-[9px] uppercase tracking-[0.14em] font-semibold ${PRIO_COLOR[key]} bg-muted/40`}
                  >
                    {PRIO_LABEL[key]}
                  </div>
                  {items.map((n) => {
                    const Icon = TIPO_ICON[n.tipo];
                    return (
                      <Link
                        key={n.id}
                        to={n.href as "/"}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 px-4 py-2.5 hover:bg-accent/60 transition-colors border-b border-border/50 last:border-b-0"
                      >
                        <Icon className={`size-3.5 mt-0.5 shrink-0 ${PRIO_COLOR[key]}`} />
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium text-foreground leading-snug truncate">
                            {n.titulo}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {n.detalle}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SilvIA floating chat ──────────────────────────────────────────────────────

type ChatMsg = { role: "user" | "assistant"; content: string };

// Web Speech API — not yet in lib.dom.d.ts, minimal interface sufficient here
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

const SpeechRecognitionCtor =
  typeof window !== "undefined"
    ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
    : null;

function SilviaFloat() {
  const pathname = useRouterState({ select: s => s.location.pathname });
  const [open, setOpen] = useState(false);
  if (pathname.startsWith("/silvia")) return null;
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const askFn = useServerFn(askSilvia);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  async function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    const userMsg: ChatMsg = { role: "user", content: msg };
    const history = [...msgs, userMsg];
    setMsgs(history);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const { reply } = await askFn({ data: { messages: history } });
      setMsgs((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function toggleVoice() {
    if (!SpeechRecognitionCtor) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new SpeechRecognitionCtor();
    rec.lang = "es-ES";
    rec.continuous = false;
    rec.interimResults = true;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      setInput(transcript);
    };

    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="SilvIA"
        className={`fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 size-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
          open
            ? "bg-sidebar text-gold border border-gold/40 scale-95"
            : "gold-shimmer text-[oklch(0.12_0.025_165)] hover:scale-105"
        }`}
      >
        {open ? <X className="size-5" /> : <Sparkles className="size-5" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-36 right-4 md:bottom-20 md:right-6 z-40 w-[min(340px,calc(100vw-2rem))] flex flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
          style={{ height: "min(480px, calc(100dvh - 10rem))" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-sidebar/80 backdrop-blur-sm shrink-0">
            <div className="size-7 rounded-full gold-shimmer flex items-center justify-center shrink-0">
              <Sparkles className="size-3.5" style={{ color: "oklch(0.12 0.025 165)" }} />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-gold leading-tight">SilvIA</div>
              <div className="text-[10px] text-muted-foreground leading-none">
                IA · El Sol Grupo
              </div>
            </div>
            {msgs.length > 0 && (
              <button
                onClick={() => {
                  setMsgs([]);
                  setError(null);
                }}
                className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {msgs.length === 0 && (
              <div className="text-center text-[11px] text-muted-foreground pt-6 px-4 leading-relaxed">
                Hola, soy SilvIA. Puedo ayudarte a gestionar leads, buscar propiedades y ejecutar
                acciones en el CRM.
              </div>
            )}
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-gold/20 text-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
                  <div className="flex gap-1 items-center h-4">
                    <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
                    <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
                    <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            {error && (
              <div className="text-[11px] text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-border shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder={listening ? "Escuchando…" : "Escribe o habla…"}
                rows={1}
                disabled={loading}
                className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 max-h-24 overflow-y-auto"
                style={{ minHeight: "36px" }}
              />
              {SpeechRecognitionCtor && (
                <button
                  onClick={toggleVoice}
                  disabled={loading}
                  title={listening ? "Detener" : "Hablar"}
                  className={`size-9 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-40 border ${
                    listening
                      ? "bg-destructive/15 border-destructive/40 text-destructive animate-pulse"
                      : "bg-muted border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {listening ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                </button>
              )}
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="size-9 rounded-xl bg-gold/90 hover:bg-gold flex items-center justify-center shrink-0 disabled:opacity-40 transition-all"
              >
                <Send className="size-3.5" style={{ color: "oklch(0.12 0.025 165)" }} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Nav link class ─────────────────────────────────────────────────────────────

const LINK_CLS =
  "nav-link group flex items-center gap-2.5 px-3 py-[7px] text-sm rounded-lg " +
  "text-sidebar-foreground/45 " +
  "hover:bg-sidebar-accent/60 hover:text-sidebar-foreground/85 " +
  "transition-all duration-150 " +
  "[&.active]:text-gold [&.active]:font-medium [&.active]:bg-sidebar-accent/50";

// ── AppShell ──────────────────────────────────────────────────────────────────

// ── Sidebar content (shared desktop + mobile drawer) ─────────────────────────

function SidebarContent({ onLinkClick, dark, onThemeToggle }: { onLinkClick?: () => void; dark?: boolean; onThemeToggle?: () => void }) {
  return (
    <>
      {/* Logo */}
      <div className="px-4 py-4 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="size-8 rounded-xl gold-shimmer flex items-center justify-center text-[0.8rem] font-display font-bold shadow-md"
            style={{ color: "oklch(0.12 0.025 165)" }}
          >
            ES
          </div>
          <div>
            <div className="font-display font-semibold tracking-tight text-[13px] text-gold leading-tight">
              El Sol Grupo
            </div>
            <div className="text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/35 mt-0.5">
              CRM Inmobiliario
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 overflow-y-auto pt-3 space-y-3 md:space-y-5">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <div className="px-3 pb-1.5 flex items-center gap-2">
                <span className="text-[9px] uppercase tracking-[0.16em] text-sidebar-foreground/35 font-semibold">
                  {group.label}
                </span>
                <span className="flex-1 h-px bg-sidebar-border/60" />
              </div>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to as "/"}
                    activeOptions={{ exact: item.to === "/" }}
                    className={LINK_CLS}
                    onClick={onLinkClick}
                  >
                    <Icon className="size-[15px] shrink-0 opacity-70 group-[.active]:opacity-100" />
                    {item.label}
                    {item.to === "/prospectos" && <ProspectosBadge />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-sidebar-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Link
            to="/perfil"
            onClick={onLinkClick}
            className="text-[9px] uppercase tracking-[0.14em] text-sidebar-foreground/25 font-medium hover:text-sidebar-foreground/50 transition-colors"
          >
            v0.5
          </Link>
          {onThemeToggle && (
            <button
              onClick={onThemeToggle}
              title={dark ? "Modo claro" : "Modo oscuro"}
              className="inline-flex items-center justify-center size-6 rounded-md text-sidebar-foreground/30 hover:text-sidebar-foreground/60 hover:bg-sidebar-accent/40 transition-all"
            >
              {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </button>
          )}
        </div>
        <span className="size-1.5 rounded-full bg-emerald-500/60" title="Conectado" />
      </div>
    </>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { dark, toggle } = useTheme();
  const { signOut, user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background text-foreground">

      {/* ── Sidebar — desktop ── */}
      <aside className="hidden md:flex w-56 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0">
        <SidebarContent dark={dark} onThemeToggle={toggle} />
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-2xl transition-transform duration-300 ease-in-out ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Close button */}
        <button
          onClick={() => setDrawerOpen(false)}
          className="absolute top-3 right-3 size-7 flex items-center justify-center rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
          aria-label="Cerrar menú"
        >
          <X className="size-4" />
        </button>
        <SidebarContent onLinkClick={() => setDrawerOpen(false)} dark={dark} onThemeToggle={toggle} />
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header
          className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-card/95 backdrop-blur-sm px-4 md:px-6"
          style={{ boxShadow: "0 1px 0 0 var(--color-border), 0 2px 8px -4px oklch(0 0 0 / 0.06)" }}
        >
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="md:hidden inline-flex items-center justify-center size-8 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-150 shrink-0"
            aria-label="Abrir menú"
          >
            <Menu className="size-[15px]" />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="font-display text-base font-semibold tracking-tight truncate leading-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground truncate hidden sm:block mt-0.5 leading-none">
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {actions}
            <NotificationBell />
            <button
              onClick={toggle}
              title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              className="hidden sm:inline-flex items-center justify-center size-8 rounded-lg border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-all duration-150"
            >
              {dark ? <Sun className="size-[15px]" /> : <Moon className="size-[15px]" />}
            </button>
            <button
              onClick={signOut}
              title={`Cerrar sesión (${user?.email ?? ""})`}
              className="inline-flex items-center justify-center size-8 rounded-lg border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-150"
            >
              <LogOut className="size-[15px]" />
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-4 md:p-6 overflow-auto pb-[calc(1rem+3.5rem)] md:pb-6">
          {children}
        </div>
      </main>

      {/* ── Mobile bottom nav ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur-md border-t border-border flex items-stretch h-14">
        {mobileNav.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to as "/"}
              activeOptions={{ exact: item.to === "/" }}
              className="flex-1 flex flex-col items-center justify-center gap-1 text-muted-foreground [&.active]:text-gold transition-colors duration-150 py-1"
            >
              <Icon className="size-[18px]" />
              <span className="text-[9px] font-medium leading-none tracking-wide">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* ── SilvIA flotante (global) ── */}
      <SilviaFloat />
    </div>
  );
}
