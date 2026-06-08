import { createFileRoute, Link, useRouter, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  getInmueble,
  listAgentes,
  updateInmueble,
  ESTATUS_OPCIONES,
  PUBLICACION_OPCIONES,
} from "@/lib/inmuebles.functions";
import { ArrowLeft, Building2, Calendar, MapPin, Phone, Mail, Save } from "lucide-react";

const inmuebleQuery = (id: string) =>
  queryOptions({
    queryKey: ["inmueble", id],
    queryFn: () => getInmueble({ data: { id } }),
  });

const agentesQuery = queryOptions({
  queryKey: ["agentes"],
  queryFn: () => listAgentes(),
});

export const Route = createFileRoute("/inmuebles/$id")({
  head: () => ({
    meta: [{ title: "Ficha de inmueble · El Sol Grupo CRM" }],
  }),
  loader: async ({ params, context }) => {
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(inmuebleQuery(params.id)),
        context.queryClient.ensureQueryData(agentesQuery),
      ]);
    } catch (e) {
      if (e instanceof Error && e.message.includes("404")) throw notFound();
      throw e;
    }
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
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
function formatDate(s: string | null) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }); } catch { return s; }
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-2 border-b border-border/50 last:border-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm mt-0.5">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
}

function InmuebleDetail() {
  const { id } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: { inmueble } } = useSuspenseQuery(inmuebleQuery(id));
  const { data: { agentes } } = useSuspenseQuery(agentesQuery);
  const updateFn = useServerFn(updateInmueble);

  const [estatus, setEstatus] = useState(inmueble.estatus || "Activo");
  const [publicacion, setPublicacion] = useState(inmueble.publicacion || "SUBIR");
  const [precio, setPrecio] = useState<string>(inmueble.precio?.toString() ?? "");
  const [precioFinal, setPrecioFinal] = useState<string>(inmueble.precioFinal?.toString() ?? "");
  const [agentesIds, setAgentesIds] = useState<string[]>(inmueble.agentesIds);
  const [observaciones, setObservaciones] = useState(inmueble.observaciones);
  const [mainImg, setMainImg] = useState<string | null>(inmueble.imagen);

  useEffect(() => { setMainImg(inmueble.imagen); }, [inmueble.imagen]);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateFn>[0]["data"]) => updateFn({ data: payload }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["inmueble", id] });
      await qc.invalidateQueries({ queryKey: ["inmuebles"] });
      router.invalidate();
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Galería */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="aspect-video bg-muted">
              {mainImg ? (
                <img src={mainImg} alt={inmueble.calle} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <Building2 className="size-10" />
                </div>
              )}
            </div>
            {inmueble.imagenes.length > 1 && (
              <div className="p-2 flex gap-2 overflow-x-auto">
                {inmueble.imagenes.map((src) => (
                  <button
                    key={src}
                    onClick={() => setMainImg(src)}
                    className={`shrink-0 size-16 rounded overflow-hidden border-2 ${mainImg === src ? "border-primary" : "border-transparent"}`}
                  >
                    <img src={src} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cabecera */}
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
            {inmueble.descripcion && (
              <p className="mt-4 text-sm leading-relaxed whitespace-pre-line text-foreground/90">
                {inmueble.descripcion}
              </p>
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
            </div>
          </div>

          {/* Historial / fechas */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Calendar className="size-4" /> Historial
            </h3>
            <ol className="relative border-l border-border ml-2 space-y-4">
              {[
                { label: "Captación / inicio", date: inmueble.fechaInicio },
                { label: "Autorización exclusiva", date: inmueble.fechaExclusiva },
                { label: "Fin de exclusividad", date: inmueble.fechaFinExclusiva },
                { label: "Reserva", date: inmueble.fechaReserva },
                { label: "Escritura", date: inmueble.fechaEscritura },
              ].map((ev) => (
                <li key={ev.label} className="ml-4">
                  <span className={`absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-background ${ev.date ? "bg-primary" : "bg-muted"}`} />
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
          </div>
        </div>

        {/* Panel lateral */}
        <aside className="space-y-6">
          {/* Edición */}
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
                    type="number"
                    min={0}
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                    className="mt-1 w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Precio final (€)</label>
                  <input
                    type="number"
                    min={0}
                    value={precioFinal}
                    onChange={(e) => setPrecioFinal(e.target.value)}
                    className="mt-1 w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Agentes asignados</label>
                <div className="mt-1 max-h-48 overflow-auto rounded-md border border-input bg-background p-2 space-y-1">
                  {agentes.map((a) => {
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
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">Observaciones</label>
                <textarea
                  rows={3}
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  className="mt-1 w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm"
                />
              </div>

              <button
                onClick={onSave}
                disabled={!dirty || mutation.isPending}
                className="w-full h-9 inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90"
              >
                <Save className="size-4" />
                {mutation.isPending ? "Guardando…" : "Guardar cambios"}
              </button>

              {mutation.isError && (
                <div className="text-xs text-destructive">
                  {(mutation.error as Error).message}
                </div>
              )}
              {mutation.isSuccess && !dirty && (
                <div className="text-xs text-emerald-600 dark:text-emerald-400">Guardado ✓</div>
              )}
            </div>
          </div>

          {/* Propietario */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-3">Propietario</h3>
            <Field label="Nombre" value={inmueble.propietario} />
            <Field
              label="Teléfono"
              value={inmueble.telefonoPropietario ? (
                <a href={`tel:${inmueble.telefonoPropietario}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                  <Phone className="size-3.5" />{inmueble.telefonoPropietario}
                </a>
              ) : ""}
            />
            <Field
              label="Email"
              value={inmueble.emailPropietario ? (
                <a href={`mailto:${inmueble.emailPropietario}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                  <Mail className="size-3.5" />{inmueble.emailPropietario}
                </a>
              ) : ""}
            />
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
