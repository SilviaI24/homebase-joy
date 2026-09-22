// Diálogo "Generar contrato" — 21 sep 2026. Flujo pedido por David: el
// comercial confirma si usar los datos ya guardados de los propietarios,
// revisa/edita nombre-DNI-domicilio y comisión/duración/cláusulas viendo el
// PDF real (no un resumen), y al aceptar se guarda todo y se da acceso al
// Portal a todos los propietarios vinculados de una vez.
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  previewContratoExclusividad,
  generarContratoYDarAccesoPortal,
  type GenerarContratoOwner,
} from "@/lib/mutations-cliente.functions";
import type { PropietarioInmueble } from "@/lib/inmuebles.functions";

const COMISION_DEFECTO = 3.5;
const DURACION_DEFECTO = 5;

function base64ToBlobUrl(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

type EditableOwner = {
  propietarioId: string;
  contactId: string | null;
  nombre: string;
  dni: string;
  domicilio: string;
};

export function GenerarContratoDialog({
  open,
  onOpenChange,
  propertyId,
  propietarios,
  duracionInicial,
  comisionInicial,
  clausulasIniciales,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  propietarios: PropietarioInmueble[];
  duracionInicial: number | null;
  comisionInicial: number | null;
  clausulasIniciales: string;
  onCompleted: () => void;
}) {
  const [step, setStep] = useState<"confirm" | "preview">("confirm");
  const [owners, setOwners] = useState<EditableOwner[]>([]);
  const [duracion, setDuracion] = useState(DURACION_DEFECTO);
  const [comision, setComision] = useState(COMISION_DEFECTO);
  const [clausulas, setClausulas] = useState("");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const previewFn = useServerFn(previewContratoExclusividad);
  const aceptarFn = useServerFn(generarContratoYDarAccesoPortal);

  // Reset al abrir/cerrar para no arrastrar datos de una vista previa anterior.
  useEffect(() => {
    if (!open) return;
    setStep("confirm");
    setOwners(
      propietarios.map((p) => ({
        propietarioId: p.id,
        contactId: p.contactId,
        nombre: p.nombre,
        dni: p.dni,
        domicilio: p.domicilio,
      })),
    );
    setDuracion(duracionInicial ?? DURACION_DEFECTO);
    setComision(comisionInicial ?? COMISION_DEFECTO);
    setClausulas(clausulasIniciales);
    setPdfUrl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );

  const previewMutation = useMutation({
    mutationFn: () =>
      previewFn({
        data: {
          propertyId,
          owners: owners.map((o) => ({ nombre: o.nombre, dni: o.dni, domicilio: o.domicilio })),
          duracionMeses: duracion,
          comisionPct: comision,
          clausulasAdicionales: clausulas,
        },
      }),
    onSuccess: (res) => {
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return base64ToBlobUrl(res.pdfBase64);
      });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo generar la vista previa"),
  });

  const aceptarMutation = useMutation({
    mutationFn: () =>
      aceptarFn({
        data: {
          propertyId,
          duracionMeses: duracion,
          comisionPct: comision,
          clausulasAdicionales: clausulas,
          propietarios: owners.map(
            (o): GenerarContratoOwner => ({
              propietarioId: o.propietarioId,
              contactId: o.contactId,
              dni: o.dni,
              domicilio: o.domicilio,
            }),
          ),
        },
      }),
    onSuccess: (res) => {
      const enviados = res.resultados.filter((r) => r.inviteSent).length;
      const fallidos = res.resultados.filter((r) => r.error);
      if (fallidos.length > 0) {
        toast.warning(
          `Contrato guardado. Acceso al portal: ${enviados} invitación(es) enviada(s), ${fallidos.length} con aviso — ${fallidos.map((f) => f.error).join("; ")}`,
        );
      } else {
        toast.success(`Contrato guardado y acceso al portal enviado a ${enviados} propietario(s)`);
      }
      onOpenChange(false);
      onCompleted();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo completar"),
  });

  const handleUsarDatos = (usar: boolean) => {
    if (!usar) {
      onOpenChange(false);
      return;
    }
    setStep("preview");
  };

  useEffect(() => {
    if (step === "preview" && owners.length > 0 && !pdfUrl && !previewMutation.isPending) {
      previewMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle>Generar contrato de exclusividad</DialogTitle>
              <DialogDescription>
                ¿Usar los datos de los propietarios asociados a este inmueble (nombre, DNI,
                domicilio) para el contrato?
              </DialogDescription>
            </DialogHeader>
            {owners.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Este inmueble no tiene propietarios vinculados todavía — vincula al menos uno antes
                de generar el contrato.
              </p>
            )}
            <DialogFooter>
              <button
                type="button"
                onClick={() => handleUsarDatos(false)}
                className="text-sm border border-border rounded-md px-3 py-1.5 hover:bg-muted"
              >
                No
              </button>
              <button
                type="button"
                disabled={owners.length === 0}
                onClick={() => handleUsarDatos(true)}
                className="text-sm font-semibold rounded-md px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Sí, continuar
              </button>
            </DialogFooter>
          </>
        )}

        {step === "preview" && (
          <>
            <DialogHeader>
              <DialogTitle>Revisar contrato antes de dar acceso al Portal</DialogTitle>
              <DialogDescription>
                Comprueba los datos y la vista previa del documento. Al aceptar, se guardan y se
                invita al Portal a cada propietario.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs uppercase tracking-[0.08em] font-medium text-muted-foreground">
                      Duración (meses)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={duracion}
                      onChange={(e) => setDuracion(Number(e.target.value))}
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
                      onChange={(e) => setComision(Number(e.target.value))}
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

                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.08em] font-medium text-muted-foreground">
                    Propietarios / firmantes
                  </div>
                  {owners.map((o, i) => (
                    <div
                      key={o.propietarioId}
                      className="space-y-1.5 py-2 border-b border-border/40 last:border-0"
                    >
                      <div className="text-sm font-medium">{o.nombre}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={o.dni}
                          onChange={(e) =>
                            setOwners((prev) =>
                              prev.map((p, j) => (j === i ? { ...p, dni: e.target.value } : p)),
                            )
                          }
                          placeholder="DNI"
                          className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
                        />
                        <input
                          value={o.domicilio}
                          onChange={(e) =>
                            setOwners((prev) =>
                              prev.map((p, j) =>
                                j === i ? { ...p, domicilio: e.target.value } : p,
                              ),
                            )
                          }
                          placeholder="Domicilio"
                          className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={previewMutation.isPending}
                  onClick={() => previewMutation.mutate()}
                  className="text-xs border border-dashed border-border rounded-md px-2.5 py-1.5 hover:bg-muted disabled:opacity-50 flex items-center gap-1.5"
                >
                  {previewMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                  Actualizar vista previa
                </button>
              </div>

              <div className="border border-border rounded-md overflow-hidden bg-muted min-h-[420px] flex items-center justify-center">
                {previewMutation.isPending && !pdfUrl && (
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                )}
                {pdfUrl && (
                  <iframe
                    title="Vista previa del contrato"
                    src={pdfUrl}
                    className="w-full h-[500px] border-0"
                  />
                )}
                {!pdfUrl && !previewMutation.isPending && (
                  <p className="text-xs text-muted-foreground p-4 text-center">
                    Sin vista previa todavía — pulsa "Actualizar vista previa".
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="text-sm border border-border rounded-md px-3 py-1.5 hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!pdfUrl || aceptarMutation.isPending}
                onClick={() => aceptarMutation.mutate()}
                className="text-sm font-semibold rounded-md px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
              >
                {aceptarMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Aceptar y dar acceso al portal
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
