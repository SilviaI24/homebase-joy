// Mini-dashboard de cabecera — propuesta "Métricas en cabecera", 23 sep 2026,
// Fase 0. Montado en Dashboard/Contactos/Cartera (a petición de David: "también
// en contactos, cartera"). Sin porcentaje de variación a propósito — ver el
// comentario junto a HeaderStats en clientes.functions.ts.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { headerStatsQuery } from "@/lib/queries";

const CANAL_COLOR: Record<string, string> = {
  WhatsApp: "bg-[#25D366]",
  Email: "bg-info",
  Tel: "bg-warning",
  Presencial: "bg-success",
  Web: "bg-gold",
};

export function HeaderStats() {
  const { data, isLoading } = useQuery(headerStatsQuery);

  if (isLoading || !data) return null;

  const canalEntries = Object.entries(data.canales).sort((a, b) => b[1] - a[1]);
  const totalContactos = canalEntries.reduce((sum, [, n]) => sum + n, 0);
  const demandada = data.propiedadDemandada;

  return (
    <div className="mb-4 rounded-xl border border-border bg-card grid grid-cols-2 lg:grid-cols-4 divide-y divide-x-0 lg:divide-y-0 lg:divide-x divide-border overflow-hidden">
      <div className="p-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1.5">
          Contactos por canal
        </div>
        <div className="text-2xl font-display font-bold tabular-nums leading-none">
          {totalContactos}
        </div>
        <div className="flex gap-2.5 mt-2 flex-wrap">
          {canalEntries.slice(0, 4).map(([canal, n]) => (
            <span
              key={canal}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
            >
              <span
                className={`size-1.5 rounded-full ${CANAL_COLOR[canal] ?? "bg-muted-foreground/30"}`}
              />
              {canal} · {n}
            </span>
          ))}
        </div>
      </div>

      <div className="p-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1.5">
          Leads · 30 días
        </div>
        <div className="text-2xl font-display font-bold tabular-nums leading-none">
          {data.leads30d}
        </div>
      </div>

      <div className="p-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1.5">
          Leads · 90 días
        </div>
        <div className="text-2xl font-display font-bold tabular-nums leading-none">
          {data.leads90d}
        </div>
      </div>

      <div className="p-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-1.5">
          Propiedad más demandada
        </div>
        {demandada ? (
          <Link
            to="/inmuebles/$id"
            params={{ id: demandada.id }}
            className="block hover:underline decoration-muted-foreground/40"
          >
            <div className="text-sm font-semibold truncate">
              {demandada.direccion || (demandada.ref ? `Ref #${demandada.ref}` : "Inmueble")}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {demandada.interesados} interesados · {demandada.visitas} visitas
            </div>
          </Link>
        ) : (
          <div className="text-xs text-muted-foreground/60 mt-1">Sin datos suficientes todavía</div>
        )}
      </div>
    </div>
  );
}
