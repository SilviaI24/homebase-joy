import { createFileRoute, Link, useRouter, notFound } from "@tanstack/react-router";
import {
  queryOptions,
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionTabs } from "@/components/SectionTabs";
import { RouteError } from "@/components/RouteError";
import { NewVisitaDialog } from "@/components/CreateDialogs";

import { SafeImage } from "@/components/SafeImage";
import { SkeletonLine } from "@/components/inmueble-detail/SkeletonLine";
import { DocumentosPanel } from "@/components/inmueble-detail/DocumentosPanel";
import { ManagementPanel } from "@/components/inmueble-detail/ManagementPanel";
import {
  TiempoMercadoPanel,
  VisitasPanel,
} from "@/components/inmueble-detail/MercadoYVisitasPanel";
import { PhotoUpload, ImagenesReorder } from "@/components/inmueble-detail/PhotoComponents";
import { formatEuro, formatDate, statusTint } from "@/lib/inmueble-detail-format";
import {
  getInmueble,
  updateInmueble,
  deleteInmueble,
  type Inmueble,
  type InmuebleDetalle,
} from "@/lib/inmuebles.functions";
import {
  ArrowLeft,
  Calendar,
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
  Hourglass,
  X,
} from "lucide-react";
import type { Documento } from "@/lib/inmuebles.functions";
import { cleanRef } from "@/lib/format";

