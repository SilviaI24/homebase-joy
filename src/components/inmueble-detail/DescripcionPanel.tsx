// M-03: extraído de src/routes/inmuebles.$id.tsx (DetailView).
import { SkeletonLine } from "@/components/inmueble-detail/SkeletonLine";

export function DescripcionPanel({
  descripcion,
  setDescripcion,
  original,
  detailReady,
}: {
  descripcion: string;
  setDescripcion: (v: string) => void;
  original: string;
  detailReady: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-base font-semibold">Descripción</h3>
        {descripcion !== original && <span className="text-[11px] text-warning">Sin guardar</span>}
      </div>
      {detailReady ? (
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          rows={6}
          placeholder="Añade una descripción del inmueble…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
        />
      ) : (
        <div className="space-y-2">
          <SkeletonLine className="w-full" />
          <SkeletonLine className="w-11/12" />
          <SkeletonLine className="w-3/4" />
        </div>
      )}
    </div>
  );
}
