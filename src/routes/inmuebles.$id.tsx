import { createFileRoute, Link, useRouter, notFound } from "@tanstack/react-router";
import {
  queryOptions,
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SafeImage } from "@/components/SafeImage";
import {
  getInmueble,
  
  listAgentes,
  listVisitasByInmueble,
  updateInmueble,
  ESTATUS_OPCIONES,
  PUBLICACION_OPCIONES,
  type Inmueble,
  type InmuebleDetalle,
} from "@/lib/inmuebles.functions";
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  MapPin,
  Phone,
  Mail,
  Save,
  Loader2,
  User,
} from "lucide-react";

// Build a detail placeholder from a list row so the page renders instantly.
function seedFromList(base: Inmueble): InmuebleDetalle {
  return {
    ...base,
    imagenes: base.imagen ? [base.imagen] : [],
    agentesIds: [],
    agentesNombres: [],
    propietarioIds: [],
    emailPropietario: "",
    certificacionEnergetica: "",
    anoConstruccion: "",
    gastosComunidad: "",
    calefaccion: "",
    orientacion: "",
    garaje: "",
    trastero: "",
    ascensor: "",
    armariosEmpotrados: "",
    terraza: "",
    balcon: "",
    planta: "",
    referenciaCatastral: "",
    honorarios: "",
    tipoExclusiva: "",
    notaria: "",
    observaciones: "",
    llaves: "",
    fechaInicio: null,
    fechaExclusiva: null,
    fechaFinExclusiva: null,
    fechaReserva: null,
    fechaEscritura: null,
  };
}

function findListSeed(qc: QueryClient, id: string): InmuebleDetalle | undefined {
  const list = qc.getQueryData<{ inmuebles: Inmueble[] }>(["inmuebles"]);
  const match = list?.inmuebles.find((i) => i.id === id);
  return match ? seedFromList(match) : undefined;
}

const inmuebleQuery = (qc: QueryClient, id: string) =>
  queryOptions({
    queryKey: ["inmueble", id],
    queryFn: () => getInmueble({ data: { id } }),
    // 1 min "fresh" so revisiting the same ficha doesn't refetch
    staleTime: 60_000,
    // Seed from list cache so the UI renders before the network resolves
    placeholderData: () => {
      const seed = findListSeed(qc, id);
      return seed ? { inmueble: seed } : undefined;
    },
  });

const agentesQuery = queryOptions({
  queryKey: ["agentes"],
  queryFn: () => listAgentes(),
  staleTime: 5 * 60_000,
});

const visitasQuery = (id: string) =>
  queryOptions({
    queryKey: ["visitas", "inmueble", id],
    queryFn: () => listVisitasByInmueble({ data: { id } }),
    staleTime: 60_000,
  });


export const Route = createFileRoute("/inmuebles/$id")({
  head: () => ({
    meta: [{ title: "Ficha de inmueble · El Sol Grupo CRM" }],
  }),
  // Non-blocking: kick off the detail fetch but don't await — placeholder
  // from the list cache renders immediately. Agentes are loaded on demand.
  loader: ({ params, context }) => {
    context.queryClient.prefetchQuery(inmuebleQuery(context.queryClient, params.id));
  },
  component: InmuebleDetail,
  errorComponent: ({ error }) => (
    <AppShell title="Inmueble">
      <BackLink />
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Error: {error.message}
      </div>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell title="Inmueble">
      <BackLink />
      <div className="text-muted-foreground">No se ha encontrado el inmueble.</div>
    </AppShell>
  ),
});

function BackLink() {
  return (
    <Link
      to="/inmuebles"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
    >
      <ArrowLeft className="size-4" /> Volver al listado
    </Link>
  );
}

function formatEuro(n: number | null) {
  if (n == null || n === 0) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}
function formatDate(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return s;
  }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-2 border-b border-border/50 last:border-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm mt-0.5">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`h-3 rounded bg-muted animate-pulse ${className}`} />;
}

