// M-03: extraído de src/routes/bandeja.index.tsx.
// Tarjeta de inmueble detectado en conversación, con botón para confirmar vínculo.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  MapPin,
  Euro,
  Link2,
  Loader2,
  CalendarPlus,
  Home,
  KeyRound,
  ShoppingCart,
  UserRound,
  Eye,
} from "lucide-react";
import { EstatusInmuebleBadge } from "@/components/StatusBadge";
import { SafeImage } from "@/components/SafeImage";
import { NewVisitaDialog } from "@/components/CreateDialogs";
import type { Inmueble } from "@/lib/inmuebles.functions";
import { asociarLeadAInmueble } from "@/lib/mutations.functions";
import { cleanRef } from "@/lib/format";
import { moneyShort } from "@/lib/bandeja-format";

const TIPO_VINCULAR_VENTA = [
  { value: "Interesado", icon: Eye, label: "Interesado" },
  { value: "Comprador", icon: ShoppingCart, label: "Comprador" },
  { value: "Propietario", icon: Home, label: "Propietario" },
] as const;

const TIPO_VINCULAR_ALQUILER = [
  { value: "Interesado", icon: Eye, label: "Interesado" },
  { value: "Inquilino", icon: KeyRound, label: "Inquilino" },
  { value: "Propietario", icon: Home, label: "Propietario" },
] as const;

export function MencionadoCard({
  inm,
  contactId,
  clienteNombre,
  onVinculado,
  readOnly = false,
}: {
  inm: Inmueble;
  contactId: string;
  clienteNombre: string;
  onVinculado: () => void;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(asociarLeadAInmueble);
  const esAlq = inm.esAlquiler;
  const tiposVincular = esAlq ? TIPO_VINCULAR_ALQUILER : TIPO_VINCULAR_VENTA;
  // "Interesado" por defecto -- Comprador/Inquilino son, por definición,
  // solo tras una reserva formal, no al primer contacto desde la bandeja.
  const [tipo, setTipo] = useState<string>("Interesado");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function confirmar() {
    setPending(true);
    try {
      await fn({ data: { contactId, propertyId: inm.id, tipo } });
      setDone(true);
      qc.invalidateQueries({ queryKey: ["clientes-stats"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      onVinculado();
      toast.success(`${clienteNombre || "Contacto"} vinculado como ${tipo}`);
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : String(e)) || "Error al vincular");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className={`rounded-md border overflow-hidden flex flex-col ${done ? "border-success/40 bg-success/[0.04]" : "border-primary/30 bg-primary/[0.03]"}`}
    >
      <Link
        to="/inmuebles/$id"
        params={{ id: inm.id }}
        className="flex items-stretch gap-2 hover:bg-primary/[0.06] transition-colors"
      >
        <div className="w-16 shrink-0 bg-muted">
          <SafeImage src={inm.imagen} alt={inm.calle || inm.ref} />
        </div>
        <div className="flex-1 min-w-0 py-2 pr-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-mono text-muted-foreground">#{cleanRef(inm.ref)}</span>
            <EstatusInmuebleBadge estatus={inm.estatus} />
          </div>
          <div className="text-xs font-semibold truncate">
            {inm.calle} {inm.numero}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="size-2.5" />
              {inm.barrio || inm.localidad || "—"}
            </span>
            <span className="inline-flex items-center gap-0.5 font-semibold text-primary">
              <Euro className="size-2.5" />
              {moneyShort(inm.precioFinal ?? inm.precio)}
            </span>
          </div>
          {inm.agentesNombres.length > 0 && (
            <div className="flex items-center gap-0.5 text-xs text-muted-foreground truncate">
              <UserRound className="size-2.5 shrink-0" />
              {inm.agentesNombres.join(", ")}
            </div>
          )}
        </div>
      </Link>
      {/* Confirmar vínculo */}
      {readOnly ? null : done ? (
        <div className="px-2 py-1.5 border-t border-success/20 flex items-center gap-1 text-xs text-success">
          <Link2 className="size-3" /> Vinculado como {tipo}
        </div>
      ) : (
        <div className="px-2 py-1.5 border-t border-primary/20 flex items-center gap-1 flex-wrap">
          <div className="flex gap-0.5 flex-1 min-w-0">
            {tiposVincular.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTipo(value)}
                className={`inline-flex items-center gap-0.5 text-xs font-medium px-2 py-1 rounded border transition-colors ${tipo === value ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-accent"}`}
              >
                <Icon className="size-2.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 shrink-0">
            <NewVisitaDialog
              defaultInmuebleId={inm.id}
              defaultClienteId={contactId}
              trigger={
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground hover:bg-accent transition-colors"
                >
                  <CalendarPlus className="size-2.5" />
                </button>
              }
            />
            <button
              type="button"
              disabled={pending}
              onClick={confirmar}
              className="inline-flex items-center gap-0.5 text-xs font-medium px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {pending ? (
                <Loader2 className="size-2.5 animate-spin" />
              ) : (
                <Link2 className="size-2.5" />
              )}
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
