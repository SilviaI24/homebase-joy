import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { RouteError } from "@/components/RouteError";
import {
  Globe,
  MessageSquare,
  UserRound,
  Phone,
  Mail,
  ExternalLink,
  CheckCircle2,
  Loader2,
  Search,
  Hourglass,
  Plus,
  X,
} from "lucide-react";

import { type ProspectoUnificado, type ProspectoCanal } from "@/lib/inmuebles.functions";
import { activarProspecto, createProspectoManual } from "@/lib/mutations.functions";
import { prospectoQuery, agentesQuery } from "@/lib/queries";

export const Route = createFileRoute("/prospectos/")({
  head: () => ({
    meta: [
      { title: "Prospectos · El Sol Grupo CRM" },
      { name: "description", content: "Captación de nuevos propietarios por canal." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(prospectoQuery);
    context.queryClient.ensureQueryData(agentesQuery);
  },
  component: ProspectosPage,
  errorComponent: ({ error }) => (
    <AppShell title="Prospectos">
      <RouteError error={error} />
    </AppShell>
  ),
});

const TIPOS_INMUEBLE = [
  "Piso",
  "Chalet",
  "Terreno",
  "Local",
  "Garaje",
  "Trastero",
  "Edificio",
  "Alquiler Piso",
  "Alquiler Chalet",
  "Alquiler Local",
  "Alquiler Oficina",
];

type CanalMeta = { label: string; icon: typeof Globe; tabActive: string; badgeActive: string };
const CANAL_META: Record<ProspectoCanal, CanalMeta> = {
  Web: {
    label: "Web",
    icon: Globe,
    tabActive: "border-violet-500 text-violet-700 dark:text-violet-300",
    badgeActive: "bg-violet-500 text-white",
  },
  SilvIA: {
    label: "SilvIA",
    icon: MessageSquare,
    tabActive: "border-blue-500 text-blue-700 dark:text-blue-300",
    badgeActive: "bg-blue-500 text-white",
  },
  Directo: {
    label: "Directo",
    icon: UserRound,
    tabActive: "border-amber-500 text-amber-700 dark:text-amber-300",
    badgeActive: "bg-amber-500 text-white",
  },
};
const CANALES: ProspectoCanal[] = ["Web", "SilvIA", "Directo"];

function formatFecha(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatEuro(n: number | null): string {
  if (!n) return "";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

type NuevoForm = {
  nombre: string;
  telefono: string;
  email: string;
  tipo: string;
  calle: string;
  numero: string;
  localidad: string;
  precio: string;
  superficie: string;
  habitaciones: string;
};
const FORM_EMPTY: NuevoForm = {
  nombre: "",
  telefono: "",
  email: "",
  tipo: "Piso",
  calle: "",
  numero: "",
  localidad: "",
  precio: "",
  superficie: "",
  habitaciones: "",
};

function ProspectosPage() {
  const { data } = useSuspenseQuery(prospectoQuery);
  const { data: agData } = useSuspenseQuery(agentesQuery);
  const prospectos = data.prospectos;
  const qc = useQueryClient();
  const activarFn = useServerFn(activarProspecto);
  const crearFn = useServerFn(createProspectoManual);
  const [tab, setTab] = useState<ProspectoCanal>("Web");
  const [q, setQ] = useState("");
  const [activating, setActivating] = useState<string | null>(null);
  const [showNuevo, setShowNuevo] = useState(false);
  const [form, setForm] = useState<NuevoForm>(FORM_EMPTY);
  const [agenteId, setAgenteId] = useState<string>("");

  const byCanal: Record<ProspectoCanal, ProspectoUnificado[]> = {
    Web: prospectos.filter((p) => p.canal === "Web"),
    SilvIA: prospectos.filter((p) => p.canal === "SilvIA"),
    Directo: prospectos.filter((p) => p.canal === "Directo"),
  };

  const current = byCanal[tab].filter((p) => {
    if (!q.trim()) return true;
    const ql = q.toLowerCase();
    return (
      p.nombre.toLowerCase().includes(ql) ||
      p.telefono.includes(ql) ||
      p.email.toLowerCase().includes(ql) ||
      (p.inmueble?.calle ?? "").toLowerCase().includes(ql) ||
      (p.inmueble?.localidad ?? "").toLowerCase().includes(ql)
    );
  });

  async function activar(p: ProspectoUnificado) {
    setActivating(p.id);
    try {
      await activarFn({ data: { contactId: p.id, propertyId: p.inmueble?.id } });
      await qc.invalidateQueries({ queryKey: ["prospectos"] });
      await qc.invalidateQueries({ queryKey: ["clientes"] });
      if (p.inmueble?.id) await qc.invalidateQueries({ queryKey: ["all-inmuebles"] });
    } finally {
      setActivating(null);
    }
  }

  const crearMut = useMutation({
    mutationFn: () =>
      crearFn({
        data: {
          nombre: form.nombre,
          telefono: form.telefono || undefined,
          email: form.email || undefined,
          tipo: form.tipo,
          calle: form.calle,
          numero: form.numero || undefined,
          localidad: form.localidad || undefined,
          precio: form.precio ? Number(form.precio) : undefined,
          superficie: form.superficie ? Number(form.superficie) : undefined,
          habitaciones: form.habitaciones ? Number(form.habitaciones) : undefined,
          agentesIds: agenteId ? [agenteId] : undefined,
        },
      }),
    onSuccess: async () => {
      toast.success("Captación directa registrada");
      await qc.invalidateQueries({ queryKey: ["prospectos"] });
      await qc.invalidateQueries({ queryKey: ["all-inmuebles"] });
      setForm(FORM_EMPTY);
      setAgenteId("");
      setShowNuevo(false);
      setTab("Directo");
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo crear"),
  });

  const meta = CANAL_META[tab];
  const Icon = meta.icon;

  const set =
    (k: keyof NuevoForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AppShell title="Prospectos" subtitle="Captación de nuevos propietarios">
      {/* Canal tabs */}
      <div className="border-b border-border mb-5 flex items-center justify-between gap-4">
        <nav className="flex gap-0.5">
          {CANALES.map((c) => {
            const m = CANAL_META[c];
            const CIcon = m.icon;
            const isActive = tab === c;
            return (
              <button
                key={c}
                onClick={() => {
                  setTab(c);
                  setQ("");
                }}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${isActive ? m.tabActive : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                <CIcon className="size-3.5 shrink-0" />
                {m.label}
                <span
                  className={`min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold leading-none px-1 transition-colors ${isActive ? m.badgeActive : "bg-muted text-muted-foreground"}`}
                >
                  {byCanal[c].length}
                </span>
              </button>
            );
          })}
        </nav>
        <button
          onClick={() => setShowNuevo(true)}
          className="mb-px shrink-0 inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="size-3.5" /> Nueva captación directa
        </button>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
        <Icon className="size-3.5 shrink-0" />
        {tab === "Web" && "Solicitudes llegadas desde el valorador online"}
        {tab === "SilvIA" && "Captados por SilvIA vía WhatsApp o teléfono"}
        {tab === "Directo" && "Presencial o añadido manualmente por un comercial"}
      </p>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por nombre, teléfono, dirección…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full h-9 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {current.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <Hourglass className="size-10 opacity-20" />
          <p className="text-sm">
            {q
              ? "Sin resultados para esa búsqueda."
              : `No hay prospectos ${meta.label.toLowerCase()} pendientes.`}
          </p>
          {!q && tab === "Directo" && (
            <button
              onClick={() => setShowNuevo(true)}
              className="mt-2 inline-flex items-center gap-1.5 px-3 h-8 rounded-md border border-border bg-card text-xs font-medium hover:bg-accent transition-colors"
            >
              <Plus className="size-3.5" /> Añadir captación manual
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    Propietario
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">
                    {tab === "Web" ? "Inmueble" : "Inmueble · Motivo"}
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground hidden lg:table-cell">
                    Llegado
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {current.map((p) => (
                  <tr key={p.id} className="bg-card hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{p.nombre}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.telefono || p.email || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {p.inmueble ? (
                        <>
                          <div className="font-medium text-foreground">
                            {p.inmueble.calle}
                            {p.inmueble.numero ? ` ${p.inmueble.numero}` : ""}
                            {p.inmueble.localidad ? `, ${p.inmueble.localidad}` : ""}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {[
                              p.inmueble.tipo,
                              p.inmueble.superficie && `${p.inmueble.superficie} m²`,
                              p.inmueble.habitaciones && `${p.inmueble.habitaciones} hab.`,
                              p.inmueble.precio && formatEuro(p.inmueble.precio),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">
                          {p.motivo || "Sin inmueble vinculado aún"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                      {formatFecha(p.fechaAlta)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {p.telefono && (
                          <a
                            href={`tel:${p.telefono}`}
                            title={`Llamar a ${p.nombre}`}
                            className="inline-flex items-center justify-center size-8 rounded-md border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                          >
                            <Phone className="size-3.5" />
                          </a>
                        )}
                        {p.email && (
                          <a
                            href={`mailto:${p.email}`}
                            title={`Email a ${p.nombre}`}
                            className="inline-flex items-center justify-center size-8 rounded-md border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                          >
                            <Mail className="size-3.5" />
                          </a>
                        )}
                        {p.inmueble && (
                          <Link
                            to="/inmuebles/$id"
                            params={{ id: p.inmueble.id }}
                            title="Ver ficha del inmueble"
                            className="inline-flex items-center justify-center size-8 rounded-md border border-border hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="size-3.5" />
                          </Link>
                        )}
                        <button
                          onClick={() => activar(p)}
                          disabled={activating === p.id}
                          title="Activar — incorporar al pipeline activo"
                          className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors text-xs font-medium disabled:opacity-50"
                        >
                          {activating === p.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="size-3.5" />
                          )}
                          <span className="hidden sm:inline">
                            {activating === p.id ? "…" : "Activar"}
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Dialog nueva captación directa ── */}
      {showNuevo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h2 className="text-sm font-semibold">Nueva captación directa</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Propietario contactado en persona o por teléfono
                </p>
              </div>
              <button
                onClick={() => {
                  setShowNuevo(false);
                  setForm(FORM_EMPTY);
                }}
                className="size-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                crearMut.mutate();
              }}
              className="p-5 space-y-4 max-h-[70vh] overflow-y-auto"
            >
              {/* Propietario */}
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-2">
                  Propietario
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <input
                    required
                    value={form.nombre}
                    onChange={set("nombre")}
                    placeholder="Nombre completo *"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={form.telefono}
                      onChange={set("telefono")}
                      placeholder="Teléfono"
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      value={form.email}
                      onChange={set("email")}
                      type="email"
                      placeholder="Email"
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>

              {/* Inmueble */}
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-2">
                  Inmueble
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      required
                      value={form.tipo}
                      onChange={set("tipo")}
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {TIPOS_INMUEBLE.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                    <input
                      value={form.localidad}
                      onChange={set("localidad")}
                      placeholder="Localidad"
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      required
                      value={form.calle}
                      onChange={set("calle")}
                      placeholder="Calle *"
                      className="col-span-2 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      value={form.numero}
                      onChange={set("numero")}
                      placeholder="Nº"
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={form.precio}
                      onChange={set("precio")}
                      type="number"
                      placeholder="Precio €"
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      value={form.superficie}
                      onChange={set("superficie")}
                      type="number"
                      placeholder="m²"
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      value={form.habitaciones}
                      onChange={set("habitaciones")}
                      type="number"
                      placeholder="Hab."
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>

              {/* Agente */}
              {agData.agentes.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-2">
                    Agente responsable
                  </p>
                  <select
                    value={agenteId}
                    onChange={(e) => setAgenteId(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Sin asignar</option>
                    {agData.agentes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowNuevo(false);
                    setForm(FORM_EMPTY);
                  }}
                  className="px-3 h-8 rounded-md text-xs text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={crearMut.isPending}
                  className="inline-flex items-center gap-1.5 px-4 h-8 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {crearMut.isPending && <Loader2 className="size-3.5 animate-spin" />}
                  Registrar captación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
