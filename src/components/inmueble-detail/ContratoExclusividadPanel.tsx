// Datos del contrato de exclusividad — 21 sep 2026. Para evitar errores,
// especialmente con copropiedad (varios propietarios en el mismo inmueble),
// el comercial introduce aquí todo lo que antes rellenaba cada propietario
// por su cuenta desde el Portal (autoservicio retirado en Onboarding.tsx):
// DNI/domicilio de cada uno, duración de la exclusividad, comisión y
// cláusulas adicionales. Panel autocontenido (query + mutaciones propias),
// igual que RevisionPropietarioPanel en ClientesPanel.tsx — no se integra
// en el buildPayload/dirty del formulario principal de la ficha porque
// necesita guardar N propietarios por separado, no solo campos de properties.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listPropietariosInmueble,
  updateInmueble,
  getContratoExclusividadEstado,
  type PropietarioInmueble,
} from "@/lib/inmuebles.functions";
import { guardarDatosFirmaPropietario } from "@/lib/mutations-cliente.functions";
import { GenerarContratoDialog } from "./GenerarContratoDialog";
import { PropietariosOnboardingPanel } from "./PropietariosOnboardingPanel";
import { DocumentoPreviewDialog } from "@/components/DocumentoPreviewDialog";

function PropietarioFirmaRow({ propietario }: { propietario: PropietarioInmueble }) {
  const guardarFn = useServerFn(guardarDatosFirmaPropietario);
  const [dni, setDni] = useState(propietario.dni);
  const [domicilio, setDomicilio] = useState(propietario.domicilio);
  const [telefono, setTelefono] = useState(propietario.telefono);

  const mutation = useMutation({
    mutationFn: () =>
      guardarFn({ data: { propietarioId: propietario.id, dni, domicilio, telefono } }),
    onSuccess: () => toast.success(`Datos de firma guardados — ${propietario.nombre}`),
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar"),
  });

  const dirty =
    dni !== propietario.dni ||
    domicilio !== propietario.domicilio ||
    telefono !== propietario.telefono;

  return (
    <div className="space-y-1.5 py-2 border-b border-border/40 last:border-0">
      <div className="text-sm font-medium">{propietario.nombre}</div>
      <div className="grid grid-cols-3 gap-2">
        <input
          value={dni}
          onChange={(e) => setDni(e.target.value)}
          placeholder="DNI"
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
        />
        <input
          value={domicilio}
          onChange={(e) => setDomicilio(e.target.value)}
          placeholder="Domicilio"
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
        />
        <input
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="Teléfono (firma OTP)"
          className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
        />
      </div>
      <button
        type="button"
        disabled={!dirty || mutation.isPending}
        onClick={() => mutation.mutate()}
        className="text-xs text-foreground hover:text-primary border border-dashed border-border rounded-md px-2.5 py-1.5 disabled:opacity-50"
      >
        Guardar
      </button>
    </div>
  );
}

