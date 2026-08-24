import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/AppShell";
import { SectionTabs } from "@/components/SectionTabs";
import { EstatusInmuebleBadge } from "@/components/StatusBadge";
import { RouteError } from "@/components/RouteError";
import { SafeImage } from "@/components/SafeImage";
import { Pagination } from "@/components/pagination/Pagination";
import { NewInmuebleDialog } from "@/components/CreateDialogs";
import {
  Search,
  Building2,
  KeyRound,
  Euro,
  MapPin,
  Home,
  Globe,
  MessageSquare,
  UserRound,
  Phone,
  Mail,
  CheckCircle2,
  Clock,
  Plus,
  X,
  Loader2,
  Hourglass,
  AlertTriangle,
  TrendingDown,
  ExternalLink,
} from "lucide-react";
import {
  type Inmueble,
  type ProspectoUnificado,
  type ProspectoCanal,
} from "@/lib/inmuebles.functions";
import { activarProspecto, createProspectoManual } from "@/lib/mutations.functions";
import { inmueblesPageQuery, prospectoQuery, agentesQuery } from "@/lib/queries";
import { cleanRef } from "@/lib/format";

const PAGE_SIZE = 48;
const DAY_MS = 1000 * 60 * 60 * 24;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / DAY_MS);
}

function formatEuro(n: number | null): string {
  if (n == null || n === 0) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

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

type CarteraTab = "captacion" | "venta" | "alquiler" | "historico";

const TAB_CONFIG: Array<{ key: CarteraTab; label: string }> = [
  { key: "captacion", label: "Captación" },
  { key: "venta", label: "Venta" },
  { key: "alquiler", label: "Alquiler" },
  { key: "historico", label: "Histórico" },
];

const searchSchema = z.object({
  tab: z.enum(["captacion", "venta", "alquiler", "historico"]).optional(),
  page: z.number().min(1).optional(),
  q: z.string().optional(),
  categoria: z.string().optional(),
  agente: z.string().optional(),
});

export const Route = createFileRoute("/cartera/")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Cartera · El Sol Grupo CRM" },
      {
        name: "description",
        content: "Cartera unificada: captación, venta, alquiler e histórico.",
      },
    ],
  }),
  loader: ({ context, location }) => {
    const tab = (location.search as { tab?: string }).tab ?? "captacion";
    if (tab === "captacion") {
      return Promise.all([
        context.queryClient.ensureQueryData(prospectoQuery),
        context.queryClient.ensureQueryData(agentesQuery),
      ]);
    }
    // venta + alquiler + historico use inmueblesPageQuery (loaded on demand)
    return Promise.resolve();
  },
  component: CarteraPage,
  errorComponent: ({ error }) => (
    <AppShell title="Cartera">
      <RouteError error={error} />
    </AppShell>
  ),
});