// Build a detail placeholder from a list row so the page renders instantly.
function seedFromList(base: Inmueble): InmuebleDetalle {
  return {
    ...base,
    imagenes: base.imagen ? [base.imagen] : [],
    imagenesAttachments: [],
    documentos: [],
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
    changelog: [],
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
      <RouteError error={error} />
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

function Field({
  label,
  value,
  hideEmpty = false,
}: {
  label: string;
  value: React.ReactNode;
  hideEmpty?: boolean;
}) {
  const isEmpty = value == null || value === "" || (typeof value === "number" && value === 0);
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

const ORIENTACION_OPTS = [
  "Norte",
  "Sur",
  "Este",
  "Oeste",
  "Noreste",
  "Noroeste",
  "Sureste",
  "Suroeste",
];

function OrientacionDetailSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [custom, setCustom] = useState(() => value !== "" && !ORIENTACION_OPTS.includes(value));
  if (custom) {
    return (
      <div className="flex gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 w-full h-8 px-2 rounded border border-input bg-background text-sm"
          placeholder="Escribe orientación…"
        />
        <button
          type="button"
          onClick={() => {
            setCustom(false);
            onChange("");
          }}
          className="h-8 px-2 rounded border border-input bg-background text-sm text-muted-foreground hover:bg-accent"
        >
          ✕
        </button>
      </div>
    );
  }
  return (
    <select
      value={ORIENTACION_OPTS.includes(value) ? value : ""}
      onChange={(e) => {
        if (e.target.value === "__custom__") {
          setCustom(true);
          onChange("");
        } else onChange(e.target.value);
      }}
      className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
    >
      <option value="">—</option>
      {ORIENTACION_OPTS.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value="__custom__">+ Personalizado…</option>
    </select>
  );
}

function EditSpecField({
  label,
  value,
  onChange,
  type = "text",
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "select" | "orientacion";
  options?: string[];
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em] font-medium text-muted-foreground mb-1">
        {label}
      </div>
      {type === "select" && options ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : type === "orientacion" ? (
        <OrientacionDetailSelect value={value} onChange={onChange} />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
        />
      )}
    </div>
  );
}

function InmuebleDetail() {
  const { id } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const updateFn = useServerFn(updateInmueble);
  const deleteFn = useServerFn(deleteInmueble);

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
      onDelete={async () => {
        await deleteFn({ data: { id } });
        await qc.invalidateQueries({ queryKey: ["inmuebles"] });
        router.navigate({ to: "/inmuebles" });
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
  onDelete,
  mutationFn,
  id,
}: {
  inmueble: InmuebleDetalle;
  detailReady: boolean;
  onAfterSave: () => Promise<void>;
  onDelete: () => Promise<void>;
  mutationFn: (payload: Parameters<typeof updateInmueble>[0]["data"]) => Promise<unknown>;
  id: string;
}) {
  const [estatus, setEstatus] = useState(inmueble.estatus || "Activo");
  const [publicacion, setPublicacion] = useState(inmueble.publicacion || "SUBIR");
  const [precio, setPrecio] = useState<string>(inmueble.precio?.toString() ?? "");
  const [precioFinal, setPrecioFinal] = useState<string>(inmueble.precioFinal?.toString() ?? "");
  const [agentesIds, setAgentesIds] = useState<string[]>(inmueble.agentesIds);
  const [observaciones, setObservaciones] = useState(inmueble.observaciones);
  const [descripcion, setDescripcion] = useState(inmueble.descripcion);
  const [imagenesOrder, setImagenesOrder] = useState<Array<{ id: string; url: string }>>(
    inmueble.imagenesAttachments,
  );
  const [mainImg, setMainImg] = useState<string | null>(inmueble.imagen);
  // Características
  const [habitaciones, setHabitaciones] = useState(inmueble.habitaciones);
  const [banos, setBanos] = useState(inmueble.banos);
  const [superficie, setSuperficie] = useState(inmueble.superficie);
  const [planta, setPlanta] = useState(inmueble.planta);
  const [estado, setEstado] = useState(inmueble.estado);
  const [anoConstruccion, setAnoConstruccion] = useState(inmueble.anoConstruccion);
  const [certificacionEnergetica, setCertificacionEnergetica] = useState(
    inmueble.certificacionEnergetica,
  );
  const [calefaccion, setCalefaccion] = useState(inmueble.calefaccion);
  const [orientacion, setOrientacion] = useState(inmueble.orientacion);
  const [garaje, setGaraje] = useState(inmueble.garaje);
  const [trastero, setTrastero] = useState(inmueble.trastero);
  const [ascensor, setAscensor] = useState(inmueble.ascensor);
  const [armariosEmpotrados, setArmariosEmpotrados] = useState(inmueble.armariosEmpotrados);
  const [terraza, setTerraza] = useState(inmueble.terraza);
  const [balcon, setBalcon] = useState(inmueble.balcon);
  const [gastosComunidad, setGastosComunidad] = useState(inmueble.gastosComunidad);
  const [referenciaCatastral, setReferenciaCatastral] = useState(inmueble.referenciaCatastral);
  // Historial
  const [fechaInicio, setFechaInicio] = useState(inmueble.fechaInicio ?? "");
  const [fechaExclusiva, setFechaExclusiva] = useState(inmueble.fechaExclusiva ?? "");
  const [fechaFinExclusiva, setFechaFinExclusiva] = useState(inmueble.fechaFinExclusiva ?? "");
  const [fechaReserva, setFechaReserva] = useState(inmueble.fechaReserva ?? "");
  const [fechaEscritura, setFechaEscritura] = useState(inmueble.fechaEscritura ?? "");
  // Operación
  const [honorarios, setHonorarios] = useState(inmueble.honorarios);
  const [tipoExclusiva, setTipoExclusiva] = useState(inmueble.tipoExclusiva);
  const [notaria, setNotaria] = useState(inmueble.notaria);
  const [llaves, setLlaves] = useState(inmueble.llaves);
  // Documentos
  const [documentos, setDocumentos] = useState<Documento[]>(inmueble.documentos ?? []);
  // Tab navigation
  const [tab, setTab] = useState<"detalles" | "historial" | "visitas" | "documentos">("detalles");
  // Autosave
  const [saveStatus, setSaveStatus] = useState<"idle" | "pending" | "saved" | "error">("idle");
  const isSavingRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Claves derivadas para el array de dependencias del useEffect de abajo —
  // extraídas a variables porque el linter no puede verificar de forma
  // estática una expresión compleja escrita directamente en ese array.
  const agentesIdsKey = inmueble.agentesIds.join(",");
  const imagenesAttachmentsKey = inmueble.imagenesAttachments.map((a) => a.id).join(",");
  const documentosKey = JSON.stringify(inmueble.documentos);

  // When fresh data arrives, re-sync the form fields that only exist in detail.
  useEffect(() => {
    if (isSavingRef.current) return;
    if (detailReady) {
      setAgentesIds(inmueble.agentesIds);
      setObservaciones(inmueble.observaciones);
      setDescripcion(inmueble.descripcion);
      setImagenesOrder(inmueble.imagenesAttachments);
      if (!mainImg) setMainImg(inmueble.imagen);
      setHabitaciones(inmueble.habitaciones);
      setBanos(inmueble.banos);
      setSuperficie(inmueble.superficie);
      setPlanta(inmueble.planta);
      setEstado(inmueble.estado);
      setAnoConstruccion(inmueble.anoConstruccion);
      setCertificacionEnergetica(inmueble.certificacionEnergetica);
      setCalefaccion(inmueble.calefaccion);
      setOrientacion(inmueble.orientacion);
      setGaraje(inmueble.garaje);
      setTrastero(inmueble.trastero);
      setAscensor(inmueble.ascensor);
      setArmariosEmpotrados(inmueble.armariosEmpotrados);
      setTerraza(inmueble.terraza);
      setBalcon(inmueble.balcon);
      setGastosComunidad(inmueble.gastosComunidad);
      setReferenciaCatastral(inmueble.referenciaCatastral);
      setFechaInicio(inmueble.fechaInicio ?? "");
      setFechaExclusiva(inmueble.fechaExclusiva ?? "");
      setFechaFinExclusiva(inmueble.fechaFinExclusiva ?? "");
      setFechaReserva(inmueble.fechaReserva ?? "");
      setFechaEscritura(inmueble.fechaEscritura ?? "");
      setHonorarios(inmueble.honorarios);
      setTipoExclusiva(inmueble.tipoExclusiva);
      setNotaria(inmueble.notaria);
      setLlaves(inmueble.llaves);
      setDocumentos(inmueble.documentos ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    detailReady,
    agentesIdsKey,
    inmueble.observaciones,
    inmueble.descripcion,
    imagenesAttachmentsKey,
    inmueble.habitaciones,
    inmueble.banos,
    inmueble.superficie,
    inmueble.planta,
    inmueble.estado,
    inmueble.anoConstruccion,
    inmueble.certificacionEnergetica,
    inmueble.calefaccion,
    inmueble.orientacion,
    inmueble.garaje,
    inmueble.trastero,
    inmueble.ascensor,
    inmueble.armariosEmpotrados,
    inmueble.terraza,
    inmueble.balcon,
    inmueble.gastosComunidad,
    inmueble.referenciaCatastral,
    inmueble.fechaInicio,
    inmueble.fechaExclusiva,
    inmueble.fechaFinExclusiva,
    inmueble.fechaReserva,
    inmueble.fechaEscritura,
    inmueble.honorarios,
    inmueble.tipoExclusiva,
    inmueble.notaria,
    inmueble.llaves,
    documentosKey,
  ]);

  const currentOrderKey = imagenesOrder.map((a) => a.id).join(",");
  const imagesDirty = imagenesAttachmentsKey !== currentOrderKey;

  const mutation = useMutation({
    mutationFn,
    onMutate: () => {
      isSavingRef.current = true;
      setSaveStatus("pending");
    },
    onSuccess: async () => {
      await onAfterSave();
      isSavingRef.current = false;
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    },
    onError: () => {
      isSavingRef.current = false;
      setSaveStatus("error");
    },
  });

  // buildPayload(includeManual): estatus, precioFinal y fechaEscritura (UX-04)
  // solo se incluyen cuando includeManual=true, es decir, en el guardado
  // explícito ("Guardar ahora"). El autosave de 2s (autoSave más abajo) nunca
  // los manda — updateInmueble trata cada campo como opcional (solo escribe
  // lo que llega), así que omitirlos aquí simplemente los deja intactos en
  // servidor hasta que el usuario confirme el cambio a mano. Evita, entre
  // otras cosas, que un cambio de estatus a Vendido/Alquilado se dispare solo
  // por el debounce y choque con trg_crm_preserve_closed_property_state.
  const buildPayload = (includeManual: boolean): Parameters<typeof updateInmueble>[0]["data"] => {
    const base: Parameters<typeof updateInmueble>[0]["data"] = {
      id,
      publicacion,
      precio: precio === "" ? null : Number(precio),
      agentesIds,
      observaciones,
      descripcion,
      ...(imagesDirty ? { imagenesAttachmentIds: imagenesOrder.map((a) => a.id) } : {}),
      habitaciones,
      banos,
      superficie,
      planta,
      estado,
      anoConstruccion,
      certificacionEnergetica,
      calefaccion,
      orientacion,
      garaje,
      trastero,
      ascensor,
      armariosEmpotrados,
      terraza,
      balcon,
      gastosComunidad,
      referenciaCatastral,
      fechaInicio: fechaInicio || null,
      fechaExclusiva: fechaExclusiva || null,
      fechaFinExclusiva: fechaFinExclusiva || null,
      fechaReserva: fechaReserva || null,
      honorarios,
      tipoExclusiva,
      notaria,
      llaves,
      documentos,
    };
    if (!includeManual) return base;
    return {
      ...base,
      estatus,
      precioFinal: precioFinal === "" ? null : Number(precioFinal),
      fechaEscritura: fechaEscritura || null,
    };
  };

  const onSaveRef = useRef<() => void>(() => {});
  const onSave = () => {
    mutation.mutate(buildPayload(true));
  };
  onSaveRef.current = onSave;

  const autoSaveRef = useRef<() => void>(() => {});
  const autoSave = () => {
    mutation.mutate(buildPayload(false));
  };
  autoSaveRef.current = autoSave;

  // UX-04: estatus, precioFinal y fechaEscritura quedan fuera del autosave —
  // solo se guardan con la acción explícita "Guardar ahora" (ver buildPayload
  // más arriba). dirtyManual los aísla para que el efecto de abajo no los
  // dispare por el debounce de 2s.
  const dirtyManual =
    estatus !== inmueble.estatus ||
    (precioFinal === "" ? null : Number(precioFinal)) !== inmueble.precioFinal ||
    fechaEscritura !== (inmueble.fechaEscritura ?? "");

  const dirtyAuto =
    publicacion !== inmueble.publicacion ||
    (precio === "" ? null : Number(precio)) !== inmueble.precio ||
    observaciones !== inmueble.observaciones ||
    descripcion !== inmueble.descripcion ||
    agentesIds.join(",") !== inmueble.agentesIds.join(",") ||
    imagesDirty ||
    habitaciones !== inmueble.habitaciones ||
    banos !== inmueble.banos ||
    superficie !== inmueble.superficie ||
    planta !== inmueble.planta ||
    estado !== inmueble.estado ||
    anoConstruccion !== inmueble.anoConstruccion ||
    certificacionEnergetica !== inmueble.certificacionEnergetica ||
    calefaccion !== inmueble.calefaccion ||
    orientacion !== inmueble.orientacion ||
    garaje !== inmueble.garaje ||
    trastero !== inmueble.trastero ||
    ascensor !== inmueble.ascensor ||
    armariosEmpotrados !== inmueble.armariosEmpotrados ||
    terraza !== inmueble.terraza ||
    balcon !== inmueble.balcon ||
    gastosComunidad !== inmueble.gastosComunidad ||
    referenciaCatastral !== inmueble.referenciaCatastral ||
    fechaInicio !== (inmueble.fechaInicio ?? "") ||
    fechaExclusiva !== (inmueble.fechaExclusiva ?? "") ||
    fechaFinExclusiva !== (inmueble.fechaFinExclusiva ?? "") ||
    fechaReserva !== (inmueble.fechaReserva ?? "") ||
    honorarios !== inmueble.honorarios ||
    tipoExclusiva !== inmueble.tipoExclusiva ||
    notaria !== inmueble.notaria ||
    llaves !== inmueble.llaves ||
    JSON.stringify(documentos) !== JSON.stringify(inmueble.documentos ?? []);

  const dirty = dirtyAuto || dirtyManual;

  useEffect(() => {
    if (!dirtyAuto || !detailReady) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      return;
    }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (!isSavingRef.current) autoSaveRef.current();
    }, 2000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [dirtyAuto, detailReady]);

  const pageTitle = inmueble.calle
    ? `${inmueble.calle}${inmueble.numero ? " " + inmueble.numero : ""}`
    : inmueble.ref
      ? `Ref #${cleanRef(inmueble.ref)}`
      : "Inmueble";
  const pageSubtitle =
    [inmueble.localidad, inmueble.ref ? `Ref #${cleanRef(inmueble.ref)}` : null]
      .filter(Boolean)
      .join(" · ") || undefined;

  return (
    <AppShell title={pageTitle} subtitle={pageSubtitle}>
      <BackLink />

      {!detailReady && (
        <div className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
          <Loader2 className="size-3 animate-spin" /> Actualizando datos…
        </div>
      )}

      {inmueble.publicacion === "PROSPECTO" && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-info/40 bg-info/10 px-4 py-3 text-sm text-info">
          <Hourglass className="size-4 mt-0.5 shrink-0 text-info" />
          <div>
            <p className="font-semibold">Inmueble prospecto — pendiente de revisión</p>
            <p className="text-xs mt-0.5 text-info/80">
              Este inmueble llegó desde el valorador web. El propietario solicitó ser contactado.
              Revisa los datos, contacta con él y cambia la publicación a <strong>SUBIR</strong> o{" "}
              <strong>PUBLICADO</strong> cuando corresponda.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hero: imagen con overlay */}
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="relative aspect-[4/3] bg-muted">
              <SafeImage
                src={mainImg}
                fallbackSrcs={imagenesOrder.filter((i) => i.url !== mainImg).map((i) => i.url)}
                alt={inmueble.calle || "Inmueble"}
              />
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
                    {cleanRef(inmueble.ref)}
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
                {(inmueble.habitaciones ||
                  inmueble.banos ||
                  inmueble.superficie ||
                  inmueble.tipo) && (
                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/90">
                    {inmueble.tipo && (
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        {inmueble.tipo}
                      </span>
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
            {detailReady && imagenesOrder.length > 1 && (
              <ImagenesReorder
                imagenes={imagenesOrder}
                mainImg={mainImg}
                onSetMain={setMainImg}
                onReorder={setImagenesOrder}
              />
            )}
            {detailReady && (
              <PhotoUpload
                propertyId={id}
                onUploaded={(url) => {
                  const newItem = { id: url, url };
                  setImagenesOrder((prev) => [...prev, newItem]);
                  if (!mainImg) setMainImg(url);
                }}
              />
            )}
          </div>

          <SectionTabs
            tabs={[
              { key: "detalles", label: "Detalles" },
              { key: "historial", label: "Historial" },
              { key: "visitas", label: "Visitas" },
              { key: "documentos", label: "Documentos" },
            ]}
            value={tab}
            onChange={setTab}
            className="mb-0"
          />

          {/* Tab: Detalles */}
          {tab === "detalles" && (
            <>
              {/* Descripción (editable) */}
              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display text-base font-semibold">Descripción</h3>
                  {descripcion !== inmueble.descripcion && (
                    <span className="text-[11px] text-warning">Sin guardar</span>
                  )}
                </div>
                {detailReady ? (
                  <textarea
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    rows={6}
                    placeholder="Añade una descripción del inmueble…"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                  />
                ) : (
                  <div className="space-y-2">
                    <SkeletonLine className="w-full" />
                    <SkeletonLine className="w-11/12" />
                    <SkeletonLine className="w-3/4" />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Tab: Documentos */}
          {tab === "documentos" && (
            <DocumentosPanel
              documentos={documentos}
              onChange={setDocumentos}
              detailReady={detailReady}
            />
          )}

          {/* Tab: Detalles — Características */}
          {tab === "detalles" && (
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h3 className="font-display text-base font-semibold mb-4">Características</h3>
              {!detailReady ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-border bg-background px-3 py-2.5 space-y-1"
                    >
                      <SkeletonLine className="w-1/2" />
                      <SkeletonLine className="w-3/4" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Tipo — read-only */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.08em] font-medium text-muted-foreground mb-1">
                        Tipo
                      </div>
                      <div className="h-8 px-2 flex items-center rounded border border-input bg-muted text-sm text-muted-foreground">
                        {inmueble.tipo || "—"}
                      </div>
                    </div>
                    <EditSpecField
                      label="Habitaciones"
                      value={habitaciones}
                      onChange={setHabitaciones}
                    />
                    <EditSpecField label="Baños" value={banos} onChange={setBanos} />
                    <EditSpecField
                      label="Superficie (m²)"
                      value={superficie}
                      onChange={setSuperficie}
                    />
                    <EditSpecField label="Planta" value={planta} onChange={setPlanta} />
                    <EditSpecField
                      label="Estado"
                      value={estado}
                      onChange={setEstado}
                      type="select"
                      options={[
                        "Nuevo",
                        "A reformar",
                        "Reformado",
                        "Buen estado",
                        "Para entrar",
                        "Obra nueva",
                      ]}
                    />
                    <EditSpecField
                      label="Año construcción"
                      value={anoConstruccion}
                      onChange={setAnoConstruccion}
                    />
                    <EditSpecField
                      label="Cert. energética"
                      value={certificacionEnergetica}
                      onChange={setCertificacionEnergetica}
                    />
                    <EditSpecField
                      label="Calefacción"
                      value={calefaccion}
                      onChange={setCalefaccion}
                    />
                    <EditSpecField
                      label="Orientación"
                      value={orientacion}
                      onChange={setOrientacion}
                      type="orientacion"
                    />
                    <EditSpecField
                      label="Garaje"
                      value={garaje}
                      onChange={setGaraje}
                      type="select"
                      options={["Sí", "No", "Opcional"]}
                    />
                    <EditSpecField
                      label="Trastero"
                      value={trastero}
                      onChange={setTrastero}
                      type="select"
                      options={["Sí", "No"]}
                    />
                    <EditSpecField
                      label="Ascensor"
                      value={ascensor}
                      onChange={setAscensor}
                      type="select"
                      options={["Sí", "No"]}
                    />
                    <EditSpecField
                      label="Armarios"
                      value={armariosEmpotrados}
                      onChange={setArmariosEmpotrados}
                      type="select"
                      options={["Sí", "No"]}
                    />
                    <EditSpecField label="Terraza" value={terraza} onChange={setTerraza} />
                    <EditSpecField label="Balcón" value={balcon} onChange={setBalcon} />
                    <EditSpecField
                      label="Gastos com."
                      value={gastosComunidad}
                      onChange={setGastosComunidad}
                    />
                    <EditSpecField
                      label="Ref. catastral"
                      value={referenciaCatastral}
                      onChange={setReferenciaCatastral}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab: Historial */}
          {tab === "historial" && (
            <>
              <TiempoMercadoPanel inmueble={inmueble} detailReady={detailReady} />

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="font-display text-base font-semibold mb-4 flex items-center gap-2">
                  <Calendar className="size-4 text-primary" /> Historial
                </h3>
                {detailReady ? (
                  <>
                    <ol className="relative ml-3 space-y-5 before:absolute before:left-0 before:top-1 before:bottom-1 before:w-px before:bg-border">
                      {[
                        { label: "Captación / inicio", value: fechaInicio, set: setFechaInicio },
                        {
                          label: "Autorización exclusiva",
                          value: fechaExclusiva,
                          set: setFechaExclusiva,
                        },
                        {
                          label: "Fin de exclusividad",
                          value: fechaFinExclusiva,
                          set: setFechaFinExclusiva,
                        },
                        { label: "Reserva", value: fechaReserva, set: setFechaReserva },
                        { label: "Escritura", value: fechaEscritura, set: setFechaEscritura },
                      ].map((ev) => {
                        const done = !!ev.value;
                        return (
                          <li key={ev.label} className="relative pl-6">
                            <span
                              className={`absolute -left-[7px] top-0.5 inline-flex items-center justify-center size-4 rounded-full ring-2 ring-card ${
                                done
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted border border-border"
                              }`}
                            >
                              {done && <Check className="size-2.5" />}
                            </span>
                            <div
                              className={`text-sm font-medium ${done ? "text-foreground" : "text-muted-foreground"}`}
                            >
                              {ev.label}
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                type="date"
                                value={ev.value ? ev.value.slice(0, 10) : ""}
                                onChange={(e) => ev.set(e.target.value)}
                                className="h-7 px-2 rounded border border-input bg-background text-xs"
                              />
                              {ev.value && (
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(ev.value)}
                                </span>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                    <div className="grid grid-cols-2 gap-x-6 mt-5 pt-4 border-t border-border">
                      <div className="py-2">
                        <div className="text-[10px] uppercase tracking-[0.08em] font-medium text-muted-foreground mb-1">
                          Notaría
                        </div>
                        <input
                          type="text"
                          value={notaria}
                          onChange={(e) => setNotaria(e.target.value)}
                          className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
                        />
                      </div>
                      <div className="py-2">
                        <div className="text-[10px] uppercase tracking-[0.08em] font-medium text-muted-foreground mb-1">
                          Honorarios
                        </div>
                        <input
                          type="text"
                          value={honorarios}
                          onChange={(e) => setHonorarios(e.target.value)}
                          className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
                        />
                      </div>
                      <div className="py-2">
                        <div className="text-[10px] uppercase tracking-[0.08em] font-medium text-muted-foreground mb-1">
                          Tipo exclusiva
                        </div>
                        <input
                          type="text"
                          value={tipoExclusiva}
                          onChange={(e) => setTipoExclusiva(e.target.value)}
                          className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
                        />
                      </div>
                      <div className="py-2">
                        <div className="text-[10px] uppercase tracking-[0.08em] font-medium text-muted-foreground mb-1">
                          Llaves
                        </div>
                        <input
                          type="text"
                          value={llaves}
                          onChange={(e) => setLlaves(e.target.value)}
                          className="w-full h-8 px-2 rounded border border-input bg-background text-sm"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <SkeletonLine className="w-1/2" />
                    <SkeletonLine className="w-2/3" />
                    <SkeletonLine className="w-1/3" />
                  </div>
                )}
              </div>

              {/* Changelog automático */}
              {detailReady && inmueble.changelog.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <h3 className="font-display text-base font-semibold mb-4 flex items-center gap-2">
                    <Hash className="size-4 text-primary" /> Cambios registrados
                  </h3>
                  <ol className="space-y-3">
                    {[...inmueble.changelog].reverse().map((c, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm">
                        <span className="shrink-0 mt-0.5 text-[10px] text-muted-foreground whitespace-nowrap">
                          {formatDate(c.ts)}
                        </span>
                        <span className="font-medium text-foreground/70 shrink-0">{c.field}:</span>
                        <span className="text-muted-foreground line-through shrink-0">
                          {c.old || "—"}
                        </span>
                        <span className="text-foreground/80">→ {c.new || "—"}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}

          {/* Tab: Visitas */}
          {tab === "visitas" && <VisitasPanel id={id} />}
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
            onDelete={onDelete}
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

      {/* Floating save bar */}
      {(dirty || saveStatus === "pending" || saveStatus === "saved" || saveStatus === "error") && (
        <div className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-between gap-4 px-4 py-3 bg-card border-t border-border shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.15)] md:left-56">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {saveStatus === "pending" ? (
              <>
                <Loader2 className="size-3.5 animate-spin" /> Guardando…
              </>
            ) : saveStatus === "saved" ? (
              <>
                <Check className="size-3.5 text-success" />{" "}
                <span className="text-success">Guardado</span>
              </>
            ) : saveStatus === "error" ? (
              <>
                <span className="size-2 rounded-full bg-destructive" /> Error al guardar
              </>
            ) : dirtyAuto ? (
              <>
                <span className="size-2 rounded-full bg-warning animate-pulse" /> Guardando en 2 s…
              </>
            ) : (
              <>
                <span className="size-2 rounded-full bg-warning" /> Cambios sin guardar — requiere
                guardado manual
              </>
            )}
          </div>
          <button
            onClick={onSave}
            disabled={mutation.isPending || !detailReady}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            <Save className="size-4" />
            Guardar ahora
          </button>
        </div>
      )}
    </AppShell>
  );
}
