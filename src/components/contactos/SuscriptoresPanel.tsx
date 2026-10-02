// Pestaña "Suscriptores" de Contactos: altas de Soldata que envía la web
// (rpc soldata_suscribir). Solo lectura — quien marcó que quiere vender ya
// entra por la Bandeja como lead web; aquí se ve la lista completa.
import { useQuery } from "@tanstack/react-query";
import { Search, Mail, Home } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { Pagination } from "@/components/pagination/Pagination";
import { suscriptoresPageQuery } from "@/lib/queries";
import { formatFechaCorta, initials, avatarColorClass } from "@/lib/contactos-format";

export function SuscriptoresTab({
  page,
  pageSize,
  q,
  onPage,
  onQ,
}: {
  page: number;
  pageSize: number;
  q: string;
  onPage: (p: number) => void;
  onQ: (q: string) => void;
}) {
  const { data, isFetching } = useQuery(suscriptoresPageQuery({ page, pageSize, q }));
  const suscriptores = data?.suscriptores ?? [];
  const total = data?.total ?? 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-sm min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => onQ(e.target.value)}
            placeholder="Buscar por nombre, email o teléfono…"
            aria-label="Buscar en suscriptores"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          Suscritos a Soldata desde la web. Quien quiere vender entra también en la Bandeja.
        </span>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                <th className="py-2.5 pl-4 pr-2 text-left font-medium">Nombre</th>
                <th className="py-2.5 px-2 text-left font-medium">Email</th>
                <th className="py-2.5 px-2 text-left font-medium">Teléfono</th>
                <th className="py-2.5 px-2 text-left font-medium">Estado</th>
                <th className="py-2.5 px-2 text-left font-medium">Origen</th>
                <th className="py-2.5 pl-2 pr-4 text-left font-medium">Alta</th>
              </tr>
            </thead>
            <tbody>
              {suscriptores.length === 0 && !isFetching ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    <Mail className="mx-auto mb-2 size-6 opacity-50" />
                    {q
                      ? "Ningún suscriptor coincide con la búsqueda."
                      : "Todavía no hay suscriptores. Llegarán desde el formulario de Soldata de la web."}
                  </td>
                </tr>
              ) : (
                suscriptores.map((c) => (
                  <tr
                    key={c.id}
                    className={`border-b border-border transition-colors hover:bg-muted/40 ${c.bajaAt ? "opacity-60" : ""}`}
                  >
                    <td className="py-3 pl-4 pr-2">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColorClass(c.nombre || c.email)}`}
                        >
                          {initials(c.nombre) || "?"}
                        </span>
                        <span className="text-sm font-medium truncate max-w-[180px]">
                          {c.nombre || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-xs text-muted-foreground truncate max-w-[220px]">
                      {c.email || "—"}
                    </td>
                    <td className="py-3 px-2 text-xs text-muted-foreground">{c.telefono || "—"}</td>
                    <td className="py-3 px-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge cicloVida={c.etapa} />
                        {c.quiereVender && (
                          <span className="inline-flex items-center gap-1 text-xs rounded-full border border-border px-2 py-0.5">
                            <Home className="size-3" aria-hidden />
                            Quiere vender
                          </span>
                        )}
                        {c.bajaAt && (
                          <span className="text-xs text-muted-foreground">
                            Baja {formatFechaCorta(c.bajaAt)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2 text-xs text-muted-foreground truncate max-w-[200px]">
                      {c.origen ?? "—"}
                    </td>
                    <td className="py-3 pl-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                      {formatFechaCorta(c.suscritoAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPage={onPage}
          isFetching={isFetching}
        />
      </div>
    </div>
  );
}
