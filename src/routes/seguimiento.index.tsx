import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { RouteError } from "@/components/RouteError";
import { Input } from "@/components/ui/input";
import {
  MessageSquare,
  Phone,
  Mail,
  Users,
  FileText,
  Bot,
  Plus,
  X,
  Send,
  Search,
  Check,
  ChevronRight,
} from "lucide-react";

import { seguimientosQuery, agentesQuery } from "@/lib/queries";
import {
  createSeguimiento,
  searchContactos,
  type SeguimientoTipo,
} from "@/lib/seguimiento.functions";

export const Route = createFileRoute("/seguimiento/")({
  head: () => ({
    meta: [
      { title: "Seguimiento · El Sol Grupo CRM" },
      {
        name: "description",
        content: "Registro de acciones comerciales: llamadas, WhatsApp, emails, visitas y notas.",
      },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(seguimientosQuery).catch(() => {});
    context.queryClient.ensureQueryData(agentesQuery).catch(() => {});
  },
  component: SeguimientoPage,
  pendingComponent: () => (
    <AppShell title="Seguimiento">
      <div className="text-sm text-muted-foreground py-10 text-center">Cargando seguimiento…</div>
    </AppShell>
  ),
  errorComponent: ({ error }) => (
    <AppShell title="Seguimiento">
      <RouteError error={error} />
    </AppShell>
  ),
});

const TIPOS: SeguimientoTipo[] = ["Llamada", "WhatsApp", "Email", "Visita", "Nota", "SilvIA"];

const TIPO_ICONS: Record<SeguimientoTipo, typeof Phone> = {
  Llamada: Phone,
  WhatsApp: MessageSquare,
  Email: Mail,
  Visita: Users,
  Nota: FileText,
  SilvIA: Bot,
};

const TIPO_COLORS: Record<SeguimientoTipo, string> = {
  Llamada: "bg-info/10 text-info",
  WhatsApp: "bg-success/10 text-success",
  Email: "bg-info/10 text-info",
  Visita: "bg-warning/10 text-warning",
  Nota: "bg-zinc-500/10 text-zinc-500",
  SilvIA: "bg-primary/10 text-primary",
};

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  } catch {
    return s.slice(0, 10);
  }
}

function SeguimientoPage() {
  const { data } = useSuspenseQuery(seguimientosQuery);
  const { data: agData } = useSuspenseQuery(agentesQuery);
  const qc = useQueryClient();

  const [tipoFilter, setTipoFilter] = useState<SeguimientoTipo | "Todos">("Todos");
  const [agenteFilter, setAgenteFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formQ, setFormQ] = useState("");
  const [formContact, setFormContact] = useState<{ id: string; nombre: string } | null>(null);
  const [formTipo, setFormTipo] = useState<SeguimientoTipo>("Llamada");
  const [formTexto, setFormTexto] = useState("");

  const createFn = useServerFn(createSeguimiento);
  const searchFn = useServerFn(searchContactos);

  const { data: searchResults } = useQuery({
    queryKey: ["contact-search", formQ],
    queryFn: () => searchFn({ data: { q: formQ } }),
    enabled: formQ.length >= 2,
    staleTime: 10_000,
  });

  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          contactId: formContact!.id,
          tipo: formTipo,
          texto: formTexto.trim(),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seguimientos"] });
      toast.success("Seguimiento registrado");
      setShowForm(false);
      setFormContact(null);
      setFormQ("");
      setFormTipo("Llamada");
      setFormTexto("");
    },
    onError: (e: Error) => toast.error(e.message || "Error al registrar"),
  });

  const filtered = useMemo(() => {
    let rows = data.seguimientos;
    if (tipoFilter !== "Todos") rows = rows.filter((r) => r.tipo === tipoFilter);
    if (agenteFilter !== "todos") rows = rows.filter((r) => r.agenteId === agenteFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.contactoNombre.toLowerCase().includes(q) ||
          r.texto.toLowerCase().includes(q) ||
          (r.agenteNombre ?? "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [data.seguimientos, tipoFilter, agenteFilter, search]);

  const subtitle =
    tipoFilter !== "Todos" || agenteFilter !== "todos" || search
      ? `${filtered.length} de ${data.seguimientos.length} acciones`
      : `${data.seguimientos.length} acciones registradas`;

  return (
    <AppShell title="Seguimiento" subtitle={subtitle}>
      {/* Header bar */}
      <div className="flex items-center justify-end mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar contacto, nota…"
              className="pl-8 h-8 w-48 text-xs"
            />
          </div>
          <select
            value={agenteFilter}
            onChange={(e) => setAgenteFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="todos">Todos los agentes</option>
            {agData.agentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-input bg-background text-xs font-medium hover:bg-accent transition-colors"
          >
            {showForm ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
            {showForm ? "Cancelar" : "Nueva acción"}
          </button>
        </div>
      </div>

      {/* Tipo filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {(["Todos", ...TIPOS] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTipoFilter(t as SeguimientoTipo | "Todos")}
            className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${
              tipoFilter === t
                ? "bg-primary text-primary-foreground border-transparent"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* New seguimiento form */}
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-5 mb-5">
          <div className="space-y-4">
            {/* Contact picker */}
            <div>
              <p className="text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide font-medium">
                Contacto *
              </p>
              {formContact ? (
                <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Check className="size-3.5 text-primary" />
                    <span className="text-sm font-medium">{formContact.nombre}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFormContact(null);
                      setFormQ("");
                    }}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    cambiar
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    value={formQ}
                    onChange={(e) => setFormQ(e.target.value)}
                    placeholder="Buscar contacto por nombre…"
                    className="pl-8 text-sm"
                  />
                  {formQ.length >= 2 &&
                    searchResults?.contacts &&
                    searchResults.contacts.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md overflow-hidden z-20 shadow-xl">
                        {searchResults.contacts.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setFormContact(c);
                              setFormQ("");
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent transition-colors border-b border-border last:border-0 text-sm"
                          >
                            {c.nombre}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* Tipo chips */}
            <div>
              <p className="text-[11px] text-muted-foreground mb-1.5 uppercase tracking-wide font-medium">
                Tipo *
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TIPOS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFormTipo(t)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                      formTipo === t
                        ? "bg-primary text-primary-foreground border-transparent"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea */}
            <textarea
              value={formTexto}
              onChange={(e) => setFormTexto(e.target.value)}
              placeholder="Notas de la acción…"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none"
            />

            <button
              onClick={() => mut.mutate()}
              disabled={!formContact || !formTexto.trim() || mut.isPending}
              className="w-full h-9 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-opacity"
            >
              <Send className="size-3.5" />
              {mut.isPending ? "Registrando…" : "Registrar"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          Sin seguimientos para los filtros seleccionados.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
          {filtered.map((s) => {
            const Icon = TIPO_ICONS[s.tipo] ?? FileText;
            const color = TIPO_COLORS[s.tipo] ?? "bg-zinc-500/10 text-zinc-500";
            return (
              <div
                key={s.id}
                className="flex items-start gap-4 px-4 py-3.5 hover:bg-accent/30 transition-colors"
              >
                <div
                  className={`size-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${color}`}
                >
                  <Icon className="size-4" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{s.contactoNombre}</span>
                    <span className="text-[11px] text-muted-foreground">{s.tipo}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.texto}</p>
                  {s.agenteNombre && (
                    <p className="text-[11px] text-muted-foreground/70 mt-1">{s.agenteNombre}</p>
                  )}
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                  <span className="text-[11px] text-muted-foreground">{fmtDate(s.created_at)}</span>
                  <ChevronRight className="size-3.5 text-muted-foreground/40" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
