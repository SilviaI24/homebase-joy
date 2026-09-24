// Instrucciones de mejora del CRM (sep 2026), punto "Interesado ligado a
// inmueble": leads enlazados a este inmueble sin formalizar todavía
// (contact_roles.tipo='Interesado') -- a diferencia del Propietario, puede
// haber varios a la vez.
import { Eye, Phone } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { InmuebleDetalle } from "@/lib/inmuebles.functions";

export function InteresadosPanel({
  inmueble,
  detailReady,
}: {
  inmueble: InmuebleDetalle;
  detailReady: boolean;
}) {
  if (!detailReady) return null;
  if (inmueble.interesados.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <h3 className="font-display text-base font-semibold mb-4 flex items-center gap-2">
        <Eye className="size-4 text-muted-foreground" />
        Interesados
        <span className="text-xs font-normal text-muted-foreground">
          ({inmueble.interesados.length})
        </span>
      </h3>
      <div className="space-y-2">
        {inmueble.interesados.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
            <Link
              to="/contactos"
              search={{ id: p.id }}
              className="font-medium text-foreground hover:underline truncate"
            >
              {p.nombre || "Sin nombre"}
            </Link>
            {p.telefono && (
              <a
                href={`tel:${p.telefono}`}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
              >
                <Phone className="size-3" />
                {p.telefono}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