function CarteraPage() {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab = rawSearch.tab ?? "captacion";

  function setTab(t: CarteraTab) {
    navigate({ search: () => ({ tab: t, page: 1 }) });
  }

  return (
    <AppShell title="Cartera">
      <SectionTabs tabs={TAB_CONFIG} value={tab} onChange={setTab} />

      {tab === "captacion" && <CaptacionTab />}
      {tab === "venta" && <VentaTab />}
      {tab === "alquiler" && <AlquilerTab />}
      {tab === "historico" && <HistoricoTab />}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CAPTACIÓN TAB
// ─────────────────────────────────────────────────────────────────────────────

const CANAL_META: Record<
  ProspectoCanal,
  { label: string; icon: typeof Globe; tabActive: string; badgeActive: string }
> = {
  Web: {
    label: "Web",
    icon: Globe,
    tabActive: "border-info text-info",
    badgeActive: "bg-info text-white",
  },
  SilvIA: {
    label: "SilvIA",
    icon: MessageSquare,
    tabActive: "border-gold text-[var(--gold)]",
    badgeActive: "bg-gold text-gold-foreground",
  },
  Directo: {
    label: "Directo",
    icon: UserRound,
    tabActive: "border-warning text-warning",
    badgeActive: "bg-warning text-warning-foreground",
  },
};
const CANALES: ProspectoCanal[] = ["Web", "SilvIA", "Directo"];

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

function CaptacionTab() {
  const { data: pData } = useSuspenseQuery(prospectoQuery);
  const { data: agData } = useSuspenseQuery(agentesQuery);
  const [canal, setCanal] = useState<ProspectoCanal>("Web");
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const qc = useQueryClient();
  const activarFn = useServerFn(activarProspecto);
  const crearFn = useServerFn(createProspectoManual);

  // Memoizado: `?? []` crea un array nuevo cada render si pData.prospectos es
  // undefined, lo que invalidaría los dos useMemo de más abajo que dependen
  // de `prospectos` aunque los datos reales no hayan cambiado.
  const prospectos: ProspectoUnificado[] = useMemo(
    () => pData.prospectos ?? [],
    [pData.prospectos],
  );
  const agentes = agData.agentes ?? [];

  const byCanal = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return prospectos.filter((p) => {
      if (p.canal !== canal) return false;
      if (!ql) return true;
      return (
        p.nombre.toLowerCase().includes(ql) ||
        p.telefono.toLowerCase().includes(ql) ||
        (p.inmueble?.calle ?? "").toLowerCase().includes(ql)
      );
    });
  }, [prospectos, canal, q]);

  const counts: Record<ProspectoCanal, number> = useMemo(() => {
    const m: Record<ProspectoCanal, number> = { Web: 0, SilvIA: 0, Directo: 0 };
    prospectos.forEach((p) => (m[p.canal] = (m[p.canal] ?? 0) + 1));
    return m;
  }, [prospectos]);

  // Form state
  const [form, setForm] = useState({
    nombre: "",
    telefono: "",
    email: "",
    tipo: "Piso",
    calle: "",
    numero: "",
    localidad: "Gijón",
    valorEstimado: "",
    agenteId: agentes[0]?.id ?? "",
    observaciones: "",
  });

  const crearMut = useMutation({
    mutationFn: crearFn,
    onSuccess: () => {
      toast.success("Prospecto creado");
      qc.invalidateQueries({ queryKey: ["prospectos"] });
      setShowForm(false);
      setForm((f) => ({ ...f, nombre: "", telefono: "", email: "", calle: "", observaciones: "" }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function activar(id: string) {
    try {
      await activarFn({ data: { contactId: id } });
      toast.success("Activado — la prospección pasa a propietario");
      qc.invalidateQueries({ queryKey: ["prospectos"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <div>
      {/* Canal tabs */}
      <div className="mb-5 flex items-center gap-0 overflow-x-auto">
        {CANALES.map((c) => {
          const meta = CANAL_META[c];
          const active = canal === c;
          const Icon = meta.icon;
          return (
            <button
              key={c}
              onClick={() => setCanal(c)}
              className={`flex items-center gap-2 px-4 py-2.5 border-b-2 text-sm font-medium transition-colors cursor-pointer ${
                active
                  ? meta.tabActive
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {meta.label}
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  active ? meta.badgeActive : "bg-muted text-muted-foreground"
                }`}
              >
                {counts[c]}
              </span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-48"
            />
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity"
          >
            <Plus className="size-4" /> Nueva captación directa
          </button>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="text-sm font-semibold">Nueva captación directa</span>
              <button onClick={() => setShowForm(false)}>
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {[
                { label: "Nombre *", key: "nombre", placeholder: "Nombre completo" },
                { label: "Teléfono *", key: "telefono", placeholder: "+34 600 000 000" },
                { label: "Email", key: "email", placeholder: "correo@ejemplo.com" },
                { label: "Calle", key: "calle", placeholder: "Calle Mayor" },
                { label: "Número", key: "numero", placeholder: "1A" },
                { label: "Localidad", key: "localidad", placeholder: "Gijón" },
                {
                  label: "Valor estimado (€)",
                  key: "valorEstimado",
                  placeholder: "180000",
                },
                { label: "Observaciones", key: "observaciones", placeholder: "Notas…" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    {label}
                  </label>
                  <input
                    value={(form as Record<string, string>)[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Tipo inmueble *
                </label>
                <select
                  value={form.tipo}
                  onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
                  className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
                >
                  {TIPOS_INMUEBLE.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              {agentes.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Agente
                  </label>
                  <select
                    value={form.agenteId}
                    onChange={(e) => setForm((f) => ({ ...f, agenteId: e.target.value }))}
                    className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
                  >
                    {agentes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-border">
              <button
                onClick={() => setShowForm(false)}
                className="h-9 px-4 rounded-md border border-border text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() =>
                  crearMut.mutate({
                    data: {
                      nombre: form.nombre,
                      telefono: form.telefono,
                      email: form.email,
                      tipo: form.tipo,
                      calle: form.calle,
                      numero: form.numero,
                      localidad: form.localidad,
                      precio: form.valorEstimado ? Number(form.valorEstimado) : undefined,
                      agentesIds: form.agenteId ? [form.agenteId] : undefined,
                    },
                  })
                }
                disabled={crearMut.isPending || !form.nombre || !form.telefono}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                {crearMut.isPending ? "Creando…" : "Crear prospecto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla prospectos */}
      {byCanal.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          <Hourglass className="mx-auto mb-2 size-6 opacity-50" />
          Sin prospectos de captación {canal.toLowerCase()}.
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="py-2.5 pl-4 pr-2 text-left font-medium">Propietario</th>
                <th className="py-2.5 px-2 text-left font-medium">Inmueble</th>
                <th className="py-2.5 px-2 text-left font-medium">Alta</th>
                <th className="py-2.5 pl-2 pr-4 text-right font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {byCanal.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border hover:bg-muted/40 transition-colors"
                >
                  <td className="py-3 pl-4 pr-2">
                    <div className="font-medium text-sm">{p.nombre || "Sin nombre"}</div>
                    <div className="flex flex-wrap gap-2 mt-0.5 text-[10px] text-muted-foreground">
                      {p.telefono && (
                        <a
                          href={`tel:${p.telefono}`}
                          className="inline-flex items-center gap-0.5 hover:text-foreground"
                        >
                          <Phone className="size-2.5" /> {p.telefono}
                        </a>
                      )}
                      {p.email && (
                        <a
                          href={`mailto:${p.email}`}
                          className="inline-flex items-center gap-0.5 hover:text-foreground"
                        >
                          <Mail className="size-2.5" /> {p.email}
                        </a>
                      )}
                    </div>
                    {p.motivo && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground italic line-clamp-1">
                        {p.motivo}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-2">
                    {p.inmueble ? (
                      <div>
                        <div className="text-xs font-medium">{p.inmueble.tipo}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {p.inmueble.calle} {p.inmueble.numero}, {p.inmueble.localidad}
                        </div>
                        {p.inmueble.precio && (
                          <div className="text-[10px] text-muted-foreground">
                            {formatEuro(p.inmueble.precio)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">Sin inmueble</span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-[11px] text-muted-foreground whitespace-nowrap">
                    {formatFecha(p.fechaAlta)}
                  </td>
                  <td className="py-3 pl-2 pr-4 text-right">
                    <button
                      onClick={() => activar(p.id)}
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-success/10 text-success hover:bg-success/20 transition-colors"
                    >
                      <CheckCircle2 className="size-3" /> Activar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VENTA TAB
// ─────────────────────────────────────────────────────────────────────────────

function InmuebleCard({ inm }: { inm: Inmueble }) {
  const dias = daysSince(inm.fechaInicio);
  return (
    <Link
      to="/inmuebles/$id"
      params={{ id: inm.id }}
      className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden hover:border-foreground/30 hover:shadow-sm transition-all"
    >
      <div className="aspect-[4/3] bg-muted overflow-hidden">
        <SafeImage src={inm.imagen} alt={inm.calle || inm.ref} />
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-muted-foreground">#{cleanRef(inm.ref)}</span>
          <EstatusInmuebleBadge estatus={inm.estatus} />
          {dias !== null && dias > 90 && (
            <span className="text-[10px] text-destructive/80 inline-flex items-center gap-0.5">
              <AlertTriangle className="size-2.5" /> {dias}d
            </span>
          )}
        </div>
        <div className="text-sm font-semibold text-foreground line-clamp-1">
          {inm.calle} {inm.numero}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-0.5">
            <MapPin className="size-3" />
            {inm.barrio || inm.localidad}
          </span>
        </div>
        <div className="mt-auto text-sm font-semibold text-primary">
          {formatEuro(inm.precioFinal ?? inm.precio)}
        </div>
      </div>
    </Link>
  );
}

function VentaTab() {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const page = rawSearch.page ?? 1;
  const q = rawSearch.q ?? "";
  const categoria = rawSearch.categoria ?? "Todas";

  const { data, isFetching } = useQuery(
    inmueblesPageQuery({
      page,
      pageSize: PAGE_SIZE,
      statuses: ["Activo", "Reservado"],
      q,
      categoria,
    }),
  );

  const inmuebles = data?.inmuebles ?? [];
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
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por ref, calle, barrio…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <NewInmuebleDialog />
        <span className="text-xs text-muted-foreground ml-auto">{total} inmuebles</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {inmuebles.map((inm) => (
          <InmuebleCard key={inm.id} inm={inm} />
        ))}
      </div>
      {inmuebles.length === 0 && !isFetching && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <Building2 className="mx-auto mb-2 size-6 opacity-50" />
          Sin inmuebles en venta.
        </div>
      )}
      <div className="mt-6">
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

// ─────────────────────────────────────────────────────────────────────────────
// ALQUILER TAB
// ─────────────────────────────────────────────────────────────────────────────

function AlquilerTab() {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const page = rawSearch.page ?? 1;
  const q = rawSearch.q ?? "";

  const { data, isFetching } = useQuery(
    inmueblesPageQuery({
      page,
      pageSize: PAGE_SIZE,
      statuses: ["Activo", "Reservado"],
      q,
      esAlquiler: true,
    }),
  );

  const alquileres = data?.inmuebles ?? [];
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
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por ref, calle, barrio…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{total} alquileres</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {alquileres.map((inm) => (
          <Link
            key={inm.id}
            to="/inmuebles/$id"
            params={{ id: inm.id }}
            className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden hover:border-foreground/30 hover:shadow-sm transition-all"
          >
            <div className="aspect-[4/3] bg-muted overflow-hidden">
              <SafeImage src={inm.imagen} alt={inm.calle || inm.ref} />
            </div>
            <div className="p-3 flex-1 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono text-muted-foreground">
                  #{cleanRef(inm.ref)}
                </span>
                <EstatusInmuebleBadge estatus={inm.estatus} />
              </div>
              <div className="text-sm font-semibold line-clamp-1">
                {inm.calle} {inm.numero}
              </div>
              <div className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5">
                <MapPin className="size-3" />
                {inm.barrio || inm.localidad}
              </div>
              <div className="mt-auto text-sm font-semibold text-primary">
                {formatEuro(inm.precioFinal ?? inm.precio)}
                <span className="text-[10px] text-muted-foreground font-normal">/mes</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
      {alquileres.length === 0 && !isFetching && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <KeyRound className="mx-auto mb-2 size-6 opacity-50" />
          Sin alquileres activos.
        </div>
      )}
      <div className="mt-6">
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

// ─────────────────────────────────────────────────────────────────────────────
// HISTÓRICO TAB
// ─────────────────────────────────────────────────────────────────────────────

function HistoricoTab() {
  const rawSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const page = rawSearch.page ?? 1;
  const q = rawSearch.q ?? "";

  const { data, isFetching } = useQuery(
    inmueblesPageQuery({
      page,
      pageSize: PAGE_SIZE,
      statuses: ["Vendido", "Alquilado", "Baja"],
      q,
    }),
  );

  const inmuebles = data?.inmuebles ?? [];
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
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por ref, calle…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{total} inmuebles</span>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
              <th className="py-2.5 pl-4 pr-2 text-left font-medium">Inmueble</th>
              <th className="py-2.5 px-2 text-left font-medium">Ref</th>
              <th className="py-2.5 px-2 text-left font-medium">Estado</th>
              <th className="py-2.5 pl-2 pr-4 text-right font-medium">Precio</th>
            </tr>
          </thead>
          <tbody>
            {inmuebles.length === 0 && !isFetching ? (
              <tr>
                <td colSpan={4} className="py-12 text-center text-sm text-muted-foreground">
                  <TrendingDown className="mx-auto mb-2 size-6 opacity-50" />
                  Sin inmuebles históricos.
                </td>
              </tr>
            ) : (
              inmuebles.map((inm) => (
                <tr
                  key={inm.id}
                  className="border-b border-border hover:bg-muted/40 transition-colors"
                >
                  <td className="py-3 pl-4 pr-2">
                    <div className="font-medium text-sm truncate max-w-[250px]">
                      {inm.calle} {inm.numero}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {inm.barrio || inm.localidad}
                    </div>
                  </td>
                  <td className="py-3 px-2 text-[11px] font-mono text-muted-foreground">
                    {cleanRef(inm.ref)}
                  </td>
                  <td className="py-3 px-2">
                    <EstatusInmuebleBadge estatus={inm.estatus} />
                  </td>
                  <td className="py-3 pl-2 pr-4 text-right text-sm font-semibold">
                    {formatEuro(inm.precioFinal ?? inm.precio)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