function InmuebleDetail() {
  const { id } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const updateFn = useServerFn(updateInmueble);

  const detailQ = useQuery(inmuebleQuery(qc, id));

  // The query always resolves to either placeholder or fresh data after the
  // loader prefetch; treat absence as 404.
  if (!detailQ.data) {
    if (detailQ.isError) throw detailQ.error;
    if (!detailQ.isFetching) throw notFound();
    return (
      <AppShell title="Inmueble">
        <BackLink />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando ficha…
        </div>
      </AppShell>
    );
  }

  const inmueble = detailQ.data.inmueble;
  // True only while we're hydrating the placeholder seeded from the list.
  const isHydrating = detailQ.isPlaceholderData || (detailQ.isFetching && !detailQ.isFetched);
  const detailReady = !isHydrating;

  return (
    <DetailView
      inmueble={inmueble}
      detailReady={detailReady}
      onAfterSave={async () => {
        await qc.invalidateQueries({ queryKey: ["inmueble", id] });
        await qc.invalidateQueries({ queryKey: ["inmuebles"] });
        router.invalidate();
      }}
      mutationFn={(payload) => updateFn({ data: payload })}
      id={id}
    />
  );
}

function DetailView({
  inmueble,
  detailReady,
  onAfterSave,
  mutationFn,
  id,
}: {
  inmueble: InmuebleDetalle;
  detailReady: boolean;
  onAfterSave: () => Promise<void>;
  mutationFn: (
    payload: Parameters<typeof updateInmueble>[0]["data"],
  ) => Promise<unknown>;
  id: string;
}) {
  const [estatus, setEstatus] = useState(inmueble.estatus || "Activo");
  const [publicacion, setPublicacion] = useState(inmueble.publicacion || "SUBIR");
  const [precio, setPrecio] = useState<string>(inmueble.precio?.toString() ?? "");
  const [precioFinal, setPrecioFinal] = useState<string>(inmueble.precioFinal?.toString() ?? "");
  const [agentesIds, setAgentesIds] = useState<string[]>(inmueble.agentesIds);
  const [observaciones, setObservaciones] = useState(inmueble.observaciones);
  const [mainImg, setMainImg] = useState<string | null>(inmueble.imagen);

  // When fresh data arrives, re-sync the form fields that only exist in detail.
  useEffect(() => {
    if (detailReady) {
      setAgentesIds(inmueble.agentesIds);
      setObservaciones(inmueble.observaciones);
      if (!mainImg) setMainImg(inmueble.imagen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailReady, inmueble.agentesIds.join(","), inmueble.observaciones]);

  const mutation = useMutation({
    mutationFn,
    onSuccess: async () => {
      await onAfterSave();
    },
  });

  const onSave = () => {
    mutation.mutate({
      id,
      estatus,
      publicacion,
      precio: precio === "" ? null : Number(precio),
      precioFinal: precioFinal === "" ? null : Number(precioFinal),
      agentesIds,
      observaciones,
    });
  };

  const dirty =
    estatus !== inmueble.estatus ||
    publicacion !== inmueble.publicacion ||
    (precio === "" ? null : Number(precio)) !== inmueble.precio ||
    (precioFinal === "" ? null : Number(precioFinal)) !== inmueble.precioFinal ||
    observaciones !== inmueble.observaciones ||
    agentesIds.join(",") !== inmueble.agentesIds.join(",");

  return (
    <AppShell title={`Inmueble #${inmueble.ref || inmueble.id}`}>
      <BackLink />

      {!detailReady && (
        <div className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
          <Loader2 className="size-3 animate-spin" /> Actualizando datos…
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Galería */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="aspect-video">
              <SafeImage src={mainImg} alt={inmueble.calle || "Inmueble"} />
            </div>
            {detailReady && inmueble.imagenes.length > 1 && (
              <div className="p-2 flex gap-2 overflow-x-auto border-t border-border">
                {inmueble.imagenes.map((src) => (
                  <button
                    key={src}
                    onClick={() => setMainImg(src)}
                    className={`shrink-0 size-16 rounded overflow-hidden border-2 transition-colors ${
                      mainImg === src ? "border-primary" : "border-border hover:border-muted-foreground/40"
                    }`}
                  >
                    <SafeImage src={src} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cabecera (siempre disponible desde lista) */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold">
                  {inmueble.calle || "Sin dirección"} {inmueble.numero}
                </h2>
                <div className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                  <MapPin className="size-3.5" />
                  {[inmueble.barrio, inmueble.localidad].filter(Boolean).join(", ") || "—"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold text-primary">{formatEuro(inmueble.precio)}</div>
                {inmueble.precioFinal ? (
                  <div className="text-xs text-muted-foreground">Final: {formatEuro(inmueble.precioFinal)}</div>
                ) : null}
              </div>
            </div>
            {detailReady ? (
              inmueble.descripcion && (
                <p className="mt-4 text-sm leading-relaxed whitespace-pre-line text-foreground/90">
                  {inmueble.descripcion}
                </p>
              )
            ) : (
              <div className="mt-4 space-y-2">
                <SkeletonLine className="w-full" />
                <SkeletonLine className="w-11/12" />
                <SkeletonLine className="w-3/4" />
              </div>
            )}
          </div>

          {/* Características */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Características</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6">
              <Field label="Tipo" value={inmueble.tipo} />
              <Field label="Habitaciones" value={inmueble.habitaciones} />
              <Field label="Baños" value={inmueble.banos} />
              <Field label="Superficie" value={inmueble.superficie ? `${inmueble.superficie} m²` : ""} />
              {detailReady && (
                <>
                  <Field label="Planta" value={inmueble.planta} />
                  <Field label="Estado" value={inmueble.estado} />
                  <Field label="Año construcción" value={inmueble.anoConstruccion} />
                  <Field label="Cert. energética" value={inmueble.certificacionEnergetica} />
                  <Field label="Calefacción" value={inmueble.calefaccion} />
                  <Field label="Orientación" value={inmueble.orientacion} />
                  <Field label="Garaje" value={inmueble.garaje} />
                  <Field label="Trastero" value={inmueble.trastero} />
                  <Field label="Ascensor" value={inmueble.ascensor} />
                  <Field label="Armarios" value={inmueble.armariosEmpotrados} />
                  <Field label="Terraza" value={inmueble.terraza} />
                  <Field label="Balcón" value={inmueble.balcon} />
                  <Field label="Gastos com." value={inmueble.gastosComunidad} />
                  <Field label="Ref. catastral" value={inmueble.referenciaCatastral} />
                </>
              )}
            </div>
          </div>

          {/* Historial / fechas — visible solo cuando hay datos */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Calendar className="size-4" /> Historial
            </h3>
            {detailReady ? (
              <>
                <ol className="relative border-l border-border ml-2 space-y-4">
                  {[
                    { label: "Captación / inicio", date: inmueble.fechaInicio },
                    { label: "Autorización exclusiva", date: inmueble.fechaExclusiva },
                    { label: "Fin de exclusividad", date: inmueble.fechaFinExclusiva },
                    { label: "Reserva", date: inmueble.fechaReserva },
                    { label: "Escritura", date: inmueble.fechaEscritura },
                  ].map((ev) => (
                    <li key={ev.label} className="ml-4">
                      <span
                        className={`absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-background ${
                          ev.date ? "bg-primary" : "bg-muted"
                        }`}
                      />
                      <div className="text-sm font-medium">{ev.label}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(ev.date)}</div>
                    </li>
                  ))}
                </ol>
                {(inmueble.notaria || inmueble.honorarios || inmueble.tipoExclusiva || inmueble.llaves) && (
                  <div className="grid grid-cols-2 gap-x-6 mt-5 pt-4 border-t border-border">
                    <Field label="Notaría" value={inmueble.notaria} />
                    <Field label="Honorarios" value={inmueble.honorarios} />
                    <Field label="Tipo exclusiva" value={inmueble.tipoExclusiva} />
                    <Field label="Llaves" value={inmueble.llaves} />
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <SkeletonLine className="w-1/2" />
                <SkeletonLine className="w-2/3" />
                <SkeletonLine className="w-1/3" />
              </div>
            )}
          </div>

          {/* Visitas */}
          <VisitasPanel id={id} />
        </div>


        {/* Panel lateral */}
        <aside className="space-y-6">
          <ManagementPanel
            estatus={estatus}
            setEstatus={setEstatus}
            publicacion={publicacion}
            setPublicacion={setPublicacion}
            precio={precio}
            setPrecio={setPrecio}
            precioFinal={precioFinal}
            setPrecioFinal={setPrecioFinal}
            agentesIds={agentesIds}
            setAgentesIds={setAgentesIds}
            observaciones={observaciones}
            setObservaciones={setObservaciones}
            detailReady={detailReady}
            dirty={dirty}
            mutation={mutation}
            onSave={onSave}
          />

          {/* Propietario */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Propietario</h3>
            <Field label="Nombre" value={inmueble.propietario} />
            <Field
              label="Teléfono"
              value={
                inmueble.telefonoPropietario ? (
                  <a
                    href={`tel:${inmueble.telefonoPropietario}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <Phone className="size-3.5" />
                    {inmueble.telefonoPropietario}
                  </a>
                ) : (
                  ""
                )
              }
            />
            {detailReady && (
              <Field
                label="Email"
                value={
                  inmueble.emailPropietario ? (
                    <a
                      href={`mailto:${inmueble.emailPropietario}`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Mail className="size-3.5" />
                      {inmueble.emailPropietario}
                    </a>
                  ) : (
                    ""
                  )
                }
              />
            )}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function ManagementPanel(props: {
  estatus: string;
  setEstatus: (s: string) => void;
  publicacion: string;
  setPublicacion: (s: string) => void;
  precio: string;
  setPrecio: (s: string) => void;
  precioFinal: string;
  setPrecioFinal: (s: string) => void;
  agentesIds: string[];
  setAgentesIds: (fn: (prev: string[]) => string[]) => void;
  observaciones: string;
  setObservaciones: (s: string) => void;
  detailReady: boolean;
  dirty: boolean;
  mutation: { isPending: boolean; isError: boolean; isSuccess: boolean; error: unknown };
  onSave: () => void;
}) {
  const {
    estatus, setEstatus, publicacion, setPublicacion, precio, setPrecio,
    precioFinal, setPrecioFinal, agentesIds, setAgentesIds, observaciones,
    setObservaciones, detailReady, dirty, mutation, onSave,
  } = props;

  // Lazy load agentes only when the user expands the picker.
  const [agentesOpen, setAgentesOpen] = useState(false);
  const agentesQ = useQuery({ ...agentesQuery, enabled: agentesOpen });

  const selectedNames = useMemo(() => {
    const list = agentesQ.data?.agentes ?? [];
    return agentesIds
      .map((id) => list.find((a) => a.id === id)?.nombre)
      .filter(Boolean) as string[];
  }, [agentesIds, agentesQ.data]);

  return (
    <div className="rounded-lg border border-border bg-card p-5 sticky top-4">
      <h3 className="text-sm font-semibold mb-4">Gestión</h3>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Estatus</label>
          <select
            value={estatus}
            onChange={(e) => setEstatus(e.target.value)}
            className="mt-1 w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
          >
            {ESTATUS_OPCIONES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Publicación</label>
          <select
            value={publicacion}
            onChange={(e) => setPublicacion(e.target.value)}
            className="mt-1 w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
          >
            {PUBLICACION_OPCIONES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Precio (€)</label>
            <input
              type="number" min={0} value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              className="mt-1 w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Precio final (€)</label>
            <input
              type="number" min={0} value={precioFinal}
              onChange={(e) => setPrecioFinal(e.target.value)}
              className="mt-1 w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Agentes asignados</label>
          {!agentesOpen ? (
            <button
              type="button"
              disabled={!detailReady}
              onClick={() => setAgentesOpen(true)}
              className="mt-1 w-full text-left h-auto min-h-9 px-2 py-1.5 rounded-md border border-input bg-background text-sm hover:bg-accent disabled:opacity-50"
            >
              {detailReady
                ? agentesIds.length === 0
                  ? <span className="text-muted-foreground">Sin asignar — clic para editar</span>
                  : `${agentesIds.length} asignado${agentesIds.length === 1 ? "" : "s"} — editar`
                : <span className="text-muted-foreground">Esperando datos…</span>}
            </button>
          ) : agentesQ.isLoading ? (
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Cargando agentes…
            </div>
          ) : (
            <div className="mt-1 max-h-48 overflow-auto rounded-md border border-input bg-background p-2 space-y-1">
              {(agentesQ.data?.agentes ?? []).map((a) => {
                const checked = agentesIds.includes(a.id);
                return (
                  <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent rounded px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setAgentesIds((prev) =>
                          e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id),
                        );
                      }}
                    />
                    <span>{a.nombre}</span>
                  </label>
                );
              })}
            </div>
          )}
          {!agentesOpen && selectedNames.length > 0 && (
            <div className="text-[11px] text-muted-foreground mt-1 truncate">
              {selectedNames.join(", ")}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Observaciones</label>
          <textarea
            rows={3} value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            className="mt-1 w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm"
          />
        </div>

        <button
          onClick={onSave}
          disabled={!dirty || mutation.isPending || !detailReady}
          className="w-full h-9 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90"
        >
          <Save className="size-4" />
          {mutation.isPending ? "Guardando…" : "Guardar cambios"}
        </button>

        {mutation.isError && (
          <div className="text-xs text-destructive">{(mutation.error as Error).message}</div>
        )}
        {mutation.isSuccess && !dirty && (
          <div className="text-xs text-emerald-600 dark:text-emerald-400">Guardado ✓</div>
        )}
      </div>
    </div>
  );
}

function formatDateTime(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function estadoVisitaColor(estado: string) {
  const e = estado.toLowerCase();
  if (e.includes("confirm")) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (e.includes("cancel")) return "bg-destructive/15 text-destructive";
  if (e.includes("realiz")) return "bg-primary/15 text-primary";
  return "bg-muted text-muted-foreground";
}

function VisitasPanel({ id }: { id: string }) {
  const visitasQ = useQuery(visitasQuery(id));
  const visitas = visitasQ.data?.visitas ?? [];
  const now = Date.now();
  const futuras = visitas.filter((v) => v.fecha && new Date(v.fecha).getTime() >= now);
  const pasadas = visitas.filter((v) => !v.fecha || new Date(v.fecha).getTime() < now);

  const stats = useMemo(() => {
    const total = visitas.length;
    let confirmadas = 0, realizadas = 0, canceladas = 0, pendientes = 0;
    const clientesSet = new Set<string>();
    const agentesSet = new Set<string>();
    let lastPast: number | null = null;
    let nextFuture: number | null = null;
    const months: { label: string; count: number; key: string }[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 5; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      months.push({
        key: `${m.getFullYear()}-${m.getMonth()}`,
        label: m.toLocaleDateString("es-ES", { month: "short" }),
        count: 0,
      });
    }
    const idxByKey = new Map(months.map((m, i) => [m.key, i]));
    for (const v of visitas) {
      const e = v.estado.toLowerCase();
      if (e.includes("confirm")) confirmadas++;
      else if (e.includes("realiz")) realizadas++;
      else if (e.includes("cancel")) canceladas++;
      else if (e.includes("pend")) pendientes++;
      v.clientesNombres.forEach((c) => clientesSet.add(c));
      v.agentesMails.forEach((a) => agentesSet.add(a));
      if (v.fecha) {
        const t = new Date(v.fecha).getTime();
        if (t < now && (lastPast == null || t > lastPast)) lastPast = t;
        if (t >= now && (nextFuture == null || t < nextFuture)) nextFuture = t;
        const dt = new Date(v.fecha);
        const key = `${dt.getFullYear()}-${dt.getMonth()}`;
        const idx = idxByKey.get(key);
        if (idx != null) months[idx].count++;
      }
    }
    const efectivas = confirmadas + realizadas;
    const conversion = total > 0 ? Math.round((efectivas / total) * 100) : 0;
    const daysSince = lastPast != null ? Math.floor((now - lastPast) / 86400000) : null;
    const daysUntil = nextFuture != null ? Math.ceil((nextFuture - now) / 86400000) : null;
    const maxMonth = Math.max(1, ...months.map((m) => m.count));
    return {
      total, confirmadas, realizadas, canceladas, pendientes,
      clientes: clientesSet.size, agentes: agentesSet.size,
      conversion, efectivas, daysSince, daysUntil, months, maxMonth,
    };
  }, [visitas, now]);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <CalendarDays className="size-4" /> Visitas y actividad
        </h3>
        <span className="text-xs text-muted-foreground">
          {visitasQ.isLoading ? "Cargando…" : `${visitas.length} registro${visitas.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {visitasQ.isLoading ? (
        <div className="space-y-2">
          <SkeletonLine className="w-2/3" />
          <SkeletonLine className="w-1/2" />
        </div>
      ) : visitas.length === 0 ? (
        <div className="text-sm text-muted-foreground">Sin visitas registradas.</div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatBox label="Total" value={stats.total} />
            <StatBox label="Conversión" value={`${stats.conversion}%`} hint={`${stats.efectivas} efectivas`} />
            <StatBox label="Clientes" value={stats.clientes} />
            <StatBox label="Agentes" value={stats.agentes} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatBox label="Confirmadas" value={stats.confirmadas} tone="emerald" />
            <StatBox label="Realizadas" value={stats.realizadas} tone="primary" />
            <StatBox label="Pendientes" value={stats.pendientes} tone="muted" />
            <StatBox label="Canceladas" value={stats.canceladas} tone="destructive" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatBox
              label="Última visita"
              value={stats.daysSince != null ? `hace ${stats.daysSince}d` : "—"}
            />
            <StatBox
              label="Próxima visita"
              value={
                stats.daysUntil != null
                  ? stats.daysUntil === 0
                    ? "hoy"
                    : `en ${stats.daysUntil}d`
                  : "—"
              }
            />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
              Visitas últimos 6 meses
            </div>
            <div className="flex items-end gap-2 h-20">
              {stats.months.map((m) => (
                <div key={m.key} className="flex-1 flex flex-col items-center gap-1 h-full">
                  <div className="w-full flex-1 bg-muted/50 rounded-sm relative overflow-hidden">
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-primary/70 rounded-sm transition-all"
                      style={{ height: `${(m.count / stats.maxMonth) * 100}%` }}
                      title={`${m.count} visita${m.count === 1 ? "" : "s"}`}
                    />
                    {m.count > 0 && (
                      <div className="absolute top-0.5 left-0 right-0 text-center text-[10px] font-medium text-foreground/70">
                        {m.count}
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground capitalize">{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {futuras.length > 0 && (
            <VisitaList title="Próximas" visitas={futuras} />
          )}
          {pasadas.length > 0 && (
            <VisitaList title="Histórico" visitas={pasadas} muted />
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "emerald" | "primary" | "destructive" | "muted";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "primary"
      ? "text-primary"
      : tone === "destructive"
      ? "text-destructive"
      : tone === "muted"
      ? "text-muted-foreground"
      : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold leading-tight ${toneCls}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function VisitaList({
  title,
  visitas,
  muted = false,
}: {
  title: string;
  visitas: Array<{
    id: string;
    fecha: string | null;
    estado: string;
    comentarios: string;
    actividad: string;
    clientesNombres: string[];
    clientesTelefonos: string[];
    agentesMails: string[];
  }>;
  muted?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">{title}</div>
      <ul className="space-y-2">
        {visitas.map((v) => (
          <li
            key={v.id}
            className={`rounded-md border border-border p-3 ${muted ? "bg-muted/30" : "bg-background"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">{formatDateTime(v.fecha)}</div>
              {v.estado && (
                <span className={`text-[11px] px-2 py-0.5 rounded ${estadoVisitaColor(v.estado)}`}>
                  {v.estado}
                </span>
              )}
            </div>
            <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {v.clientesNombres.length > 0 && (
                <div className="flex items-center gap-1">
                  <User className="size-3" />
                  <span>{v.clientesNombres.join(", ")}</span>
                </div>
              )}
              {v.clientesTelefonos.length > 0 && (
                <div className="flex items-center gap-1">
                  <Phone className="size-3" />
                  <a
                    href={`tel:${v.clientesTelefonos[0]}`}
                    className="hover:text-primary"
                  >
                    {v.clientesTelefonos.join(", ")}
                  </a>
                </div>
              )}
              {v.agentesMails.length > 0 && (
                <div className="flex items-center gap-1 sm:col-span-2">
                  <Mail className="size-3" />
                  <span>{v.agentesMails.join(", ")}</span>
                </div>
              )}
              {v.actividad && (
                <div className="sm:col-span-2">
                  <span className="font-medium text-foreground/80">Actividad:</span> {v.actividad}
                </div>
              )}
            </div>
            {v.comentarios && (
              <div className="mt-2 text-xs whitespace-pre-line text-foreground/80">
                {v.comentarios}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