export function ContratoExclusividadPanel({
  propertyId,
  duracionExclusividadMeses,
  comisionExclusividadPct,
  clausulasAdicionales,
}: {
  propertyId: string;
  duracionExclusividadMeses: number | null;
  comisionExclusividadPct: number | null;
  clausulasAdicionales: string;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPropietariosInmueble);
  const updateFn = useServerFn(updateInmueble);
  const estadoContratoFn = useServerFn(getContratoExclusividadEstado);

  const { data, isLoading } = useQuery({
    queryKey: ["propietarios-inmueble", propertyId],
    queryFn: () => listFn({ data: { propertyId } }),
  });

  const { data: contratoEstado } = useQuery({
    queryKey: ["contrato-exclusividad-estado", propertyId],
    queryFn: () => estadoContratoFn({ data: { propertyId } }),
  });

  const [duracion, setDuracion] = useState(duracionExclusividadMeses?.toString() ?? "");
  const [comision, setComision] = useState(comisionExclusividadPct?.toString() ?? "");
  const [clausulas, setClausulas] = useState(clausulasAdicionales);

  useEffect(() => {
    setDuracion(duracionExclusividadMeses?.toString() ?? "");
    setComision(comisionExclusividadPct?.toString() ?? "");
    setClausulas(clausulasAdicionales);
  }, [duracionExclusividadMeses, comisionExclusividadPct, clausulasAdicionales]);

  const datosMutation = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id: propertyId,
          duracionExclusividadMeses: duracion.trim() ? Number(duracion) : null,
          comisionExclusividadPct: comision.trim() ? Number(comision) : null,
          clausulasAdicionales: clausulas,
        },
      }),
    onSuccess: () => {
      toast.success("Datos del contrato guardados");
      qc.invalidateQueries({ queryKey: ["inmueble", propertyId] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar"),
  });

  const dirtyDatos =
    duracion !== (duracionExclusividadMeses?.toString() ?? "") ||
    comision !== (comisionExclusividadPct?.toString() ?? "") ||
    clausulas !== clausulasAdicionales;

  const [generarOpen, setGenerarOpen] = useState(false);
  const [previewContratoOpen, setPreviewContratoOpen] = useState(false);
  const contratoFirmado = contratoEstado?.firmado ?? false;

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold">
            Datos del contrato de exclusividad
          </h3>
          <div className="flex items-center gap-2">
            {contratoFirmado ? (
              <>
                <button
                  type="button"
                  onClick={() => setPreviewContratoOpen(true)}
                  className="text-xs font-semibold rounded-md px-2.5 py-1.5 bg-success/10 text-success hover:bg-success/20"
                >
                  Ver contrato firmado
                </button>
                <button
                  type="button"
                  onClick={() => setGenerarOpen(true)}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  Generar uno nuevo
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setGenerarOpen(true)}
                className="text-xs font-semibold rounded-md px-2.5 py-1.5 bg-primary text-primary-foreground hover:opacity-90"
              >
                Generar contrato
              </button>
            )}
          </div>
        </div>

        {contratoFirmado && contratoEstado?.documentoId && (
          <DocumentoPreviewDialog
            documentoId={previewContratoOpen ? contratoEstado.documentoId : null}
            onOpenChange={(open) => !open && setPreviewContratoOpen(false)}
          />
        )}

        <GenerarContratoDialog
          open={generarOpen}
          onOpenChange={setGenerarOpen}
          propertyId={propertyId}
          propietarios={data?.propietarios ?? []}
          duracionInicial={duracionExclusividadMeses}
          comisionInicial={comisionExclusividadPct}
          clausulasIniciales={clausulasAdicionales}
          onCompleted={() => {
            qc.invalidateQueries({ queryKey: ["propietarios-inmueble", propertyId] });
            qc.invalidateQueries({ queryKey: ["inmueble", propertyId] });
            qc.invalidateQueries({ queryKey: ["contrato-exclusividad-estado", propertyId] });
          }}
        />

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-[0.08em] font-medium text-muted-foreground">
              Duración (meses)
            </label>
            <input
              type="number"
              min={1}
              value={duracion}
              onChange={(e) => setDuracion(e.target.value)}
              className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-[0.08em] font-medium text-muted-foreground">
              Comisión (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={comision}
              onChange={(e) => setComision(e.target.value)}
              className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs uppercase tracking-[0.08em] font-medium text-muted-foreground">
            Otras cláusulas
          </label>
          <textarea
            value={clausulas}
            onChange={(e) => setClausulas(e.target.value)}
            rows={3}
            className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground resize-none"
          />
        </div>

        <button
          type="button"
          disabled={!dirtyDatos || datosMutation.isPending}
          onClick={() => datosMutation.mutate()}
          className="text-xs font-semibold text-center rounded-md px-2.5 py-1.5 bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {datosMutation.isPending ? "Guardando…" : "Guardar datos del contrato"}
        </button>

        <div className="border-t border-border pt-3 space-y-1">
          <div className="text-xs uppercase tracking-[0.08em] font-medium text-muted-foreground mb-1">
            Propietarios (DNI / domicilio para la firma)
          </div>
          {isLoading && <p className="text-xs text-muted-foreground">Cargando…</p>}
          {!isLoading && (data?.propietarios.length ?? 0) === 0 && (
            <p className="text-xs text-muted-foreground">
              Sin propietarios con acceso al Portal vinculados a este inmueble.
            </p>
          )}
          {data?.propietarios.map((p) => (
            <PropietarioFirmaRow key={p.id} propietario={p} />
          ))}
        </div>
      </div>

      <PropietariosOnboardingPanel propietarios={data?.propietarios ?? []} />
    </>
  );
}
