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
import { NewVisitaDialog } from "@/components/CreateDialogs";

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
  BedDouble,
  Bath,
  Ruler,
  Hash,
  Check,
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

function diffDays(a: string | null, b: string | null) {
  if (!a || !b) return null;
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.max(0, Math.floor((d2 - d1) / 86400000));
}

function daysLabel(d: number | null) {
  if (d == null) return "—";
  return `${d} día${d === 1 ? "" : "s"}`;
}

function Field({
  label,
  value,
  hideEmpty = false,
}: {
  label: string;
  value: React.ReactNode;
  hideEmpty?: boolean;
}) {
  const isEmpty =
    value == null ||
    value === "" ||
    (typeof value === "number" && value === 0);
  if (hideEmpty && isEmpty) return null;
  return (
    <div className="py-2 border-b border-border/40 last:border-0">
      <div className="text-[10px] uppercase tracking-[0.08em] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="text-sm mt-1 font-medium text-foreground">
        {isEmpty ? <span className="text-muted-foreground/60 font-normal">—</span> : value}
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.08em] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold text-foreground mt-1 truncate">{value}</div>
    </div>
  );
}

function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`h-3 rounded bg-muted animate-pulse ${className}`} />;
}

function statusTint(estatus: string) {
  const map: Record<string, string> = {
    Activo: "bg-emerald-600 text-white",
    Reservado: "bg-amber-500 text-white",
    Vendido: "bg-blue-600 text-white",
    Alquilado: "bg-blue-600 text-white",
    Baja: "bg-muted text-muted-foreground",
    Prospección: "bg-secondary text-secondary-foreground",
  };
  return map[estatus] ?? "bg-secondary text-secondary-foreground";
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
          {/* Hero: imagen con overlay */}
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="relative aspect-[16/9] bg-muted">
              <SafeImage src={mainImg} alt={inmueble.calle || "Inmueble"} />
              {/* Top chips */}
              <div className="absolute inset-x-0 top-0 p-4 flex items-start justify-between pointer-events-none">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold shadow-sm ${statusTint(
                    inmueble.estatus,
                  )}`}
                >
                  <span className="size-1.5 rounded-full bg-current opacity-80" />
                  {inmueble.estatus || "—"}
                </span>
                {inmueble.ref && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold bg-background text-foreground border border-border/60 px-2 py-1 rounded-full shadow-sm">
                    <Hash className="size-3" />
                    {inmueble.ref}
                  </span>
                )}
              </div>
              {/* Bottom overlay */}
              <div className="absolute inset-x-0 bottom-0 px-6 pt-20 pb-5 bg-gradient-to-t from-black/85 via-black/55 to-transparent text-white">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-display text-2xl sm:text-3xl font-semibold leading-tight tracking-tight">
                      {inmueble.calle || "Sin dirección"}{" "}
                      {inmueble.numero && (
                        <span className="text-white/80 font-normal">{inmueble.numero}</span>
                      )}
                    </h2>
                    <div className="text-sm text-white/85 flex items-center gap-1.5 mt-1">
                      <MapPin className="size-3.5" />
                      {[inmueble.barrio, inmueble.localidad].filter(Boolean).join(", ") || "—"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display text-3xl sm:text-4xl font-bold leading-none tracking-tight tabular-nums">
                      {formatEuro(inmueble.precio)}
                    </div>
                    {inmueble.precioFinal ? (
                      <div className="text-[11px] text-white/75 mt-1">
                        Cerrado en {formatEuro(inmueble.precioFinal)}
                      </div>
                    ) : null}
                  </div>
                </div>
                {(inmueble.habitaciones || inmueble.banos || inmueble.superficie || inmueble.tipo) && (
                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/90">
                    {inmueble.tipo && (
                      <span className="inline-flex items-center gap-1.5 font-medium">{inmueble.tipo}</span>
                    )}
                    {inmueble.habitaciones && (
                      <span className="inline-flex items-center gap-1.5">
                        <BedDouble className="size-4" /> {inmueble.habitaciones} hab.
                      </span>
                    )}
                    {inmueble.banos && (
                      <span className="inline-flex items-center gap-1.5">
                        <Bath className="size-4" /> {inmueble.banos} baños
                      </span>
                    )}
                    {inmueble.superficie && (
                      <span className="inline-flex items-center gap-1.5">
                        <Ruler className="size-4" /> {inmueble.superficie} m²
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            {detailReady && inmueble.imagenes.length > 1 && (
              <div className="p-3 flex gap-2 overflow-x-auto border-t border-border bg-card">
                {inmueble.imagenes.map((src) => {
                  const active = mainImg === src;
                  return (
                    <button
                      key={src}
                      onClick={() => setMainImg(src)}
                      className={`shrink-0 size-16 rounded-md overflow-hidden border-2 transition-all ${
                        active
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-border hover:border-primary/60 opacity-80 hover:opacity-100"
                      }`}
                    >
                      <SafeImage src={src} alt="" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Descripción */}
          {(detailReady && inmueble.descripcion) || !detailReady ? (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h3 className="font-display text-base font-semibold mb-3">Descripción</h3>
              {detailReady ? (
                <p className="text-sm leading-relaxed whitespace-pre-line text-foreground/85">
                  {inmueble.descripcion}
                </p>
              ) : (
                <div className="space-y-2">
                  <SkeletonLine className="w-full" />
                  <SkeletonLine className="w-11/12" />
                  <SkeletonLine className="w-3/4" />
                </div>
              )}
            </div>
          ) : null}

          {/* Características */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="font-display text-base font-semibold mb-4">Características</h3>
            {(() => {
              const specs: { label: string; value: React.ReactNode }[] = [
                { label: "Tipo", value: inmueble.tipo },
                { label: "Habitaciones", value: inmueble.habitaciones },
                { label: "Baños", value: inmueble.banos },
                { label: "Superficie", value: inmueble.superficie ? `${inmueble.superficie} m²` : "" },
              ];
              if (detailReady) {
                specs.push(
                  { label: "Planta", value: inmueble.planta },
                  { label: "Estado", value: inmueble.estado },
                  { label: "Año construcción", value: inmueble.anoConstruccion },
                  { label: "Cert. energética", value: inmueble.certificacionEnergetica },
                  { label: "Calefacción", value: inmueble.calefaccion },
                  { label: "Orientación", value: inmueble.orientacion },
                  { label: "Garaje", value: inmueble.garaje },
                  { label: "Trastero", value: inmueble.trastero },
                  { label: "Ascensor", value: inmueble.ascensor },
                  { label: "Armarios", value: inmueble.armariosEmpotrados },
                  { label: "Terraza", value: inmueble.terraza },
                  { label: "Balcón", value: inmueble.balcon },
                  { label: "Gastos com.", value: inmueble.gastosComunidad },
                  { label: "Ref. catastral", value: inmueble.referenciaCatastral },
                );
              }
              const filled = specs.filter(
                (s) => s.value != null && s.value !== "" && s.value !== 0,
              );
              if (filled.length === 0) {
                return (
                  <div className="text-sm text-muted-foreground">
                    Sin características registradas.
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {filled.map((s) => (
                    <Spec key={s.label} label={s.label} value={s.value} />
                  ))}
                </div>
              );
            })()}
          </div>

          <TiempoMercadoPanel inmueble={inmueble} detailReady={detailReady} />

          {/* Historial / fechas — visible solo cuando hay datos */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="font-display text-base font-semibold mb-4 flex items-center gap-2">
              <Calendar className="size-4 text-primary" /> Historial
            </h3>
            {detailReady ? (
              <>
                <ol className="relative ml-3 space-y-5 before:absolute before:left-0 before:top-1 before:bottom-1 before:w-px before:bg-border">
                  {[
                    { label: "Captación / inicio", date: inmueble.fechaInicio },
                    { label: "Autorización exclusiva", date: inmueble.fechaExclusiva },
                    { label: "Fin de exclusividad", date: inmueble.fechaFinExclusiva },
                    { label: "Reserva", date: inmueble.fechaReserva },
                    { label: "Escritura", date: inmueble.fechaEscritura },
                  ].map((ev) => {
                    const done = !!ev.date;
                    return (
                      <li key={ev.label} className="relative pl-6">
                        <span
                          className={`absolute -left-[7px] top-0.5 inline-flex items-center justify-center size-4 rounded-full ring-2 ring-card ${
                            done ? "bg-primary text-primary-foreground" : "bg-muted border border-border"
                          }`}
                        >
                          {done && <Check className="size-2.5" />}
                        </span>
                        <div className={`text-sm font-medium ${done ? "text-foreground" : "text-muted-foreground"}`}>
                          {ev.label}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{formatDate(ev.date)}</div>
                      </li>
                    );
                  })}
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
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="font-display text-base font-semibold mb-4">Propietario</h3>
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

function TiempoMercadoPanel({
  inmueble,
  detailReady,
}: {
  inmueble: InmuebleDetalle;
  detailReady: boolean;
}) {
  const todayIso = new Date().toISOString();
  const diasEnMercado = diffDays(inmueble.fechaInicio, todayIso);

  const hitos: { label: string; from: string | null; to: string | null; tone?: Parameters<typeof StatBox>[0]["tone"] }[] = [
    { label: "Captación → Exclusiva", from: inmueble.fechaInicio, to: inmueble.fechaExclusiva },
    { label: "Exclusiva → Fin exclusividad", from: inmueble.fechaExclusiva, to: inmueble.fechaFinExclusiva },
    { label: "Inicio → Reserva", from: inmueble.fechaInicio, to: inmueble.fechaReserva },
    { label: "Reserva → Escritura", from: inmueble.fechaReserva, to: inmueble.fechaEscritura },
    { label: "Ciclo total (inicio → escritura)", from: inmueble.fechaInicio, to: inmueble.fechaEscritura, tone: "primary" },
  ];

  const completados = hitos.filter((h) => h.from && h.to);

  const statusTone: Parameters<typeof StatBox>[0]["tone"] =
    inmueble.estatus === "Vendido" || inmueble.estatus === "Alquilado"
      ? "emerald"
      : inmueble.estatus === "Reservado"
      ? "primary"
      : inmueble.estatus === "Baja"
      ? "destructive"
      : "default";

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="font-display text-base font-semibold mb-4">Tiempo en mercado</h3>

      {!detailReady ? (
        <div className="space-y-2">
          <SkeletonLine className="w-1/3" />
          <SkeletonLine className="w-1/2" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <StatBox
              label="Días desde alta"
              value={daysLabel(diasEnMercado)}
              tone={diasEnMercado != null && diasEnMercado > 180 ? "destructive" : statusTone}
              hint={inmueble.estatus}
            />
            <StatBox
              label="Estado actual"
              value={inmueble.estatus || "—"}
              tone={statusTone}
            />
          </div>

          {completados.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                Duración entre hitos
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {completados.map((h) => (
                  <StatBox
                    key={h.label}
                    label={h.label}
                    value={daysLabel(diffDays(h.from, h.to))}
                    tone={h.tone ?? "default"}
                    hint={`${formatDate(h.from)} → ${formatDate(h.to)}`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm sticky top-4">
      <h3 className="font-display text-base font-semibold mb-4">Gestión</h3>

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
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-base font-semibold flex items-center gap-2">
          <CalendarDays className="size-4" /> Visitas y actividad
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {visitasQ.isLoading ? "Cargando…" : `${visitas.length} registro${visitas.length === 1 ? "" : "s"}`}
          </span>
          <NewVisitaDialog defaultInmuebleId={id} />
        </div>
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
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "primary"
      ? "text-primary"
      : tone === "destructive"
      ? "text-destructive"
      : tone === "muted"
      ? "text-muted-foreground"
      : "text-foreground";
  const accent =
    tone === "emerald"
      ? "before:bg-emerald-500"
      : tone === "primary"
      ? "before:bg-primary"
      : tone === "destructive"
      ? "before:bg-destructive"
      : tone === "muted"
      ? "before:bg-muted-foreground/40"
      : "before:bg-border";
  return (
    <div
      className={`relative rounded-md border border-border bg-background px-3 py-2.5 overflow-hidden before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] ${accent}`}
    >
      <div className="text-[10px] uppercase tracking-[0.08em] font-medium text-muted-foreground">
        {label}
      </div>
      <div className={`text-lg font-display font-semibold leading-tight mt-0.5 tabular-nums ${toneCls}`}>
        {value}
      </div>
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
