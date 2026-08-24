// M-03: extraído de src/routes/inmuebles.$id.tsx. Componente puramente
// presentacional, usado tanto por DetailView (en la ruta) como por los
// paneles ya extraídos a sus propios archivos — vive aquí para que ninguno
// de esos archivos tenga que importarlo del otro (evitaría un ciclo).
export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`h-3 rounded bg-muted animate-pulse ${className}`} />;
}
