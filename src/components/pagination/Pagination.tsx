import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  isFetching?: boolean;
  className?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  isFetching,
  className = "",
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 mt-4 text-sm ${className}`}>
      <span className="text-xs text-muted-foreground">
        {total === 0 ? (
          "Sin resultados"
        ) : (
          <>
            {from}–{to} de {total} registros
          </>
        )}
        {isFetching && <span className="ml-2 text-primary animate-pulse">Cargando…</span>}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1 || isFetching}
          aria-label="Página anterior"
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-input bg-background text-xs font-medium hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ChevronLeft className="size-3.5" />
          Anterior
        </button>
        <span className="px-3 text-xs text-muted-foreground whitespace-nowrap tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages || isFetching}
          aria-label="Página siguiente"
          className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-input bg-background text-xs font-medium hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          Siguiente
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
