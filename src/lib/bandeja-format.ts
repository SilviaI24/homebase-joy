// Helpers de formato puros de Bandeja (M-03: extraídos de
// src/routes/bandeja.index.tsx). Sin estado, sin JSX.
//
// moneyShort aquí redondea a 1 decimal y acepta null -- distinto de las
// versiones homónimas en dashboard-format.ts (2 decimales) y
// comerciales.index.lazy.tsx (sin null). No se unifican: son 3 pantallas
// distintas y no hay evidencia de qué redondeo es el "correcto" a nivel de
// producto -- decisión para cuando se aborde esa duplicación explícitamente.

export function formatFecha(f: string | null): string {
  if (!f) return "Sin fecha";
  try {
    return new Date(f).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return f;
  }
}

export function moneyShort(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M €`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k €`;
  return `${v} €`;
}
