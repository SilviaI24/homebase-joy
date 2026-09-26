import { createFileRoute, Link, useRouter, notFound } from "@tanstack/react-router";
import {
  queryOptions,
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SectionTabs } from "@/components/SectionTabs";
import { RouteError } from "@/components/RouteError";
import { invalidarInmuebles } from "@/lib/queries";

import { DocumentosPanel } from "@/components/inmueble-detail/DocumentosPanel";
import { DocumentosOnboardingPanel } from "@/components/inmueble-detail/DocumentosOnboardingPanel";
import { ManagementPanel } from "@/components/inmueble-detail/ManagementPanel";
import {
  TiempoMercadoPanel,
  VisitasPanel,
} from "@/components/inmueble-detail/MercadoYVisitasPanel";
import { HeroImagePanel } from "@/components/inmueble-detail/HeroImagePanel";
import { DescripcionPanel } from "@/components/inmueble-detail/DescripcionPanel";
import { CaracteristicasPanel } from "@/components/inmueble-detail/CaracteristicasPanel";
import { HistorialPanel } from "@/components/inmueble-detail/HistorialPanel";
import { PropietarioPanel } from "@/components/inmueble-detail/PropietarioPanel";
import { ContratoExclusividadPanel } from "@/components/inmueble-detail/ContratoExclusividadPanel";
import { InteresadosPanel } from "@/components/inmueble-detail/InteresadosPanel";
import { SaveBar } from "@/components/inmueble-detail/SaveBar";
import {
  getInmueble,
  updateInmueble,
  deleteInmueble,
  type Inmueble,
  type InmuebleDetalle,
} from "@/lib/inmuebles.functions";
import { ArrowLeft, Loader2, Hourglass } from "lucide-react";
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
    observacionesPropietario: "",
    interesados: [],
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
    duracionExclusividadMeses: null,
    comisionExclusividadPct: null,
    clausulasAdicionales: "",
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
        // ["inmuebles"] no corresponde a ninguna query (P5, 26 sep 2026).
        invalidarInmuebles(qc);
        router.invalidate();
      }}
      onDelete={async () => {
        await deleteFn({ data: { id } });
        invalidarInmuebles(qc);
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
  // P2 (auditoría de altas, 26 sep 2026): antes `|| "SUBIR"`. Un inmueble con
  // publicacion='' (valor válido del CHECK: aún sin decidir) quedaba "sucio"
  // nada más abrir la ficha y el autosave escribía SUBIR a los 2 s, sin que
  // nadie tocase nada (visto en audit_log). Abrir la ficha no escribe nunca.
  const [publicacion, setPublicacion] = useState(inmueble.publicacion ?? "");
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
    onError: (e: Error) => {
      isSavingRef.current = false;
      setSaveStatus("error");
      // P4: el servidor devuelve mensajes legibles (p. ej. "Habitaciones debe
      // ser un número entero"); sin esto solo se veía "Error al guardar".
      if (e?.message) toast.error(e.message);
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
      // Solo si cambió: updateInmueble exige properties.publish en cuanto
      // llega `publicacion`, así que mandarlo siempre impedía a quien no
      // tiene ese permiso autoguardar cualquier otro campo.
      ...(publicacion !== inmueble.publicacion ? { publicacion } : {}),
      precio: precio === "" ? null : Number(precio),
      agentesIds,
      observaciones,
      descripcion,
      ...(imagesDirty ? { imagenesAttachmentIds: imagenesOrder.map((a) => a.id) } : {}),
      // Igual que publicacion: solo si cambiaron. El servidor ahora lee estos
      // campos en formato español (P4), y la ficha los muestra con
      // String(número) — un 28.538 guardado se releería como 28538 si se
      // reenviase sin tocar al autoguardar otro campo.
      ...(habitaciones !== inmueble.habitaciones ? { habitaciones } : {}),
      ...(banos !== inmueble.banos ? { banos } : {}),
      ...(superficie !== inmueble.superficie ? { superficie } : {}),
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

      {inmueble.estatus === "Prospección" && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-info/40 bg-info/10 px-4 py-3 text-sm text-info">
          <Hourglass className="size-4 mt-0.5 shrink-0 text-info" />
          <div>
            <p className="font-semibold">Inmueble en prospección — pendiente de activar</p>
            <p className="text-xs mt-0.5 text-info/80">
              Todavía no hay acuerdo de comercialización firmado. Revisa los datos y cambia el
              Estatus a <strong>Activo</strong> cuando corresponda.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Hero: imagen con overlay */}
          <HeroImagePanel
            inmueble={inmueble}
            detailReady={detailReady}
            id={id}
            mainImg={mainImg}
            setMainImg={setMainImg}
            imagenesOrder={imagenesOrder}
            setImagenesOrder={setImagenesOrder}
          />

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
            <DescripcionPanel
              descripcion={descripcion}
              setDescripcion={setDescripcion}
              original={inmueble.descripcion}
              detailReady={detailReady}
            />
          )}

          {/* Tab: Documentos */}
          {tab === "documentos" && (
            <div className="space-y-4">
              <DocumentosOnboardingPanel propertyId={id} />
              <DocumentosPanel
                documentos={documentos}
                onChange={setDocumentos}
                detailReady={detailReady}
              />
            </div>
          )}

          {/* Tab: Detalles — Características */}
          {tab === "detalles" && (
            <CaracteristicasPanel
              detailReady={detailReady}
              tipo={inmueble.tipo}
              habitaciones={habitaciones}
              setHabitaciones={setHabitaciones}
              banos={banos}
              setBanos={setBanos}
              superficie={superficie}
              setSuperficie={setSuperficie}
              planta={planta}
              setPlanta={setPlanta}
              estado={estado}
              setEstado={setEstado}
              anoConstruccion={anoConstruccion}
              setAnoConstruccion={setAnoConstruccion}
              certificacionEnergetica={certificacionEnergetica}
              setCertificacionEnergetica={setCertificacionEnergetica}
              calefaccion={calefaccion}
              setCalefaccion={setCalefaccion}
              orientacion={orientacion}
              setOrientacion={setOrientacion}
              garaje={garaje}
              setGaraje={setGaraje}
              trastero={trastero}
              setTrastero={setTrastero}
              ascensor={ascensor}
              setAscensor={setAscensor}
              armariosEmpotrados={armariosEmpotrados}
              setArmariosEmpotrados={setArmariosEmpotrados}
              terraza={terraza}
              setTerraza={setTerraza}
              balcon={balcon}
              setBalcon={setBalcon}
              gastosComunidad={gastosComunidad}
              setGastosComunidad={setGastosComunidad}
              referenciaCatastral={referenciaCatastral}
              setReferenciaCatastral={setReferenciaCatastral}
            />
          )}

          {/* Tab: Historial */}
          {tab === "historial" && (
            <>
              <TiempoMercadoPanel inmueble={inmueble} detailReady={detailReady} />

              <HistorialPanel
                detailReady={detailReady}
                fechaInicio={fechaInicio}
                setFechaInicio={setFechaInicio}
                fechaExclusiva={fechaExclusiva}
                setFechaExclusiva={setFechaExclusiva}
                fechaFinExclusiva={fechaFinExclusiva}
                setFechaFinExclusiva={setFechaFinExclusiva}
                fechaReserva={fechaReserva}
                setFechaReserva={setFechaReserva}
                fechaEscritura={fechaEscritura}
                setFechaEscritura={setFechaEscritura}
                notaria={notaria}
                setNotaria={setNotaria}
                honorarios={honorarios}
                setHonorarios={setHonorarios}
                tipoExclusiva={tipoExclusiva}
                setTipoExclusiva={setTipoExclusiva}
                llaves={llaves}
                setLlaves={setLlaves}
              />
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
          <PropietarioPanel inmueble={inmueble} detailReady={detailReady} />

          {/* Datos del contrato de exclusividad */}
          <ContratoExclusividadPanel
            propertyId={inmueble.id}
            duracionExclusividadMeses={inmueble.duracionExclusividadMeses}
            comisionExclusividadPct={inmueble.comisionExclusividadPct}
            clausulasAdicionales={inmueble.clausulasAdicionales}
          />

          {/* Interesados */}
          <InteresadosPanel inmueble={inmueble} detailReady={detailReady} />
        </aside>
      </div>

      {/* Floating save bar */}
      <SaveBar
        dirty={dirty}
        dirtyAuto={dirtyAuto}
        saveStatus={saveStatus}
        isPending={mutation.isPending}
        detailReady={detailReady}
        onSave={onSave}
      />
    </AppShell>
  );
}
