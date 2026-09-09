// Constantes y helpers puros de Operaciones (M-03: extraídos de
// src/routes/operaciones.index.tsx). Sin estado, sin JSX.
import type { OperacionTipo, OperacionEstado } from "@/lib/operaciones.functions";

export const TIPOS: OperacionTipo[] = ["Venta", "Alquiler", "Valoración", "Servicio"];
export const ESTADOS: OperacionEstado[] = ["Abierta", "En negociación", "Cerrada", "Cancelada"];

export const ESTADO_STYLE: Record<OperacionEstado, string> = {
  Abierta: "bg-info/10 text-info",
  "En negociación": "bg-warning/10 text-warning",
  Cerrada: "bg-success/10 text-success",
  Cancelada: "bg-zinc-500/10 text-zinc-500",
};

export function fmtEur(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function fmtDate(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s.slice(0, 10);
  }
}
