// Helpers de formato puros de la ficha de inmueble (M-03: extraídos de
// src/routes/inmuebles.$id.tsx, que mezclaba estos con el loader, el
// formulario y los paneles de la página). Sin estado, sin JSX.

export function formatEuro(n: number | null): string {
  if (n == null || n === 0) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

export function formatDateTime(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

export function diffDays(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const d1 = new Date(a).getTime();
  const d2 = new Date(b).getTime();
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.max(0, Math.floor((d2 - d1) / 86400000));
}

export function daysLabel(d: number | null): string {
  if (d == null) return "—";
  return `${d} día${d === 1 ? "" : "s"}`;
}

export function statusTint(estatus: string): string {
  const map: Record<string, string> = {
    Pendiente: "bg-slate-400 text-white",
    Activo: "bg-success text-white",
    Reservado: "bg-warning text-warning-foreground",
    Vendido: "bg-info text-white",
    Alquilado: "bg-brand-green text-white",
    Baja: "bg-muted text-muted-foreground",
    Prospección: "bg-secondary text-secondary-foreground",
  };
  return map[estatus] ?? "bg-secondary text-secondary-foreground";
}

export function estadoVisitaColor(estado: string): string {
  const e = estado.toLowerCase();
  if (e.includes("confirm")) return "bg-success/15 text-success";
  if (e.includes("cancel")) return "bg-destructive/15 text-destructive";
  if (e.includes("realiz")) return "bg-primary/15 text-primary";
  return "bg-muted text-muted-foreground";
}
