import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { listClientes, type Cliente } from "@/lib/clientes.functions";
import { getInmueblesByIds, isAlquiler } from "@/lib/inmuebles.functions";
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
  Loader2,
  MapPin,
  ChevronRight,
  Euro,
} from "lucide-react";

const clientesQuery = queryOptions({
  queryKey: ["clientes"],
  queryFn: () => listClientes(),
});

export const Route = createFileRoute("/clientes/")({
  head: () => ({
    meta: [
      { title: "Clientes · El Sol Grupo CRM" },
      { name: "description", content: "Gestión de clientes: propietarios, compradores e interesados." },
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

const TIPOS_TABS = [
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
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<string>("Todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const conteo = useMemo(() => {
    const m: Record<string, number> = { Todos: data.clientes.length };
    TIPOS_TABS.forEach((t) => t !== "Todos" && (m[t] = 0));
    data.clientes.forEach((c) => {
      if (m[c.tipo] != null) m[c.tipo]++;
    });
    return m;
  }, [data.clientes]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return data.clientes.filter((c) => {
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
  }, [data.clientes, q, tipo]);

  const selected = useMemo(
    () => data.clientes.find((c) => c.id === selectedId) ?? null,
    [data.clientes, selectedId],
  );

  return (
    <AppShell title="Clientes">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, email, tel, DNI, ref…"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="ml-auto text-sm text-muted-foreground">
          {filtered.length} de {data.clientes.length}
        </div>
        <button
          onClick={() => router.invalidate()}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm hover:bg-accent"
        >
          Refrescar
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4 border-b border-border pb-2">
        {TIPOS_TABS.map((t) => {
          const active = tipo === t;
          const count = conteo[t] ?? 0;
          return (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`px-3 h-8 rounded-md text-xs font-medium transition-colors ${
                active ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-accent"
              }`}
            >
              {t}
              <span className={`ml-1.5 text-[10px] ${active ? "opacity-80" : "text-muted-foreground"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className={`grid gap-4 ${selected ? "lg:grid-cols-[1fr_420px]" : "grid-cols-1"}`}>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Contacto</th>
                  <th className="px-3 py-2 font-medium">Propiedades</th>
                  <th className="px-3 py-2 font-medium hidden md:table-cell">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const propCount =
                    c.propiedadIds.length +
                    c.inmuebleCompradorIds.length +
                    c.propiedadAlquilerIds.length +
                    c.inmueblesIds.length;
                  const active = c.id === selectedId;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={`border-t border-border cursor-pointer hover:bg-accent/40 ${
                        active ? "bg-accent/60" : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-medium">{c.nombre || "—"}</td>
                      <td className="px-3 py-2">{tipoBadge(c.tipo)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        <div className="flex flex-col gap-0.5">
                          {c.telefono && <span>{c.telefono}</span>}
                          {c.email && <span className="truncate max-w-[180px]">{c.email}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {propCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-foreground/80">
                            <Building2 className="size-3" />
                            {propCount}
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

        {selected && <ClienteDetalle cliente={selected} onClose={() => setSelectedId(null)} />}
      </div>
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

function ClienteDetalle({ cliente, onClose }: { cliente: Cliente; onClose: () => void }) {
  const fetchByIds = useServerFn(getInmueblesByIds);
  const allIds = useMemo(() => {
    const ids = new Set<string>();
    cliente.propiedadIds.forEach((id) => ids.add(id));
    cliente.inmuebleCompradorIds.forEach((id) => ids.add(id));
    cliente.propiedadAlquilerIds.forEach((id) => ids.add(id));
    cliente.inmueblesIds.forEach((id) => ids.add(id));
    return Array.from(ids);
  }, [cliente]);
  const { data: linkedData, isLoading: linkedLoading } = useQuery({
    queryKey: ["inmuebles", "byIds", allIds],
    queryFn: () => fetchByIds({ data: { ids: allIds } }),
    enabled: allIds.length > 0,
  });
  const propiedades = linkedData?.inmuebles ?? [];

  return (
    <aside className="rounded-lg border border-border bg-card sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-auto">
      <header className="flex items-start justify-between gap-2 p-4 border-b border-border">
        <div className="min-w-0">
          <h2 className="font-semibold text-base truncate">{cliente.nombre || "Sin nombre"}</h2>
          <div className="mt-1 flex items-center gap-2">
            {tipoBadge(cliente.tipo)}
            {cliente.trabajado && (
              <span className="text-[10px] bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 rounded-full px-2 py-0.5">
                {cliente.trabajado}
              </span>
            )}
          </div>
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

        <Section title={`Propiedades vinculadas (${propiedades.length})`}>
          {propiedades.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {linkedLoading ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" /> Cargando propiedades…
                </span>
              ) : (
                "Sin propiedades vinculadas."
              )}
            </p>
          ) : (
            <ul className="space-y-3">
              {propiedades.map((p) => (
                <li key={p.id}>
                  <Link
                    to="/inmuebles/$id"
                    params={{ id: p.id }}
                    className="group flex gap-3 rounded-xl border border-border bg-background p-3 hover:shadow-md hover:border-primary/30 transition-all"
                  >
                    <div className="shrink-0">
                      {p.imagen ? (
                        <img
                          src={p.imagen}
                          alt={p.calle || p.ref}
                          className="h-20 w-28 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="h-20 w-28 rounded-lg bg-muted flex items-center justify-center">
                          <Building2 className="size-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                            #{p.ref || p.id}
                          </span>
                          {p.estatus && (
                            <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${estatusClase(p.estatus)}`}>
                              {p.estatus}
                            </span>
                          )}
                          <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${isAlquiler(p.tipo) ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-blue-500/10 text-blue-600 dark:text-blue-400"}`}>
                            {isAlquiler(p.tipo) ? "Alquiler" : "Venta"}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-foreground truncate">
                          {[p.calle, p.numero].filter(Boolean).join(" ")}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="size-3.5" />
                          <span className="truncate">{[p.barrio, p.localidad].filter(Boolean).join(" · ")}</span>
                        </div>
                        {(p.precio ?? p.precioFinal) != null && (
                          <div className="flex items-center gap-0.5 text-xs font-bold text-foreground">
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
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Estado y solicitudes">
          <Row label="Motivo de llamada" value={cliente.motivo} multiline />
          <Row label="Solicitud" value={cliente.solicitud} multiline />
          <Row label="Sección" value={cliente.seccion} multiline />
          {cliente.categoria.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                Categoría
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

        {(cliente.conversaciones || cliente.observaciones || cliente.feedback) && (
          <Section title="Notas">
            <Row label="Observaciones" value={cliente.observaciones} multiline />
            <Row label="Conversaciones" value={cliente.conversaciones} multiline />
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

function Mini({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between text-xs rounded-md bg-muted/40 px-2 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{count}</span>
    </div>
  );
}
