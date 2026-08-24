// Helpers de formato puros del Dashboard (M-03: extraídos de
// src/routes/index.tsx, que mezclaba estos con el componente y el resto de
// la lógica de la página). Sin estado, sin JSX, sin dependencias externas.

export function moneyShort(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M €`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k €`;
  return `${v} €`;
}

export function moneyFull(v: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}

export function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  } catch {
    return s;
  }
}

export function calcDelta(cur: number, prev: number): number | null {
  if (prev === 0) return cur > 0 ? 100 : null;
  return Math.round(((cur - prev) / prev) * 100);
}

export function fmtMes(mes: string): string {
  const [y, m] = mes.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("es-ES", {
    month: "short",
    year: "2-digit",
  });
}
