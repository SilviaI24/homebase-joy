import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { listClientes, type Cliente, type MiniInmueble } from "@/lib/clientes.functions";
import {
  Search,
  Mail,
  Phone,
  IdCard,
  Building2,
  Paperclip,
  X,
  FileText,
  Briefcase,
  Dog,
  ShieldCheck,
  CalendarDays,
  MapPin,
  ChevronRight,
  Euro,
  Sparkles,
  CheckCircle2,
  Clock,
  ArrowUpRight,
} from "lucide-react";
import {
  CanalChip,
  Transcripcion,
  inferCanal,
  hasSilviaConversation,
} from "@/components/silvia/conversation";

const clientesQuery = queryOptions({
  queryKey: ["clientes"],
  queryFn: () => listClientes(),
});

export const Route = createFileRoute("/clientes/")({
  validateSearch: (s: Record<string, unknown>) => ({
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Clientes · El Sol Grupo CRM" },
      { name: "description", content: "Gestión de clientes activos y potenciales." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(clientesQuery),
  component: ClientesPage,
  errorComponent: ({ error }) => (
    <AppShell title="Clientes">
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Error cargando clientes: {error.message}
      </div>
    </AppShell>
  ),
});

const ESTADO_TABS = ["Activos", "Todos"] as const;
type EstadoTab = (typeof ESTADO_TABS)[number];

const TIPO_TABS = [
  "Todos",
  "Propietario",
  "Comprador",
  "Interesado Propiedades",
  "Interesado alquiler",
  "Prospecciones",
] as const;

function tipoBadge(t: string) {
  const map: Record<string, string> = {
    Propietario: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    Comprador: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    "Interesado Propiedades": "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    "Interesado alquiler": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    Prospecciones: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
    "Anular prospección": "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  };
  const cls = map[t] ?? "bg-secondary text-secondary-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {t || "Sin tipo"}
    </span>
  );
}

function ClientesPage() {
  const { data } = useSuspenseQuery(clientesQuery);
  const router = useRouter();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<EstadoTab>("Activos");
  const [tipo, setTipo] = useState<string>("Todos");
  const [selectedId, setSelectedId] = useState<string | null>(search.id ?? null);

  // Deep-link desde SilvIA: ?id=... abre la ficha como overlay
  useEffect(() => {
    if (!search.id) return;
    const c = data.clientes.find((x) => x.id === search.id);
    if (!c) return;
    setSelectedId(c.id);
  }, [search.id, data.clientes]);

  function selectCliente(id: string | null) {
    setSelectedId(id);
    navigate({ search: { id: id ?? undefined }, replace: true });
  }


  const porEstado = useMemo(() => {
    const activos = data.clientes.filter((c) => c.activo);
    return { Activos: activos, Todos: data.clientes };
  }, [data.clientes]);

  const baseSet = porEstado[estado];

  const conteoTipos = useMemo(() => {
    const m: Record<string, number> = { Todos: baseSet.length };
    TIPO_TABS.forEach((t) => t !== "Todos" && (m[t] = 0));
    baseSet.forEach((c) => {
      if (m[c.tipo] != null) m[c.tipo]++;
    });
    return m;
  }, [baseSet]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return baseSet.filter((c) => {
      if (tipo !== "Todos" && c.tipo !== tipo) return false;
      if (!n) return true;
      return (
        c.nombre.toLowerCase().includes(n) ||
        c.email.toLowerCase().includes(n) ||
        c.telefono.toLowerCase().includes(n) ||
        c.dni.toLowerCase().includes(n) ||
        c.propiedadRefs.some((r) => r.toLowerCase().includes(n)) ||
        c.propiedadCalles.some((s) => s.toLowerCase().includes(n))
      );
    });
  }, [baseSet, q, tipo]);

  const selected = useMemo(
    () => data.clientes.find((c) => c.id === selectedId) ?? null,
    [data.clientes, selectedId],
  );

  return (
    <AppShell title="Clientes">
      {/* Estado tabs (segmented) */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
          {ESTADO_TABS.map((e) => {
            const active = estado === e;
            const count = porEstado[e].length;
            return (
              <button
                key={e}
                onClick={() => {
                  setEstado(e);
                  setTipo("Todos");
                }}
                className={`px-3 h-8 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/70 hover:bg-accent"
                }`}
              >
                {e === "Activos" && <CheckCircle2 className="size-3.5" />}
                {e}
                <span className={`text-[10px] ${active ? "opacity-80" : "text-muted-foreground"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 min-w-[220px] max-w-sm ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, email, tel, DNI, ref…"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          onClick={() => router.invalidate()}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent"
        >
          Refrescar
        </button>
      </div>

      {/* Descripcion del estado */}
      <p className="text-xs text-muted-foreground mb-3">
        {estado === "Activos" && "Propietarios con inmueble activo o prospecciones en curso. Los clientes potenciales se gestionan desde SilvIA."}
        {estado === "Todos" && "Todos los registros de clientes."}
      </p>

      {/* Tipo filter (secundario) */}
      <div className="flex flex-wrap gap-1.5 mb-4 border-b border-border pb-2">
        {TIPO_TABS.map((t) => {
          const active = tipo === t;
          const count = conteoTipos[t] ?? 0;
          if (t !== "Todos" && count === 0) return null;
          return (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`px-3 h-8 rounded-md text-xs font-medium transition-colors ${
                active ? "bg-accent text-foreground" : "text-foreground/60 hover:bg-accent/60"
              }`}
            >
              {t}
              <span className="ml-1.5 text-[10px] text-muted-foreground">{count}</span>
            </button>
          );
        })}
        <div className="ml-auto text-xs text-muted-foreground self-center">
          {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Contacto</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium hidden md:table-cell">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const active = c.id === selectedId;
                const hasSilvia = hasSilviaConversation(c);
                return (
                  <tr
                    key={c.id}
                    onClick={() => selectCliente(c.id)}
                    className={`border-t border-border cursor-pointer hover:bg-accent/40 ${
                      active ? "bg-accent/60" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-medium">
                      <div className="flex items-center gap-2">
                        <span className="truncate">{c.nombre || "—"}</span>
                        {hasSilvia && (
                          <Link
                            to="/silvia"
                            onClick={(e) => e.stopPropagation()}
                            title="Ver conversación con Silvia"
                            className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-400 px-1.5 py-0.5 hover:bg-violet-500/20"
                          >
                            <Sparkles className="size-2.5" /> SilvIA
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">{tipoBadge(c.tipo)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      <div className="flex flex-col gap-0.5">
                        {c.telefono && <span>{c.telefono}</span>}
                        {c.email && <span className="truncate max-w-[180px]">{c.email}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {c.activo ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="size-3.5" />
                          {c.inmueblesActivos.length} activo{c.inmueblesActivos.length !== 1 ? "s" : ""}
                        </span>
                      ) : c.matches.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400">
                          <Sparkles className="size-3.5" />
                          {c.matches.length} match
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell truncate max-w-[260px]">
                      {c.motivo || "—"}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    Sin resultados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && selectCliente(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 overflow-y-auto">
          {selected && <ClienteDetalle cliente={selected} />}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

function estatusClase(estatus: string) {
  const map: Record<string, string> = {
    Activo: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    Reservado: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    Vendido: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    Alquilado: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    Baja: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
    Prospección: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  };
  return map[estatus] ?? "bg-secondary text-secondary-foreground";
}

function InmuebleCard({ p }: { p: MiniInmueble }) {
  return (
    <Link
      to="/inmuebles/$id"
      params={{ id: p.id }}
      className="group flex gap-3 rounded-xl border border-border bg-background p-3 hover:shadow-md hover:border-primary/30 transition-all"
    >
      <div className="shrink-0">
        {p.imagen ? (
          <img src={p.imagen} alt={p.calle || p.ref} className="h-20 w-28 rounded-lg object-cover" />
        ) : (
          <div className="h-20 w-28 rounded-lg bg-muted flex items-center justify-center">
            <Building2 className="size-6 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              #{p.ref || p.id}
            </span>
            {p.estatus && (
              <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${estatusClase(p.estatus)}`}>
                {p.estatus}
              </span>
            )}
            <span
              className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${
                p.esAlquiler
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
              }`}
            >
              {p.esAlquiler ? "Alquiler" : "Venta"}
            </span>
            <span className="text-[10px] text-muted-foreground">{p.categoria}</span>
          </div>
          <div className="text-sm font-semibold text-foreground truncate">
            {[p.calle, p.numero].filter(Boolean).join(" ") || "Sin dirección"}
          </div>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{[p.barrio, p.localidad].filter(Boolean).join(" · ")}</span>
          </div>
          {(p.precio ?? p.precioFinal) != null && (
            <div className="flex items-center gap-0.5 text-xs font-bold text-foreground shrink-0">
              <Euro className="size-3" />
              {(p.precioFinal ?? p.precio)!.toLocaleString("es-ES")}
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="size-4 text-muted-foreground" />
      </div>
    </Link>
  );
}

function ClienteDetalle({ cliente, onClose }: { cliente: Cliente; onClose: () => void }) {
  return (
    <aside className="rounded-lg border border-border bg-card sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-auto">
      <header className="flex items-start justify-between gap-2 p-4 border-b border-border">
        <div className="min-w-0">
          <h2 className="font-semibold text-base truncate">{cliente.nombre || "Sin nombre"}</h2>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {tipoBadge(cliente.tipo)}
            {cliente.activo ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-full px-2 py-0.5">
                <CheckCircle2 className="size-3" />
                Activo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 rounded-full px-2 py-0.5">
                <Clock className="size-3" />
                Potencial
              </span>
            )}
            {cliente.trabajado && (
              <span className="text-[10px] bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 rounded-full px-2 py-0.5">
                {cliente.trabajado}
              </span>
            )}
          </div>
          {cliente.motivoActivo && (
            <div className="text-[11px] text-muted-foreground mt-1">{cliente.motivoActivo}</div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-accent"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="p-4 space-y-5">
        <Section title="Contacto">
          <Row icon={<Phone className="size-3.5" />} label="Teléfono" value={cliente.telefono} />
          <Row icon={<Mail className="size-3.5" />} label="Email" value={cliente.email} />
          <Row icon={<IdCard className="size-3.5" />} label="DNI" value={cliente.dni} />
          <Row icon={<Briefcase className="size-3.5" />} label="Profesión" value={cliente.profesion} />
          <Row
            icon={<CalendarDays className="size-3.5" />}
            label="Fecha alta"
            value={cliente.fecha ? new Date(cliente.fecha).toLocaleDateString("es-ES") : ""}
          />
        </Section>

        {cliente.activo && (
          <Section title={`Propiedades activas (${cliente.inmueblesActivos.length})`}>
            <ul className="space-y-3">
              {cliente.inmueblesActivos.map((p) => (
                <li key={p.id}>
                  <InmuebleCard p={p} />
                </li>
              ))}
            </ul>
          </Section>
        )}

        {!cliente.activo && (
          <Section
            title={
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-violet-500" />
                Posibles matches ({cliente.matches.length})
              </span>
            }
          >
            {cliente.matches.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Sin inmuebles activos que encajen con sus intereses
                {cliente.categoria.length > 0 ? ` (${cliente.categoria.join(", ")})` : ""}.
              </p>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Inmuebles activos que encajan con sus intereses.
                </p>
                <ul className="space-y-3">
                  {cliente.matches.map((m) => (
                    <li key={m.inmueble.id} className="space-y-1.5">
                      <InmuebleCard p={m.inmueble} />
                      <div className="flex flex-wrap gap-1 pl-1">
                        {m.razones.map((r, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 px-2 py-0.5"
                          >
                            <Sparkles className="size-2.5" />
                            {r}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Section>
        )}

        {hasSilviaConversation(cliente) && (
          <Section
            title={
              <span className="flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-violet-500" />
                Conversación con Silvia
                <CanalChip canal={inferCanal(cliente)} />
                <Link
                  to="/silvia"
                  className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-violet-700 dark:text-violet-400 hover:underline"
                >
                  Abrir en SilvIA <ArrowUpRight className="size-3" />
                </Link>
              </span>
            }
          >
            {cliente.motivo && (
              <div className="rounded-md bg-muted/40 border border-border p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Motivo
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {cliente.motivo}
                </p>
              </div>
            )}
            {cliente.conversaciones && (
              <div className="rounded-md bg-muted/40 border border-border p-3 max-h-96 overflow-auto">
                <Transcripcion text={cliente.conversaciones} />
              </div>
            )}
          </Section>
        )}

        <Section title="Solicitud e intereses">
          <Row label="Solicitud" value={cliente.solicitud} multiline />
          <Row label="Sección" value={cliente.seccion} multiline />
          {cliente.categoria.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Categoría de interés
              </div>
              <div className="flex flex-wrap gap-1">
                {cliente.categoria.map((c) => (
                  <span
                    key={c}
                    className="text-[10px] rounded-full bg-secondary text-secondary-foreground px-2 py-0.5"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Section>

        {(cliente.contratoTrabajo || cliente.mascota || cliente.avalista) && (
          <Section title="Perfil alquiler">
            <Row icon={<ShieldCheck className="size-3.5" />} label="Contrato" value={cliente.contratoTrabajo} />
            <Row icon={<Dog className="size-3.5" />} label="Mascota" value={cliente.mascota} />
            <Row label="Avalista" value={cliente.avalista} />
          </Section>
        )}

        {(cliente.observaciones || cliente.feedback) && (
          <Section title="Notas internas">
            <Row label="Observaciones" value={cliente.observaciones} multiline />
            <Row label="Feedback comercial" value={cliente.feedback} multiline />
          </Section>
        )}

        <Section title={`Documentación (${cliente.attachments.length})`}>
          {cliente.attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin documentos adjuntos.</p>
          ) : (
            <ul className="space-y-1">
              {cliente.attachments.map((a, i) => (
                <li key={i}>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs rounded-md border border-border px-2 py-1.5 hover:bg-accent"
                  >
                    {a.type.startsWith("image/") ? (
                      <Paperclip className="size-3.5 text-muted-foreground" />
                    ) : (
                      <FileText className="size-3.5 text-muted-foreground" />
                    )}
                    <span className="truncate flex-1">{a.filename}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {cliente.agentesMails.length > 0 && (
          <Section title="Agentes asignados">
            <div className="flex flex-wrap gap-1">
              {cliente.agentesMails.map((m, i) => (
                <span
                  key={i}
                  className="text-[10px] rounded-full bg-muted text-foreground/80 px-2 py-0.5"
                >
                  {m}
                </span>
              ))}
            </div>
          </Section>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-foreground/70 uppercase tracking-wide mb-2">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  icon,
  multiline,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <div className={multiline ? "whitespace-pre-wrap text-foreground/90" : "text-foreground/90"}>
        {value}
      </div>
    </div>
  );
}
