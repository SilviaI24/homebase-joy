// M-03: extraído de src/routes/inmuebles.$id.tsx (DetailView). Solo lee
// `inmueble`/`detailReady` — sin closures compartidas con el resto del form.
import { Phone, Mail } from "lucide-react";
import type { InmuebleDetalle } from "@/lib/inmuebles.functions";
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
    </div>
  );
}
