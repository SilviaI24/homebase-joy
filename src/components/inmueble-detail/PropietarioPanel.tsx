// M-03: extraído de src/routes/inmuebles.$id.tsx (DetailView). Solo lee
// `inmueble`/`detailReady` — sin closures compartidas con el resto del form.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Phone, Mail, Link2Off, Loader2 } from "lucide-react";
import {
  listPropietariosInmueble,
  desvincularPropietarioInmueble,
  type InmuebleDetalle,
} from "@/lib/inmuebles.functions";
import { AsociarPropietarioButton } from "./AsociarPropietarioButton";

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
      <div className="text-xs uppercase tracking-[0.08em] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="text-sm mt-1 font-medium text-foreground">
        {isEmpty ? <span className="text-muted-foreground/60 font-normal">—</span> : value}
      </div>
    </div>
  );
}

// Único sitio de la ficha donde se ve/gestiona quién está vinculado como
// propietario — 22 sep 2026, para no repetir "propietario vinculado: X" en
// el panel de onboarding de más abajo, que ya lo daba por hecho.
function VinculadosList({ propertyId }: { propertyId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPropietariosInmueble);
  const desvincularFn = useServerFn(desvincularPropietarioInmueble);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  // Misma queryKey que ContratoExclusividadPanel — comparten caché, no
  // duplica la petición de red.
  const { data } = useQuery({
    queryKey: ["propietarios-inmueble", propertyId],
    queryFn: () => listFn({ data: { propertyId } }),
  });

  const desvincularMutation = useMutation({
    mutationFn: (vars: { propietarioId: string; contactId: string | null }) =>
      desvincularFn({ data: { propertyId, ...vars } }),
    onSuccess: () => {
      toast.success("Propietario desvinculado de este inmueble");
      setConfirmandoId(null);
      qc.invalidateQueries({ queryKey: ["propietarios-inmueble", propertyId] });
      qc.invalidateQueries({ queryKey: ["inmueble", propertyId] });
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo desvincular"),
  });

  const propietarios = data?.propietarios ?? [];
  if (propietarios.length === 0) return null;

  return (
    <div className="pt-2 space-y-1.5">
      {propietarios.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground truncate">Vinculado: {p.nombre}</span>
          {confirmandoId === p.id ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmandoId(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={desvincularMutation.isPending}
                onClick={() =>
                  desvincularMutation.mutate({ propietarioId: p.id, contactId: p.contactId })
                }
                className="inline-flex items-center gap-1 text-destructive font-semibold hover:underline disabled:opacity-50"
              >
                {desvincularMutation.isPending && <Loader2 className="size-3 animate-spin" />}
                Confirmar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmandoId(p.id)}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
            >
              <Link2Off className="size-3" /> Desvincular
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function PropietarioPanel({
  inmueble,
  detailReady,
}: {
  inmueble: InmuebleDetalle;
  detailReady: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-base font-semibold">Propietario</h3>
        <AsociarPropietarioButton propertyId={inmueble.id} />
      </div>
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
      {detailReady && (
        <Field label="Observaciones" value={inmueble.observacionesPropietario} hideEmpty />
      )}
      <VinculadosList propertyId={inmueble.id} />
    </div>
  );
}
