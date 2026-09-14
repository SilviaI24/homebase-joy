// M-03: extraído de src/routes/comerciales.index.lazy.tsx.

import { moneyShortCore } from "@/lib/format";

export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtTime(s: string | null): string {
  if (!s) return "--:--";
  const d = new Date(s);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtDateCompact(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function estadoColor(estado: string): string {
  if (estado === "Realizada") return "#10b981";
  if (estado === "Cancelada") return "#f43f5e";
  return "#6366f1";
}

// 1 decimal para millones -- distinto de dashboard-format.ts (2 decimales). Ver
// moneyShortCore en format.ts para el porqué de no unificar el redondeo en sí.
export function moneyShort(v: number): string {
  return moneyShortCore(v, 1);
}
