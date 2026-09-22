// Progreso de onboarding por propietario en la ficha del inmueble — 22 sep
// 2026. Reutiliza RevisionPropietarioPanel (ya construido en la ficha de
// cliente) para cada propietario vinculado, sin el bloque de DNI/domicilio/
// teléfono (mostrarDatosFirma={false}) — esos mismos campos ya se editan en
// el panel de datos del contrato de esta misma ficha, duplicarlos confundía.
// En su lugar, cada propietario muestra que está vinculado + la opción de
// desvincularlo si se enlazó el contacto equivocado por error.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2Off, Loader2 } from "lucide-react";
import { RevisionPropietarioPanel } from "@/components/contactos/ClientesPanel";
import {
  desvincularPropietarioInmueble,
  type PropietarioInmueble,
} from "@/lib/inmuebles.functions";

function PropietarioVinculadoRow({
  propietario,
  propertyId,
}: {
  propietario: PropietarioInmueble;
  propertyId: string;
}) {
  const qc = useQueryClient();
  const desvincularFn = useServerFn(desvincularPropietarioInmueble);
  const [confirmando, setConfirmando] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      desvincularFn({
        data: { propertyId, propietarioId: propietario.id, contactId: propietario.contactId },
      }),
    onSuccess: () => {
      toast.success(`${propietario.nombre} desvinculado de este inmueble`);
      qc.invalidateQueries({ queryKey: ["propietarios-inmueble", propertyId] });
      qc.invalidateQueries({ queryKey: ["inmueble", propertyId] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo desvincular"),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Propietario vinculado: {propietario.nombre}</span>
        {!confirmando ? (
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <Link2Off className="size-3.5" /> Desvincular
          </button>
        ) : null}
      </div>

      {confirmando && (
        <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs text-destructive font-medium">
            ¿Desvincular a {propietario.nombre} de este inmueble? Es para cuando se vinculó el
            contacto equivocado — su ficha de propietario y su acceso al Portal no se borran, solo
            deja de estar asociado a este inmueble.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="text-xs px-2.5 py-1.5 rounded-md hover:bg-muted text-muted-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
              className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-md px-2.5 py-1.5 bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50"
            >
              {mutation.isPending && <Loader2 className="size-3 animate-spin" />}
              Sí, desvincular
            </button>
          </div>
        </div>
      )}

      {propietario.contactId && (
        <RevisionPropietarioPanel contactId={propietario.contactId} mostrarDatosFirma={false} />
      )}
    </div>
  );
}

export function PropietariosOnboardingPanel({
  propietarios,
  propertyId,
}: {
  propietarios: PropietarioInmueble[];
  propertyId: string;
}) {
  const conContacto = propietarios.filter((p) => p.contactId);
  if (conContacto.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
      <h3 className="font-display text-base font-semibold">Onboarding del propietario</h3>
      {conContacto.map((p) => (
        <PropietarioVinculadoRow key={p.id} propietario={p} propertyId={propertyId} />
      ))}
    </div>
  );
}
